import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FieldsTab from '../../src/components/FieldsTab.vue';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import VisitFormPreviewDialog from '../../src/components/VisitFormPreviewDialog.vue';
import { stageDesignServer } from './designServerFixture.js';

vi.mock('sortablejs', () => ({ default: { create: () => ({ destroy() {}, option() {} }) } }));
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises(); };
const body = () => new DOMWrapper(document.body);
function inputByLabel(scope, label) {
  const item = scope.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text().trim() === label);
  expect(item, `应有输入：${label}`).toBeTruthy();
  return item.get('input');
}
function button(scope, label) {
  const node = scope.findAll('button').find((item) => item.text().trim() === label);
  expect(node, `应有按钮：${label}`).toBeTruthy();
  return node;
}
async function mountEditor(component = FormDesignerTab, { open = true, formId = 7, seed = () => {} } = {}) {
  const server = stageDesignServer();
  seed(server.state);
  const refreshKey = ref(0);
  const wrapper = mount(component, { props: { projectId: 1 },
    global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
  });
  await settle();
  if (component === FormDesignerTab && formId != null) {
    await wrapper.vm.selectFormById(formId);
    await settle();
    if (open) { await button(wrapper, '设计表单').trigger('click'); await settle(); }
  }
  return { wrapper, server, refreshKey };
}
async function selectFirstField(wrapper) {
  await wrapper.get('.ff-item').trigger('click');
  await settle();
  return wrapper.get('[data-test="designer-field-property-form"]');
}

beforeEach(() => { localStorage.clear(); });

describe('字段库：冻结编辑基线与明确覆盖', () => {
  it('刷新列表不能悄悄升级打开编辑器的基线；取消保留字段输入', async () => {
    const { wrapper, server, refreshKey } = await mountEditor(FieldsTab);
    const loadedRevision = server.revision();
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await inputByLabel(wrapper, '标签').setValue('我的标签');
    server.remote((state) => { state.definitions[0].label = '远端标签'; });
    refreshKey.value++;
    await settle();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0].revision).toBe(loadedRevision);
    expect(server.writes()[0].accepted).toBe(false);
    expect(inputByLabel(wrapper, '标签').element.value).toBe('我的标签');
    expect(server.state.definitions[0].label).toBe('远端标签');
  });

  it('项目 ID、表单/字段 ID 和 OID 都相同，项目 incarnation 改变仍禁止覆盖', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await inputByLabel(wrapper, '标签').setValue('旧项目输入');
    server.recreateProject();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0].accepted).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(inputByLabel(wrapper, '标签').element.value).toBe('旧项目输入');
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('原项目已被替换'));
  });

  it('真实冲突弹框安全展示旧值、原始输入、最新值；点击明确确认才覆盖', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await inputByLabel(wrapper, '标签').setValue('本地 <img src=x onerror=alert(1)>');
    server.remote((state) => { state.definitions[0].label = '远端标签'; });
    const reviewed = server.revision();
    await button(wrapper, '保存').trigger('click');
    await settle();
    const review = body().get('[data-test="design-conflict-review"]');
    expect(review.text()).toContain('字段1');
    expect(review.text()).toContain('本地 <img src=x onerror=alert(1)>');
    expect(review.text()).toContain('远端标签');
    expect(review.text()).toContain('当前引用影响');
    expect(review.find('img').exists()).toBe(false);
    expect(server.writes().filter((call) => call.accepted)).toHaveLength(0);
    await button(body(), '确认覆盖此版本').trigger('click');
    await settle();
    expect(server.writes()).toHaveLength(2);
    expect(server.writes()[1].revision).toBe(reviewed);
    expect(server.state.definitions[0].label).toBe('本地 <img src=x onerror=alert(1)>');
  });

  it('审阅后又有写入必须第二次审阅，始终重放同一冻结输入', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await inputByLabel(wrapper, '标签').setValue('本地标签');
    server.remote((state) => { state.definitions[0].label = '别人第一次'; });
    let reviews = 0;
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(async () => {
      if (++reviews === 1) server.remote((state) => { state.definitions[0].label = '别人第二次'; });
      return 'confirm';
    });
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(reviews).toBe(2);
    expect(server.writes()).toHaveLength(3);
    expect(server.writes().every((call) => call.body.label === '本地标签')).toBe(true);
    expect(server.writes().filter((call) => call.accepted)).toHaveLength(1);
  });
});

describe('字段库：冲突审阅中放弃不是错误', () => {
  it.each([['cancel'], ['close']])('复制字段遇到冲突后选择放弃（%s），零写入且不弹空白错误', async (reason) => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.remote((state) => { state.definitions[0].label = '远端标签'; });
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(reason);
    await wrapper.findAll('[aria-label="复制"]')[0].trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false]);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('删除字段遇到冲突后关闭审阅框，零写入且不弹空白错误', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.remote((state) => { state.definitions[0].label = '远端标签'; });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm').mockRejectedValueOnce('close');
    await wrapper.findAll('[aria-label="删除"]')[0].trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false]);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('设计器：冲突审阅中关闭弹框不是错误', () => {
  it('删除字段遇到冲突后关闭审阅框，零写入、字段仍在且不弹错误', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.forms[0].design_notes = '外部修改'; });
    // 未被访视引用的表单删除字段不弹影响提醒：唯一一次确认就是冲突审阅。
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('close');
    await wrapper.findAll('[data-test="designer-delete-field"]')[0].trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false]);
    expect(server.state.fields).toHaveLength(3);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('删除表单遇到冲突后关闭审阅框，零写入且不弹错误', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    server.remote((state) => { state.forms[0].design_notes = '外部修改'; });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm').mockRejectedValueOnce('close');
    await wrapper.findAll('[aria-label="删除"]')[0].trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false]);
    expect(server.state.forms).toHaveLength(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('设计器：覆盖历史的实际 before-image 与替换边界', () => {
  it('覆盖字段后撤销恢复真正的远端提交前值，而不是最初打开的旧值', async () => {
    const { wrapper, server } = await mountEditor();
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本地修改');
    server.remote((state) => { state.definitions[0].label = '审阅的远端值'; });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('本地修改');
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('审阅的远端值');
    expect(server.writes().filter((call) => call.accepted)).toHaveLength(2);
    await wrapper.get('[data-test="designer-redo"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('本地修改');
  });

  it('删除冲突确认后撤销恢复实际删除前快照与位置', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.fields[0].help_text = '远端帮助'; state.fields[0].order_index = 2; state.fields[1].order_index = 1; });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await wrapper.findAll('[data-test="designer-delete-field"]')[0].trigger('click');
    await settle();
    expect(server.state.fields.some((field) => field.id === 101)).toBe(false);
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    const restored = server.state.fields.find((field) => field.field_definition_id === 201);
    expect(restored.help_text).toBe('远端帮助');
    expect(restored.order_index).toBe(2);
  });

  it('未知外部版本中的旧撤销不能重定向到相同 ID 的替换对象；显式重新载入才清栈', async () => {
    const { wrapper, server } = await mountEditor();
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本地修改');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    server.remote((state) => { state.definitions[0].label = '恢复后的同 ID 内容'; });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const count = server.writes().length;
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.writes().length).toBe(count + 1);
    expect(server.state.definitions[0].label).toBe('恢复后的同 ID 内容');
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    await settle();
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('恢复后的同 ID 内容');
  });

  it('成功撤销后的 GET 失败不会把已提交撤销留在原栈供重复执行', async () => {
    const { wrapper, server } = await mountEditor();
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本地修改');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    server.failReads();
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('字段1');
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeDefined();
    const count = server.writes().length;
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.writes()).toHaveLength(count);
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('操作已提交'));
  });

  it('远端删除或换绑时不展示可覆盖按钮，不会将原命令应用新绑定', async () => {
    const { wrapper, server } = await mountEditor();
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本地修改');
    server.remote((state) => { state.fields[0].field_definition_id = 202; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0].accepted).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(inputByLabel(editor, '字段标签').element.value).toBe('本地修改');
  });
});

const waitDebounce = () => new Promise((resolve) => { setTimeout(resolve, 260); });
async function dragAnnotation(annotation, deltaPx) {
  annotation.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 100, pointerId: 1 }));
  await nextTick();
  window.dispatchEvent(new PointerEvent('pointermove', { clientY: 100 + deltaPx, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  await nextTick();
}
async function mountVisitPreview() {
  const server = stageDesignServer();
  localStorage.setItem('crf_view_mode', 'aCRF');
  const wrapper = mount(VisitFormPreviewDialog, { props: { modelValue: true, projectId: 1, formId: 7 },
    global: { provide: { editMode: ref(true) } } });
  await settle();
  return { wrapper, server, annotation: () => wrapper.get('.wp-acrf-annotation--field') };
}

describe('aCRF 标注：自己已确认的写入推进基线，不与自己冲突', () => {
  it('访视预览连续两次拖动都用上一次提交后的状态，不弹冲突审阅', async () => {
    const { server, annotation } = await mountVisitPreview();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await dragAnnotation(annotation(), 20);
    await waitDebounce(); await settle();
    await dragAnnotation(annotation(), 40);
    await waitDebounce(); await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('上一次保存仍在途时排队的拖动，在该次提交后接续提交而非自冲突', async () => {
    const { server, annotation } = await mountVisitPreview();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const release = server.holdWrites();
    await dragAnnotation(annotation(), 20);
    await waitDebounce(); await settle();
    await dragAnnotation(annotation(), 40);
    await waitDebounce(); await settle();
    release();
    await settle(); await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(Object.keys(server.state.forms[0].annotation_positions || {})).toHaveLength(1);
  });

  it('外部在两次拖动之间修改表单，第二次仍按冲突审阅，取消不写入', async () => {
    const { wrapper, server, annotation } = await mountVisitPreview();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await dragAnnotation(annotation(), 20);
    await waitDebounce(); await settle();
    server.remote((state) => { state.forms[0].design_notes = '外部修改'; });
    await dragAnnotation(annotation(), 40);
    await waitDebounce(); await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, false]);
    expect(confirm).toHaveBeenCalledTimes(1);
    // 明确放弃即不再排队：之后冲刷/卸载不重发，也不报错误提示；界面重读最新已保存位置。
    expect(ElMessage.error).not.toHaveBeenCalled();
    wrapper.unmount();
    await settle();
    expect(server.writes()).toHaveLength(2);
  });

  it('关闭弹窗时按原基线落地排队拖动；若期间被外部修改，不弹审阅、拒绝写入并提示', async () => {
    const { wrapper, server, annotation } = await mountVisitPreview();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await dragAnnotation(annotation(), 20);
    server.remote((state) => { state.forms[0].design_notes = '外部修改'; });
    await wrapper.setProps({ modelValue: false });
    wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('closed');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.forms[0].annotation_positions).toBeNull();
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('编辑位置已切换'));
  });

  it('设计器连续两次拖动标注都直接提交，不弹冲突审阅', async () => {
    localStorage.setItem('crf_view_mode', 'aCRF');
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const annotation = () => wrapper.get('.wp-acrf-annotation--field');
    await dragAnnotation(annotation(), 20);
    await waitDebounce(); await settle();
    await dragAnnotation(annotation(), 40);
    await waitDebounce(); await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
  });
});

