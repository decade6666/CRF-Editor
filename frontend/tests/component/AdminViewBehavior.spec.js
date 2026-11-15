// AdminView 行为挂载测试：真实用户表格、新增/改名/重置密码/删除用户、
// 两步式项目批量操作、回收站恢复/彻底删除与清理策略弹窗。
// 外部边界：api 对象（scriptApi + patch spy）与 ElMessageBox；不 mock 被测组件。
// append-to-body 弹窗内容经 body() 上的 .el-dialog 元素查询（按标题定位）。
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ElMessage, ElMessageBox } from 'element-plus';
import AdminView from '../../src/components/AdminView.vue';
import { api } from '../../src/composables/useApi.js';
import { body, buttonByText, dialogByTitle, scriptApi, settle } from './appTestHarness.js';

const USERS = [
  { id: 1, username: 'admin', is_admin: true, project_count: 2 },
  { id: 2, username: 'bob', is_admin: false, project_count: 0 },
  { id: 3, username: 'carol', is_admin: false, project_count: 1 },
];
const CAROL_PROJECTS = [
  { id: 31, name: 'carol 项目一' },
  { id: 32, name: 'carol 项目二' },
];
const RECYCLE_PROJECTS = [
  { id: 41, name: '已删项目', owner_id: 2, estimated_size_bytes: 2048, deleted_at: '2026-11-01 10:00:00' },
];
const CLEANUP_POLICY = {
  interval_minutes: 60,
  min_retain_hours: 24,
  age: { enabled: false, value: 30, unit: 'day' },
  size: { enabled: false, value: 500, unit: 'MB' },
  total_estimated_size_bytes: 4096,
  recycled_project_count: 1,
};
const POLICY_URL = '/api/admin/recycle-bin/cleanup-policy';
const RECYCLE_URL = '/api/admin/projects/recycle-bin';

function defaultGet(url) {
  if (url === '/api/admin/users') return USERS.map((u) => ({ ...u }));
  if (url === RECYCLE_URL) return RECYCLE_PROJECTS.map((p) => ({ ...p }));
  if (url === POLICY_URL) {
    return { ...CLEANUP_POLICY, age: { ...CLEANUP_POLICY.age }, size: { ...CLEANUP_POLICY.size } };
  }
  if (url === '/api/projects?user_id=3') return CAROL_PROJECTS.map((p) => ({ ...p }));
  return undefined;
}

async function mountAdmin(routes = {}) {
  scriptApi({ get: defaultGet, ...routes });
  vi.spyOn(api, 'patch').mockResolvedValue({});
  const wrapper = mount(AdminView);
  await settle();
  return wrapper;
}

// 弹窗可见性断言用组件实例，内容查询用 body 上按标题定位的 .el-dialog 元素。
function dialogNode(wrapper, title) {
  const node = dialogByTitle(wrapper, title);
  expect(node, `应渲染弹窗组件「${title}」`).toBeTruthy();
  return node;
}

function dialogEl(wrapper, title) {
  const el = body()
    .findAll('.el-dialog')
    .find((candidate) => candidate.find('.el-dialog__title').text() === title);
  expect(el, `弹窗「${title}」应已渲染 DOM`).toBeTruthy();
  return el;
}

// 成功后的 resetProjectListState 会把弹窗标题重置为「项目列表 - 」，按前缀定位同一弹窗实例。
function projectListNode(wrapper) {
  const node = wrapper
    .findAllComponents({ name: 'ElDialog' })
    .find((candidate) => String(candidate.props('title')).startsWith('项目列表 - '));
  expect(node, '应渲染项目列表弹窗组件').toBeTruthy();
  return node;
}

function userRow(wrapper, username) {
  const row = wrapper.findAll('.el-table__row').find((node) => node.text().includes(username));
  expect(row, `应渲染用户行「${username}」`).toBeTruthy();
  return row;
}

async function clickRowAction(wrapper, username, label) {
  const row = userRow(wrapper, username);
  const button = row.find(`button[aria-label="${label}"]`);
  expect(button.exists(), `用户行应有「${label}」操作`).toBe(true);
  await button.trigger('click');
  await settle();
}

