// 真实 App + Element Plus：工作台既有功能——登录与会话恢复、项目增删改与排序、刷新、Word 导出、侧栏宽度、
// 懒加载页签与离开守卫、模板导入 / 模板字段查询 / Word 导入入口。
// 懒加载的大型子页签以替身代替（vi.mock，仍走 App 的 defineAsyncComponent 加载链路），
// 其余只替换外部边界：api 对象、fetch / 浏览器下载、ElMessageBox；不消音 Vue 警告。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessage, ElMessageBox } from 'element-plus';
import LoginView from '../../src/components/LoginView.vue';
import AdminView from '../../src/components/AdminView.vue';
import OrganizationManagementView from '../../src/components/OrganizationManagementView.vue';
import WordImportDialog from '../../src/components/WordImportDialog.vue';
import { api } from '../../src/composables/useApi.js';
import {
  PROJECTS,
  body,
  buttonByText,
  captureDownloads,
  deferred,
  dialogByTitle,
  fakeJwt,
  fakeResponse,
  formItem,
  mountApp,
  openSettings,
  requestedUrls,
  scriptFetch,
  selectProject,
  settle,
} from './appTestHarness.js';

const designer = vi.hoisted(() => ({ allowLeaveTab: true, allowLeaveProject: true, selectedFormIds: [] }));

vi.mock('../../src/components/FormDesignerTab.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('FormDesignerTab', {
    props: ['projectId'],
    events: { 导入模板: ['import-template'], 查询模板字段: ['open-template-field-search'] },
    expose: {
      canLeaveTab: async () => designer.allowLeaveTab,
      canLeaveProject: async () => designer.allowLeaveProject,
      selectFormById: async (formId) => {
        designer.selectedFormIds.push(formId);
      },
    },
  });
});
vi.mock('../../src/components/VisitsTab.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('VisitsTab', { props: ['projectId', 'workspace'] });
});
vi.mock('../../src/components/FieldsTab.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('FieldsTab', { props: ['projectId'], injections: ['projectDbType'] });
});
vi.mock('../../src/components/CodelistsTab.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('CodelistsTab', { props: ['projectId'] });
});
vi.mock('../../src/components/UnitsTab.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('UnitsTab', { props: ['projectId'] });
});
vi.mock('../../src/components/TemplatePreviewDialog.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('TemplatePreviewDialog', {
    props: ['modelValue', 'projectId', 'formId', 'formName'],
    events: { 关闭预览: ['update:modelValue', false] },
  });
});
vi.mock('../../src/components/TemplateFieldSearchDialog.vue', async () => {
  const { standInModule } = await import('./appTestHarness.js');
  return standInModule('TemplateFieldSearchDialog', {
    props: ['modelValue'],
    events: { 关闭查询: ['update:modelValue', false] },
  });
});

beforeEach(() => {
  designer.allowLeaveTab = true;
  designer.allowLeaveProject = true;
  designer.selectedFormIds = [];
});

function projectLoads() {
  return requestedUrls('get').filter((url) => url === '/api/projects').length;
}

function projectNames(wrapper) {
  return wrapper.findAll('.project-select-btn').map((node) => node.text());
}

function activeProject(wrapper) {
  return wrapper.get('.project-item.active .project-select-btn').text();
}

function projectAction(wrapper, name, label) {
  const item = wrapper.findAll('.project-item').find((node) => node.get('.project-select-btn').text() === name);
  expect(item, `侧栏应渲染项目「${name}」`).toBeTruthy();
  return item.get(`[aria-label="${label}"]`);
}

function activeTab(wrapper) {
  return wrapper.get('.el-tabs__item.is-active').text();
}

async function openTab(wrapper, label) {
  const tab = wrapper.findAll('.el-tabs__item').find((node) => node.text() === label);
  expect(tab, `应渲染页签「${label}」`).toBeTruthy();
  await tab.trigger('click');
  // 页签离开守卫与 defineAsyncComponent 替身解析各需一轮异步收敛
  await settle();
  await settle();
}

function standIn(wrapper, name) {
  return wrapper.find(`[data-test="${name}"]`);
}

function standInProps(wrapper, name) {
  return Object.fromEntries(
    wrapper
      .get(`[data-test="${name}"]`)
      .findAll('[data-prop]')
      .map((node) => [node.attributes('data-prop'), node.text()]),
  );
}

async function clickStandInButton(wrapper, name, label) {
  await buttonByText(wrapper.get(`[data-test="${name}"]`), label).trigger('click');
  await settle();
  await settle();
}

