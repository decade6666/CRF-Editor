import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import VisitFormPreviewDialog from '../../src/components/VisitFormPreviewDialog.vue';
import { api } from '../../src/composables/useApi.js';
import { installDesignMetadataFixture } from './designMetadataFixture.js';
beforeEach(() => installDesignMetadataFixture(vi, api));

vi.mock('sortablejs', () => ({ default: { create: () => ({ destroy() {} }) } }));

const FORM_ID = 7;
const FORMS_URL = '/api/projects/1/forms';
const FREE_DOMAIN = 'dM / Vs；自定义 <域>';

function stageApi(domain = 'legacyDomain') {
  let forms = [
    { id: FORM_ID, project_id: 1, name: '知情同意', code: 'legacy_code_long', domain,
      order_index: 1, paper_orientation: 'landscape', annotation_positions: { _form: { y: 15 } } },
    { id: 8, project_id: 1, name: '第二表单', code: 'SECOND', domain: null,
      order_index: 2, paper_orientation: 'auto' },
  ];
  const fields = [{
    id: 101, form_id: FORM_ID, field_definition_id: 201, order_index: 1,
    is_log_row: 0, inline_mark: 0, required: 0,
    field_definition: { id: 201, project_id: 1, label: '姓名', variable_name: 'NAME',
      field_type: '文本', is_multi_record: 0, table_type: '固定行' },
  }];
  vi.spyOn(api, 'cachedGet').mockImplementation(async (url) => {
    if (url === FORMS_URL) return structuredClone(forms);
    if (url === `/api/forms/${FORM_ID}/fields`) return structuredClone(fields);
    if (url === '/api/forms/8/fields' || url === '/api/forms/9/fields' || url === '/api/projects/1/field-definitions' ||
        url === '/api/projects/1/codelists' || url === '/api/projects/1/units') return [];
    throw new Error(`未预期的读取：${url}`);
  });
  const get = vi.spyOn(api, 'get').mockResolvedValue([]);
  const put = vi.spyOn(api, 'put').mockImplementation(async (url, body) => {
    expect(url).toBe(`/api/forms/${FORM_ID}`);
    forms = forms.map((form) => form.id === FORM_ID ? { ...form, ...body } : form);
    return structuredClone(forms[0]);
  });
  const post = vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    expect(url).toBe(FORMS_URL);
    const created = { id: 9, project_id: 1, order_index: 3, paper_orientation: 'auto', ...body };
    forms = [...forms, created];
    return structuredClone(created);
  });
  return { get, put, post };
}

function button(scope, text) {
  const match = scope.findAll('button').find((node) => node.text().trim() === text);
  expect(match, `应显示「${text}」按钮`).toBeTruthy();
  return match;
}

function input(scope, label) {
  const item = scope.findAll('.el-form-item').find((node) =>
    node.find('.el-form-item__label').text().trim() === label);
  expect(item, `应显示「${label}」输入`).toBeTruthy();
  return item.find('input');
}

function dialog(wrapper, title) {
  const match = wrapper.findAll('.el-dialog').find((node) =>
    node.find('.el-dialog__title').text().trim() === title);
  expect(match, `应显示「${title}」弹窗`).toBeTruthy();
  return match;
}

async function settle() {
  await flushPromises();
  await nextTick();
}

async function mountDesigner({ domain = 'legacyDomain', full = true, open = true } = {}) {
  const mocks = stageApi(domain);
  const editMode = ref(full);
  localStorage.setItem('crf_view_mode', 'aCRF');
  const wrapper = mount(FormDesignerTab, {
    props: { projectId: 1 },
    global: { provide: { refreshKey: ref(0), editMode, projectDbType: ref('赛美斯') } },
  });
  await settle();
  await wrapper.vm.selectFormById(FORM_ID);
  await settle();
  if (open) {
    await button(wrapper, '设计表单').trigger('click');
    await settle();
  }
  return { wrapper, mocks, editMode };
}

