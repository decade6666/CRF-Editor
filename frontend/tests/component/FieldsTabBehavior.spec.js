// FieldsTab 行为挂载测试：字段库列表（排除标签行）、新增/编辑保存与校验、
// 引用影响提醒、单删/批量删除、复制、搜索过滤与字典快捷入口。
// 外部边界：api 对象、ElMessageBox、sortablejs。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FieldsTab from '../../src/components/FieldsTab.vue';
import { api } from '../../src/composables/useApi.js';
import { installDesignMetadataFixture } from './designMetadataFixture.js';
beforeEach(() => installDesignMetadataFixture(vi, api));
import { OID_ERROR } from '../../src/composables/oidValidation.js';
import { body } from './appTestHarness.js';

vi.mock('sortablejs', () => ({
  default: { create: () => ({ destroy() {}, option() {} }) },
}));

const PROJECT_ID = 1;
const FIELDS = [
  {
    id: 31,
    variable_name: 'SEX',
    label: '性别',
    field_type: '单选',
    codelist_id: 11,
    unit_id: null,
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    checkbox_label: null,
    order_index: 1,
    is_log_row: 0,
    codelist: { id: 11, name: '性别' },
    unit: null,
  },
  {
    id: 32,
    variable_name: 'WEIGHT',
    label: '体重',
    field_type: '数值',
    codelist_id: null,
    unit_id: 21,
    integer_digits: 3,
    decimal_digits: 1,
    date_format: null,
    checkbox_label: null,
    order_index: 2,
    is_log_row: 0,
    codelist: null,
    unit: { id: 21, symbol: 'kg' },
  },
  {
    id: 33,
    variable_name: '',
    label: '以下为标签行',
    field_type: '标签',
    codelist_id: null,
    unit_id: null,
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    checkbox_label: null,
    order_index: 3,
    is_log_row: 0,
    codelist: null,
    unit: null,
  },
];
const CODELISTS = [{ id: 11, name: '性别', code: 'CL_SEX', options: [] }];
const UNITS = [{ id: 21, symbol: 'kg', code: 'UNIT_KG', order_index: 1 }];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function mountFields({ dbType = '其他' } = {}) {
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    if (url === `/api/projects/${PROJECT_ID}/field-definitions`) return Promise.resolve(clone(FIELDS));
    if (url === `/api/projects/${PROJECT_ID}/codelists`) return Promise.resolve(clone(CODELISTS));
    if (url === `/api/projects/${PROJECT_ID}/units`) return Promise.resolve(clone(UNITS));
    return Promise.reject(new Error(`未脚本化 cachedGet: ${url}`));
  });
  vi.spyOn(api, 'get').mockResolvedValue([]);
  vi.spyOn(api, 'post').mockResolvedValue({ id: 99 });
  vi.spyOn(api, 'put').mockResolvedValue({});
  vi.spyOn(api, 'del').mockResolvedValue(undefined);
  vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
  const refreshKey = ref(0);
  const wrapper = mount(FieldsTab, {
    props: { projectId: PROJECT_ID },
    global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref(dbType) } },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, refreshKey };
}

function paneTitle(wrapper) {
  return wrapper.find('.pane-tool-slot').text();
}

function findFormItem(scope, label) {
  return scope.findAll('.el-form-item').find((node) => {
    const labelNode = node.find('.el-form-item__label');
    return labelNode.exists() && labelNode.text() === label;
  });
}

function formItemByLabel(scope, label) {
  const item = findFormItem(scope, label);
  expect(item, `应渲染表单项「${label}」`).toBeTruthy();
  return item;
}

async function fillFormItem(scope, label, value) {
  await formItemByLabel(scope, label).get('input').setValue(value);
  await flushPromises();
}

async function selectUnitRow(wrapper, index = 0) {
  await wrapper.findAll('.el-table__row')[index].trigger('click');
  await flushPromises();
  await nextTick();
}