async function toggleEditMode(wrapper) {
  const settings = await openSettings(wrapper);
  await formItem(settings, '编辑模式').get('.el-switch').trigger('click');
  await settle();
}

describe('App 登录与会话恢复', () => {
  it('没有令牌时直接显示登录页且不请求身份', async () => {
    const wrapper = await mountApp({ token: false });

    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('普通用户登录成功后进入项目工作台并记住用户名', async () => {
    const wrapper = await mountApp({ token: false });
    localStorage.setItem('crf_token', fakeJwt());

    wrapper.findComponent(LoginView).vm.$emit('login-success');
    await settle();

    expect(projectNames(wrapper)).toEqual(PROJECTS.map((project) => project.name));
    expect(localStorage.getItem('crf_last_username')).toBe('temporary-owner');
  });

  it('管理员登录成功后进入管理工作台且不加载项目', async () => {
    const wrapper = await mountApp({ token: false, admin: true });
    localStorage.setItem('crf_token', fakeJwt());

    wrapper.findComponent(LoginView).vm.$emit('login-success');
    await settle();

    expect(wrapper.findComponent(AdminView).exists()).toBe(true);
    expect(requestedUrls('get')).not.toContain('/api/projects');
  });

  it('登录后身份校验失败则留在登录页并清除令牌', async () => {
    const wrapper = await mountApp({
      token: false,
      get: (url) => (url === '/api/auth/me' ? Promise.reject(new Error('未授权')) : undefined),
    });
    localStorage.setItem('crf_token', fakeJwt());

    wrapper.findComponent(LoginView).vm.$emit('login-success');
    await settle();

    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(localStorage.getItem('crf_token')).toBeNull();
  });

  it('启动恢复会话失败时清除令牌并回到登录页', async () => {
    const wrapper = await mountApp({
      select: false,
      get: (url) => (url === '/api/auth/me' ? Promise.reject(new Error('令牌已过期')) : undefined),
    });

    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(localStorage.getItem('crf_token')).toBeNull();
  });

  it('管理员可从用户管理切换到机构管理', async () => {
    const wrapper = await mountApp({ admin: true });
    const orgs = wrapper.findAll('.el-radio-button').find((node) => node.text() === '机构管理');

    await orgs.get('input').setValue(true);
    await settle();

    expect(wrapper.findComponent(OrganizationManagementView).exists()).toBe(true);
    expect(wrapper.find('admin-view-stub').exists()).toBe(false);
  });

  it('管理员从用户管理退出登录后回到登录页', async () => {
    const wrapper = await mountApp({ admin: true });

    wrapper.findComponent(AdminView).vm.$emit('logout');
    await settle();

    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(ElMessage.success).toHaveBeenCalledWith('已退出登录');
  });
});

describe('App 项目管理', () => {
  async function openCreateDialog(wrapper, via = '侧栏按钮') {
    if (via === '侧栏按钮') await wrapper.get('button[title="新建项目"]').trigger('click');
    else await buttonByText(wrapper.get('.empty-state'), '新建项目').trigger('click');
    await settle();
    return dialogByTitle(wrapper, '新建项目');
  }

  it('新建项目要求填写名称', async () => {
    const wrapper = await mountApp();
    const dialog = await openCreateDialog(wrapper);

    await buttonByText(dialog, '确定').trigger('click');
    await settle();

    expect(ElMessage.warning).toHaveBeenCalledWith('请输入项目名称');
    expect(api.post).not.toHaveBeenCalled();
    expect(dialog.props('modelValue')).toBe(true);
  });

  it('新建项目提交名称、版本与数据库类型后选中新项目', async () => {
    const created = { id: 11, name: '新建测试项目', version: '2.0', db_type: '赛美斯' };
    const wrapper = await mountApp({ select: false, post: (url) => (url === '/api/projects' ? created : undefined) });
    const dialog = await openCreateDialog(wrapper, '空状态按钮');

    await formItem(dialog, '项目名称').get('input').setValue(created.name);
    await formItem(dialog, '版本号').get('input').setValue(created.version);
    const saimeisi = formItem(dialog, '数据库类型')
      .findAll('.el-radio')
      .find((node) => node.text() === '赛美斯');
    await saimeisi.get('input').setValue(true);
    await buttonByText(dialog, '确定').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/projects', { name: '新建测试项目', version: '2.0', db_type: '赛美斯' });
    expect(dialog.props('modelValue')).toBe(false);
    expect(activeProject(wrapper)).toBe('新建测试项目');
  });

  it('新建失败时保留弹窗并提示原因', async () => {
    const wrapper = await mountApp({ post: () => Promise.reject(new Error('项目名称已存在')) });
    const dialog = await openCreateDialog(wrapper);
    await formItem(dialog, '项目名称').get('input').setValue('重复项目');

    await buttonByText(dialog, '确定').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('项目名称已存在');
    expect(dialog.props('modelValue')).toBe(true);
  });

  it.each(['取消按钮', '对话框关闭事件'])('通过%s关闭新建项目弹窗且不提交', async (via) => {
    const wrapper = await mountApp();
    const dialog = await openCreateDialog(wrapper);

    if (via === '取消按钮') await buttonByText(dialog, '取消').trigger('click');
    else dialog.vm.$emit('update:modelValue', false);
    await settle();

    expect(dialog.props('modelValue')).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('复制项目后刷新列表并选中副本', async () => {
    const projects = PROJECTS.map((project) => ({ ...project }));
    const copy = { id: 9, name: '授权测试项目 (副本)', version: '1.0', db_type: '其他' };
    const wrapper = await mountApp({
      projects,
      post: (url) => {
        if (url !== '/api/projects/5/copy') return undefined;
        projects.push(copy);
        return copy;
      },
    });

    await projectAction(wrapper, '授权测试项目', '复制项目').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/projects/5/copy', {});
    expect(projectNames(wrapper)).toContain(copy.name);
    expect(activeProject(wrapper)).toBe(copy.name);
    expect(ElMessage.success).toHaveBeenCalledWith('项目复制成功');
  });

  it('复制失败时提示原因并恢复按钮状态', async () => {
    const wrapper = await mountApp({ post: () => Promise.reject(new Error('配额不足')) });
    const copyButton = projectAction(wrapper, '授权测试项目', '复制项目');

    await copyButton.trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('项目复制失败: 配额不足');
    expect(copyButton.classes()).not.toContain('is-loading');
    expect(activeProject(wrapper)).toBe('授权测试项目');
  });

  it.each([1, 2])('删除时在第 %i 次确认取消则不删除也不报错', async (cancelAt) => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    if (cancelAt === 2) confirm.mockResolvedValueOnce('confirm');
    const wrapper = await mountApp();

    await projectAction(wrapper, '授权测试项目', '删除项目').trigger('click');
    await settle();

    expect(confirm).toHaveBeenCalledTimes(cancelAt);
    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(activeProject(wrapper)).toBe('授权测试项目');
  });

  it('删除失败时提示原因', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = await mountApp({ del: () => Promise.reject(new Error('项目被占用')) });

    await projectAction(wrapper, '授权测试项目', '删除项目').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('删除失败: 项目被占用');
  });

  it('删除其他项目时保留当前选择并刷新列表', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = await mountApp();
    const loadsBefore = projectLoads();

    await projectAction(wrapper, '另一个测试项目', '删除项目').trigger('click');
    await settle();

    expect(api.del).toHaveBeenCalledWith('/api/projects/7');
    expect(activeProject(wrapper)).toBe('授权测试项目');
    expect(projectLoads()).toBe(loadsBefore + 1);
  });

  it('拖拽排序后提交新顺序并重新加载列表', async () => {
    const wrapper = await mountApp();
    const list = wrapper.findComponent({ name: 'draggable' });
    const loadsBefore = projectLoads();

    list.vm.$emit('start');
    list.vm.$emit('update:modelValue', PROJECTS.map((project) => ({ ...project })).reverse());
    await settle();
    expect(projectNames(wrapper)).toEqual(['另一个测试项目', '授权测试项目']);
    list.vm.$emit('end');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/projects/reorder', [7, 5]);
    expect(projectLoads()).toBe(loadsBefore + 1);
  });

  it('拖拽排序保存失败时提示原因', async () => {
    const wrapper = await mountApp({
      post: (url) => (url === '/api/projects/reorder' ? Promise.reject(new Error('排序冲突')) : undefined),
    });

    wrapper.findComponent({ name: 'draggable' }).vm.$emit('end');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('排序冲突');
  });

  it('刷新按钮清空缓存、重新加载项目并提示', async () => {
    const wrapper = await mountApp();
    const loadsBefore = projectLoads();

    await wrapper.get('[aria-label="刷新数据"]').trigger('click');
    await settle();

    expect(api.clearAllCache).toHaveBeenCalledTimes(1);
    expect(projectLoads()).toBe(loadsBefore + 1);
    expect(ElMessage.success).toHaveBeenCalledWith('数据已刷新');
  });

  it('再次点击当前项目不重置工作区页签', async () => {
    const wrapper = await mountApp();
    await openTab(wrapper, '访视');

    await selectProject(wrapper, '授权测试项目');

    expect(activeTab(wrapper)).toBe('访视');
  });
});

describe('App 导出 Word', () => {
  const EXPORT_ROUTE = 'POST /api/projects/5/export/word';

  async function exportVia(label) {
    const item = body()
      .findAll('.el-dropdown-menu__item')
      .find((node) => node.text() === label);
    expect(item, `导出菜单应包含「${label}」`).toBeTruthy();
    await item.trigger('click');
    await settle();
  }

  it.each([
    ['导出eCRF', false, '授权测试项目_CRF.docx'],
    ['导出aCRF', true, '授权测试项目_aCRF.docx'],
  ])('%s提交注释标记并按回退文件名下载', async (label, annotated, filename) => {
    const fetchSpy = scriptFetch({ [EXPORT_ROUTE]: () => fakeResponse() });
    const downloads = captureDownloads('blob:word');
    await mountApp();

    await exportVia(label);

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: expect.stringMatching(/^Bearer /),
    });
    expect(JSON.parse(init.body)).toMatchObject({ annotated });
    expect(downloads.clicks).toEqual([{ href: 'blob:word', download: filename, attached: true }]);
    expect(downloads.revoke).toHaveBeenCalledWith('blob:word');
    expect(ElMessage.success).toHaveBeenCalledWith('导出成功');
  });

  it('优先使用服务端返回的文件名', async () => {
    scriptFetch({ [EXPORT_ROUTE]: () => fakeResponse({ disposition: 'attachment; filename="服务端命名.docx"' }) });
    const downloads = captureDownloads();
    await mountApp();

    await exportVia('导出eCRF');

    expect(downloads.clicks.map((click) => click.download)).toEqual(['服务端命名.docx']);
  });

  it.each([
    [() => Promise.resolve({ detail: '导出过于频繁' }), '导出失败: 导出过于频繁'],
    [() => Promise.reject(new SyntaxError('Unexpected token')), '导出失败: 未知错误'],
  ])('服务端拒绝时提示原因且不下载（%#）', async (json, message) => {
    scriptFetch({ [EXPORT_ROUTE]: () => fakeResponse({ ok: false, json }) });
    const downloads = captureDownloads();
    await mountApp();

    await exportVia('导出eCRF');

    expect(ElMessage.error).toHaveBeenCalledWith(message);
    expect(downloads.clicks).toEqual([]);
  });

  it('网络异常时提示导出失败并恢复按钮', async () => {
    scriptFetch({ [EXPORT_ROUTE]: () => Promise.reject(new TypeError('Failed to fetch')) });
    const wrapper = await mountApp();

    await exportVia('导出eCRF');

    expect(ElMessage.error).toHaveBeenCalledWith('导出失败: Failed to fetch');
    expect(wrapper.get('[aria-label="导出"]').classes()).not.toContain('is-loading');
  });

  it('导出进行中忽略重复的导出命令', async () => {
    const pending = deferred();
    const fetchSpy = scriptFetch({ [EXPORT_ROUTE]: () => pending.promise });
    const downloads = captureDownloads();
    await mountApp();

    await exportVia('导出eCRF');
    await exportVia('导出aCRF');
    pending.resolve(fakeResponse());
    await settle();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(downloads.clicks).toHaveLength(1);
  });
});