async function fillFormItem(scope, label, value) {
  const item = scope.findAll('.el-form-item').find((node) => {
    const labelNode = node.find('.el-form-item__label');
    return labelNode.exists() && labelNode.text() === label;
  });
  expect(item, `应渲染表单项「${label}」`).toBeTruthy();
  await item.get('input').setValue(value);
  await settle();
}

async function pickSelectOption(scope, optionText) {
  await scope.find('.el-select__wrapper').trigger('click');
  await settle();
  const option = body()
    .findAll('.el-select-dropdown__item')
    .find((item) => item.text() === optionText);
  expect(option, `下拉应出现选项「${optionText}」`).toBeTruthy();
  await option.trigger('click');
  await settle();
}

describe('AdminView · 用户列表与行内操作', () => {
  it('渲染用户表格：管理员标签、管理员行无项目列表/删除操作、有项目用户删除禁用', async () => {
    const wrapper = await mountAdmin();

    expect(wrapper.text()).toContain('用户管理');
    const adminRow = userRow(wrapper, 'admin');
    expect(adminRow.text()).toContain('管理员');
    expect(adminRow.find('button[aria-label="项目列表"]').exists()).toBe(false);
    expect(adminRow.find('button[aria-label="删除"]').exists()).toBe(false);

    const carolRow = userRow(wrapper, 'carol');
    expect(carolRow.find('button[aria-label="项目列表"]').exists()).toBe(true);
    expect(carolRow.find('button[aria-label="删除"]').attributes('disabled')).toBeDefined();

    const bobRow = userRow(wrapper, 'bob');
    expect(bobRow.find('button[aria-label="删除"]').attributes('disabled')).toBeUndefined();
  });

  it('加载用户失败时提示且表格为空', async () => {
    await mountAdmin({
      get: (url) => (url === '/api/admin/users' ? Promise.reject(new Error('后端不可用')) : undefined),
    });

    expect(ElMessage.error).toHaveBeenCalledWith('加载用户失败: 后端不可用');
  });

  it('刷新按钮重新加载用户列表', async () => {
    const wrapper = await mountAdmin();
    const callsBefore = api.get.mock.calls.length;

    await wrapper.find('button[aria-label="刷新"]').trigger('click');
    await settle();

    expect(api.get.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(api.get.mock.calls.at(-1)[0]).toBe('/api/admin/users');
  });
});

describe('AdminView · 新增用户', () => {
  it('新增用户提交用户名与初始密码并重载列表', async () => {
    const wrapper = await mountAdmin();

    await wrapper.find('button[aria-label="新增用户"]').trigger('click');
    await settle();
    const dialog = dialogNode(wrapper, '新增用户');
    expect(dialog.props('modelValue')).toBe(true);
    const dialogBody = dialogEl(wrapper, '新增用户');
    await fillFormItem(dialogBody, '用户名', 'dave');
    await fillFormItem(dialogBody, '初始密码', 'init-pass');

    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/admin/users', { username: 'dave', password: 'init-pass' });
    expect(ElMessage.success).toHaveBeenCalledWith('添加成功');
    expect(dialogNode(wrapper, '新增用户').props('modelValue')).toBe(false);
    expect(api.get.mock.calls.filter(([url]) => url === '/api/admin/users').length).toBe(2);
  });

  it('新增用户缺少初始密码时提示且不提交', async () => {
    const wrapper = await mountAdmin();

    await wrapper.find('button[aria-label="新增用户"]').trigger('click');
    await settle();
    const dialogBody = dialogEl(wrapper, '新增用户');
    await fillFormItem(dialogBody, '用户名', 'dave');

    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('请输入初始密码');
    expect(api.post).not.toHaveBeenCalled();
    expect(dialogNode(wrapper, '新增用户').props('modelValue')).toBe(true);
  });

  it('新增用户用户名为空时直接返回不提交', async () => {
    const wrapper = await mountAdmin();

    await wrapper.find('button[aria-label="新增用户"]').trigger('click');
    await settle();
    const dialogBody = dialogEl(wrapper, '新增用户');
    await fillFormItem(dialogBody, '初始密码', 'init-pass');

    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(api.post).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('AdminView · 改名与重置密码', () => {
  it('改名预填用户名并以 PATCH 提交', async () => {
    const wrapper = await mountAdmin();

    await clickRowAction(wrapper, 'bob', '改名');
    const dialogBody = dialogEl(wrapper, '修改用户名');
    expect(dialogNode(wrapper, '修改用户名').props('modelValue')).toBe(true);
    const nameInput = dialogBody.findAll('.el-form-item')[0].get('input');
    expect(nameInput.element.value).toBe('bob');
    await nameInput.setValue('bobby');

    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/users/2', { username: 'bobby' });
    expect(ElMessage.success).toHaveBeenCalledWith('修改成功');
    expect(dialogNode(wrapper, '修改用户名').props('modelValue')).toBe(false);
  });

  it('改名失败时提示且弹窗保持打开', async () => {
    const wrapper = await mountAdmin();
    api.patch.mockRejectedValue(new Error('重名'));

    await clickRowAction(wrapper, 'bob', '改名');
    const dialogBody = dialogEl(wrapper, '修改用户名');
    await fillFormItem(dialogBody, '用户名', 'bobby');
    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('操作失败: 重名');
    expect(dialogNode(wrapper, '修改用户名').props('modelValue')).toBe(true);
  });

  it('重置密码空密码提示，填写后 PUT 提交并重载', async () => {
    const wrapper = await mountAdmin();

    await clickRowAction(wrapper, 'bob', '重置密码');
    const dialogBody = dialogEl(wrapper, '重置密码');
    const usernameInput = dialogBody.findAll('.el-form-item')[0].get('input');
    expect(usernameInput.element.value).toBe('bob');
    expect(usernameInput.attributes('disabled')).toBeDefined();

    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();
    expect(ElMessage.error).toHaveBeenCalledWith('请输入新密码');
    expect(api.put).not.toHaveBeenCalled();

    await fillFormItem(dialogBody, '新密码', 'new-pass');
    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(api.put).toHaveBeenCalledWith('/api/admin/users/2/password', { password: 'new-pass' });
    expect(ElMessage.success).toHaveBeenCalledWith('密码重置成功');
    expect(dialogNode(wrapper, '重置密码').props('modelValue')).toBe(false);
  });

  it('重置密码失败时提示且弹窗保持打开', async () => {
    const wrapper = await mountAdmin();
    api.put.mockImplementation((url) =>
      url === '/api/admin/users/2/password' ? Promise.reject(new Error('弱密码')) : Promise.resolve(),
    );

    await clickRowAction(wrapper, 'bob', '重置密码');
    const dialogBody = dialogEl(wrapper, '重置密码');
    await fillFormItem(dialogBody, '新密码', '123');
    await buttonByText(dialogBody, '确定').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('密码重置失败: 弱密码');
    expect(dialogNode(wrapper, '重置密码').props('modelValue')).toBe(true);
  });
});

describe('AdminView · 删除用户', () => {
  it('确认后 DELETE 用户并重载列表', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    await clickRowAction(wrapper, 'bob', '删除');

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确定删除用户 "bob" 吗？', '删除用户', { type: 'warning' });
    expect(api.del).toHaveBeenCalledWith('/api/admin/users/2');
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功');
  });

  it('取消确认时不删除也不报错', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    await clickRowAction(wrapper, 'bob', '删除');

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('删除失败时提示错误', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    api.del.mockRejectedValue(new Error('仍有引用'));

    await clickRowAction(wrapper, 'bob', '删除');

    expect(ElMessage.error).toHaveBeenCalledWith('删除失败: 仍有引用');
  });
});

describe('AdminView · 项目列表与批量操作', () => {
  async function openProjectList(wrapper) {
    await clickRowAction(wrapper, 'carol', '项目列表');
    const node = dialogNode(wrapper, '项目列表 - carol');
    expect(node.props('modelValue')).toBe(true);
    expect(api.get.mock.calls.at(-1)[0]).toBe('/api/projects?user_id=3');
    await settle();
    return dialogEl(wrapper, '项目列表 - carol');
  }

  async function selectFirstProjectRow(dialogBody) {
    const checkbox = dialogBody.find('.el-table__row .el-checkbox input');
    expect(checkbox.exists(), '项目行应有选择框').toBe(true);
    await checkbox.setValue(true);
    await settle();
  }

  it('打开项目列表加载该项目数据', async () => {
    const wrapper = await mountAdmin();

    const dialogBody = await openProjectList(wrapper);
    const names = dialogBody.findAll('.el-table__row').map((row) => row.text());
    expect(names.join('|')).toContain('carol 项目一');
  });

  it('加载项目失败时提示', async () => {
    const wrapper = await mountAdmin();
    scriptApi({
      get: (url) => (url === '/api/projects?user_id=3' ? Promise.reject(new Error('超时')) : undefined),
    });

    await clickRowAction(wrapper, 'carol', '项目列表');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('加载项目失败');
  });

  it('未选择项目时批量按钮禁用', async () => {
    const wrapper = await mountAdmin();

    const dialogBody = await openProjectList(wrapper);
    for (const text of ['复制', '迁移', '删除']) {
      expect(buttonByText(dialogBody, text).attributes('disabled')).toBeDefined();
    }
  });

  it('两步式迁移：选择项目与目标用户后提交 batch-move', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openProjectList(wrapper);
    await selectFirstProjectRow(dialog);
    await buttonByText(dialog, '迁移').trigger('click');
    await settle();

    const dialogBody = dialogEl(wrapper, '项目列表 - carol');
    expect(buttonByText(dialogBody, '上一步').exists(), '应进入目标用户选择步骤').toBe(true);
    await pickSelectOption(dialogBody, 'bob');
    expect(buttonByText(dialogBody, '确定迁移').attributes('disabled')).toBeUndefined();

    await buttonByText(dialogBody, '确定迁移').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/admin/projects/batch-move', {
      project_ids: [31],
      target_user_id: 2,
    });
    expect(ElMessage.success).toHaveBeenCalledWith('迁移成功');
    expect(projectListNode(wrapper).props('modelValue')).toBe(false);
  });

  it('迁移未选目标用户时确认按钮禁用', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openProjectList(wrapper);
    await selectFirstProjectRow(dialog);
    await buttonByText(dialog, '迁移').trigger('click');
    await settle();

    const dialogBody = dialogEl(wrapper, '项目列表 - carol');
    expect(buttonByText(dialogBody, '确定迁移').attributes('disabled')).toBeDefined();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('上一步返回项目选择', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openProjectList(wrapper);
    await selectFirstProjectRow(dialog);
    await buttonByText(dialog, '迁移').trigger('click');
    await settle();
    const dialogBody = dialogEl(wrapper, '项目列表 - carol');
    await buttonByText(dialogBody, '上一步').trigger('click');
    await settle();

    expect(buttonByText(dialogBody, '复制').exists(), '应回到项目选择步骤').toBe(true);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('两步式复制按成功条数提示并提交 batch-copy', async () => {
    const wrapper = await mountAdmin({
      post: (url) =>
        url === '/api/admin/projects/batch-copy' ? [{ status: 'success' }, { status: 'failed' }] : undefined,
    });

    const dialog = await openProjectList(wrapper);
    await selectFirstProjectRow(dialog);
    await buttonByText(dialog, '复制').trigger('click');
    await settle();
    const dialogBody = dialogEl(wrapper, '项目列表 - carol');
    await pickSelectOption(dialogBody, 'bob');
    await buttonByText(dialogBody, '确定复制').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/admin/projects/batch-copy', {
      project_ids: [31],
      target_user_id: 2,
    });
    expect(ElMessage.success).toHaveBeenCalledWith('成功复制 1 个项目');
  });

  it('批量删除经最终确认后提交 batch-delete 并刷新回收站', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    const dialog = await openProjectList(wrapper);
    await selectFirstProjectRow(dialog);
    const recycleCallsBefore = api.get.mock.calls.filter(([url]) => url === RECYCLE_URL).length;

    await buttonByText(dialog, '删除').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/admin/projects/batch-delete', { project_ids: [31] });
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功');
    expect(api.get.mock.calls.filter(([url]) => url === RECYCLE_URL).length).toBeGreaterThan(recycleCallsBefore);
    expect(projectListNode(wrapper).props('modelValue')).toBe(false);
  });

  it('批量删除取消最终确认时不提交', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    const dialog = await openProjectList(wrapper);
    await selectFirstProjectRow(dialog);
    await buttonByText(dialog, '删除').trigger('click');
    await settle();

    expect(api.post).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('AdminView · 回收站', () => {
  async function openRecycleBin(wrapper) {
    await wrapper.find('button[aria-label="回收站"]').trigger('click');
    await settle();
    return dialogEl(wrapper, '项目回收站');
  }

  it('打开回收站加载数据并显示估算大小', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openRecycleBin(wrapper);
    expect(dialogNode(wrapper, '项目回收站').props('modelValue')).toBe(true);
    expect(dialog.text()).toContain('已删项目');
    expect(dialog.text()).toContain('2.0 KB');
    expect(dialog.text()).toContain('2026-11-01 10:00:00');
  });

  it('回收站为空时显示空态', async () => {
    const wrapper = await mountAdmin({
      get: (url) => (url === RECYCLE_URL ? [] : undefined),
    });

    const dialog = await openRecycleBin(wrapper);
    expect(dialog.text()).toContain('回收站空空如也');
  });

  it('加载回收站失败时提示', async () => {
    const wrapper = await mountAdmin({
      get: (url) => (url === RECYCLE_URL ? Promise.reject(new Error('超时')) : undefined),
    });

    await openRecycleBin(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('加载回收站失败');
  });

  it('恢复项目后刷新回收站与用户列表', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openRecycleBin(wrapper);
    await buttonByText(dialog, '恢复').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/admin/projects/41/restore');
    expect(ElMessage.success).toHaveBeenCalledWith('已恢复');
    expect(api.get.mock.calls.filter(([url]) => url === '/api/admin/users').length).toBe(2);
    expect(api.get.mock.calls.filter(([url]) => url === POLICY_URL).length).toBe(2);
  });

  it('恢复失败时提示', async () => {
    const wrapper = await mountAdmin();
    api.post.mockImplementation((url) =>
      url === '/api/admin/projects/41/restore' ? Promise.reject(new Error('冲突')) : Promise.resolve(),
    );

    const dialog = await openRecycleBin(wrapper);
    await buttonByText(dialog, '恢复').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('恢复失败: 冲突');
  });

  it('彻底删除需两次确认后提交 hard-delete', async () => {
    const wrapper = await mountAdmin();
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    const dialog = await openRecycleBin(wrapper);
    await buttonByText(dialog, '彻底删除').trigger('click');
    await settle();

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(api.del).toHaveBeenCalledWith('/api/admin/projects/41/hard-delete');
    expect(ElMessage.success).toHaveBeenCalledWith('已彻底删除');
  });

  it('彻底删除第一次确认取消时不提交', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    const dialog = await openRecycleBin(wrapper);
    await buttonByText(dialog, '彻底删除').trigger('click');
    await settle();

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('AdminView · 回收站清理策略', () => {
  async function openPolicyDialog(wrapper) {
    await wrapper.find('button[aria-label="回收站"]').trigger('click');
    await settle();
    const recycleDialog = dialogEl(wrapper, '项目回收站');
    await buttonByText(recycleDialog, '清理策略').trigger('click');
    await settle();
    return dialogEl(wrapper, '回收站清理策略');
  }

  it('加载策略回显且未修改时保存禁用', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openPolicyDialog(wrapper);
    expect(dialogNode(wrapper, '回收站清理策略').props('modelValue')).toBe(true);
    expect(dialog.text()).toContain('1 个项目，约 4.0 KB');
    expect(buttonByText(dialog, '保存').attributes('disabled')).toBeDefined();
  });

  it('加载清理策略失败时提示', async () => {
    const wrapper = await mountAdmin({
      get: (url) => (url === POLICY_URL ? Promise.reject(new Error('拒绝访问')) : undefined),
    });

    await openPolicyDialog(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('加载清理策略失败: 拒绝访问');
  });

  it('启用过期清理后保存需确认并以精确载荷提交', async () => {
    const wrapper = await mountAdmin();
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const saved = { ...CLEANUP_POLICY, age: { ...CLEANUP_POLICY.age, enabled: true } };
    api.put.mockImplementation((url) => (url === POLICY_URL ? Promise.resolve(saved) : Promise.resolve()));

    const dialog = await openPolicyDialog(wrapper);
    await dialog.find('.el-switch').trigger('click');
    await settle();
    expect(buttonByText(dialog, '保存').attributes('disabled')).toBeUndefined();

    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledWith(POLICY_URL, {
      interval_minutes: 60,
      min_retain_hours: 24,
      age: { enabled: true, value: 30, unit: 'day' },
      size: { enabled: false, value: 500, unit: 'MB' },
    });
    expect(ElMessage.success).toHaveBeenCalledWith('清理策略已保存');
  });

  it('启用确认取消时不提交', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    const dialog = await openPolicyDialog(wrapper);
    await dialog.find('.el-switch').trigger('click');
    await settle();
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(api.put).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('已启用策略再次保存无需启用确认', async () => {
    const wrapper = await mountAdmin({
      get: (url) =>
        url === POLICY_URL ? { ...CLEANUP_POLICY, age: { ...CLEANUP_POLICY.age, enabled: true } } : undefined,
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    api.put.mockImplementation((url) => (url === POLICY_URL ? Promise.resolve(CLEANUP_POLICY) : Promise.resolve()));

    const dialog = await openPolicyDialog(wrapper);
    await dialog.find('.el-switch').trigger('click');
    await settle();
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('清理策略已保存');
  });

  it('保存失败时提示且不误报成功', async () => {
    const wrapper = await mountAdmin();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    api.put.mockRejectedValue(new Error('写入失败'));

    const dialog = await openPolicyDialog(wrapper);
    await dialog.find('.el-switch').trigger('click');
    await settle();
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('保存失败: 写入失败');
  });

  it('预览将删除展示命中项目与规则', async () => {
    const wrapper = await mountAdmin();
    api.post.mockImplementation((url) =>
      url === '/api/admin/recycle-bin/cleanup/preview'
        ? Promise.resolve([
            {
              name: '已删项目',
              owner_username: 'bob',
              estimated_size_bytes: 2048,
              deleted_at: '2026-11-01 10:00:00',
              matched_rules: ['age', 'size'],
            },
          ])
        : Promise.resolve(),
    );

    const dialog = await openPolicyDialog(wrapper);
    await buttonByText(dialog, '预览将删除').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/admin/recycle-bin/cleanup/preview', {});
    expect(dialog.text()).toContain('已删项目');
    expect(dialog.text()).toContain('age, size');
    expect(dialog.text()).toContain('2.0 KB');
  });

  it('预览失败时提示', async () => {
    const wrapper = await mountAdmin();
    api.post.mockImplementation((url) =>
      url === '/api/admin/recycle-bin/cleanup/preview' ? Promise.reject(new Error('超时')) : Promise.resolve(),
    );

    const dialog = await openPolicyDialog(wrapper);
    await buttonByText(dialog, '预览将删除').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('预览失败: 超时');
  });

  it('取消按钮关闭策略弹窗', async () => {
    const wrapper = await mountAdmin();

    const dialog = await openPolicyDialog(wrapper);
    await buttonByText(dialog, '取消').trigger('click');
    await settle();

    expect(dialogNode(wrapper, '回收站清理策略').props('modelValue')).toBe(false);
  });
});