// 自己已被接受的写入只推进“恰好停在该写入依据版本”的本页快照；编辑器/历史的旧基线沿本页写入链换成精确快照。
// 外部写入不在链上：仍须审阅；审阅确认后的覆盖改为重读最新设计，不借审阅数据在旧画面上吸收外部变化。
describe('自己的写入推进本页基线：同页后续写入不误报冲突', () => {
  const accepted = (server) => server.writes().map((call) => call.accepted);
  const dragEvent = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '' } });
  async function saveNotes(wrapper, text) {
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    await body().get('[data-test="design-notes-input"]').setValue(text);
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
  }
  async function saveFormName(wrapper, name) {
    await wrapper.get('[data-test="designer-form-property-name"]').setValue(name);
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
  }
  async function saveFirstFieldLabel(wrapper, label) {
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue(label);
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
  }

  it('设计器：保存设计备注后再拖动 aCRF 标注，直接提交不弹审阅', async () => {
    localStorage.setItem('crf_view_mode', 'aCRF');
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await saveNotes(wrapper, '本页备注');
    await dragAnnotation(wrapper.get('.wp-acrf-annotation--field'), 20);
    await waitDebounce(); await settle();
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('设计器：保存设计备注后再保存表单属性，直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await saveNotes(wrapper, '本页备注');
    await saveFormName(wrapper, '本页表单名');
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.forms[0]).toMatchObject({ design_notes: '本页备注', name: '本页表单名' });
  });

  it('设计器：连续两次保存表单属性，第二次直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await saveFormName(wrapper, '第一次名称');
    await saveFormName(wrapper, '第二次名称');
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.forms[0].name).toBe('第二次名称');
  });

  it('设计器：保存表单属性后再保存字段属性，直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await saveFormName(wrapper, '本页表单名');
    await saveFirstFieldLabel(wrapper, '本页标签');
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions[0].label).toBe('本页标签');
  });

  it('设计器：拖动字段排序后再保存表单属性，直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const rows = wrapper.findAll('.fd-canvas-list .ff-item');
    await rows[0].trigger('dragstart', dragEvent());
    await rows[2].trigger('dragover', dragEvent());
    await rows[2].trigger('drop', dragEvent());
    await settle();
    await saveFormName(wrapper, '本页表单名');
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('设计器：改表单属性后撤销此前的字段修改，直接执行不弹审阅', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await saveFirstFieldLabel(wrapper, '本页标签');
    await wrapper.get('.fd-canvas-list').trigger('click');
    await settle();
    await saveFormName(wrapper, '本页表单名');
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('字段1');
    expect(accepted(server)).toEqual([true, true, true]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('设计器：自己的备注保存之后又有外部修改，表单属性保存仍须审阅', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await saveNotes(wrapper, '本页备注');
    server.remote((state) => { state.forms[0].domain = '外部域'; });
    await saveFormName(wrapper, '本页表单名');
    expect(accepted(server)).toEqual([true, false]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(server.state.forms[0].name).toBe('知情同意');
  });

  it('审阅并确认一次拖动覆盖后，画面重读最新设计，而不是在旧画面上吸收外部变化', async () => {
    localStorage.setItem('crf_view_mode', 'aCRF');
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    server.remote((state) => { state.definitions[1].label = '远端标签'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    expect(wrapper.text()).not.toContain('远端标签');
    await dragAnnotation(wrapper.get('.wp-acrf-annotation--field'), 20);
    await waitDebounce(); await settle();
    expect(accepted(server)).toEqual([false, true]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('远端标签');
  });

  it('访视预览：审阅并确认拖动覆盖后重读最新内容', async () => {
    const { wrapper, server, annotation } = await mountVisitPreview();
    server.remote((state) => { state.definitions[1].label = '远端标签'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    expect(wrapper.text()).not.toContain('远端标签');
    await dragAnnotation(annotation(), 20);
    await waitDebounce(); await settle();
    expect(accepted(server)).toEqual([false, true]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('远端标签');
  });

  it('字段库：序号快捷排序后，打开中的编辑器保存直接提交', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await wrapper.findAll('.el-table__row')[1].find('.ordinal-cell').trigger('dblclick');
    await settle();
    const ordinal = wrapper.findAll('.el-table__row')[1].find('.el-input-number input');
    await ordinal.setValue('1');
    await ordinal.trigger('keyup.enter');
    await settle();
    await inputByLabel(wrapper, '标签').setValue('本页标签');
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions.find((item) => item.id === 201).label).toBe('本页标签');
  });

  it('字段库：复制其他字段后，打开中的编辑器保存直接提交', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await wrapper.findAll('[aria-label="复制"]')[1].trigger('click');
    await settle();
    await inputByLabel(wrapper, '标签').setValue('本页标签');
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(accepted(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions.find((item) => item.id === 201).label).toBe('本页标签');
  });

  it('字段库：自己的复制之后又有外部修改，打开中的编辑器保存仍须审阅', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await wrapper.findAll('[aria-label="复制"]')[1].trigger('click');
    await settle();
    server.remote((state) => { state.definitions[2].label = '外部标签'; });
    await inputByLabel(wrapper, '标签').setValue('本页标签');
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(accepted(server)).toEqual([true, false]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(inputByLabel(wrapper, '标签').element.value).toBe('本页标签');
  });
});

describe('设计器草稿：已提交后刷新失败不得留下可再次提交的草稿', () => {
  it('field-profile 成功后字段与字段库读取都失败，草稿转正且不能重复创建', async () => {
    const { wrapper, server } = await mountEditor();
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    server.onAccepted(() => server.failReads());
    await wrapper.get('[data-test="designer-draft-save"]').trigger('click');
    await settle();
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0].accepted).toBe(true);
    expect(wrapper.find('[data-test="designer-draft-save"]').exists()).toBe(false);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

// F1：快捷新增字典/单位、整表复制是「仅失效」写入。新后端随成功响应一体返回服务器证明的
// 前后标签（designServerFixture transitionMetadata 模式）；本页证明成立时沿写入边推进快照，
// 后续受保护写入不再误报冲突；未证明（外部插入/证据无效）保持保守审阅并保留旧画布与输入。
const acceptedWrites = (server) => server.writes().map((call) => call.accepted);
describe('F1：仅失效写入的过渡证据让本页后续写入不再误报冲突', () => {
  async function quickAddUnit(wrapper, symbol) {
    await wrapper.get('[aria-label="新增单位"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增单位'));
    expect(dialog, '应有新增单位弹窗').toBeTruthy();
    await dialog.get('input').setValue(symbol);
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
  }
  async function quickAddCodelist(wrapper, name) {
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    expect(dialog, '应有新增字典弹窗').toBeTruthy();
    await dialog.findAll('.el-form-item')[0].get('input').setValue(name);
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
  }
  async function pickFieldType(scope, optionText) {
    const item = scope.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text().trim() === '字段类型');
    await item.get('.el-select__wrapper').trigger('click');
    await settle();
    const option = body().findAll('.el-select-dropdown__item').find((node) => node.text() === optionText);
    expect(option, `下拉应出现选项「${optionText}」`).toBeTruthy();
    await option.trigger('click');
    await settle();
  }
  const formsRowCopy = (wrapper) => wrapper.findAll('.el-table__row')[0].findAll('[aria-label="复制"]')[0];
  const seedSecondForm = (state) => {
    state.forms.push({ ...state.forms[0], id: 8, name: '随访表单', code: 'FU', domain: 'VS', order_index: 2 });
    state.fields.push(...state.fields.map((field) => ({ ...field, id: field.id + 1000, form_id: 8 })));
  };
  const listedForm = (wrapper, name) => {
    const row = wrapper.findAll('.el-table__row').find((node) => node.text().includes(name));
    expect(row, `列表应显示表单「${name}」`).toBeTruthy();
    return row;
  };

  async function reloadAndCloseDesigner(wrapper) {
    const reload = wrapper.get('[data-test="designer-reload-context"]');
    const dialog = new DOMWrapper(reload.element.closest('.el-dialog'));
    await reload.trigger('click');
    await settle();
    await dialog.get('.el-dialog__headerbtn').trigger('click');
    await settle();
  }

  async function holdToolbarReload(wrapper, server) {
    const readsBefore = server.calls.filter((call) => call.method === 'GET').length;
    const releases = server.holdReads(5);
    await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    await settle();
    expect(server.calls.filter((call) => call.method === 'GET')).toHaveLength(readsBefore + 5);
    return async () => { releases.forEach((release) => release()); await settle(); };
  }

  it('RELOAD-INPUT：读取期间新增的表单名称和域保留原基线，后续保存仍审阅', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    server.remote((state) => { Object.assign(state.forms[0], { name: '读取中的外部名', domain: '外部域' }); });
    const release = await holdToolbarReload(wrapper, server);
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('等待期间本地名');
    await wrapper.get('[data-test="designer-form-property-domain"]').setValue('等待期间本地域');
    await release();
    expect(wrapper.get('[data-test="designer-form-property-name"]').element.value).toBe('等待期间本地名');
    expect(wrapper.get('[data-test="designer-form-property-domain"]').element.value).toBe('等待期间本地域');
    expect(listedForm(wrapper, 'ICF').text()).toContain('知情同意');
    expect(ElMessage.warning).toHaveBeenCalledWith('重新载入未应用：读取期间编辑内容已变化，当前输入和撤销记录已保留');
    confirm.mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([false]);
    expect(server.state.forms[0]).toMatchObject({ name: '读取中的外部名', domain: '外部域' });
  });

  it.each([false, true])('RELOAD-INPUT：字段读取期间新输入保留且不清撤销，先放弃旧编辑=%s', async (discardFirst) => {
    const { wrapper, server } = await mountEditor();
    let editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('已保存的字段历史');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    editor = wrapper.get('[data-test="designer-field-property-form"]');
    if (discardFirst) await inputByLabel(editor, '字段标签').setValue('明确放弃的旧编辑');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    if (discardFirst) confirm.mockRejectedValueOnce('cancel');
    server.remote((state) => { state.definitions[0].label = '读取中的外部字段'; });
    const release = await holdToolbarReload(wrapper, server);
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('等待期间新字段输入');
    await release();
    expect(wrapper.find('[data-test="designer-field-property-form"]').exists()).toBe(true);
    expect(inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').element.value).toBe('等待期间新字段输入');
    expect(wrapper.get('[data-test="designer-property-save"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    expect(ElMessage.warning).toHaveBeenCalledWith('重新载入未应用：读取期间编辑内容已变化，当前输入和撤销记录已保留');
    confirm.mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, false]);
    expect(server.state.definitions[0].label).toBe('读取中的外部字段');
  });

  it('RELOAD-INPUT：读取期间新建的本地草稿和输入不被重载结果删除', async () => {
    const { wrapper, server } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('等待期间新草稿');
    await release();
    expect(wrapper.text()).toContain('等待期间新草稿');
    expect(wrapper.find('[data-test="designer-field-property-form"]').exists()).toBe(true);
    expect(server.writes()).toHaveLength(0);
    expect(ElMessage.warning).toHaveBeenCalledWith('重新载入未应用：读取期间编辑内容已变化，当前输入和撤销记录已保留');
  });

  it('RELOAD-CANCEL：放弃旧编辑后取消重载确认，恢复已保存字段与基线且不重读', async () => {
    const { wrapper, server } = await mountEditor();
    let editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('已保存的字段历史');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    editor = wrapper.get('[data-test="designer-field-property-form"]');
    await inputByLabel(editor, '字段标签').setValue('明确放弃的旧编辑');
    const readsBefore = server.calls.filter((call) => call.method === 'GET').length;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    await settle();
    expect(confirm, '放弃提示与重载确认各一次').toHaveBeenCalledTimes(2);
    expect(server.calls.filter((call) => call.method === 'GET')).toHaveLength(readsBefore);
    expect(server.writes()).toHaveLength(1);
    const restored = wrapper.get('[data-test="designer-field-property-form"]');
    expect(inputByLabel(restored, '字段标签').element.value).toBe('已保存的字段历史');
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('取消后新输入');
    const save = wrapper.get('[data-test="designer-property-save"]');
    expect(save.attributes('disabled')).toBeUndefined();
    await save.trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(server.state.definitions[0].label).toBe('取消后新输入');
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
  });

  it('RELOAD-CANCEL：外部变更后取消重载，恢复基线的新保存仍409审阅且取消保留输入', async () => {
    const { wrapper, server } = await mountEditor();
    let editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('已保存的字段历史');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    server.remote((state) => { state.definitions[0].label = '外部最新字段'; });
    editor = wrapper.get('[data-test="designer-field-property-form"]');
    await inputByLabel(editor, '字段标签').setValue('明确放弃的旧编辑');
    const readsBefore = server.calls.filter((call) => call.method === 'GET').length;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    await settle();
    expect(server.calls.filter((call) => call.method === 'GET')).toHaveLength(readsBefore);
    const restored = wrapper.get('[data-test="designer-field-property-form"]');
    expect(inputByLabel(restored, '字段标签').element.value).toBe('已保存的字段历史');
    expect(server.state.definitions[0].label).toBe('外部最新字段');
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('取消后新输入');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, false]);
    expect(server.state.definitions[0].label).toBe('外部最新字段');
    expect(inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').element.value).toBe('取消后新输入');
  });

  it('RELOAD-CANCEL：确认重载时放弃旧编辑仍完整安装并清历史（通过反例）', async () => {
    const { wrapper, server } = await mountEditor();
    let editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('已保存的字段历史');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    editor = wrapper.get('[data-test="designer-field-property-form"]');
    await inputByLabel(editor, '字段标签').setValue('明确放弃的旧编辑');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValue('confirm');
    server.remote((state) => { state.definitions[0].label = '重载后的外部字段'; });
    await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(ElMessage.warning).not.toHaveBeenCalledWith('重新载入未应用：读取期间编辑内容已变化，当前输入和撤销记录已保留');
    expect(wrapper.find('[data-test="designer-field-property-form"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeDefined();
    const reselected = await selectFirstField(wrapper);
    expect(inputByLabel(reselected, '字段标签').element.value).toBe('重载后的外部字段');
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('重载后的新输入');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(server.state.definitions[0].label).toBe('重载后的新输入');
  });

  it('RELOAD：重新载入后编辑未选中表单不会把外部名称和域覆盖为旧值', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { formId: 8, seed: seedSecondForm });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    server.remote((state) => { Object.assign(state.forms[0], { name: '外部名称', domain: '外部域' }); });
    await reloadAndCloseDesigner(wrapper);
    await listedForm(wrapper, 'ICF').get('[aria-label="编辑"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => {
      const title = node.find('.el-dialog__title');
      return title.exists() && title.text() === '编辑表单';
    });
    await button(dialog, '确定').trigger('click');
    await settle();
    expect(server.state.forms.find((form) => form.id === 7)).toMatchObject({ name: '外部名称', domain: '外部域' });
    expect(acceptedWrites(server)).toEqual([true]);
    expect(confirm, '完整重读后的表单保存不需要额外冲突确认').toHaveBeenCalledTimes(1);
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
  });

  it('RELOAD：重新载入会移除已被外部删除的非选中表单行', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { formId: 8, seed: seedSecondForm });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    server.remote((state) => {
      state.forms = state.forms.filter((form) => form.id !== 7);
      state.fields = state.fields.filter((field) => field.form_id !== 7);
    });
    await reloadAndCloseDesigner(wrapper);
    expect(wrapper.findAll('.el-table__row')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('知情同意');
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
    expect(server.writes()).toHaveLength(0);
  });

  it('RELOAD：完整重读之后再有外部修改，未选中表单的保存仍须独立审阅', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { formId: 8, seed: seedSecondForm });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    server.remote((state) => { Object.assign(state.forms[0], { name: '已重读名称', domain: '已重读域' }); });
    await reloadAndCloseDesigner(wrapper);
    await listedForm(wrapper, 'ICF').get('[aria-label="编辑"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => {
      const title = node.find('.el-dialog__title');
      return title.exists() && title.text() === '编辑表单';
    });
    await inputByLabel(dialog, '名称').setValue('保留的本地名称');
    server.remote((state) => { Object.assign(state.forms[0], { name: '更新的外部名称', domain: '更新的外部域' }); });
    confirm.mockRejectedValue('cancel');
    await button(dialog, '确定').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([false]);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(server.state.forms.find((form) => form.id === 7)).toMatchObject({ name: '更新的外部名称', domain: '更新的外部域' });
    expect(inputByLabel(dialog, '名称').element.value).toBe('保留的本地名称');
  });

  it.each(['单位', '字典'])('HIGH-1：字段快照领先时快捷新增%s不能升级未刷新的表单列表基线', async (kind) => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { seed: seedSecondForm });
    server.useTransitionMetadata(true);
    server.remote((state) => { Object.assign(state.forms[0], { name: '外部名称', domain: '外部域' }); });
    await wrapper.vm.selectFormById(8);
    await settle();
    expect(wrapper.text()).toContain('知情同意');
    const editor = await selectFirstField(wrapper);
    if (kind === '单位') await quickAddUnit(wrapper, 'kg');
    else {
      await pickFieldType(editor, '单选');
      await quickAddCodelist(wrapper, '独立快照字典');
    }
    await listedForm(wrapper, '知情同意').get('[aria-label="编辑"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => {
      const title = node.find('.el-dialog__title');
      return title.exists() && title.text() === '编辑表单';
    });
    expect(inputByLabel(dialog, '名称').element.value).toBe('知情同意');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await button(dialog, '确定').trigger('click');
    await settle();
    expect(server.state.forms[0]).toMatchObject({ name: '外部名称', domain: '外部域' });
    expect(confirm, '旧列表保存必须审阅，不能借用字段侧的新标签').toHaveBeenCalledTimes(1);
    expect(acceptedWrites(server)).toEqual([true, false]);
    expect(inputByLabel(dialog, '名称').element.value).toBe('知情同意');
  });

  it.each([
    ['未选中表单且缓存仍热', null, 7, true],
    ['复制非选中表单且缓存仍热', 7, 8, true],
    ['旧服务器只返回后标签', 7, 7, false],
    ['服务器返回损坏的前标签', 7, 7, 'malformed'],
    ['未选中表单且只有后标签', null, 8, false],
  ])('HIGH-2：%s，已复制的新表单仍须立即显示且只提交一次', async (_name, formId, sourceId, metadata) => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false, formId, seed: seedSecondForm });
    server.useTransitionMetadata(metadata);
    const sourceName = server.state.forms.find((form) => form.id === sourceId).name;
    await listedForm(wrapper, sourceName).get('[aria-label="复制"]').trigger('click');
    await settle();
    const copies = server.writes().filter((call) => call.url === `/api/forms/${sourceId}/copy`);
    expect(copies).toHaveLength(1);
    expect(copies[0].accepted).toBe(true);
    expect(server.state.forms).toHaveLength(3);
    expect(wrapper.text(), '成功写入后的新行不能只存在于服务器').toContain(`${sourceName}_copy`);
    expect(ElMessage.success).toHaveBeenCalledWith('复制成功');
  });

  it('HIGH-2：复制后外部写入使过渡不可采纳时仍刷新表单列表，脏字段基线不偷升', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { seed: seedSecondForm });
    server.useTransitionMetadata(true);
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('保留的本地输入');
    server.onAccepted(() => server.remote((state) => {
      state.forms[1].name = '外部随访名称';
      state.definitions[0].label = '外部字段标签';
    }));
    await formsRowCopy(wrapper).trigger('click');
    await settle();
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(wrapper.text()).toContain('外部随访名称');
    expect(inputByLabel(editor, '字段标签').element.value).toBe('保留的本地输入');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(acceptedWrites(server)).toEqual([true, false]);
    expect(server.state.definitions[0].label).toBe('外部字段标签');
  });

  it('HIGH-2：复制已提交但列表读取失败时明确报告已复制，不能诱导重复提交', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    server.useTransitionMetadata(true);
    server.onAccepted(() => server.failReads());
    await formsRowCopy(wrapper).trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true]);
    expect(server.state.forms).toHaveLength(2);
    expect(ElMessage.warning).toHaveBeenCalledWith('表单已复制，但列表刷新失败，请刷新后核对，勿重复提交');
    expect(ElMessage.success).not.toHaveBeenCalledWith('复制成功');
  });

  it('设计器：带着未保存字段输入快捷新增单位后，字段属性保存直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本页标签');
    await quickAddUnit(wrapper, 'kg');
    expect(server.state.units).toHaveLength(1);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions[0].label).toBe('本页标签');
  });

  it('设计器：带着未保存字段输入快捷新增字典后，字段属性保存直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本页标签');
    await pickFieldType(editor, '单选');
    await quickAddCodelist(wrapper, '快速字典');
    expect(server.state.codelists).toHaveLength(1);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions[0].codelist_id).toBe(server.state.codelists[0].id);
  });

  it('设计器：带着未保存字段输入整表复制后，字段属性保存直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本页标签');
    await formsRowCopy(wrapper).trigger('click');
    await settle();
    expect(server.state.forms).toHaveLength(2);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions[0].label).toBe('本页标签');
  });

  // R1：草稿打开时「仅失效」写入仍须记录已证明的过渡边并推进快照基线——否则草稿保存多付一次
  // 假审阅。GREEN 必须只动基线/快照，绝不把服务端字段行盖到本地草稿上。
  const SAVED_BUT_FOREIGN = '操作已保存，但检测到其他最新修改；保存前请先核对最新内容';
  const canvasCopyButton = (wrapper) => wrapper.get('[data-test="designer-copy-field"]');
  const canvasDeleteButton = (wrapper) => wrapper.get('[data-test="designer-delete-field"]');

  it('设计器：新建字段草稿打开时快捷新增字典，草稿保存直接提交且草稿内容原样落库', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    const editor = wrapper.get('[data-test="designer-field-property-form"]');
    await inputByLabel(editor, '字段标签').setValue('草稿标签');
    await pickFieldType(editor, '单选');
    await quickAddCodelist(wrapper, '草稿期字典');
    expect(server.state.codelists).toHaveLength(1);
    // 草稿打开不吞掉已证明的过渡：不得出现「已保存但检测到外部变化」的假警告。
    expect(ElMessage.warning).not.toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-draft-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    const savedDefinition = server.state.definitions.at(-1);
    expect(savedDefinition.label).toBe('草稿标签');
    expect(savedDefinition.codelist_id).toBe(server.state.codelists[0].id);
    expect(server.state.fields).toHaveLength(4);
  });

  it('设计器：复制字段草稿打开时快捷新增单位，草稿保存直接提交且复制 OID 保留', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await canvasCopyButton(wrapper).trigger('click');
    await settle();
    expect(wrapper.findAll('.ff-item')).toHaveLength(4);
    await quickAddUnit(wrapper, 'kg');
    expect(ElMessage.warning).not.toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-draft-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.fields).toHaveLength(4);
    const savedRow = server.state.fields[3];
    const savedDefinition = server.state.definitions.find((item) => item.id === savedRow.field_definition_id);
    expect(savedDefinition.variable_name).toContain('_COPY');
    expect(savedDefinition.unit_id).toBe(server.state.units[0].id);
  });

  it('设计器：新建字段草稿打开时整表复制，草稿保存直接提交', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    await formsRowCopy(wrapper).trigger('click');
    await settle();
    expect(server.state.forms).toHaveLength(2);
    expect(ElMessage.warning).not.toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-draft-save"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    // 整表复制克隆了 3 条实例（form_id 变为新表单）；本表单仍是 3 旧 + 1 草稿转正 = 4。
    expect(server.state.fields.filter((field) => field.form_id === 7)).toHaveLength(4);
  });

  it('设计器：草稿打开快捷新增字典后外部写入插在重读之前，删除既有字段仍须审阅；取消保留画布与草稿输入', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    const editor = wrapper.get('[data-test="designer-field-property-form"]');
    await inputByLabel(editor, '字段标签').setValue('本页输入');
    await pickFieldType(editor, '单选');
    let externalDone = false;
    server.onAccepted(() => {
      if (!externalDone) {
        externalDone = true;
        server.remote((state) => { state.definitions[0].label = '外部标签'; });
      }
    });
    await quickAddCodelist(wrapper, '草稿期字典');
    // 外部写入插队：如实报告，且绝不安装外部状态。
    expect(ElMessage.warning).toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
    expect(wrapper.text()).not.toContain('外部标签');
    // 设计器的持久行删除无独立确认弹窗（无访视引用时）：唯一一次 confirm 就是覆盖审阅，此处取消。
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await canvasDeleteButton(wrapper).trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(acceptedWrites(server)).toEqual([true, false]);
    // 取消审阅：画布快照仍是旧内容，草稿与其输入原样保留。
    expect(inputByLabel(editor, '字段标签').element.value).toBe('本页输入');
    expect(wrapper.text()).not.toContain('外部标签');
    expect(wrapper.findAll('.ff-item')).toHaveLength(4);
  });

  it('设计器：整表复制后撤销此前的新建字段直接执行，复制仍在且被引用的定义按引用保留', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="designer-draft-save"]').trigger('click');
    await settle();
    const createdField = server.state.fields[3];
    const createdDefinitionId = createdField.field_definition_id;
    await formsRowCopy(wrapper).trigger('click');
    await settle();
    expect(server.state.forms).toHaveLength(2);
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.fields.some((field) => field.id === createdField.id)).toBe(false);
    // 定义仍被复制出的实例引用：保留并提示，而非静默删除共享定义。
    expect(server.state.definitions.some((definition) => definition.id === createdDefinitionId)).toBe(true);
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('已保留定义'));
  });

  it('设计器：整表复制后又有外部写入，旧撤销仍拒绝重放并要求重新载入', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="designer-draft-save"]').trigger('click');
    await settle();
    const createdField = server.state.fields[3];
    await formsRowCopy(wrapper).trigger('click');
    await settle();
    server.remote((state) => { state.definitions[0].label = '外部标签'; });
    const writesBefore = server.writes().length;
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(server.writes()).toHaveLength(writesBefore + 1);
    expect(server.writes()[writesBefore].accepted).toBe(false);
    // 新建字段实例未被旧撤销删除；共享定义内容不被旧命令改写。
    expect(server.state.fields.some((field) => field.id === createdField.id)).toBe(true);
    expect(server.state.definitions[0].label).toBe('外部标签');
  });

  it('字段库：快捷新增字典后外部写入插在重读之前，删除其他字段仍须审阅且旧列表与输入保留', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(true);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await inputByLabel(wrapper, '标签').setValue('本页标签');
    await pickFieldType(wrapper, '单选');
    let externalDone = false;
    server.onAccepted(() => {
      if (!externalDone) {
        externalDone = true;
        server.remote((state) => { state.definitions[0].label = '外部标签'; });
      }
    });
    await quickAddCodelist(wrapper, '快速字典');
    expect(server.state.codelists).toHaveLength(1);
    // 外部写入已插入：本页不得安装外部状态——旧列表保留、默认写入版本不前移。
    expect(wrapper.text()).not.toContain('外部标签');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm').mockRejectedValueOnce('cancel');
    await wrapper.findAll('[aria-label="删除"]')[1].trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(acceptedWrites(server)).toEqual([true, false]);
    expect(inputByLabel(wrapper, '标签').element.value).toBe('本页标签');
    expect(wrapper.text()).not.toContain('外部标签');
  });

  it('字段库：快捷新增字典（无外部插入）后，打开中的编辑器保存直接提交', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(true);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await inputByLabel(wrapper, '标签').setValue('本页标签');
    await pickFieldType(wrapper, '单选');
    await quickAddCodelist(wrapper, '快速字典');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await button(wrapper, '保存').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).not.toHaveBeenCalled();
    expect(server.state.definitions.find((definition) => definition.id === 201).codelist_id).toBe(server.state.codelists[0].id);
  });
});

