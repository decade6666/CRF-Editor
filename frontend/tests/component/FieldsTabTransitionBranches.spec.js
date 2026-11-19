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