async function openFormDialog(wrapper, title) {
  const label = title === '新建表单' ? '新建表单' : '编辑';
  await wrapper.find(`button[aria-label="${label}"]`).trigger('click');
  await settle();
  return dialog(wrapper, title);
}

function propertyPane(wrapper) {
  return wrapper.find('[data-test="designer-form-property-form"]');
}

function saveButton(wrapper) {
  return wrapper.find('[data-test="designer-form-property-save"]');
}

describe('表单域：新增和编辑弹窗', () => {
  it('新建保留大小写、分隔符及自由文本，不应用 OID 限制', async () => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    const add = await openFormDialog(wrapper, '新建表单');
    await input(add, '名称').setValue('新表单');
    await input(add, '表单域').setValue(FREE_DOMAIN);
    expect(input(add, '表单域').attributes('maxlength')).toBeUndefined();
    expect(mocks.post).not.toHaveBeenCalled();
    await button(add, '确定').trigger('click');
    await settle();
    expect(mocks.post).toHaveBeenCalledWith(FORMS_URL, expect.objectContaining({ domain: FREE_DOMAIN }));
  });

  it.each(['', '   '])('新建空白域 %j 保存为 null', async (domain) => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    const add = await openFormDialog(wrapper, '新建表单');
    await input(add, '名称').setValue('空域表单');
    await input(add, '表单域').setValue(domain);
    await button(add, '确定').trigger('click');
    await settle();
    expect(mocks.post.mock.calls[0][1].domain).toBeNull();
  });

  it('取消新建零写入，再开时不带入已放弃的域', async () => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    const add = await openFormDialog(wrapper, '新建表单');
    await input(add, '表单域').setValue(FREE_DOMAIN);
    await button(add, '取消').trigger('click');
    await settle();
    expect(mocks.post).not.toHaveBeenCalled();
    const reopened = await openFormDialog(wrapper, '新建表单');
    expect(input(reopened, '表单域').element.value).toBe('');
  });

  it('新建失败保留域和名称，修复后可重试', async () => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    mocks.post.mockRejectedValueOnce(new Error('保存失败，请重试'));
    const add = await openFormDialog(wrapper, '新建表单');
    await input(add, '名称').setValue('失败后重试');
    await input(add, '表单域').setValue(FREE_DOMAIN);
    await button(add, '确定').trigger('click');
    await settle();
    expect(ElMessage.error).toHaveBeenCalledWith('保存失败，请重试');
    expect(input(add, '表单域').element.value).toBe(FREE_DOMAIN);
    expect(input(add, '名称').element.value).toBe('失败后重试');
    await button(add, '确定').trigger('click');
    await settle();
    expect(mocks.post).toHaveBeenLastCalledWith(FORMS_URL, expect.objectContaining({ domain: FREE_DOMAIN }));
  });

  it('编辑保存后重新打开显示已保存的域，OID 和方向原样保留', async () => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    const edit = await openFormDialog(wrapper, '编辑表单');
    expect(input(edit, '表单域').element.value).toBe('legacyDomain');
    await input(edit, '表单域').setValue(FREE_DOMAIN);
    await button(edit, '确定').trigger('click');
    await settle();
    expect(mocks.put).toHaveBeenCalledWith(`/api/forms/${FORM_ID}`, {
      name: '知情同意', code: 'legacy_code_long', domain: FREE_DOMAIN, paper_orientation: 'landscape',
    });
    const reopened = await openFormDialog(wrapper, '编辑表单');
    expect(input(reopened, '表单域').element.value).toBe(FREE_DOMAIN);
  });

  it('编辑取消零写入，再次打开恢复已存文本', async () => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    const edit = await openFormDialog(wrapper, '编辑表单');
    await input(edit, '表单域').setValue(FREE_DOMAIN);
    await button(edit, '取消').trigger('click');
    await settle();
    expect(mocks.put).not.toHaveBeenCalled();
    const reopened = await openFormDialog(wrapper, '编辑表单');
    expect(input(reopened, '表单域').element.value).toBe('legacyDomain');
  });

  it('编辑失败保持弹窗和域输入，允许直接重试', async () => {
    const { wrapper, mocks } = await mountDesigner({ open: false });
    mocks.put.mockRejectedValueOnce(new Error('网络异常，请重试'));
    const edit = await openFormDialog(wrapper, '编辑表单');
    await input(edit, '表单域').setValue(FREE_DOMAIN);
    await button(edit, '确定').trigger('click');
    await settle();
    expect(ElMessage.error).toHaveBeenCalledWith('网络异常，请重试');
    expect(input(edit, '表单域').element.value).toBe(FREE_DOMAIN);
    await button(edit, '确定').trigger('click');
    await settle();
    expect(mocks.put).toHaveBeenLastCalledWith(`/api/forms/${FORM_ID}`, expect.objectContaining({ domain: FREE_DOMAIN }));
  });
});