async function pickSelectOption(scope, label, optionText) {
  await formItemByLabel(scope, label).find('.el-select__wrapper').trigger('click');
  await flushPromises();
  const option = body()
    .findAll('.el-select-dropdown__item')
    .find((item) => item.text() === optionText);
  expect(option, `下拉应出现选项「${optionText}」`).toBeTruthy();
  await option.trigger('click');
  await flushPromises();
}

async function clickPaneButton(wrapper, text) {
  const button = wrapper.findAll('button').find((node) => node.text() === text);
  expect(button, `属性面板应有按钮「${text}」`).toBeTruthy();
  await button.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  localStorage.clear();
});

describe('FieldsTab · 加载与选择', () => {
  it('渲染字段库列表并排除标签行', async () => {
    const { wrapper } = await mountFields();

    const rows = wrapper.findAll('.el-table__row');
    expect(rows.length).toBe(2);
    expect(wrapper.text()).toContain('性别');
    expect(wrapper.text()).not.toContain('以下为标签行');
    expect(api.cachedGet).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/field-definitions`);
  });

  it('点击行进入编辑态并回显 OID 与标签', async () => {
    const { wrapper } = await mountFields();

    await selectUnitRow(wrapper, 0);

    expect(paneTitle(wrapper)).toContain('编辑字段');
    expect(formItemByLabel(wrapper, 'OID').get('input').element.value).toBe('SEX');
    expect(formItemByLabel(wrapper, '标签').get('input').element.value).toBe('性别');
  });

  it('切换字段类型为数值时显示位数输入并清空字典绑定', async () => {
    const { wrapper } = await mountFields();
    await selectUnitRow(wrapper, 0);

    await pickSelectOption(wrapper, '字段类型', '数值');
    await nextTick();

    expect(findFormItem(wrapper, '整数位数')).toBeTruthy();
    expect(findFormItem(wrapper, '小数位数')).toBeTruthy();
    expect(findFormItem(wrapper, '选项')).toBeUndefined();

    await clickPaneButton(wrapper, '保存');

    const payload = api.put.mock.calls[0][1];
    // 切离单选后字典绑定被清空；原行本无单位绑定，保持 null。
    expect(payload.codelist_id).toBeNull();
    expect(payload.unit_id).toBeNull();
  });

  it('搜索关键字过滤字段列表', async () => {
    const { wrapper } = await mountFields();

    await wrapper.find('.list-toolbar input').setValue('体重');
    await flushPromises();

    expect(wrapper.findAll('.el-table__row').length).toBe(1);
  });
});

describe('FieldsTab · 新增字段', () => {
  async function startCreate(wrapper) {
    await wrapper.find('button[aria-label="新增字段"]').trigger('click');
    await flushPromises();
    return wrapper;
  }

  it('新增字段预填变量名并 POST 成功后回填编辑态', async () => {
    const { wrapper } = await mountFields();
    await startCreate(wrapper);

    expect(paneTitle(wrapper)).toContain('新增字段');
    const oid = formItemByLabel(wrapper, 'OID').get('input').element.value;
    expect(oid).toMatch(/^FIELD_/);
    await fillFormItem(wrapper, '标签', '收缩压');

    await clickPaneButton(wrapper, '保存');

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/field-definitions`, {
      variable_name: oid,
      label: '收缩压',
      field_type: '文本',
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
    });
    expect(ElMessage.success).toHaveBeenCalledWith('新增成功');
    expect(paneTitle(wrapper)).toContain('编辑字段');
  });

  it('OID 非法时提示且不提交', async () => {
    const { wrapper } = await mountFields();
    await startCreate(wrapper);

    await fillFormItem(wrapper, 'OID', 'FIELD 甲!');
    await fillFormItem(wrapper, '标签', '收缩压');
    await clickPaneButton(wrapper, '保存');

    expect(ElMessage.warning).toHaveBeenCalledWith(OID_ERROR);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('赛美斯项目手输超长 OID 保存时提示上限', async () => {
    const { wrapper } = await mountFields({ dbType: '赛美斯' });
    await startCreate(wrapper);

    const oidInput = formItemByLabel(wrapper, 'OID').get('input');
    expect(oidInput.attributes('maxlength')).toBe('8');
    await oidInput.setValue('ABCDEFGHI');
    await fillFormItem(wrapper, '标签', '收缩压');
    await clickPaneButton(wrapper, '保存');

    expect(ElMessage.warning).toHaveBeenCalledWith('赛美斯数据库的字段 OID 最多为 8 位');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('单选字段未选字典时提示且不提交', async () => {
    const { wrapper } = await mountFields();
    await startCreate(wrapper);

    await pickSelectOption(wrapper, '字段类型', '单选');
    await fillFormItem(wrapper, '标签', '吸烟');
    await clickPaneButton(wrapper, '保存');

    expect(ElMessage.warning).toHaveBeenCalledWith('单选/多选字段必须选择选项字典');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('复选字段展示复选文本输入并随保存提交', async () => {
    const { wrapper } = await mountFields();
    await startCreate(wrapper);

    await pickSelectOption(wrapper, '字段类型', '复选');
    const checkboxInput = formItemByLabel(wrapper, '复选文本').get('input');
    expect(checkboxInput.attributes('placeholder')).toBe('✔');
    await checkboxInput.setValue('有');
    await fillFormItem(wrapper, '标签', '吸烟史');
    await clickPaneButton(wrapper, '保存');

    expect(api.post).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/field-definitions`,
      expect.objectContaining({
        field_type: '复选',
        checkbox_label: '有',
      }),
    );
  });
});

describe('FieldsTab · 编辑保存', () => {
  it('单表单引用直接 PUT 并回填', async () => {
    const { wrapper } = await mountFields();
    api.get.mockImplementation((url) =>
      url === '/api/field-definitions/31/references'
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }])
        : Promise.resolve([]),
    );
    await selectUnitRow(wrapper, 0);
    await fillFormItem(wrapper, '标签', '性别（改）');

    await clickPaneButton(wrapper, '保存');

    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/field-definitions/31`,
      expect.objectContaining({
        label: '性别（改）',
        codelist_id: 11,
      }),
    );
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
  });

  it('跨表单引用先影响提醒再 PUT，取消则不提交', async () => {
    const { wrapper } = await mountFields();
    api.get.mockImplementation((url) =>
      url === '/api/field-definitions/31/references'
        ? Promise.resolve([
            { form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' },
            { form_name: '表单乙', form_code: 'F2', field_label: '性别', field_var: 'SEX2' },
          ])
        : Promise.resolve([]),
    );
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await selectUnitRow(wrapper, 0);
    await fillFormItem(wrapper, '标签', '性别（改）');

    await clickPaneButton(wrapper, '保存');

    expect(confirmSpy.mock.calls[0][0]).toContain('修改将影响以下表单');
    expect(api.put).toHaveBeenCalledTimes(1);

    confirmSpy.mockRejectedValue('cancel');
    await fillFormItem(wrapper, '标签', '性别（再改）');
    await clickPaneButton(wrapper, '保存');

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('保存失败时提示', async () => {
    const { wrapper } = await mountFields();
    api.put.mockRejectedValue(new Error('写入失败'));
    await selectUnitRow(wrapper, 0);

    await clickPaneButton(wrapper, '保存');

    expect(ElMessage.error).toHaveBeenCalledWith('写入失败');
  });
});

describe('FieldsTab · 删除与复制', () => {
  it('删除被引用字段只提醒不删除', async () => {
    const { wrapper } = await mountFields();
    api.get.mockImplementation((url) =>
      url === '/api/field-definitions/31/references'
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }])
        : Promise.resolve([]),
    );
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('需先从相关表单中移除该字段');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
  });

  it('删除未引用字段经确认后 DELETE', async () => {
    const { wrapper } = await mountFields();
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(api.del).toHaveBeenCalledWith('/api/field-definitions/31');
  });

  it('取消删除确认时不提交', async () => {
    const { wrapper } = await mountFields();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('混合引用批量删除确认后只删除未引用组', async () => {
    const { wrapper } = await mountFields();
    api.post.mockImplementation((url) => {
      if (url === `/api/projects/${PROJECT_ID}/field-definitions/batch-references`) {
        return Promise.resolve({
          31: [{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }],
          32: [],
        });
      }
      return Promise.resolve({ deleted: 1 });
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    for (const index of [0, 1]) {
      const checkbox = wrapper.findAll('.el-table__row')[index].find('.el-checkbox input');
      await checkbox.setValue(true);
      await flushPromises();
    }
    await wrapper.find('button[aria-label="批量删除字段"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/field-definitions/batch-references`, {
      ids: [31, 32],
    });
    expect(confirmSpy.mock.calls[0][0]).toContain('以下 1 个字段已被引用');
    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/field-definitions/batch-delete`, { ids: [32] });
    expect(ElMessage.success).toHaveBeenCalledWith('已删除 1 个字段，1 个被引用的字段未删除');
  });

  it('复制字段提交 copy 请求并提示', async () => {
    const { wrapper } = await mountFields();

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="复制"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/field-definitions/31/copy', {});
    expect(ElMessage.success).toHaveBeenCalledWith('复制成功');
  });

  it('复制失败时提示错误', async () => {
    const { wrapper } = await mountFields();
    api.post.mockRejectedValue(new Error('复制冲突'));

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="复制"]').trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('复制冲突');
  });
});

describe('FieldsTab · 字典快捷入口', () => {
  it('新增字典按钮打开共享弹窗，取消后关闭且不提交', async () => {
    const { wrapper } = await mountFields();
    await selectUnitRow(wrapper, 0);
    await pickSelectOption(wrapper, '字段类型', '单选');
    await nextTick();

    const addButton = formItemByLabel(wrapper, '选项').find('button[aria-label="新增字典"]');
    expect(addButton.exists()).toBe(true);
    await addButton.trigger('click');
    await flushPromises();

    // 共享弹窗未开 append-to-body，内容渲染在组件子树内。
    const quickDialog = wrapper
      .findAll('.el-dialog')
      .find((node) => node.find('.el-dialog__title').text() === '新增选项字典');
    expect(quickDialog, '共享新增字典弹窗应渲染').toBeTruthy();

    const cancelButton = quickDialog.findAll('button').find((node) => node.text() === '取消');
    expect(cancelButton, '弹窗应有取消按钮').toBeTruthy();
    await cancelButton.trigger('click');
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
  });

  it('未选字典时编辑字典按钮禁用', async () => {
    const { wrapper } = await mountFields();
    await wrapper.find('button[aria-label="新增字段"]').trigger('click');
    await flushPromises();
    await pickSelectOption(wrapper, '字段类型', '单选');
    await nextTick();

    const editButton = formItemByLabel(wrapper, '选项').find('button[aria-label="编辑字典"]');
    expect(editButton.exists()).toBe(true);
    expect(editButton.attributes('disabled')).toBeDefined();
  });

  it('选中已有字典后编辑字典按钮可用并打开编辑弹窗', async () => {
    const { wrapper } = await mountFields();
    await selectUnitRow(wrapper, 0);
    await nextTick();

    const editButton = formItemByLabel(wrapper, '选项').find('button[aria-label="编辑字典"]');
    expect(editButton.attributes('disabled')).toBeUndefined();
    await editButton.trigger('click');
    await flushPromises();

    const quickDialog = wrapper
      .findAll('.el-dialog')
      .find((node) => node.find('.el-dialog__title').text() === '编辑选项字典');
    expect(quickDialog, '共享编辑字典弹窗应渲染').toBeTruthy();
  });
});