// F2：审阅确认的设计备注吸收了外部变化，但审阅数据不得祝福旧画布；只把无未保存输入的
// 干净编辑器一致重读到最新状态，脏缓冲/草稿/旧撤销栈保留原基线，后续写入各自审阅。
describe('F2：审阅确认备注后只同步干净编辑器', () => {
  const saveNotes = async (wrapper, text) => {
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    await body().get('[data-test="design-notes-input"]').setValue(text);
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
  };
  const saveFormName = async (wrapper, name) => {
    await wrapper.get('[data-test="designer-form-property-name"]').setValue(name);
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
  };

  it('设计器：审阅确认备注后保存表单属性直接提交，不再第二次审阅', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.forms[0].domain = '外部域'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await saveNotes(wrapper, '审阅后备注');
    await saveFormName(wrapper, '本页表单名');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(acceptedWrites(server)).toEqual([false, true, true]);
    expect(server.state.forms[0]).toMatchObject({ design_notes: '审阅后备注', name: '本页表单名' });
  });

  it('设计器：审阅确认备注后干净画布显示最新内容，再有外部写入仍须重新审阅', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.definitions[1].label = '外部标签一'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await saveNotes(wrapper, '审阅后备注');
    await settle();
    // 干净编辑器已一致重读：外部内容可见，且紧随其后的自己的写入不再审阅。
    expect(wrapper.text()).toContain('外部标签一');
    await saveFormName(wrapper, '第一次名称');
    expect(acceptedWrites(server)).toEqual([false, true, true]);
    server.remote((state) => { state.definitions[1].label = '外部标签二'; });
    await saveFormName(wrapper, '第二次名称');
    // 第三次写入面对新的外部变化必须重新审阅；明确确认后按审阅版本提交。
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(acceptedWrites(server)).toEqual([false, true, true, false, true]);
  });

  // 说明：设计器的「设计备注」入口在选中任一字段（含草稿行）时隐藏（v-if="!selectedFieldId"），
  // 因此「脏字段编辑器/草稿 + 备注保存」在当前 UI 中不可达；脏缓冲反例由表单属性行内卡片覆盖。
  it('设计器：审阅确认备注后重读失败，已提交结果如实报告且下一次写入仍须审阅', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.forms[0].domain = '外部域'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    server.onAccepted(() => server.failReads());
    await saveNotes(wrapper, '审阅后备注');
    await settle();
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('刷新最新设计失败'));
    // 重读失败：本页基线未推进；恢复读取后下一次写入仍必须先审阅（第二次确认即证据）。
    server.failReads(false);
    await saveFormName(wrapper, '本页表单名');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(acceptedWrites(server)).toEqual([false, true, false, true]);
    expect(server.state.forms[0].name).toBe('本页表单名');
  });

  it('设计器：备注保存期间出现未保存输入，一致重读不覆盖也不改写其基线', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.forms[0].domain = '外部域'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(async () => {
      await wrapper.get('[data-test="designer-form-property-name"]').setValue('迟到的输入');
      return 'confirm';
    });
    await saveNotes(wrapper, '审阅后备注');
    await settle();
    expect(wrapper.get('[data-test="designer-form-property-name"]').element.value).toBe('迟到的输入');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    // 迟到输入的基线仍是旧标签：必须单独审阅，输入不丢、不被同步覆盖或静默换基线。
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(acceptedWrites(server)).toEqual([false, true, false, true]);
  });
});