describe('表单域：内联属性、离开保护与预览', () => {
  it('只改域即进入未保存状态；保存前预览不变，保存后设计器与访视读取相同文本', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const pane = propertyPane(wrapper);
    await input(pane, '表单域').setValue(FREE_DOMAIN);
    expect(saveButton(wrapper).element.disabled).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(wrapper.find('.wp-acrf-annotation--form').text()).toContain('legacyDomain');
    await saveButton(wrapper).trigger('click');
    await settle();
    expect(mocks.put.mock.calls[0][1].domain).toBe(FREE_DOMAIN);
    expect(saveButton(wrapper).element.disabled).toBe(true);
    expect(wrapper.find('.wp-acrf-annotation--form').text()).toContain(FREE_DOMAIN);
    expect(wrapper.find('.wp-acrf-annotation--form').find('域').exists()).toBe(false);
    const visits = mount(VisitFormPreviewDialog, {
      props: { modelValue: true, projectId: 1, formId: FORM_ID },
      global: { provide: { editMode: ref(true) } },
    });
    await settle();
    expect(visits.find('.wp-acrf-annotation--form').text()).toContain(FREE_DOMAIN);
    expect(input(pane, '表单域').element.value).toBe(FREE_DOMAIN);
  });

  it.each(['', ' \t '])('清空域 %j 保存 null 且省略标注', async (cleared) => {
    const { wrapper, mocks } = await mountDesigner();
    await input(propertyPane(wrapper), '表单域').setValue(cleared);
    await saveButton(wrapper).trigger('click');
    await settle();
    expect(mocks.put.mock.calls[0][1].domain).toBeNull();
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe('');
    expect(wrapper.find('.wp-acrf-annotation--form').exists()).toBe(false);
  });

  it.each([null, '', '   ', '  oldDm / vS  '])('只改名称时不改写已存域 %j', async (legacy) => {
    const { wrapper, mocks } = await mountDesigner({ domain: legacy });
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(legacy ?? '');
    await input(propertyPane(wrapper), '名称').setValue('只改名称');
    await saveButton(wrapper).trigger('click');
    await settle();
    expect(mocks.put.mock.calls[0][1]).not.toHaveProperty('domain');
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(legacy ?? '');
  });

  it('取消内联编辑同时恢复域及其他未保存值，无请求', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    await input(propertyPane(wrapper), '名称').setValue('临时名称');
    await wrapper.find('[data-test="designer-form-property-cancel"]').trigger('click');
    await settle();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe('legacyDomain');
    expect(input(propertyPane(wrapper), '名称').element.value).toBe('知情同意');
    expect(saveButton(wrapper).element.disabled).toBe(true);
  });

  it('保存失败保留域、其他脏值和可重试状态', async () => {
    const { wrapper, mocks } = await mountDesigner();
    mocks.put.mockRejectedValueOnce(new Error('保存失败，请重试'));
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    await input(propertyPane(wrapper), '名称').setValue('待保存名称');
    await saveButton(wrapper).trigger('click');
    await settle();
    expect(ElMessage.error).toHaveBeenCalledWith('保存失败，请重试');
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(FREE_DOMAIN);
    expect(input(propertyPane(wrapper), '名称').element.value).toBe('待保存名称');
    expect(saveButton(wrapper).element.disabled).toBe(false);
  });

  it('取消引用影响确认不写入且保留域草稿', async () => {
    const { wrapper, mocks } = await mountDesigner();
    mocks.get.mockResolvedValue([{ visit_name: '筛选访视' }]);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    await saveButton(wrapper).trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('筛选访视'), '影响提醒', expect.any(Object));
    expect(mocks.put).not.toHaveBeenCalled();
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(FREE_DOMAIN);
  });

  it.each(['canLeaveProject', 'canLeaveTab'])('%s 在关闭确认时阻止离开并保留域', async (guard) => {
    const { wrapper, mocks } = await mountDesigner();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('close');
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    expect(await wrapper.vm[guard]()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.any(String), '表单属性未保存', expect.any(Object));
    expect(mocks.put).not.toHaveBeenCalled();
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(FREE_DOMAIN);
  });

  it('切换表单时关闭确认保留当前表单，放弃后才切换', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('close').mockRejectedValueOnce('cancel');
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    await wrapper.vm.selectFormById(8);
    await settle();
    expect(input(propertyPane(wrapper), '名称').element.value).toBe('知情同意');
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(FREE_DOMAIN);
    await wrapper.vm.selectFormById(8);
    await settle();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(input(propertyPane(wrapper), '名称').element.value).toBe('第二表单');
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe('');
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('离开前选择保存：保存成功才允许离开，失败阻止离开', async () => {
    const { wrapper, mocks } = await mountDesigner();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    mocks.put.mockRejectedValueOnce(new Error('服务暂不可用'));
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    expect(await wrapper.vm.canLeaveProject()).toBe(false);
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(FREE_DOMAIN);
    expect(await wrapper.vm.canLeaveProject()).toBe(true);
    expect(mocks.put).toHaveBeenLastCalledWith(`/api/forms/${FORM_ID}`, expect.objectContaining({ domain: FREE_DOMAIN }));
  });

  it('离开前选择放弃：重建域基线而非仅隐藏草稿', async () => {
    const { wrapper, mocks } = await mountDesigner();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    expect(await wrapper.vm.canLeaveTab()).toBe(true);
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe('legacyDomain');
    expect(saveButton(wrapper).element.disabled).toBe(true);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('切换基础模式隐藏域输入并保留未保存缓冲，再切回可继续修改', async () => {
    const { wrapper, mocks, editMode } = await mountDesigner();
    await input(propertyPane(wrapper), '表单域').setValue(FREE_DOMAIN);
    editMode.value = false;
    await settle();
    expect(propertyPane(wrapper).text()).not.toContain('表单域');
    expect(wrapper.find('.wp-acrf-annotation--form').exists()).toBe(false);
    expect(saveButton(wrapper).element.disabled).toBe(false);
    editMode.value = true;
    await settle();
    expect(input(propertyPane(wrapper), '表单域').element.value).toBe(FREE_DOMAIN);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('基础模式三个入口均不显示表单域，普通保存不清空历史域', async () => {
    const { wrapper, mocks } = await mountDesigner({ full: false });
    expect(propertyPane(wrapper).text()).not.toContain('表单域');
    await input(propertyPane(wrapper), '名称').setValue('基础模式改名');
    await saveButton(wrapper).trigger('click');
    await settle();
    expect(mocks.put.mock.calls[0][1]).not.toHaveProperty('domain');
    const add = await openFormDialog(wrapper, '新建表单');
    expect(add.text()).not.toContain('表单域');
    await button(add, '取消').trigger('click');
    await settle();
    const edit = await openFormDialog(wrapper, '编辑表单');
    expect(edit.text()).not.toContain('表单域');
  });
});
