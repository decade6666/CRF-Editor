// 【组件挂载回归 · 单横向表格编辑守卫】任务 10-26-single-table-guard
//
// 真实挂载 FormDesignerTab，钉住三件事：
// 1) 行内横向开关在拆块/新增块方向被就地拒绝（零请求 + 具体原因 + 仅回滚布局位）；
// 2) 会拆块的拖拽排序在乐观替换前被拒绝并保持原顺序；
// 3) 批量删除撤销走一次 restore-batch 原子请求，失败时提示具体原因且不逐行重建。
// 行为级细粒度矩阵见 tests/inlineTableGuard.test.js 与后端 API 测试。
import { describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import { api } from '../../src/composables/useApi.js';

vi.mock('sortablejs', () => ({
  default: {
    create: () => ({ destroy() {} }),
  },
}));

const PROJECT_ID = 1;
const FORM_ID = 7;
const LIMIT_MESSAGE = '单个表单最多允许一个横向表格，本次操作会新增横向表格，已取消操作';

function makeField(id, label, orderIndex, { inlineMark = 0 } = {}) {
  return {
    id,
    form_id: FORM_ID,
    field_definition_id: 200 + orderIndex,
    is_log_row: 0,
    order_index: orderIndex,
    required: 0,
    label_override: null,
    help_text: null,
    default_value: null,
    inline_mark: inlineMark,
    bg_color: null,
    text_color: null,
    label_bold: null,
    label_font_size: null,
    field_definition: {
      id: 200 + orderIndex,
      project_id: PROJECT_ID,
      variable_name: `EDC_OID_${id}`,
      label,
      field_type: '文本',
      checkbox_label: null,
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      codelist_id: null,
      unit_id: null,
      is_multi_record: 0,
      table_type: '固定行',
      order_index: orderIndex,
      codelist: null,
      unit: null,
    },
  };
}

function dragEvent(extra = {}) {
  return { dataTransfer: { effectAllowed: '', dropEffect: '' }, ...extra };
}

// 按 URL 分派；维护独立的服务端快照，重载不能重新带回已经删除的字段。
function stageApiMocks({ fields, onRestoreBatch, onPut, restoreIds = [] } = {}) {
  const posts = [];
  const puts = [];
  let serverFields = structuredClone(fields);
  const definitions = new Map(fields.map((field) => [field.field_definition_id, structuredClone(field.field_definition)]));
  let nextId = 1000;
  const restoredIds = [...restoreIds];
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    if (url === `/api/projects/${PROJECT_ID}/forms`) {
      return Promise.resolve([
        { id: FORM_ID, project_id: PROJECT_ID, name: '知情同意', code: 'ICF', order_index: 1 },
      ]);
    }
    if (url === `/api/forms/${FORM_ID}/fields`) return Promise.resolve(structuredClone(serverFields));
    if (url === `/api/projects/${PROJECT_ID}/field-definitions`) return Promise.resolve([...definitions.values()]);
    return Promise.resolve([]);
  });
  vi.spyOn(api, 'get').mockResolvedValue([]);
  vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    posts.push([url, body]);
    if (url === `/api/forms/${FORM_ID}/fields/batch-delete`) {
      serverFields = serverFields.filter((field) => !body.ids.includes(field.id))
        .map((field, index) => ({ ...field, order_index: index + 1 }));
    }
    if (url === `/api/forms/${FORM_ID}/fields/restore-batch`) {
      if (onRestoreBatch) await onRestoreBatch(body);
      const restored = body.items.map(({ form_field: payload }) => ({
        ...payload, id: restoredIds.length ? restoredIds.shift() : nextId++, form_id: FORM_ID,
        field_definition: structuredClone(definitions.get(payload.field_definition_id)),
      }));
      for (const field of [...restored].sort((a, b) => a.order_index - b.order_index)) {
        serverFields = serverFields.map((item) => ({
          ...item, order_index: item.order_index >= field.order_index ? item.order_index + 1 : item.order_index,
        }));
        serverFields.push(field);
      }
      return structuredClone(restored);
    }
  });
  vi.spyOn(api, 'put').mockImplementation(async (url, body) => {
    puts.push([url, body]);
    if (onPut) await onPut(url, body);
    const id = Number(url.split('/')[3]);
    serverFields = serverFields.map((field) => field.id === id ? { ...field, ...body.instance.upsert } : field);
    return { form_field: structuredClone(serverFields.find((field) => field.id === id)) };
  });
  vi.spyOn(api, 'del').mockResolvedValue(undefined);
  return { posts, puts };
}

