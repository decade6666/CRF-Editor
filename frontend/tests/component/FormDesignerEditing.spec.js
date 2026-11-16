// FormDesignerTab 字段实例编辑行为挂载测试：预览双击快编、横向标记切换、
// log 行添加、字段删除（引用影响提醒）与批量删除。
// 外部边界：api 对象、ElMessageBox、sortablejs。使用设计器主画布真实预览（不开全屏弹窗）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import { api } from '../../src/composables/useApi.js';
import { installDesignMetadataFixture } from './designMetadataFixture.js';
beforeEach(() => installDesignMetadataFixture(vi, api));
import { body } from './appTestHarness.js';

vi.mock('sortablejs', () => ({
  default: { create: () => ({ destroy() {}, option() {} }) },
}));

const FORM_ID = 7;
const FORMS_URL = '/api/projects/1/forms';
const FIELDS_URL = `/api/forms/${FORM_ID}/fields`;
const FIELDS = [
  {
    id: 101,
    form_id: FORM_ID,
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
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
      is_multi_record: 0,
      table_type: '固定行',
      codelist: null,
      unit: null,
    },
  },
  {
    id: 102,
    form_id: FORM_ID,
    field_definition_id: 202,
    order_index: 2,
    is_log_row: 0,
    inline_mark: 0,
    required: 0,
    field_definition: {
      id: 202,
      project_id: 1,
      label: '体重',
      variable_name: 'WEIGHT',
      field_type: '数值',
      integer_digits: 3,
      decimal_digits: 1,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
      is_multi_record: 0,
      table_type: '固定行',
      codelist: null,
      unit: null,
    },
  },
];
const FIELD_DEFS = [FIELDS[0].field_definition, FIELDS[1].field_definition];
const AUX_URLS = ['/api/projects/1/field-definitions', '/api/projects/1/codelists', '/api/projects/1/units'];

async function mountDesignerEditing({ refs = {} } = {}) {
  vi.spyOn(api, 'cachedGet').mockImplementation(async (url) => {
    if (url === FORMS_URL) {
      return [
        {
          id: FORM_ID,
          project_id: 1,
          name: '知情同意',
          code: 'ICF',
          domain: 'DM',
          order_index: 1,
          paper_orientation: 'landscape',
        },
      ];
    }
    if (url === FIELDS_URL) return JSON.parse(JSON.stringify(FIELDS));
    if (AUX_URLS.includes(url)) return url.endsWith('field-definitions') ? JSON.parse(JSON.stringify(FIELD_DEFS)) : [];
    throw new Error(`未预期的读取：${url}`);
  });
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (typeof refs[url] !== 'undefined') return refs[url];
    return [];
  });
  vi.spyOn(api, 'post').mockResolvedValue({ id: 555 });
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
  await wrapper.vm.selectFormById(FORM_ID);
  await flushPromises();
  await nextTick();
  // 字段列表位于全屏设计器弹窗内（非 append-to-body），打开后 .ff-item 才渲染。
  const openButton = wrapper.findAll('button').find((node) => node.text().includes('设计表单'));
  expect(openButton, '应渲染「设计表单」按钮').toBeTruthy();
  await openButton.trigger('click');
  await flushPromises();
  await nextTick();
  return { wrapper, refreshKey };
}

async function dblclickPreviewField(wrapper, label) {
  const cell = wrapper.findAll('td').find((node) => node.text().includes(label));
  expect(cell, `预览中应渲染「${label}」单元格`).toBeTruthy();
  await cell.trigger('dblclick');
  await flushPromises();
  await nextTick();
}

function quickEditDialog() {
  const dialog = body()
    .findAll('.el-dialog')
    .find((node) => node.find('.el-dialog__title').text() === '快速编辑字段');
  expect(dialog, '快速编辑弹窗应渲染').toBeTruthy();
  return dialog;
}

function fieldItem(wrapper, label) {
  const item = wrapper.findAll('.ff-item').find((node) => node.text().includes(label));
  expect(item, `字段列表应渲染「${label}」`).toBeTruthy();
  return item;
}

async function clickFieldAction(wrapper, label, ariaLabel) {
  const button = fieldItem(wrapper, label).find(`button[aria-label="${ariaLabel}"]`);
  expect(button.exists(), `字段行应有「${ariaLabel}」操作`).toBeTruthy();
  await button.trigger('click');
  await flushPromises();
  await nextTick();
}

beforeEach(() => {
  localStorage.clear();
});