// AC2-COPY / AC2-RELOAD 专用（本文件局部）：在已安装的 designServerFixture fetch mock 之上再包一层，
// 只拦截项目2的四个列表读取（空数组 + 合法 p2 标签），其余请求一律委托被捕获的原实现。
// 共享 fixture 只脚本化了项目1；项目切换用例若无此包装，会在项目 watcher 未 await 的 loadForms()
// 上产生未处理拒绝。不改动共享 fixture/setup，也不吞掉任何失败。
// 注意：vitest 对同一 fetch 重复 spyOn 返回同一个 mock，mockImplementation 会覆盖 fixture 实现，
// 因此必须捕获并委托 getMockImplementation() 的原始函数，而不是再次 spyOn 包装。
function installProject2ReadSupport() {
  const inner = globalThis.fetch.getMockImplementation();
  const p2ListRead = /^\/api\/projects\/2\/(?:forms|field-definitions|codelists|units)$/;
  const p2Tag = () => `"crf-design-v1:p2:${'c'.repeat(32)}:r1"`;
  globalThis.fetch.mockImplementation(async (url, options = {}) => {
    if ((options.method || 'GET') === 'GET' && p2ListRead.test(String(url))) {
      return new Response('[]', { status: 200, headers: { 'X-CRF-Design-Revision': p2Tag() } });
    }
    return inner(url, options);
  });
}