describe('App 侧栏宽度', () => {
  function sidebarWidth(wrapper) {
    return wrapper.get('.sidebar').element.style.width;
  }

  async function dragResizer(wrapper, from, to) {
    await wrapper.get('.sidebar-resizer').trigger('mousedown', { clientX: from });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: to }));
    await settle();
  }

  it('拖动分隔条按位移调整宽度并持久化，松开后停止跟随', async () => {
    const wrapper = await mountApp();

    await dragResizer(wrapper, 100, 160);
    expect(sidebarWidth(wrapper)).toBe('280px');
    expect(localStorage.getItem('crf_sidebarWidth')).toBe('280');
    expect(wrapper.get('.sidebar-resizer').classes()).toContain('dragging');
    document.dispatchEvent(new MouseEvent('mouseup'));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
    await settle();

    expect(sidebarWidth(wrapper)).toBe('280px');
    expect(wrapper.get('.sidebar-resizer').classes()).not.toContain('dragging');
  });

  it.each([
    [-1000, '120px'],
    [5000, '400px'],
  ])('拖动到 %i 时宽度限制为 %s', async (to, width) => {
    const wrapper = await mountApp();

    await dragResizer(wrapper, 100, to);
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(sidebarWidth(wrapper)).toBe(width);
  });

  it('启动时恢复已保存的侧栏宽度', async () => {
    localStorage.setItem('crf_sidebarWidth', '300');

    const wrapper = await mountApp();

    expect(sidebarWidth(wrapper)).toBe('300px');
  });
});

