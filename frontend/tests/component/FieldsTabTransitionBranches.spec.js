// R3：FieldsTab 字典过渡采纳的补充行为分支。
// 1) 无过渡元数据的服务器（旧后端兼容）：快捷新增照常提交，宿主经 load() 一致重读刷新，
//    不弹「已保存但检测到其他最新修改」警告，新字典仍回绑当前编辑器。
// 2) 编辑字典入口守卫：无绑定字典 / 绑定的字典已不在列表中时不打开弹窗（不发起请求）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../src/composables/useApi.js';
import FieldsTab from '../../src/components/FieldsTab.vue';
import { stageDesignServer } from './designServerFixture.js';

vi.mock('sortablejs', () => ({ default: { create: () => ({ destroy() {}, option() {} }) } }));
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises(); };
const body = () => new DOMWrapper(document.body);

function formItemByText(scope, label) {
  return scope.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text().trim() === label);
}
async function pickFieldType(wrapper, optionText) {
  const item = formItemByText(wrapper, '字段类型');
  await item.get('.el-select__wrapper').trigger('click');
  await settle();
  const option = body().findAll('.el-select-dropdown__item').find((node) => node.text() === optionText);
  expect(option, `下拉应出现选项「${optionText}」`).toBeTruthy();
  await option.trigger('click');
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('R3：FieldsTab 字典过渡分支', () => {
  it('无过渡元数据时快捷新增字典仍成功：一致重读刷新列表且新字典回绑编辑器', async () => {
    const server = stageDesignServer();
    const refreshKey = ref(0);
    const wrapper = mount(FieldsTab, { props: { projectId: 1 },
      global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
    });
    await settle();
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    // 默认（无 useTransitionMetadata）：POST 响应不带过渡头 → 采纳退化为 load() 一致重读。
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    await dialog.findAll('.el-form-item')[0].get('input').setValue('兼容字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    // 业务写入已提交且列表经一致重读装进新字典，无外部变化误报。
    expect(server.writes().map((call) => call.accepted)).toEqual([true]);
    expect(ElMessage.warning, '无过渡证据不是外部变化，不得误报').not.toHaveBeenCalledWith(
      '已保存，但检测到其他最新修改；当前列表未刷新，保存前请先核对',
    );
    await formItemByText(wrapper, '选项').get('.el-select__wrapper').trigger('click');
    await settle();
    const items = body().findAll('.el-select-dropdown__item').map((node) => node.text());
    expect(items, '一致重读把新字典装进当前编辑器下拉').toContain('兼容字典');
    expect(server.state.codelists.map((c) => c.name)).toContain('兼容字典');
    api.clearAllCache();
  });

  it('编辑字典入口守卫：绑定的字典不在列表中时不打开弹窗也不发请求', async () => {
    const server = stageDesignServer();
    const refreshKey = ref(0);
    const wrapper = mount(FieldsTab, { props: { projectId: 1 },
      global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
    });
    await settle();
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    // 先正常绑定一个字典（无过渡元数据路径），再把它从服务器列表里移除并重读，
    // 使 editProp.codelist_id 指向已消失的字典 → 守卫直接返回。
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    await dialog.findAll('.el-form-item')[0].get('input').setValue('移除字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    server.remote((state) => { state.codelists = []; });
    api.invalidateCache('/api/projects/1/codelists');
    refreshKey.value++;
    await settle();
    const callsBefore = server.calls.length;
    const editButton = formItemByText(wrapper, '选项')
      .findAll('button').find((node) => node.attributes()['aria-label'] === '编辑字典');
    expect(editButton, '应有编辑字典入口').toBeTruthy();
    await editButton.trigger('click');
    await settle();
    expect(server.calls.length, '守卫返回不得发起任何请求').toBe(callsBefore);
    expect(wrapper.findAll('.el-dialog').find((node) => node.text().includes('编辑选项'))).toBeUndefined();
    api.clearAllCache();
  });
});

// ── CL-2：已提交创建 ≠ 刷新失败（字段库宿主）─────────────────────────────────
// POST 已提交后，候选一致读 / 无元数据一致回退 / 字典下拉回退中任何一个失败，都必须由
// 共享弹窗给出唯一的「已创建但刷新失败」终态；宿主不再吞掉读取失败假装成功、不再误绑、
// 不得把外部间隙提示误当唯一反馈。只有读取成功且新字典确实在已验证列表里才回绑。
describe('CL-2：字段库快捷新增的已提交/刷新失败分离', () => {
  const COMMITTED_REFRESH_FAILED_MESSAGE = '字典已创建，但列表刷新失败，请刷新后核对，勿重复新增。';
  const COMMITTED_NOT_VISIBLE_MESSAGE = '字典已创建，但当前列表尚未显示新字典，请刷新后核对，勿重复新增。';
  const SAVED_BUT_FOREIGN_MESSAGE = '已保存，但检测到其他最新修改；当前列表未刷新，保存前请先核对';

  async function mountFieldsWithChoice() {
    const server = stageDesignServer();
    const refreshKey = ref(0);
    const wrapper = mount(FieldsTab, { props: { projectId: 1 },
      global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
    });
    await settle();
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    return { server, wrapper, refreshKey };
  }

  async function submitQuickAdd(wrapper, name = '快速字典') {
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    expect(dialog, '应有新增字典弹窗').toBeTruthy();
    await dialog.findAll('.el-form-item')[0].get('input').setValue(name);
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    return dialog;
  }

  function editCodelistButton(wrapper) {
    return formItemByText(wrapper, '选项')
      .findAll('button').find((node) => node.attributes()['aria-label'] === '编辑字典');
  }

  it('候选一致读失败：弹窗唯一终态警告，宿主不误报加载失败、不误报成功、不误绑', async () => {
    const { server, wrapper } = await mountFieldsWithChoice();
    server.useTransitionMetadata(true);
    server.onAccepted(() => server.failReads());

    await submitQuickAdd(wrapper);

    expect(server.writes(), '业务写入已提交且仅一次').toEqual([expect.objectContaining({ method: 'POST', accepted: true })]);
    expect(ElMessage.warning).toHaveBeenCalledTimes(1);
    expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_REFRESH_FAILED_MESSAGE);
    expect(ElMessage.error, '宿主不得再弹加载失败').not.toHaveBeenCalled();
    expect(ElMessage.success, '刷新失败不得误报新增成功').not.toHaveBeenCalled();
    expect(editCodelistButton(wrapper).attributes('disabled'), '未验证的新字典不得回绑').toBeDefined();
    api.clearAllCache();
  });

  it('无过渡元数据的一致回退读失败：同样唯一终态警告且不误绑', async () => {
    const { server, wrapper } = await mountFieldsWithChoice();
    server.onAccepted(() => server.failReads());

    await submitQuickAdd(wrapper);

    expect(server.writes()[0].accepted).toBe(true);
    expect(ElMessage.warning).toHaveBeenCalledTimes(1);
    expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_REFRESH_FAILED_MESSAGE);
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(editCodelistButton(wrapper).attributes('disabled')).toBeDefined();
    api.clearAllCache();
  });

  it('外部间隙后的字典下拉回退读失败：弃用外部间隙提示，唯一终态警告且不误绑', async () => {
    const { server, wrapper } = await mountFieldsWithChoice();
    server.useTransitionMetadata(true);
    server.onAccepted(() => server.remote((state) => { state.definitions[0].label = '外部字段标签'; }));
    vi.spyOn(api, 'cachedGet').mockRejectedValueOnce(new Error('下拉刷新失败'));

    await submitQuickAdd(wrapper);

    expect(server.writes()[0].accepted).toBe(true);
    expect(ElMessage.warning).toHaveBeenCalledTimes(1);
    expect(ElMessage.warning, '外部间隙提示被弃用，只留唯一终态警告').toHaveBeenCalledWith(COMMITTED_REFRESH_FAILED_MESSAGE);
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(editCodelistButton(wrapper).attributes('disabled')).toBeDefined();
    api.clearAllCache();
  });

  it('回退读成功但新字典不在列表：唯一「尚未显示」警告且不误绑', async () => {
    const { server, wrapper } = await mountFieldsWithChoice();
    server.onAccepted(() => server.remote((state) => { state.codelists = []; }));

    await submitQuickAdd(wrapper);

    expect(server.writes()[0].accepted).toBe(true);
    expect(ElMessage.warning).toHaveBeenCalledTimes(1);
    expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_NOT_VISIBLE_MESSAGE);
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(editCodelistButton(wrapper).attributes('disabled')).toBeDefined();
    api.clearAllCache();
  });

  it('对照：外部间隙但回退读成功且字典可见 → 保留保守间隙提示并正常回绑', async () => {
    const { server, wrapper } = await mountFieldsWithChoice();
    server.useTransitionMetadata(true);
    server.onAccepted(() => server.remote((state) => { state.definitions[0].label = '外部字段标签'; }));

    await submitQuickAdd(wrapper);

    expect(server.writes()[0].accepted).toBe(true);
    expect(ElMessage.warning).toHaveBeenCalledWith(SAVED_BUT_FOREIGN_MESSAGE);
    expect(ElMessage.success).toHaveBeenCalledWith('新增成功');
    expect(editCodelistButton(wrapper).attributes('disabled'), '已验证可见的新字典照常回绑').toBeUndefined();
    await formItemByText(wrapper, '选项').get('.el-select__wrapper').trigger('click');
    await settle();
    expect(new DOMWrapper(document.body).findAll('.el-select-dropdown__item').map((node) => node.text()))
      .toContain('快速字典');
    api.clearAllCache();
  });

  it('对照：刷新期间换选其他字段 → 宿主静默取消，不回绑新字段编辑器', async () => {
    const { server, wrapper } = await mountFieldsWithChoice();
    server.useTransitionMetadata(true);
    let releases = null;
    server.onAccepted(() => { releases = server.holdReads(3); });

    await submitQuickAdd(wrapper);
    expect(releases, '一致重读应被扣住').toBeTruthy();
    await wrapper.findAll('.el-table__row')[1].trigger('click');
    await settle();
    releases.forEach((release) => release());
    await settle();

    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
    await pickFieldType(wrapper, '单选');
    expect(editCodelistButton(wrapper).attributes('disabled'), '离开的回绑不得落到新编辑器').toBeDefined();
    api.clearAllCache();
  });
});
