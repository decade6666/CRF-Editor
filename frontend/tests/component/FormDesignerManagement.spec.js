// FormDesignerTab 表单列表管理行为挂载测试：删除（引用拦截/确认/取消）、复制、
// 批量删除分组确认、新建表单 OID 校验、序号快捷改序与 refreshKey 重载。
// 外部边界：api 对象、ElMessageBox、sortablejs。表单列表与新建/编辑弹窗不依赖打开设计器。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import { api } from '../../src/composables/useApi.js';
import { OID_ERROR } from '../../src/composables/oidValidation.js';

vi.mock('sortablejs', () => ({
  default: { create: () => ({ destroy() {}, option() {} }) },
}));

const FORMS_URL = '/api/projects/1/forms';
const FORMS = [
  { id: 7, project_id: 1, name: '知情同意', code: 'ICF', domain: 'DM', order_index: 1, paper_orientation: 'landscape' },
  { id: 8, project_id: 1, name: '体格检查', code: 'PE', domain: null, order_index: 2, paper_orientation: 'auto' },
];
const FIELDS_BY_FORM = {
  7: [
    {
      id: 101,
      form_id: 7,
      field_definition_id: 201,
      order_index: 1,
      is_log_row: 0,
      inline_mark: 0,
      required: 0,
      field_definition: {
        id: 201,
        project_id: 1,
        label: '姓名',
        variable_name: 'NAME',
        field_type: '文本',
        is_multi_record: 0,
        table_type: '固定行',
      },
    },
  ],
  8: [],
};
const AUX_URLS = ['/api/projects/1/field-definitions', '/api/projects/1/codelists', '/api/projects/1/units'];

function cloneForms() {
  return JSON.parse(JSON.stringify(FORMS));
}

async function mountDesignerManagement({ refs = {}, postRoutes = {} } = {}) {
  const formsState = cloneForms();
  vi.spyOn(api, 'cachedGet').mockImplementation(async (url) => {
    if (url === FORMS_URL) return JSON.parse(JSON.stringify(formsState));
    if (url.startsWith('/api/forms/') && url.endsWith('/fields')) {
      const id = Number(url.split('/')[3]);
      return JSON.parse(JSON.stringify(FIELDS_BY_FORM[id] || []));
    }
    if (AUX_URLS.includes(url)) return [];
    throw new Error(`未预期的读取：${url}`);
  });
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (typeof refs[url] !== 'undefined') return refs[url];
    return [];
  });
  vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    if (typeof postRoutes[url] !== 'undefined') return postRoutes[url];
    if (url === FORMS_URL) {
      const created = { id: 9, project_id: 1, order_index: 3, paper_orientation: 'auto', ...body };
      formsState.push(JSON.parse(JSON.stringify(created)));
      return JSON.parse(JSON.stringify(created));
    }
    return {};
  });
  vi.spyOn(api, 'put').mockResolvedValue({});
  vi.spyOn(api, 'del').mockResolvedValue(undefined);
  vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
  const refreshKey = ref(0);
  const wrapper = mount(FormDesignerTab, {
    props: { projectId: 1 },
    global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, refreshKey };
}

function formRow(wrapper, name) {
  const row = wrapper.findAll('.el-table__row').find((node) => node.text().includes(name));
  expect(row, `应渲染表单行「${name}」`).toBeTruthy();
  return row;
}

async function clickRowAction(wrapper, name, label) {
  const button = formRow(wrapper, name).find(`button[aria-label="${label}"]`);
  expect(button.exists(), `表单行应有「${label}」操作`).toBe(true);
  await button.trigger('click');
  await flushPromises();
}

async function selectRowCheckbox(wrapper, index = 0) {
  const checkbox = wrapper.findAll('.el-table__row')[index].find('.el-checkbox input');
  expect(checkbox.exists(), '表单行应有选择框').toBe(true);
  await checkbox.setValue(true);
  await flushPromises();
}

async function selectFormById(wrapper, formId) {
  await wrapper.vm.selectFormById(formId);
  await flushPromises();
  await nextTick();
}

beforeEach(() => {
  localStorage.clear();
});