describe('App 工作区页签', () => {
  it('访视与访视流程页签按需加载并传入当前项目', async () => {
    const wrapper = await mountApp();
    expect(standIn(wrapper, 'VisitsTab').exists()).toBe(false);

    await openTab(wrapper, '访视');
    await openTab(wrapper, '访视流程');

    const visits = wrapper.findAll('[data-test="VisitsTab"]').map((node) => ({
      projectId: node.get('[data-prop="projectId"]').text(),
      workspace: node.get('[data-prop="workspace"]').text(),
    }));
    expect(visits).toEqual([
      { projectId: '5', workspace: 'list' },
      { projectId: '5', workspace: 'flow' },
    ]);
  });

  it('完全编辑模式提供选项、单位、字段页签，字段页按当前项目注入数据库类型', async () => {
    localStorage.setItem('crf_edit_mode', 'true');
    const wrapper = await mountApp({
      projects: [
        { id: 5, name: '赛美斯项目', version: '1.0', db_type: '赛美斯' },
        { id: 7, name: '未设类型项目', version: '1.0' },
      ],
    });

    await openTab(wrapper, '选项');
    await openTab(wrapper, '单位');
    await openTab(wrapper, '字段');
    expect(standInProps(wrapper, 'CodelistsTab')).toEqual({ projectId: '5' });
    expect(standInProps(wrapper, 'UnitsTab')).toEqual({ projectId: '5' });
    expect(wrapper.get('[data-test="FieldsTab"] [data-inject="projectDbType"]').text()).toBe('赛美斯');
    await selectProject(wrapper, '未设类型项目');
    await openTab(wrapper, '字段');

    expect(wrapper.get('[data-test="FieldsTab"] [data-inject="projectDbType"]').text()).toBe('其他');
  });

  it('关闭完全编辑模式时从高级页签回到项目信息', async () => {
    localStorage.setItem('crf_edit_mode', 'true');
    const wrapper = await mountApp();
    await openTab(wrapper, '字段');

    await toggleEditMode(wrapper);

    expect(localStorage.getItem('crf_edit_mode')).toBe('false');
    expect(activeTab(wrapper)).toBe('项目信息');
    expect(wrapper.findAll('.el-tabs__item').map((node) => node.text())).not.toContain('字段');
  });

  it('设计器拒绝离开时停留在表单页签，允许后才切换', async () => {
    const wrapper = await mountApp();
    await openTab(wrapper, '表单');
    designer.allowLeaveTab = false;

    await openTab(wrapper, '访视');
    expect(activeTab(wrapper)).toBe('表单');
    expect(standIn(wrapper, 'VisitsTab').exists()).toBe(false);
    designer.allowLeaveTab = true;
    await openTab(wrapper, '访视');

    expect(activeTab(wrapper)).toBe('访视');
  });

  it('设计器拒绝离开时不切换项目，允许后切换并回到项目信息', async () => {
    const wrapper = await mountApp();
    await openTab(wrapper, '表单');
    designer.allowLeaveProject = false;

    await selectProject(wrapper, '另一个测试项目');
    expect(activeProject(wrapper)).toBe('授权测试项目');
    designer.allowLeaveProject = true;
    await selectProject(wrapper, '另一个测试项目');

    expect(activeProject(wrapper)).toBe('另一个测试项目');
    expect(activeTab(wrapper)).toBe('项目信息');
  });
});

