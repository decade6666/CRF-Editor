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
async function mountEditor(component = FormDesignerTab, { open = true } = {}) {
  const server = stageDesignServer();
  const refreshKey = ref(0);
  const wrapper = mount(component, { props: { projectId: 1 },
    global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
  });
  await settle();
  if (component === FormDesignerTab) {
    await wrapper.vm.selectFormById(7);
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