describe('FormDesigner 编辑 · 快速编辑', () => {
  it('双击预览单元格打开快编，保存提交 binding-profile 并提示', async () => {
    const { wrapper } = await mountDesignerEditing();

    await dblclickPreviewField(wrapper, '姓名');
    const dialog = quickEditDialog();
    const labelInput = dialog
      .findAll('.el-form-item')
      .find((node) => node.find('.el-form-item__label').text() === '字段标签')
      .get('input');
    expect(labelInput.element.value).toBe('姓名');
    await labelInput.setValue('姓名（改）');

    await dialog
      .findAll('button')
      .find((node) => node.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith(
      `/api/form-fields/101/binding-profile`,
      expect.objectContaining({
        definition_operation: { operation: 'none' },
        binding: { mode: 'keep' },
        instance: expect.objectContaining({
          mode: 'upsert',
          upsert: expect.objectContaining({ label_override: '姓名（改）' }),
        }),
      }),
    );
    expect(ElMessage.success).toHaveBeenCalledWith('已保存');
    expect(api.invalidateCache).toHaveBeenCalledWith(FIELDS_URL);
  });

  it('快编保存失败时提示且弹窗保持打开', async () => {
    const { wrapper } = await mountDesignerEditing();
    api.put.mockRejectedValue(new Error('后端拒绝'));

    await dblclickPreviewField(wrapper, '姓名');
    const dialog = quickEditDialog();
    await dialog
      .findAll('button')
      .find((node) => node.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('保存失败: 后端拒绝');
    expect(quickEditDialog()).toBeTruthy();
  });
});

describe('FormDesigner 编辑 · 横向标记与 log 行', () => {
  it('切换横向表格标记提交 binding-profile', async () => {
    const { wrapper } = await mountDesignerEditing();

    await clickFieldAction(wrapper, '体重', '切换 体重 的横向表格标记');

    expect(api.put).toHaveBeenCalledWith(
      `/api/form-fields/102/binding-profile`,
      expect.objectContaining({
        instance: expect.objectContaining({
          upsert: expect.objectContaining({ inline_mark: 1 }),
        }),
      }),
    );
    expect(api.invalidateCache).toHaveBeenCalledWith(FIELDS_URL);
  });

  it('表单被访视引用时先影响提醒再切换', async () => {
    const { wrapper } = await mountDesignerEditing({
      refs: { [`/api/forms/${FORM_ID}/references`]: [{ visit_name: '访视一' }] },
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    await clickFieldAction(wrapper, '体重', '切换 体重 的横向表格标记');

    expect(confirmSpy.mock.calls[0][0]).toContain('当前表单被以下访视引用');
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('添加 log 行提交实例创建并重载字段', async () => {
    const { wrapper } = await mountDesignerEditing();

    await wrapper.find('button[aria-label="添加“以下为log行”提示"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/forms/${FORM_ID}/fields`, {
      is_log_row: 1,
      label_override: '以下为log行',
    });
    expect(api.invalidateCache).toHaveBeenCalledWith(FIELDS_URL);
    expect(api.cachedGet.mock.calls.filter(([url]) => url === FIELDS_URL).length).toBe(3);
  });

  it('log 行添加失败时提示', async () => {
    const { wrapper } = await mountDesignerEditing();
    api.post.mockRejectedValue(new Error('写入失败'));

    await wrapper.find('button[aria-label="添加“以下为log行”提示"]').trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('写入失败');
  });
});

describe('FormDesigner 编辑 · 删除与批量删除', () => {
  async function deleteField(wrapper, label) {
    const button = fieldItem(wrapper, label).find('button[data-test="designer-delete-field"]');
    expect(button.exists(), '字段行应有删除按钮').toBeTruthy();
    await button.trigger('click');
    await flushPromises();
    await nextTick();
  }

  it('删除字段提交 DELETE 并重载', async () => {
    const { wrapper } = await mountDesignerEditing();

    await deleteField(wrapper, '姓名');

    expect(api.del).toHaveBeenCalledWith('/api/form-fields/101');
    expect(api.invalidateCache).toHaveBeenCalledWith(FIELDS_URL);
    expect(api.cachedGet.mock.calls.filter(([url]) => url === FIELDS_URL).length).toBe(3);
  });

  it('表单被访视引用时先确认，取消则不删除', async () => {
    const { wrapper } = await mountDesignerEditing({
      refs: { [`/api/forms/${FORM_ID}/references`]: [{ visit_name: '访视一' }] },
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    await deleteField(wrapper, '姓名');

    expect(confirmSpy.mock.calls[0][0]).toContain('修改将影响这些访视');
    expect(api.del).not.toHaveBeenCalled();

    confirmSpy.mockResolvedValue('confirm');
    await deleteField(wrapper, '姓名');
    expect(api.del).toHaveBeenCalledWith('/api/form-fields/101');
  });

  it('删除失败时提示', async () => {
    const { wrapper } = await mountDesignerEditing();
    api.del.mockRejectedValue(new Error('删除冲突'));

    await deleteField(wrapper, '姓名');

    expect(ElMessage.error).toHaveBeenCalledWith('删除冲突');
  });

  it('勾选字段后批量删除提交 batch-delete', async () => {
    const { wrapper } = await mountDesignerEditing();

    const checkbox = fieldItem(wrapper, '姓名').find('.el-checkbox input');
    expect(checkbox.exists()).toBe(true);
    await checkbox.setValue(true);
    await flushPromises();

    const batchButton = wrapper.find('button[data-test="designer-batch-delete"]');
    expect(batchButton.attributes('disabled')).toBeUndefined();
    await batchButton.trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/forms/${FORM_ID}/fields/batch-delete`, { ids: [101] });
    expect(api.invalidateCache).toHaveBeenCalledWith(FIELDS_URL);
  });
});