// F1-R4：工具栏重载的原始输入比较看不到「不改动任何被捕获输入」的本页已接受写入；排序写入也
// 可以在读取在途时才开始。落地前必须同步重查投影快照身份/最近本页已接受写入标签/accepted 凭据、
// 项目/表单/选择/鉴权/组件生命周期，以及历史回放/排序/草稿保存/字段保存/成员变更忙状态。
describe('F1-R4：重载候选被本页更新超越', () => {
  // 一条如实的「未应用」反馈：既覆盖读取期间有新的本页提交，也覆盖落地瞬间仍有进行中的本页操作。
  const RELOAD_SUPERSEDED_MESSAGE = '重新载入未应用：读取期间本页有新操作或仍在进行的操作，当前显示和撤销记录已保留';
  async function holdToolbarReload(wrapper, server) {
    const readsBefore = server.calls.filter((call) => call.method === 'GET').length;
    const releases = server.holdReads(5);
    await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    await settle();
    expect(server.calls.filter((call) => call.method === 'GET')).toHaveLength(readsBefore + 5);
    return async () => { releases.forEach((release) => release()); await settle(); };
  }

  it('RELOAD-OWNWRITE：读取期间本页备注保存超越旧候选，已保存显示与既有撤销保留且可真实撤销', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    // 先形成一条可撤销的本页历史（字段属性保存会记入撤销栈；表单属性保存不记）
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('重载前的本页标签');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true]);
    // 关闭字段编辑器，露出备注入口（备注按钮仅在未选中字段时可见）
    await wrapper.get('.fd-canvas-list').trigger('click');
    await settle();
    const release = await holdToolbarReload(wrapper, server);
    // 读取在途时通过真实备注弹窗保存备注；所有被捕获的原始输入不变
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    await body().get('[data-test="design-notes-input"]').setValue('读取期间保存的备注');
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true]);
    await release();
    // 旧候选必须被拒绝：已保存备注不得回退、旧撤销不得清除且必须能真实回放
    expect(ElMessage.warning).toHaveBeenCalledWith(RELOAD_SUPERSEDED_MESSAGE);
    expect(wrapper.text()).toContain('读取期间保存的备注');
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('字段1');
    // 被拒绝的重载不得破坏本页写入链：之后的自己的保存继续直接提交
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('拒绝后新名称');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true, true, true]);
    expect(server.state.forms[0].name).toBe('拒绝后新名称');
  });

  it('RELOAD-REORDER：排序写入在途时旧重读不得覆盖乐观顺序；读取先归位、写入后落地且历史可用', async () => {
    const { wrapper, server } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    // 先武装写入门，再触发排序：写入在途而读取仍被扣住
    const releaseWrite = server.holdWrites();
    const dragEvent = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '' } });
    const canvasOrder = () => wrapper.findAll('.fd-canvas-list .ff-item')
      .map((node) => ['字段1', '字段2', '字段3'].find((label) => node.text().includes(label)))
      .join(',');
    const rows = () => wrapper.findAll('.fd-canvas-list .ff-item');
    await rows()[0].trigger('dragstart', dragEvent());
    await rows()[2].trigger('dragover', dragEvent());
    await rows()[2].trigger('drop', dragEvent());
    await settle();
    // 乐观状态：新顺序已显示；写入被扣住尚未提交；历史尚未记录（撤销不可用属正常）
    expect(canvasOrder()).toBe('字段2,字段1,字段3');
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0].accepted).toBe(false);
    // 先放行旧读取，后放行写入
    await release();
    // 读取落地瞬间排序仍在途：必须拒绝重载，乐观顺序与历史现状原样保留
    expect(ElMessage.warning).toHaveBeenCalledWith(RELOAD_SUPERSEDED_MESSAGE);
    expect(canvasOrder()).toBe('字段2,字段1,字段3');
    await releaseWrite();
    await settle();
    // 写入落地：显示顺序 = 服务器顺序，且撤销可真实回放到原顺序
    expect(canvasOrder()).toBe('字段2,字段1,字段3');
    const serverOrder = () => server.state.fields
      .filter((field) => field.form_id === 7)
      .sort((a, b) => a.order_index - b.order_index)
      .map((field) => ['字段1', '字段2', '字段3'].find((label) => {
        const definition = server.state.definitions.find((item) => item.id === field.field_definition_id);
        return definition && definition.label === label;
      }))
      .join(',');
    expect(serverOrder()).toBe('字段2,字段1,字段3');
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(serverOrder()).toBe('字段1,字段2,字段3');
    expect(canvasOrder()).toBe('字段1,字段2,字段3');
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true]);
  });

  it('RELOAD-DEPART：重载读取在途切换项目，上下文丢失按取消处理且不安装', async () => {
    const { wrapper, server } = await mountEditor();
    installProject2ReadSupport();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    await wrapper.setProps({ projectId: 2 });
    await settle();
    await release();
    // 上下文丢失=取消：无警告/错误，旧候选不落进项目2的空列表视图
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('知情同意');
  });

  it('RELOAD-AUTH-CHANGE：读取在途鉴权代变化且编辑内容已变化，静默放弃不警示（LOW-1 续修前预期RED）', async () => {
    const { wrapper, server } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    // 读取在途：先产生原始输入变化，再切换鉴权会话（离开当前会话上下文）
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('离开会话前的输入');
    localStorage.setItem('crf_token', 'reload-next-auth');
    await release();
    await settle();
    // 生命周期已丢失：静默取消。不得在离开会话后仍发出原始输入警示（LOW-1 时序缺口）。
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('RELOAD-AUTH-ONLY：读取在途鉴权代变化（编辑内容不变），静默放弃不警示（控制）', async () => {
    const { wrapper, server } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    localStorage.setItem('crf_token', 'reload-next-auth-only');
    await release();
    await settle();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('RELOAD-DISPOSED-ONLY：读取在途组件卸载（编辑内容不变），静默不警示（控制）', async () => {
    const { wrapper, server } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    wrapper.unmount();
    await settle();
    release();
    await settle();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('RELOAD-DISPOSED-CHANGE：读取在途卸载且编辑内容已变化，静默放弃不警示（disposal判别控制）', async () => {
    const { wrapper, server } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const release = await holdToolbarReload(wrapper, server);
    // 读取在途：先产生原始输入变化，再卸载组件（与 AUTH-CHANGE 镜像的 disposal 前提）。
    // 若移除 disposed 检查，原始输入比较会先命中并发出「编辑内容已变化」警示 → 本用例失败。
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('卸载前的输入');
    wrapper.unmount();
    await settle();
    release();
    await settle();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('RELOAD-REFUSAL-AFTERMATH：拒绝后本页撤销仍可用；真实外部推进后的后续保存仍409审阅且取消保留输入', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    // 形成可撤销历史并触发拒绝（备注保存超越旧候选）
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('重载前的本页标签');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    await wrapper.get('.fd-canvas-list').trigger('click');
    await settle();
    const release = await holdToolbarReload(wrapper, server);
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    await body().get('[data-test="design-notes-input"]').setValue('读取期间备注');
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
    await release();
    expect(ElMessage.warning).toHaveBeenCalledWith(RELOAD_SUPERSEDED_MESSAGE);
    // 拒绝后既有撤销仍可用：真实回放到保存前值
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(server.state.definitions[0].label).toBe('字段1');
    // 真实外部推进表单名；自己的表单名保存 → 409 审阅 → 取消保留输入
    server.remote((state) => { state.forms[0].name = '外部推进名'; });
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('我的后续输入');
    confirm.mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    // 写入序列：字段标签保存、备注保存、撤销回放（均为本页已接受），最后表单名保存被审阅拒绝
    expect(acceptedWrites(server)).toEqual([true, true, true, false]);
    expect(wrapper.get('[data-test="designer-form-property-name"]').element.value).toBe('我的后续输入');
    expect(server.state.forms[0].name).toBe('外部推进名');
  });

  it('RELOAD-CLEAN-UNKNOWN-EFFECT：干净重读投影后，读取期间instance-only命令（unknown效果）仍超越旧候选（组合守卫characterization）', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    // 先完成一次无干扰的完整重读：干净投影、历史清空
    const releaseClean = await holdToolbarReload(wrapper, server);
    await releaseClean();
    await settle();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeDefined();
    // 从干净投影再发起重读；先扣住本命令写后的字段一致重读（forms+fields 2个读），
    // 防新fields快照遮蔽own-tag/receipt组合信号
    const releaseFieldReads = server.holdReadsAfterNextWrite(2);
    const release = await holdToolbarReload(wrapper, server);
    // 读取在途：instance-only命令（横向表格标记切换 → PUT /api/form-fields/{id}/binding-profile）。
    // 该命令走 FIELD_COMMAND_URL：完整快照下 applyOwnDesignWrite 返回 null=效果未知，两个快照
    // 身份不变、无独立忙标记——身份判别看不到此类写入（备注保存 PUT /api/forms/7 是 known 效果，
    // 身份改变本身就能拒旧读，不能作 unknown-effect 见证）。
    await wrapper.find('.ff-item [aria-label*="横向表格标记"]').trigger('click');
    await settle();
    const bindingWrites = server.writes().filter((call) => /binding-profile/.test(call.url));
    expect(bindingWrites).toHaveLength(1);
    expect(bindingWrites[0].accepted).toBe(true);
    // 先放行旧toolbar候选：组合信号（最近本页写入标签/accepted 凭据/进行中本页操作）判定被超越
    // → superseded 警示；等标签 receipt 仍不可隔离，本用例只刻画组合守卫整体行为。
    await release();
    expect(ElMessage.warning).toHaveBeenCalledWith(RELOAD_SUPERSEDED_MESSAGE);
    // 再放行写后字段读收敛：inline 标记真实落地
    releaseFieldReads();
    await settle();
    // 实际unknown写后的own-save控制：unknown效果不升级宿主基线（known效果才会），观察实际路径
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('未知效果后的直存');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    // 写入序列按实际观察记录（characterization）：binding-profile（unknown效果）后，表单名直存
    // 直接提交成功（写后一致重读已收敛宿主基线，无409审阅）——unknown效果不阻断后续本页写入。
    // confirm 恰好2次=两次工具栏重载确认；第3次不存在=最终直存无冲突审阅。
    expect(acceptedWrites(server)).toEqual([true, true]);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(server.state.forms[0].name).toBe('未知效果后的直存');
  });
});

// F1-R3：整表复制已提交后的列表结果/反馈原先与「选择会话」绑定——普通切换表单就吞掉已提交
// 副本的可见性与「复制成功」反馈。产品决定：同项目内的普通表单切换不再取消列表结果（项目列表
// 生命周期只随项目票据/鉴权/组件失效；A→B→A 视为新项目会话）；选择绑定的候选采纳仍需原表单/
// 选择会话，采纳失效但项目仍在时走恰好一次 forms-only 回退读取；回退读取发起前固定快照身份/
// 最近本页标签/accepted 凭据，只有该读取期间的新变化能超越它；成功反馈以「实际当前成对列表」
// 是否含副本 id 为准，绝不重发 POST。
describe('F1-R3：整表复制跨选择完成', () => {
  const COPY_NOT_VISIBLE_MESSAGE = '表单已复制，但当前列表尚未显示新表单，请刷新后核对，勿重复提交';
  const seedSecondForm = (state) => {
    state.forms.push({ ...state.forms[0], id: 8, name: '随访表单', code: 'FU', domain: 'VS', order_index: 2 });
    state.fields.push(...state.fields.map((field) => ({ ...field, id: field.id + 1000, form_id: 8 })));
  };
  const listedForm = (wrapper, name) => {
    const row = wrapper.findAll('.el-table__row').find((node) => node.text().includes(name));
    expect(row, `列表应显示表单「${name}」`).toBeTruthy();
    return row;
  };
  const copySourceRow = (wrapper, sourceName) => listedForm(wrapper, sourceName).get('[aria-label="复制"]');
  const copyCalls = (server) => server.writes().filter((call) => /\/copy$/.test(call.url));
  async function saveNotesDuringPendingReads(wrapper, text) {
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    await body().get('[data-test="design-notes-input"]').setValue(text);
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
  }
  // 共享 fixture 仅脚本化 /api/forms/7/fields/reorder（其余写按「未脚本化写入」拒绝）。
  // 表单8的真实拖排历史（persistFieldReorder：真实 recordHistory、直接成功不发布左列表）
  // 按派单「所有网络闸门/helper 仅本 spec」的授权，用局部 fetch 包装补齐：幂等定义 PUT 经
  // 既有 mock 推进修订序列取新标签（不改 fixture 内部序列），再按 fixture 同款 mutate 语义
  // 改写 form 8 字段顺序并回 204 + 新标签；写入 server.calls 保持既有断言可见。
  function installForm8ReorderSupport(server) {
    const inner = globalThis.fetch.getMockImplementation();
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'POST' && String(url) === '/api/forms/8/fields/reorder') {
        // 保真度（与共享 fixture 同款）：按调用方真实 If-Match 请求头判别——缺失或陈旧返回与
        // fixture 相同的 409 {detail:'设计已更新，请核对',code:'STALE_STATE'}（无 revision 响应头、
        // 不推进序列、不改字段顺序、accepted:false 记录真实请求头）；成功同样记录真实请求头。
        // 不替调用方取最新 If-Match（序列推进 PUT 用的标签是包装器自身写入，仍按需取当前值）。
        const body = options.body ? JSON.parse(options.body) : undefined;
        const list = await inner('/api/projects/1/forms', {});
        const currentTag = list.headers.get('X-CRF-Design-Revision');
        const call = { url: String(url), method, body, revision: options.headers?.['If-Match'], accepted: false };
        server.calls.push(call);
        if (call.revision !== currentTag) {
          return new Response(JSON.stringify({ detail: '设计已更新，请核对', code: 'STALE_STATE' }), { status: 409 });
        }
        const definitionRow = server.state.definitions.find((item) => item.id === 201);
        const bumped = await inner('/api/projects/1/field-definitions/201', {
          method: 'PUT',
          headers: { 'If-Match': currentTag },
          body: JSON.stringify({ label: definitionRow.label }),
        });
        const newTag = bumped.headers.get('X-CRF-Design-Revision');
        for (const [index, id] of body.ordered_ids.entries()) {
          server.state.fields.find((item) => item.id === id).order_index = index + 1;
        }
        call.accepted = true;
        return new Response(null, { status: 204, headers: { 'X-CRF-Design-Revision': newTag } });
      }
      return inner(url, options);
    });
  }
  // 仅扣复制 POST 的局部包装（派单明确要求：不用全局 holdWrites——它会挡住复制窗口内
  // 所有后续写入，使 B 的保存/撤销永远悬空）。放行后交还既有 fixture mock 正常处理。
  function armCopyPostHold() {
    const inner = globalThis.fetch.getMockImplementation();
    const releases = [];
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'POST' && /\/api\/forms\/\d+\/copy$/.test(String(url))) {
        await new Promise((resolve) => releases.push(resolve));
      }
      return inner(url, options);
    });
    return () => { for (const release of releases.splice(0)) release(); };
  }

  // A项helper保真自测：与共享fixture同款按调用方真实If-Match请求头判别。缺省/陈旧标签必须
  // 409 STALE_STATE（无revision响应头、不推进序列、不改字段顺序、accepted:false记录真实请求头）；
  // 正确标签204并记录真实请求头。旧包装器无条件204且把server标签冒充请求头——先留真实RED。
  it('FORM8-REORDER-IFMATCH：局部重排包装器按真实请求头判别，缺/陈旧If-Match应409且不推进（helper保真自测）', async () => {
    const { server } = await mountEditor(FormDesignerTab, { formId: 7, seed: seedSecondForm });
    installForm8ReorderSupport(server);
    const list = await fetch('/api/projects/1/forms');
    const currentTag = list.headers.get('X-CRF-Design-Revision');
    expect(currentTag).toBeTruthy();
    const orderedIds = () => server.state.fields
      .filter((field) => field.form_id === 8)
      .sort((a, b) => a.order_index - b.order_index)
      .map((field) => field.id);
    const orderBefore = orderedIds().join(',');
    const staleTag = '"crf-design-v1:p1:' + 'a'.repeat(32) + ':r99"';
    const post = (headers) => fetch('/api/forms/8/fields/reorder', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ordered_ids: [...orderedIds()].reverse() }),
    });
    const missingRes = await post({});
    expect(missingRes.status).toBe(409);
    expect((await missingRes.json()).code).toBe('STALE_STATE');
    expect(missingRes.headers.get('X-CRF-Design-Revision')).toBeNull();
    const staleRes = await post({ 'If-Match': staleTag });
    expect(staleRes.status).toBe(409);
    expect((await staleRes.json()).code).toBe('STALE_STATE');
    expect(staleRes.headers.get('X-CRF-Design-Revision')).toBeNull();
    // 409不推进序列、不改字段顺序
    const afterList = await fetch('/api/projects/1/forms');
    expect(afterList.headers.get('X-CRF-Design-Revision')).toBe(currentTag);
    expect(orderedIds().join(',')).toBe(orderBefore);
    // 拒绝调用按真实请求头记录、accepted:false
    const reorderCalls = server.writes().filter((call) => /reorder/.test(call.url));
    expect(reorderCalls.map((call) => [call.accepted, call.revision])).toEqual([
      [false, undefined],
      [false, staleTag],
    ]);
    // 正确标签：204、新标签、真实改序、accepted:true且记录真实请求头
    const okRes = await post({ 'If-Match': currentTag });
    expect(okRes.status).toBe(204);
    const newTag = okRes.headers.get('X-CRF-Design-Revision');
    expect(newTag).toBeTruthy();
    expect(newTag).not.toBe(currentTag);
    expect(orderedIds().join(',')).not.toBe(orderBefore);
    const acceptedCall = server.writes().filter((call) => /reorder/.test(call.url))[2];
    expect(acceptedCall.accepted).toBe(true);
    expect(acceptedCall.revision).toBe(currentTag);
  });

  it('COPY-SWITCH-POST：复制POST在途切换A→B，副本显示、复制成功恰好一次、单次POST且当前选择保留', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    // 在途期间真实行点击切换到表单B（普通选择不是列表结果取消）
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
    releasePost();
    await settle();
    // 副本必须出现在实际列表；反馈恰好一次；恰好一次复制POST；当前选择仍是B
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success).toHaveBeenCalledTimes(1);
    expect(ElMessage.success).toHaveBeenCalledWith('复制成功');
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
    // B 的字段画布保持已加载状态（主画布字段计数），未被复制完成流程重置
    expect(wrapper.text()).toContain('共 3 个字段');
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('COPY-SWITCH-ADOPT：采纳读在途切换A→B，B的真实拖排历史先于回退创建（左列表不提前发布），副本落地后历史保留可撤销', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    installForm8ReorderSupport(server);
    // 扣住采纳的一致重读（设计器已打开 → forms/fields/definitions/codelists/units 共5个读）
    const releases = server.holdReads(5);
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    // 采纳读在途时切换到B；B 的读取不受扣住影响（门已耗尽）
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    // 读开始基线判别的前提：此刻左列表尚未发布副本行
    expect(wrapper.text()).not.toContain('知情同意_copy');
    // 在旧采纳读放行之前，为B创建一条真实撤销历史：画布拖排（persistFieldReorder 直接接受、
    // 真实 recordHistory，且不触发 loadForms/refreshKey——不提前发布含副本的左列表）。
    // 不用字段属性保存冒充：它会 refreshKey++ 并先发布含副本列表，使错误 POST-start 捕获也假成功。
    const bOrder = () => server.state.fields
      .filter((field) => field.form_id === 8)
      .sort((a, b) => a.order_index - b.order_index)
      .map((field) => field.field_definition_id)
      .join(',');
    const orderBefore = bOrder();
    const dragEvent = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '' } });
    const bRows = () => wrapper.findAll('.fd-canvas-list .ff-item');
    await bRows()[0].trigger('dragstart', dragEvent());
    await bRows()[2].trigger('dragover', dragEvent());
    await bRows()[2].trigger('drop', dragEvent());
    await settle();
    // 复制POST恰一次已接受；表单8拖排恰一次已接受（中间的幂等定义PUT是包装器推进修订序列
    // 的既有 mock 写入，属包装器实现细节）
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    expect(server.writes().filter((call) => /reorder/.test(call.url))).toHaveLength(1);
    expect(server.writes().filter((call) => /reorder/.test(call.url))[0].accepted).toBe(true);
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    // 拖排不发布左列表：副本行仍不可见；完成反馈尚未发出（读开始基线判别此刻才有效）
    expect(wrapper.text()).not.toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(0);
    // 放行旧采纳读：其选择会话已失效 → 静默弃用；改走 forms-only 回退
    releases.forEach((release) => release());
    await settle();
    expect(wrapper.text()).toContain('知情同意_copy');
    // 复制成功恰好一次（单次 POST 不变）
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(copyCalls(server)).toHaveLength(1);
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
    // 回退落地不得清掉B的历史：真实撤销回放拖排到原顺序
    expect(bOrder()).not.toBe(orderBefore);
    await wrapper.get('[data-test="designer-undo"]').trigger('click');
    await settle();
    expect(bOrder()).toBe(orderBefore);
  });

  it('COPY-SUPERSEDED-WRITE：回退读在途本页直受写入超越，陈旧候选被拒且反馈按当前列表如实选择', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(false);
    // 旧服务器只有后标签：采纳无过渡证据 → 恰好一次 forms-only 回退读取。
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    // 先扣住回退读，再放行POST：回退读在途期间切换到B（项目存活，不取消回退）
    const releases = server.holdReads(1);
    releasePost();
    await settle();
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    // B 的读取已把字段侧基线推进到复制后标签：B 上一次直接接受的本页写入（无审阅）
    // 移动「最近本页已接受写入标签」与 accepted 凭据；其保存后刷新同时安装更新列表。
    const editorB = await selectFirstField(wrapper);
    await inputByLabel(editorB, '字段标签').setValue('B期间的本页标签');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true]);
    // 回退仍在途：本页尚未发出复制反馈
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(0);
    releases.forEach((release) => release());
    await settle();
    // 陈旧候选被拒绝（不回退安装）；当前列表已含副本行 → 反馈如实选择成功分支，恰好一次
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(ElMessage.warning).not.toHaveBeenCalledWith(COPY_NOT_VISIBLE_MESSAGE);
    expect(wrapper.text()).toContain('B期间的本页标签');
    expect(copyCalls(server)).toHaveLength(1);
    // 正向连续性控制（非反证）：own-chain R1→R2 会升级基线，本探针原理上检测不到「陈旧回退
    // 被安装」——不能据此声称证明防超越。此处只断言流程结束后表单排序仍零审阅直接提交（未被
    // 本流程破坏）；防超越由上方组合信号（快照身份/最近本页写入标签/accepted 凭据，等标签
    // receipt 不单独证明）与 COPY-COMMITTED-NOT-VISIBLE 的拒装断言共同承担。
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.findAll('.el-table__row')[1].find('.ordinal-cell').trigger('dblclick');
    await settle();
    const ordinal = wrapper.findAll('.el-table__row')[1].find('.el-input-number input');
    await ordinal.setValue('1');
    await ordinal.trigger('keyup.enter');
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, true, true]);
  });

  it('COPY-SUPERSEDED-NOTES：回退读在途审阅后备注保存+干净同步安装，保留新状态并按当前列表如实报告成功', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(false);
    // 页面快照仍停在复制前标签：备注首次保存按409审阅后接受；审阅后干净同步在回退读在途时
    // 安装更新读取（含副本行）——超越旧候选；反馈按当前列表如实选择成功分支。
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const releases = server.holdReads(1);
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    await saveNotesDuringPendingReads(wrapper, '回退期间保存的备注');
    expect(server.writes().map((call) => call.accepted)).toEqual([true, false, true]);
    releases.forEach((release) => release());
    await settle();
    // 迟到候选不得把旧读取（旧备注、旧列表）安装回退；当前列表已含副本行 → 成功如实且恰好一次。
    expect(wrapper.text()).toContain('回退期间保存的备注');
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(ElMessage.warning).not.toHaveBeenCalledWith(COPY_NOT_VISIBLE_MESSAGE);
    expect(copyCalls(server)).toHaveLength(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('COPY-SUPERSEDED-INSTALL：回退读在途新列表安装，保留新列表并按当前列表如实报告成功', async () => {
    const { wrapper, server, refreshKey } = await mountEditor();
    server.useTransitionMetadata(false);
    const releases = server.holdReads(1);
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    // 回退读在途：外部推进 + 共享刷新信号触发更新列表安装（含副本行与外部名称）
    server.remote((state) => { state.forms[0].name = '外部更新名'; });
    refreshKey.value++;
    await settle();
    releases.forEach((release) => release());
    await settle();
    // 迟到候选被超越：保留更新后的列表（外部名称不回退），副本已在其中 → 成功如实且恰好一次
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(wrapper.text()).toContain('外部更新名');
    expect(ElMessage.success).toHaveBeenCalledTimes(1);
    expect(ElMessage.success).toHaveBeenCalledWith('复制成功');
    expect(ElMessage.warning).not.toHaveBeenCalledWith(COPY_NOT_VISIBLE_MESSAGE);
    expect(copyCalls(server)).toHaveLength(1);
  });

  it('COPY-ABA-PROJECT：复制POST在途A→B→A项目切换，旧回调静默、不覆盖项目2视图且缓存已失效', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    installProject2ReadSupport();
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    await wrapper.setProps({ projectId: 2 });
    await settle();
    expect(wrapper.text()).not.toContain('知情同意');
    releasePost();
    await settle();
    // 项目会话已离开：旧回调不得把项目1数据装进项目2空视图，也不得有任何反馈
    expect(wrapper.text()).not.toContain('知情同意');
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    // 回到项目1：合法加载可显示已提交副本，但旧复制操作仍保持静默、恰好一次POST
    await wrapper.setProps({ projectId: 1 });
    await settle();
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(copyCalls(server)).toHaveLength(1);
  });

  it('COPY-AUTH：复制POST在途鉴权会话变化，旧回调静默且列表不安装副本', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    localStorage.setItem('crf_token', 'copy-next-auth');
    releasePost();
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('知情同意_copy');
  });

  it('COPY-UNMOUNT：复制POST在途组件卸载，旧回调静默、零读取零反馈（LOW-2 既有缺陷预期RED）', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    const getsBefore = server.calls.filter((call) => call.method === 'GET').length;
    wrapper.unmount();
    await settle();
    releasePost();
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    // 卸载后旧回调不得再发起任何读取，也不得发出成功/警告反馈
    expect(server.calls.filter((call) => call.method === 'GET')).toHaveLength(getsBefore);
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(ElMessage.warning).not.toHaveBeenCalled();
  });

  it('COPY-ABA-SETTLE：复制POST在途项目1→2→1各自settle后才放行，旧回调零反馈零新增读，单次POST', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: false });
    installProject2ReadSupport();
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    // 两次项目切换各自落定（票据两次推进）后才放行POST：旧回调早已失效
    await wrapper.setProps({ projectId: 2 });
    await settle();
    await wrapper.setProps({ projectId: 1 });
    await settle();
    expect(wrapper.text()).not.toContain('知情同意_copy');
    const getsBeforeRelease = server.calls.filter((call) => call.method === 'GET').length;
    releasePost();
    await settle();
    // 旧回调不得发出任何反馈、不得发起任何新读取；恰好一次已接受POST
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(server.calls.filter((call) => call.method === 'GET')).toHaveLength(getsBeforeRelease);
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    // 放行前的合法回程加载不含副本（POST 此前未落地）；旧回调也不得补装
    expect(wrapper.text()).not.toContain('知情同意_copy');
  });

  it('COPY-ABA-FORM-RETURN：真实源拖排历史下A→B→A交付复制完成，旧历史随切换清空且不复活、A新会话输入保留', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    // 先造一条真实源历史（共享fixture支持form7拖排）：使「源历史不复活」有实际前提
    const dragEvent = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '' } });
    const aRows = () => wrapper.findAll('.fd-canvas-list .ff-item');
    await aRows()[0].trigger('dragstart', dragEvent());
    await aRows()[2].trigger('dragover', dragEvent());
    await aRows()[2].trigger('drop', dragEvent());
    await settle();
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeUndefined();
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    // 真实行点击 A→B→A（两次选择会话推进后才交付完成；不用 selectFormById 掩盖列表发布）
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    await listedForm(wrapper, '知情同意').trigger('click');
    await settle();
    // 源历史随选择切换清空（正常行为），回A后不得复活；A 新会话产生未保存输入
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('回A后的新输入');
    releasePost();
    await settle();
    // 副本行可见；成功反馈恰好一次；恰好一次POST
    expect(wrapper.text()).toContain('知情同意_copy');
    const copyFormRow = server.state.forms.find((item) => item.name === '知情同意_copy');
    expect(copyFormRow).toBeTruthy();
    expect(listedForm(wrapper, '知情同意_copy')).toBeTruthy();
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(copyCalls(server)).toHaveLength(1);
    // A 新会话的输入保留；旧源历史未复活（撤销仍不可用）。
    // 范围声明：本用例不预种/不创建A的新历史，「新A历史保留」不由本用例证明；
    // 新当前选择的真实拖排历史/撤销由 COPY-SWITCH-ADOPT 承担。
    expect(wrapper.get('[data-test="designer-form-property-name"]').element.value).toBe('回A后的新输入');
    expect(wrapper.get('[data-test="designer-undo"]').attributes('disabled')).toBeDefined();
  });

  it('COPY-COMMITTED-NOT-VISIBLE：回退读扣住时B直受拖排推进，陈旧候选拒装且恰一次已复制未显示警示，不重发POST', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(false);
    installForm8ReorderSupport(server);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    // 先扣住 forms-only 回退读，再放行POST（副本已提交）
    const releases = server.holdReads(1);
    releasePost();
    await settle();
    // 回退读在途：切换到B（其字段侧读取已推进到含副本的标签）
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    // B 直接受拖排（真实历史、不触发 loadForms/refreshKey）：推进最近本页写入标签/凭据
    const dragEvent = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '' } });
    const bRows = () => wrapper.findAll('.fd-canvas-list .ff-item');
    await bRows()[0].trigger('dragstart', dragEvent());
    await bRows()[2].trigger('dragover', dragEvent());
    await bRows()[2].trigger('drop', dragEvent());
    await settle();
    expect(server.writes().filter((call) => /reorder/.test(call.url))).toHaveLength(1);
    // 当前左列表仍未发布副本行；完成反馈尚未发出
    expect(wrapper.text()).not.toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(0);
    // 放行陈旧回退读：候选被拒装（不回退左列表）→ 恰一次「已复制但当前列表未显示」
    releases.forEach((release) => release());
    await settle();
    expect(ElMessage.warning.mock.calls.filter((call) => call[0] === COPY_NOT_VISIBLE_MESSAGE)).toHaveLength(1);
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('知情同意_copy');
    // 绝不重发POST；后续核对（再放行一轮 settle）也不补发
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
  });

  it('COPY-RETAIN-DIRTY-FORM：复制POST在途切换B并脏改表单名，交付完成后输入保留且成功恰一次', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('B脏表单名');
    releasePost();
    await settle();
    expect(wrapper.get('[data-test="designer-form-property-name"]').element.value).toBe('B脏表单名');
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(copyCalls(server)).toHaveLength(1);
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
  });

  it('COPY-RETAIN-DIRTY-FIELD：复制POST在途切换B并脏改字段标签，交付完成后编辑器输入保留且可保存', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    await selectFirstField(wrapper);
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('B脏字段输入');
    releasePost();
    await settle();
    expect(wrapper.find('[data-test="designer-field-property-form"]').exists()).toBe(true);
    expect(inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').element.value).toBe('B脏字段输入');
    expect(wrapper.get('[data-test="designer-property-save"]').attributes('disabled')).toBeUndefined();
    // 按钮enabled之外的真实保存路径：复制回退只刷左列表、不升级脏字段基线——保存按冻结的
    // 复制前基线提交 → 真实409审阅 → 取消静默放弃、输入保留（不迁移新副本权限）。
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').element.value).toBe('B脏字段输入');
    expect(acceptedWrites(server)).toEqual([true, false]);
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(copyCalls(server)).toHaveLength(1);
  });

  it('COPY-RETAIN-DRAFT：复制POST在途切换B新建本地草稿，交付完成后草稿保留且未保存写入为零', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    const releasePost = server.holdWrites();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    await wrapper.get('[data-test="designer-new-field"]').trigger('click');
    await settle();
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('B新草稿');
    releasePost();
    await settle();
    expect(wrapper.text()).toContain('B新草稿');
    expect(wrapper.find('[data-test="designer-field-property-form"]').exists()).toBe(true);
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    // 真实零草稿保存：放行后全部写入恰为复制POST这一条（草稿只存本地，无任何保存写入）
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0].url).toMatch(/\/copy$/);
  });

  it('COPY-METADATA-AFTER-ONLY：复制响应仅有后标签（无过渡证据），同选择直接走回退并成功恰一次', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(false);
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(ElMessage.warning).not.toHaveBeenCalledWith(COPY_NOT_VISIBLE_MESSAGE);
    expect(copyCalls(server)).toHaveLength(1);
  });

  it('COPY-METADATA-MALFORMED：复制响应过渡证据畸形，同选择直接走回退并成功恰一次', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata('malformed');
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    expect(wrapper.text()).toContain('知情同意_copy');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(ElMessage.warning).not.toHaveBeenCalledWith(COPY_NOT_VISIBLE_MESSAGE);
    expect(copyCalls(server)).toHaveLength(1);
  });

  it('COPY-EXTERNAL-GAP-CANCEL：复制窗口内外部推进使B字段保存409审阅，取消保留输入且复制照常完成', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(true);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    // 只扣复制 POST 的局部包装（全局 holdWrites 会挡住窗口内 B 的保存）
    const releasePost = armCopyPostHold();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    await selectFirstField(wrapper);
    // 复制窗口内真实外部推进表单名；B 的字段标签保存基线已陈旧 → 409 审阅 → 取消静默放弃
    server.remote((state) => { state.forms[0].name = '窗口内外部名'; });
    await inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').setValue('B审阅期间输入');
    confirm.mockRejectedValueOnce('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    // 取消保留输入；复制POST仍未放行（无成功反馈）
    expect(inputByLabel(wrapper.get('[data-test="designer-field-property-form"]'), '字段标签').element.value).toBe('B审阅期间输入');
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(0);
    // 真实409凭据（不以confirm次数替代）：此刻唯一写入=字段保存被拒
    expect(acceptedWrites(server)).toEqual([false]);
    // 复制照常完成：副本可见、成功恰一次、单次POST
    releasePost();
    await settle();
    // 副本继承放行时源表单当前名（外部改名后落地 → `窗口内外部名_copy`）
    const copyRowText = wrapper.findAll('.el-table__row')
      .map((node) => node.text())
      .find((text) => text.includes('_copy'));
    expect(copyRowText, '列表应显示副本行').toBeTruthy();
    expect(server.state.forms.find((item) => item.name.endsWith('_copy'))).toBeTruthy();
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(1);
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
  });

  it('COPY-FALLBACK-READ-FAIL：复制POST扣住时切B，跨选择回退读取真实失败，恰一次警示且不重发POST', async () => {
    const { wrapper, server } = await mountEditor(FormDesignerTab, { open: true, formId: 7, seed: seedSecondForm });
    server.useTransitionMetadata(false);
    // 只扣复制POST的局部包装：扣住期间完成跨选择切换（已批准的cross-selection失败警示场景）。
    // 注意：包装层扣住的POST尚未到达fixture（未入server.calls），释放后才能断言调用记录。
    const releasePost = armCopyPostHold();
    await copySourceRow(wrapper, '知情同意').trigger('click');
    await settle();
    await listedForm(wrapper, '随访表单').trigger('click');
    await settle();
    expect(wrapper.get('.el-table__row.current-row').text()).toContain('随访表单');
    server.failReads(true);
    releasePost();
    await settle();
    server.failReads(false);
    // 复制已提交但回退读取失败：如实警示、无成功反馈、左列表不装副本、不重发POST
    expect(ElMessage.warning.mock.calls.filter((call) => call[0] === '表单已复制，但列表刷新失败，请刷新后核对，勿重复提交')).toHaveLength(1);
    expect(ElMessage.success.mock.calls.filter((call) => call[0] === '复制成功')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('知情同意_copy');
    expect(copyCalls(server)).toHaveLength(1);
    expect(copyCalls(server)[0].accepted).toBe(true);
    await settle();
    expect(copyCalls(server)).toHaveLength(1);
  });
});