async function mountDesignerAndSelectForm({ fields, onRestoreBatch, onPut, restoreIds } = {}) {
  const mocks = stageApiMocks({ fields, onRestoreBatch, onPut, restoreIds });
  const wrapper = mount(FormDesignerTab, {
    props: { projectId: PROJECT_ID },
    global: { provide: { refreshKey: ref(0), editMode: ref(true) } },
  });
  await flushPromises();
  await nextTick();
  await wrapper.vm.selectFormById(FORM_ID);
  await flushPromises();
  await nextTick();
  const openButton = wrapper.findAll('button').find((button) => button.text().includes('设计表单'));
  expect(openButton, '选中表单后应出现「设计表单」入口').toBeTruthy();
  await openButton.trigger('click');
  await flushPromises();
  await nextTick();
  await flushPromises();
  return { wrapper, mocks };
}

const inlineToggleByLabel = (wrapper, label) =>
  wrapper
    .findAll('.fd-canvas-list .ff-item button')
    .find((button) => (button.attributes('aria-label') || '').includes(`切换 ${label} 的横向表格标记`));

const renderedFieldLabels = (wrapper) =>
  wrapper.findAll('.fd-canvas-list .ff-item .ff-label').map((node) => node.text().trim());

describe('FormDesignerTab 单横向表格编辑守卫（真实挂载）', () => {
  it('块中间关闭横向标记被就地拒绝：零请求 + 具体原因 + 行保持横向', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [
        makeField(101, '甲', 1, { inlineMark: 1 }),
        makeField(102, '乙', 2, { inlineMark: 1 }),
        makeField(103, '丙', 3, { inlineMark: 1 }),
      ],
    });

    const toggle = inlineToggleByLabel(wrapper, '乙');
    expect(toggle, '块内字段应有横向开关').toBeTruthy();
    await toggle.trigger('click');
    await flushPromises();
    await nextTick();

    expect(mocks.puts, '拒绝时不得发出任何写请求').toEqual([]);
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(renderedFieldLabels(wrapper)).toEqual(['甲', '乙', '丙']);
    const middleItem = wrapper.findAll('.fd-canvas-list .ff-item')[1];
    expect(middleItem.classes(), '被拒绝的字段行应保持横向标记').toContain('inline');
  });

  it('块尾相邻扩展仍放行：开关照常发出既有请求', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1, { inlineMark: 1 }), makeField(102, '乙', 2)],
    });

    const toggle = inlineToggleByLabel(wrapper, '乙');
    expect(toggle.attributes('disabled')).toBeUndefined();
    await toggle.trigger('click');
    await flushPromises();
    await nextTick();

    expect(ElMessage.error.mock.calls).toEqual([]);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][0]).toBe(`/api/form-fields/102/binding-profile`);
    expect(ElMessage.error).not.toHaveBeenCalledWith(LIMIT_MESSAGE);
  });

  it('拆块的拖拽被拒绝：零排序请求 + 原顺序保持 + 具体原因', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [
        makeField(101, '甲', 1, { inlineMark: 1 }),
        makeField(102, '乙', 2, { inlineMark: 1 }),
        makeField(103, '丙', 3),
      ],
    });
    expect(renderedFieldLabels(wrapper)).toEqual(['甲', '乙', '丙']);

    // 把普通字段丙拖到块中间乙的上方：[甲, 丙, 乙] 会拆出两个横向块
    const rows = wrapper.findAll('.fd-canvas-list .ff-item');
    expect(rows[2].attributes('draggable')).toBe('true');
    await rows[2].trigger('dragstart', dragEvent());
    expect(wrapper.vm.$.setupState.dragSrcId, 'dragstart 应记录拖动源').toBe(103);
    await rows[1].trigger('dragover', dragEvent());
    expect(wrapper.vm.$.setupState.dragSrcId, 'dragover 不应丢失拖动源').toBe(103);
    await wrapper.findAll('.fd-canvas-list .ff-item')[1].trigger('drop', dragEvent());
    await flushPromises();
    await nextTick();

    const reorderPosts = mocks.posts.filter(([url]) => url === `/api/forms/${FORM_ID}/fields/reorder`);
    expect(reorderPosts, '拆块排序不得发出请求').toEqual([]);
    expect(renderedFieldLabels(wrapper), '拒绝后应保持原顺序').toEqual(['甲', '乙', '丙']);
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
  });

  it('快捷编辑的横向复选框拆块时立即回退，不等待保存', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [
        makeField(101, '甲', 1, { inlineMark: 1 }),
        makeField(102, '乙', 2, { inlineMark: 1 }),
        makeField(103, '丙', 3, { inlineMark: 1 }),
      ],
    });
    await wrapper.findAll('.wp-inline-header')[1].trigger('dblclick');
    await flushPromises();
    const checkbox = new DOMWrapper(document.body).findAll('.el-checkbox').find((item) => item.text().trim() === '横向显示');
    expect(checkbox).toBeTruthy();
    await checkbox.find('input').setValue(false);
    await flushPromises();
    await nextTick();

    expect(checkbox.find('input').element.checked).toBe(true);
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(mocks.puts).toEqual([]);
  });

  it('快编被后端并发校验拒绝时仅恢复标记，保留文本并可重试', async () => {
    let reject = true;
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1)],
      onPut: () => { if (reject) throw new Error(LIMIT_MESSAGE); },
    });
    await wrapper.find('.wp-label').trigger('dblclick');
    await flushPromises();
    const dialog = new DOMWrapper(document.body).findAll('.el-dialog')
      .find((item) => item.find('.el-dialog__title').text() === '快速编辑字段');
    const labelInput = dialog.findAll('.el-form-item').find((item) => item.text().includes('字段标签')).find('input');
    await labelInput.setValue('保留快编名称');
    const checkbox = dialog.find('.el-checkbox input');
    await checkbox.setValue(true);
    await flushPromises();
    await dialog.findAll('button').find((button) => button.text() === '确定').trigger('click');
    await flushPromises();

    expect(mocks.puts).toHaveLength(1);
    expect(checkbox.element.checked).toBe(false);
    expect(labelInput.element.value).toBe('保留快编名称');
    expect(ElMessage.success).not.toHaveBeenCalled();
    reject = false;
    await dialog.findAll('button').find((button) => button.text() === '确定').trigger('click');
    await flushPromises();
    expect(mocks.puts).toHaveLength(2);
    expect(mocks.puts[1][1].instance.upsert.label_override).toBe('保留快编名称');
    expect(mocks.puts[1][1].instance.upsert.inline_mark).toBe(0);
    expect(ElMessage.success).toHaveBeenCalledWith('已保存');
  });

  it('复制遗留横向标签会被归一为分隔行时拒绝整次复制', async () => {
    const label = makeField(102, '标签乙', 2, { inlineMark: 1 });
    label.field_definition.field_type = '标签';
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1, { inlineMark: 1 }), label, makeField(103, '丙', 3, { inlineMark: 1 })],
    });
    await wrapper.findAll('[data-test="designer-copy-field"]')[1].trigger('click');
    await flushPromises();

    expect(renderedFieldLabels(wrapper)).toEqual(['甲', '标签乙', '丙']);
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(mocks.posts).toEqual([]);
  });

  it('持久化字段改成标签会拆块时立即拒绝，并保留未保存标签', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [
        makeField(101, '甲', 1, { inlineMark: 1 }),
        makeField(102, '乙', 2, { inlineMark: 1 }),
        makeField(103, '丙', 3, { inlineMark: 1 }),
      ],
    });
    await wrapper.findAll('.fd-canvas-list .ff-item')[1].trigger('click');
    await flushPromises();
    const editor = wrapper.find('[data-test="designer-field-property-form"]');
    const label = editor.find('[data-test="designer-field-label-autocomplete"]');
    await label.setValue('保留未保存标签');
    const type = editor.findAllComponents({ name: 'ElSelect' }).find((select) => select.props('modelValue') === '文本');
    type.vm.$emit('update:modelValue', '标签');
    await nextTick();
    await flushPromises();

    expect(type.props('modelValue')).toBe('文本');
    expect(editor.find('[data-test="designer-field-label-autocomplete"]').element.value).toBe('保留未保存标签');
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(mocks.puts).toEqual([]);
  });

  it('属性保存被后端拒绝时恢复类型及其依赖，保留此前未保存名称', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1, { inlineMark: 1 }), makeField(102, '乙', 2, { inlineMark: 1 })],
      onPut: () => { throw new Error(LIMIT_MESSAGE); },
    });
    await wrapper.findAll('.fd-canvas-list .ff-item')[1].trigger('click');
    await flushPromises();
    const editor = wrapper.find('[data-test="designer-field-property-form"]');
    await editor.find('[data-test="designer-field-label-autocomplete"]').setValue('保存失败仍保留');
    const type = editor.findAllComponents({ name: 'ElSelect' }).find((select) => select.props('modelValue') === '文本');
    type.vm.$emit('update:modelValue', '标签');
    await flushPromises();
    expect(type.props('modelValue')).toBe('标签');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await flushPromises();

    expect(mocks.puts).toHaveLength(1);
    expect(type.props('modelValue')).toBe('文本');
    expect(editor.find('[data-test="designer-field-label-autocomplete"]').element.value).toBe('保存失败仍保留');
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
  });

  it('复制草稿改成标签会拆块时立即拒绝，并保留其余草稿内容', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [
        makeField(101, '甲', 1, { inlineMark: 1 }),
        makeField(102, '乙', 2, { inlineMark: 1 }),
        makeField(103, '丙', 3),
      ],
    });
    await wrapper.findAll('[data-test="designer-copy-field"]')[0].trigger('click');
    await flushPromises();
    const editor = wrapper.find('[data-test="designer-field-property-form"]');
    await editor.find('[data-test="designer-field-label-autocomplete"]').setValue('保留复制草稿标签');
    const type = editor.findAllComponents({ name: 'ElSelect' }).find((select) => select.props('modelValue') === '文本');
    type.vm.$emit('update:modelValue', '标签');
    await nextTick();
    await flushPromises();

    expect(type.props('modelValue')).toBe('文本');
    expect(editor.find('[data-test="designer-field-label-autocomplete"]').element.value).toBe('保留复制草稿标签');
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(mocks.posts).toEqual([]);
  });

  it('批量删除撤销走单次 restore-batch：失败时具体原因且不逐行重建', async () => {
    const restoreBatches = [];
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [
        makeField(101, '甲', 1),
        makeField(102, '乙', 2),
        makeField(103, '丙', 3),
      ],
      onRestoreBatch: (body) => {
        restoreBatches.push(body);
        return Promise.reject(new Error(LIMIT_MESSAGE));
      },
    });

    const checkboxes = wrapper.findAll('.fd-canvas-list .ff-item .el-checkbox input');
    await checkboxes[1].setValue(true);
    await checkboxes[2].setValue(true);
    await nextTick();
    await wrapper.find('[data-test="designer-batch-delete"]').trigger('click');
    await flushPromises();
    await nextTick();

    const batchDeletePosts = mocks.posts.filter(([url]) => url === `/api/forms/${FORM_ID}/fields/batch-delete`);
    expect(batchDeletePosts, '批量删除本身应成功').toHaveLength(1);

    await wrapper.findAll('.fd-canvas-list .ff-item')[0].trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="designer-field-label-autocomplete"]').setValue('撤销失败也保留此输入');
    const fieldReadsBeforeUndo = api.cachedGet.mock.calls.filter(([url]) => url === `/api/forms/${FORM_ID}/fields`).length;
    ElMessage.error.mockClear();
    await wrapper.find('[data-test="designer-undo"]').trigger('click');
    await flushPromises();
    await nextTick();

    expect(restoreBatches, '撤销应恰好发出一次原子恢复请求').toHaveLength(1);
    expect(restoreBatches[0].items, '整批快照应在同一请求内').toHaveLength(2);
    expect(restoreBatches[0].items.map((item) => item.form_field?.field_definition_id)).toEqual([202, 203]);
    const perRowCreates = mocks.posts.filter(([url]) => url === `/api/forms/${FORM_ID}/fields`);
    expect(perRowCreates, '失败撤销不得逐行重建').toEqual([]);
    // runHistory 统一包装「撤回失败：<具体原因>」，业务原因必须透传
    expect(
      ElMessage.error.mock.calls.some(([message]) => String(message).includes(LIMIT_MESSAGE)),
      '失败撤销应提示具体的横向表格限制原因',
    ).toBe(true);
    const undoButton = wrapper.find('[data-test="designer-undo"]');
    expect(undoButton.attributes('disabled'), '失败的撤销应保留栈以便重试').toBeUndefined();
    expect(api.cachedGet.mock.calls.filter(([url]) => url === `/api/forms/${FORM_ID}/fields`)).toHaveLength(fieldReadsBeforeUndo);
    expect(wrapper.find('[data-test="designer-field-label-autocomplete"]').element.value).toBe('撤销失败也保留此输入');
    expect(renderedFieldLabels(wrapper)).toEqual(['甲']);
  });

  it('其他字段切换标记也要考虑尚未保存的类型预览，不能在可见布局中拆出第二块', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1, { inlineMark: 1 }), makeField(102, '乙', 2, { inlineMark: 1 }), makeField(103, '丙', 3)],
    });
    await wrapper.findAll('.fd-canvas-list .ff-item')[1].trigger('click');
    await flushPromises();
    const editor = wrapper.find('[data-test="designer-field-property-form"]');
    await editor.find('[data-test="designer-field-label-autocomplete"]').setValue('保留尚未保存类型的标签');
    const type = editor.findAllComponents({ name: 'ElSelect' }).find((select) => select.props('modelValue') === '文本');
    type.vm.$emit('update:modelValue', '标签');
    await flushPromises();
    await inlineToggleByLabel(wrapper, '丙').trigger('click');
    await flushPromises();

    expect(mocks.puts).toEqual([]);
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(editor.find('textarea').element.value).toBe('保留尚未保存类型的标签');
    expect(wrapper.find('.designer-preview-pane').findAll('table.inline-table')).toHaveLength(1);
  });

  it('批量恢复复用旧ID且顺序不同，重做仍删除正确的全部实例', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1), makeField(103, '乙', 2), makeField(102, '丙', 3)],
      restoreIds: [102, 103, 102, 103],
    });
    const checkboxes = wrapper.findAll('.fd-canvas-list .ff-item .el-checkbox input');
    await checkboxes[1].setValue(true);
    await checkboxes[2].setValue(true);
    await wrapper.find('[data-test="designer-batch-delete"]').trigger('click');
    await flushPromises();
    for (let attempt = 0; attempt < 2; attempt++) {
      await wrapper.find('[data-test="designer-undo"]').trigger('click');
      await flushPromises();
      expect(renderedFieldLabels(wrapper)).toEqual(['甲', '乙', '丙']);
      await wrapper.find('[data-test="designer-redo"]').trigger('click');
      await flushPromises();
      const deletes = mocks.posts.filter(([url]) => url.endsWith('/fields/batch-delete'));
      expect(deletes.at(-1)[1].ids).toEqual([102, 103]);
      expect(renderedFieldLabels(wrapper)).toEqual(['甲']);
    }
  });

  it('共享遗留标签的OID不符合新建校验时，撤销不发送无须重建的非法快照', async () => {
    const label = makeField(102, '遗留标签', 2);
    label.field_definition.field_type = '标签';
    label.field_definition.variable_name = 'IMPORTED?LABEL';
    const { wrapper, mocks } = await mountDesignerAndSelectForm({ fields: [makeField(101, '甲', 1), label] });
    await wrapper.findAll('.fd-canvas-list .ff-item .el-checkbox input')[1].setValue(true);
    await wrapper.find('[data-test="designer-batch-delete"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="designer-undo"]').trigger('click');
    await flushPromises();
    const request = mocks.posts.find(([url]) => url.endsWith('/fields/restore-batch'))[1];
    expect(request.items[0].field_definition).toBeNull();
    expect(request.items[0].form_field.field_definition_id).toBe(202);
    expect(renderedFieldLabels(wrapper)).toEqual(['甲', '遗留标签']);
  });

  it('横向字段类型切为标签再切回文本，不会悄悄关闭原标记', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1, { inlineMark: 1 }), makeField(102, '乙', 2, { inlineMark: 1 })],
    });
    await wrapper.findAll('.fd-canvas-list .ff-item')[1].trigger('click');
    await flushPromises();
    const editor = wrapper.find('[data-test="designer-field-property-form"]');
    const type = editor.findAllComponents({ name: 'ElSelect' }).find((select) => select.props('modelValue') === '文本');
    type.vm.$emit('update:modelValue', '标签');
    await flushPromises();
    type.vm.$emit('update:modelValue', '文本');
    await flushPromises();
    await editor.find('[aria-label="选择底纹颜色：蓝色"]').trigger('click');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await flushPromises();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][1].instance.upsert.inline_mark).toBe(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it.each([false, true])('非法复制在提示保存或丢弃之前拒绝，保留原编辑状态（已有草稿=%s）', async (hasDraft) => {
    const label = makeField(102, '遗留横向标签', 2, { inlineMark: 1 });
    label.field_definition.field_type = '标签';
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1, { inlineMark: 1 }), label, makeField(103, '丙', 3, { inlineMark: 1 })],
    });
    if (hasDraft) await wrapper.findAll('[data-test="designer-copy-field"]')[0].trigger('click');
    else await wrapper.findAll('.fd-canvas-list .ff-item')[0].trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="designer-field-label-autocomplete"]').setValue('保留原有未保存输入');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.findAll('[data-test="designer-copy-field"]').find((button) => button.attributes('aria-label') === '复制 遗留横向标签').trigger('click');
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(wrapper.find('[data-test="designer-field-label-autocomplete"]').element.value).toBe('保留原有未保存输入');
    expect(renderedFieldLabels(wrapper)).toHaveLength(hasDraft ? 4 : 3);
    expect(mocks.posts).toEqual([]);
  });

  it('批量删除成功撤销后，重做和再次撤销始终使用整批新ID', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm({
      fields: [makeField(101, '甲', 1), makeField(102, '乙', 2), makeField(103, '丙', 3)],
    });
    const checkboxes = wrapper.findAll('.fd-canvas-list .ff-item .el-checkbox input');
    await checkboxes[1].setValue(true);
    await checkboxes[2].setValue(true);
    await wrapper.find('[data-test="designer-batch-delete"]').trigger('click');
    await flushPromises();
    expect(renderedFieldLabels(wrapper)).toEqual(['甲']);

    for (const ids of [[1000, 1001], [1002, 1003]]) {
      await wrapper.find('[data-test="designer-undo"]').trigger('click');
      await flushPromises();
      expect(renderedFieldLabels(wrapper)).toEqual(['甲', '乙', '丙']);
      await wrapper.find('[data-test="designer-redo"]').trigger('click');
      await flushPromises();
      expect(renderedFieldLabels(wrapper)).toEqual(['甲']);
      const deletes = mocks.posts.filter(([url]) => url.endsWith('/fields/batch-delete'));
      expect(deletes.at(-1)[1].ids).toEqual(ids);
    }
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});