describe('FormDesigner 管理 · 删除表单', () => {
  it('删除被访视引用的表单只提醒不删除', async () => {
    const { wrapper } = await mountDesignerManagement({
      refs: { '/api/forms/8/references': [{ visit_name: '访视一' }, { visit_name: '访视二' }] },
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    await clickRowAction(wrapper, '体格检查', '删除');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('该表单被以下访视引用');
    expect(alertSpy.mock.calls[0][0]).toContain('访视一');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
  });

  it('删除未引用表单经确认后 DELETE 并重载', async () => {
    const { wrapper } = await mountDesignerManagement();
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    await clickRowAction(wrapper, '体格检查', '删除');

    expect(confirmSpy).toHaveBeenCalledWith('删除表单 "体格检查"？', '确认', { type: 'warning' });
    expect(api.del).toHaveBeenCalledWith('/api/forms/8');
    expect(api.invalidateCache).toHaveBeenCalledWith(FORMS_URL);
    expect(api.cachedGet.mock.calls.filter(([url]) => url === FORMS_URL).length).toBe(2);
  });

  it('取消删除确认时不删除也不报错', async () => {
    const { wrapper } = await mountDesignerManagement();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    await clickRowAction(wrapper, '体格检查', '删除');

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('删除失败时提示错误', async () => {
    const { wrapper } = await mountDesignerManagement();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    api.del.mockRejectedValue(new Error('删除冲突'));

    await clickRowAction(wrapper, '体格检查', '删除');

    expect(ElMessage.error).toHaveBeenCalledWith('删除冲突');
  });
});

describe('FormDesigner 管理 · 复制表单', () => {
  it('复制表单提交 copy 请求并提示', async () => {
    const { wrapper } = await mountDesignerManagement();

    await clickRowAction(wrapper, '知情同意', '复制');

    expect(api.post).toHaveBeenCalledWith('/api/forms/7/copy', {});
    expect(ElMessage.success).toHaveBeenCalledWith('复制成功');
  });

  it('复制失败时提示错误', async () => {
    const { wrapper } = await mountDesignerManagement();
    api.post.mockRejectedValue(new Error('复制冲突'));

    await clickRowAction(wrapper, '知情同意', '复制');

    expect(ElMessage.error).toHaveBeenCalledWith('复制冲突');
  });
});

describe('FormDesigner 管理 · 批量删除表单', () => {
  it('混合引用分组确认后只删除未引用组并提示部分删除', async () => {
    const { wrapper } = await mountDesignerManagement({
      postRoutes: {
        [`${FORMS_URL}/batch-references`]: {
          7: [{ visit_name: '访视一' }],
          8: [],
        },
        [`${FORMS_URL}/batch-delete`]: { deleted: 1 },
      },
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    await selectRowCheckbox(wrapper, 0);
    await selectRowCheckbox(wrapper, 1);
    await wrapper.find('button[aria-label="批量删除表单"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`${FORMS_URL}/batch-references`, { ids: [7, 8] });
    expect(confirmSpy.mock.calls[0][0]).toContain('以下 1 个表单已被引用');
    expect(confirmSpy.mock.calls[0][0]).toContain('知情同意');
    expect(api.post).toHaveBeenCalledWith(`${FORMS_URL}/batch-delete`, { ids: [8] });
    expect(ElMessage.success).toHaveBeenCalledWith('已删除 1 个表单，1 个被引用的表单未删除');
  });

  it('全部被引用时只提醒不提交删除', async () => {
    const { wrapper } = await mountDesignerManagement({
      postRoutes: {
        [`${FORMS_URL}/batch-references`]: {
          7: [{ visit_name: '访视一' }],
          8: [{ visit_name: '访视二' }],
        },
      },
    });
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    await selectRowCheckbox(wrapper, 0);
    await selectRowCheckbox(wrapper, 1);
    await wrapper.find('button[aria-label="批量删除表单"]').trigger('click');
    await flushPromises();

    expect(alertSpy.mock.calls[0][0]).toContain('均已被引用');
    expect(api.post.mock.calls.filter(([url]) => url.endsWith('/batch-delete'))).toHaveLength(0);
  });
});

describe('FormDesigner 管理 · 新建表单', () => {
  it('OID 非法时提示且不提交', async () => {
    const { wrapper } = await mountDesignerManagement();

    await wrapper.find('button[aria-label="新建表单"]').trigger('click');
    await flushPromises();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text() === '新建表单');
    expect(dialog, '新建表单弹窗应渲染').toBeTruthy();
    const oidInput = dialog.findAll('.el-form-item')[0].get('input');
    await oidInput.setValue('FORM 甲!');
    await flushPromises();
    await dialog.findAll('.el-form-item')[1].get('input').setValue('新表单');
    await flushPromises();

    await dialog
      .findAll('button')
      .find((node) => node.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith(OID_ERROR);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('新建表单成功后选中新表单', async () => {
    const { wrapper } = await mountDesignerManagement();

    await wrapper.find('button[aria-label="新建表单"]').trigger('click');
    await flushPromises();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text() === '新建表单');
    await dialog.findAll('.el-form-item')[1].get('input').setValue('新表单');
    await flushPromises();

    await dialog
      .findAll('button')
      .find((node) => node.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(FORMS_URL, expect.objectContaining({ name: '新表单', domain: null }));
    expect(wrapper.vm.getForms().some((form) => form.id === 9)).toBe(true);
  });
});

describe('FormDesigner 管理 · 排序与刷新', () => {
  it('表单序号快捷改序提交重排请求', async () => {
    const { wrapper } = await mountDesignerManagement();

    await wrapper.findAll('.el-table__row')[0].find('.ordinal-cell').trigger('dblclick');
    await flushPromises();
    const ordinalInput = wrapper.findAll('.el-table__row')[0].find('.el-input-number input');
    expect(ordinalInput.exists()).toBe(true);
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/projects/1/forms/reorder', [8, 7]);
  });

  it('重排保存失败时恢复并提示', async () => {
    const { wrapper } = await mountDesignerManagement();
    api.post.mockRejectedValue(new Error('排序失败'));

    await wrapper.findAll('.el-table__row')[0].find('.ordinal-cell').trigger('dblclick');
    await flushPromises();
    const ordinalInput = wrapper.findAll('.el-table__row')[0].find('.el-input-number input');
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith('排序保存失败，已恢复');
  });

  it('refreshKey 变化重载表单列表', async () => {
    const { wrapper, refreshKey } = await mountDesignerManagement();
    const callsBefore = api.cachedGet.mock.calls.filter(([url]) => url === FORMS_URL).length;

    refreshKey.value += 1;
    await flushPromises();

    expect(api.cachedGet.mock.calls.filter(([url]) => url === FORMS_URL).length).toBe(callsBefore + 1);
    expect(wrapper.vm.getForms()).toHaveLength(2);
  });

  it('选中表单后 refreshKey 重载仍保留选中', async () => {
    const { wrapper, refreshKey } = await mountDesignerManagement();
    await selectFormById(wrapper, 7);

    refreshKey.value += 1;
    await flushPromises();

    // 同表单重载保持选中身份：选中表单对象与重载后的列表引用一致。
    const forms = wrapper.vm.getForms();
    expect(forms).toHaveLength(2);
    expect(wrapper.text()).toContain('知情同意');
  });
});