describe('App 模板导入弹窗', () => {
  const TEMPLATE_LIBRARY = {
    projects: [{ id: 21, name: '模板库', version: '2.0', forms: [{ id: 31, name: '人口学资料' }] }],
  };

  async function openImport(wrapper) {
    await openTab(wrapper, '表单');
    await clickStandInButton(wrapper, 'FormDesignerTab', '导入模板');
    return dialogByTitle(wrapper, '导入模板');
  }

  it('设计器请求导入时列出模板库，可预览并关闭单个表单预览', async () => {
    const wrapper = await mountApp({
      post: (url) => (url === '/api/projects/5/import-template' ? TEMPLATE_LIBRARY : undefined),
    });
    const dialog = await openImport(wrapper);
    expect(dialog.text()).toContain('模板库（v2.0，1 个表单）');

    await dialog.get('.el-tree-node__content').trigger('click');
    await settle();
    await buttonByText(dialog, '预览').trigger('click');
    await settle();
    await settle();
    expect(standInProps(wrapper, 'TemplatePreviewDialog')).toEqual({
      modelValue: 'true',
      projectId: '5',
      formId: '31',
      formName: '人口学资料',
    });
    await clickStandInButton(wrapper, 'TemplatePreviewDialog', '关闭预览');

    expect(standInProps(wrapper, 'TemplatePreviewDialog').modelValue).toBe('false');
  });

  it('模板加载失败时提示原因并关闭弹窗', async () => {
    const wrapper = await mountApp({ post: () => Promise.reject(new Error('模板库不可用')) });

    const dialog = await openImport(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('加载模板失败: 模板库不可用');
    expect(dialog.props('modelValue')).toBe(false);
  });

  it.each(['取消按钮', '对话框关闭事件'])('模板库为空时提示，并可通过%s关闭', async (via) => {
    const wrapper = await mountApp({ post: () => ({}) });
    const dialog = await openImport(wrapper);
    expect(dialog.text()).toContain('模板库中没有项目');

    if (via === '取消按钮') await buttonByText(dialog, '取消').trigger('click');
    else dialog.vm.$emit('update:modelValue', false);
    await settle();

    expect(dialog.props('modelValue')).toBe(false);
  });
});

describe('App 模板字段查询', () => {
  function searchDialog(wrapper) {
    return wrapper.findComponent({ name: 'TemplateFieldSearchDialogStandIn' });
  }

  async function openFromHeader(wrapper) {
    await wrapper.get('[aria-label="模板字段查询"]').trigger('click');
    await settle();
    await settle();
  }

  it('完全编辑模式下从头部或设计器打开，重复打开仍是同一个窗口', async () => {
    localStorage.setItem('crf_edit_mode', 'true');
    const wrapper = await mountApp();

    await openFromHeader(wrapper);
    const uid = searchDialog(wrapper).vm.$.uid;
    expect(searchDialog(wrapper).props('modelValue')).toBe(true);
    await openTab(wrapper, '表单');
    await clickStandInButton(wrapper, 'FormDesignerTab', '查询模板字段');

    expect(searchDialog(wrapper).vm.$.uid).toBe(uid);
    expect(searchDialog(wrapper).props('modelValue')).toBe(true);
  });

  it('查询窗口可自行关闭，退出完全编辑模式时自动关闭并隐藏入口', async () => {
    localStorage.setItem('crf_edit_mode', 'true');
    const wrapper = await mountApp();
    await openFromHeader(wrapper);

    await clickStandInButton(wrapper, 'TemplateFieldSearchDialog', '关闭查询');
    expect(searchDialog(wrapper).props('modelValue')).toBe(false);
    await openFromHeader(wrapper);
    await toggleEditMode(wrapper);

    expect(searchDialog(wrapper).props('modelValue')).toBe(false);
    expect(wrapper.find('[aria-label="模板字段查询"]').exists()).toBe(false);
  });
});

describe('App 导入 Word', () => {
  async function openWordImport(wrapper) {
    const settings = await openSettings(wrapper);
    await buttonByText(settings, '导入Word').trigger('click');
    await settle();
    return wrapper.findComponent(WordImportDialog);
  }

  it('设置中的导入Word打开向导，完成后切到表单页并选中导入的表单', async () => {
    const wrapper = await mountApp();
    const wizard = await openWordImport(wrapper);
    expect(wizard.props()).toMatchObject({ modelValue: true, projectId: 5 });

    wizard.vm.$emit('open-designer', 42);
    await settle();
    await settle();

    expect(wizard.props('modelValue')).toBe(false);
    expect(activeTab(wrapper)).toBe('表单');
    expect(designer.selectedFormIds).toEqual([42]);
  });

  it('向导自身关闭时同步隐藏', async () => {
    const wrapper = await mountApp();
    const wizard = await openWordImport(wrapper);

    wizard.vm.$emit('update:modelValue', false);
    await settle();

    expect(wizard.props('modelValue')).toBe(false);
  });
});
