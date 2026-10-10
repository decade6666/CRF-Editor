// CodelistQuickEditDialog 挂载测试：FieldsTab / FormDesignerTab 共用的字典快捷增/改弹窗。
// 验证 design.md §2.2 流程契约：缓存失效在弹窗内统一完成（codelists + field-definitions），
// 宿主通过 awaitable afterChange 承接刷新/绑定；新增成功提示仅在宿主传入 addSuccessMessage
// 时由弹窗在关闭后发出（保持 FieldsTab 原 close→toast 顺序），设计器不传则静默。
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ElMessage, ElMessageBox } from 'element-plus';
import CodelistQuickEditDialog from '../../src/components/CodelistQuickEditDialog.vue';
import { api } from '../../src/composables/useApi.js';

// el-dialog 未启用 append-to-body：内容留在组件子树内，直接通过 wrapper 查询。
// 与 DesignNotesDialog.spec 相同的打开方式：初始 modelValue=false，挂载后再 setProps 打开
// （Element Plus 的弹窗内容在 open watcher 首次触发后才渲染，挂载即开不渲染内容）。
function mountDialog(props = {}) {
  return mount(CodelistQuickEditDialog, {
    props: {
      modelValue: false,
      projectId: 1,
      mode: 'add',
      codelistId: null,
      codelists: [],
      afterChange: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
  });
}

async function openDialog(wrapper) {
  await wrapper.setProps({ modelValue: true });
  // el-table 的表头在打开后的下一个微任务才渲染完成
  await flushPromises();
}

function footerButtons(wrapper) {
  return wrapper.find('.el-dialog__footer').findAll('button');
}

function nameInput(wrapper) {
  return wrapper.findAll('.el-form-item')[0].find('input');
}

function addRow(wrapper) {
  return wrapper.find('[data-test="codelist-option-add-row"]');
}

function headerTexts(wrapper) {
  return wrapper.findAll('.el-table__header th .cell').map((cell) => cell.text());
}

async function addOptionRow(wrapper, code, decode) {
  const inputs = addRow(wrapper).findAll('input');
  if (code !== null) await inputs[0].setValue(code);
  await inputs[inputs.length - 1].setValue(decode);
  await addRow(wrapper).findAll('button')[0].trigger('click');
}

async function clickConfirm(wrapper) {
  await footerButtons(wrapper)[1].trigger('click');
  await flushPromises();
}

describe('CodelistQuickEditDialog', () => {
  it('新增成功（未传 addSuccessMessage）：失效两份缓存，afterChange resolve 后才关闭，且不发新增成功提示', async () => {
    let resolveAfterChange;
    const afterChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveAfterChange = resolve;
        }),
    );
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
    const wrapper = mountDialog({ afterChange });
    await openDialog(wrapper);

    await nameInput(wrapper).setValue('字典A');
    await addOptionRow(wrapper, 'C.1', '男');
    await clickConfirm(wrapper);

    expect(postSpy).toHaveBeenCalledWith('/api/projects/1/codelists', {
      name: '字典A',
      description: '',
      options: [{ code: 'C.1', decode: '男', order_index: 1 }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(afterChange).toHaveBeenCalledWith('add', { codelist: { id: 9, name: '字典A' } });
    // afterChange 尚未 resolve：宿主刷新完成前弹窗不得关闭
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    resolveAfterChange();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    // 设计器形态（未传文案）：弹窗不发新增成功提示
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it('新增成功（传入 addSuccessMessage）：提示在关闭之后发出，保持 close→toast 顺序', async () => {
    // onUpdate:modelValue 监听器即 VTU 侧的关闭事件 spy，用 invocationCallOrder 对比先后
    const onUpdateModelValue = vi.fn();
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
    const wrapper = mountDialog({
      addSuccessMessage: '新增成功',
      'onUpdate:modelValue': onUpdateModelValue,
    });
    await openDialog(wrapper);

    await nameInput(wrapper).setValue('字典A');
    await clickConfirm(wrapper);

    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(onUpdateModelValue).toHaveBeenCalledWith(false);
    expect(ElMessage.success).toHaveBeenCalledWith('新增成功');
    // FieldsTab 原始顺序：先关闭（update:modelValue false），后提示
    expect(onUpdateModelValue.mock.invocationCallOrder[0]).toBeLessThan(ElMessage.success.mock.invocationCallOrder[0]);
  });

  it('新增失败：仅错误提示，弹窗保持打开且保留已输入内容，不失效缓存也不回调 afterChange', async () => {
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    vi.spyOn(api, 'post').mockRejectedValue(new Error('网络错误'));
    const wrapper = mountDialog({ afterChange });
    await openDialog(wrapper);

    // FieldsTab 形态（默认 normalizeDraftBeforeSubmit=false）：失败后原样回显输入值
    await nameInput(wrapper).setValue('  字典A  ');
    await addOptionRow(wrapper, 'C.1', '男');
    await clickConfirm(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('网络错误');
    expect(afterChange).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(nameInput(wrapper).element.value).toBe('  字典A  ');
    expect(wrapper.findAll('.el-table__body input')[1].element.value).toBe('男');
  });

  it('FormDesignerTab 形态（normalizeDraftBeforeSubmit=true）：新增失败后回显裁剪/规范化值', async () => {
    const afterChange = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(api, 'post').mockRejectedValue(new Error('网络错误'));
    const wrapper = mountDialog({ afterChange, normalizeDraftBeforeSubmit: true });
    await openDialog(wrapper);

    await nameInput(wrapper).setValue('  字典A  ');
    await addOptionRow(wrapper, 'C.1', '男');
    // 行内直接改码为带空白文本，模拟表格输入未裁剪的场景
    await wrapper.findAll('.el-table__body input')[0].setValue('  C9  ');
    await clickConfirm(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('网络错误');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(nameInput(wrapper).element.value).toBe('字典A');
    expect(wrapper.findAll('.el-table__body input')[0].element.value).toBe('C9');
    expect(wrapper.findAll('.el-table__body input')[1].element.value).toBe('男');
  });

  it('编辑成功：引用确认后 snapshot 单请求保存，失效两份缓存并等待 afterChange，随后关闭并提示保存成功', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValue([{ form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' }]);
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      mode: 'edit',
      codelistId: 5,
      codelists: [{ id: 5, name: '字典A', description: '描述', options: [{ id: 11, code: 'C.1', decode: '男' }] }],
      afterChange,
    });
    await openDialog(wrapper);

    // 编辑模式打开时按 codelistId 回填
    expect(nameInput(wrapper).element.value).toBe('字典A');
    await clickConfirm(wrapper);

    expect(getSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/references');
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('修改将影响以下字段'), '影响提醒', {
      type: 'warning',
    });
    expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', {
      name: '字典A',
      description: '描述',
      options: [{ id: 11, code: 'C.1', decode: '男' }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    // AC3 回归锁：字段定义缓存也必须失效（设计器快改后左侧字段库 30 秒旧数据缺陷）
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(afterChange).toHaveBeenCalledWith('save', { codelist: { id: 5 } });
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
  });

  it('编辑失败：仍失效两份缓存并等待 afterChange 刷新，关闭后提示失败与已刷新说明', async () => {
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    vi.spyOn(api, 'get').mockResolvedValue([]);
    vi.spyOn(api, 'put').mockRejectedValue(new Error('网络错误'));
    const wrapper = mountDialog({
      mode: 'edit',
      codelistId: 5,
      codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      afterChange,
    });
    await openDialog(wrapper);

    await clickConfirm(wrapper);

    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(afterChange).toHaveBeenCalledWith('save', { codelist: { id: 5 } });
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(ElMessage.error).toHaveBeenCalledWith('保存失败：网络错误。已刷新为最新字典数据，请重新检查后再编辑。');
  });

  it('影响提醒选择取消：不写入、不失效缓存、不回调 afterChange，弹窗保持打开', async () => {
    // ElMessageBox 的取消以 reject('cancel') 表达（resolve 只发生在确认时）
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const putSpy = vi.spyOn(api, 'put');
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      mode: 'edit',
      codelistId: 5,
      codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      afterChange,
    });
    await openDialog(wrapper);
    vi.spyOn(api, 'get').mockResolvedValue([
      { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
    ]);

    await clickConfirm(wrapper);

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(afterChange).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('取消按钮：只发出关闭事件，不发请求、不失效缓存、不回调 afterChange', async () => {
    const postSpy = vi.spyOn(api, 'post');
    const putSpy = vi.spyOn(api, 'put');
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({ afterChange });
    await openDialog(wrapper);

    await footerButtons(wrapper)[0].trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(postSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(afterChange).not.toHaveBeenCalled();
  });

  it('新增请求在途时项目已切换：POST 与缓存失效仍落在原项目，不回调 afterChange，弹窗静默关闭', async () => {
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    let resolvePost;
    const postSpy = vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const wrapper = mountDialog({ afterChange });
    await openDialog(wrapper);

    await nameInput(wrapper).setValue('字典A');
    const confirming = clickConfirm(wrapper);
    await wrapper.setProps({ projectId: 2 });
    resolvePost({ id: 9, name: '字典A' });
    await confirming;

    // 写入目标固定为操作发起时的项目：失效必须落在原项目，迟到结果不落新项目上下文
    expect(postSpy).toHaveBeenCalledWith('/api/projects/1/codelists', expect.anything());
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(invalidateSpy).not.toHaveBeenCalledWith('/api/projects/2/codelists');
    expect(invalidateSpy).not.toHaveBeenCalledWith('/api/projects/2/field-definitions');
    expect(afterChange).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it('编辑保存请求在途时项目与字典目标已切换：snapshot 仍写入原目标，不回调 afterChange，弹窗静默关闭', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    vi
      .spyOn(api, 'get')
      .mockResolvedValue([{ form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' }]);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    let resolvePut;
    const putSpy = vi.spyOn(api, 'put').mockReturnValue(
      new Promise((resolve) => {
        resolvePut = resolve;
      }),
    );
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      mode: 'edit',
      codelistId: 5,
      codelists: [{ id: 5, name: '字典A', description: '', options: [{ id: 11, code: 'C.1', decode: '男' }] }],
      afterChange,
    });
    await openDialog(wrapper);

    const confirming = clickConfirm(wrapper);
    await wrapper.setProps({ projectId: 2, codelistId: 7 });
    resolvePut(null);
    await confirming;

    expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', expect.anything());
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(invalidateSpy).not.toHaveBeenCalledWith('/api/projects/2/codelists');
    expect(invalidateSpy).not.toHaveBeenCalledWith('/api/projects/2/field-definitions');
    expect(afterChange).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it('编辑保存失败且操作已过期：只报原始错误并关闭弹窗，不回调 afterChange、不提示已刷新', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    vi
      .spyOn(api, 'get')
      .mockResolvedValue([{ form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' }]);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    let rejectPut;
    const putSpy = vi.spyOn(api, 'put').mockReturnValue(
      new Promise((_, reject) => {
        rejectPut = reject;
      }),
    );
    const afterChange = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      mode: 'edit',
      codelistId: 5,
      codelists: [{ id: 5, name: '字典A', description: '', options: [{ id: 11, code: 'C.1', decode: '男' }] }],
      afterChange,
    });
    await openDialog(wrapper);

    const confirming = clickConfirm(wrapper);
    await wrapper.setProps({ projectId: 2, codelistId: 7 });
    rejectPut(new Error('网络错误'));
    await confirming;

    // PUT 目标固定为操作发起时的原项目；失败只失效原项目缓存并提示原始错误，
    // 不说「已刷新为最新字典数据」（过期路径不再刷新宿主数据）
    expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', expect.anything());
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
    expect(invalidateSpy).not.toHaveBeenCalledWith('/api/projects/2/codelists');
    expect(ElMessage.error).toHaveBeenCalledWith('网络错误');
    expect(ElMessage.error).not.toHaveBeenCalledWith(expect.stringContaining('已刷新为最新字典数据'));
    expect(afterChange).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('选项编码接受自由文本，不做 OID 字符集校验', async () => {
    const wrapper = mountDialog();
    await openDialog(wrapper);

    await addOptionRow(wrapper, 'free form code!!', '自由标签');

    const rowInputs = wrapper.findAll('.el-table__body input');
    expect(rowInputs).toHaveLength(2);
    expect(rowInputs[0].element.value).toBe('free form code!!');
    expect(rowInputs[1].element.value).toBe('自由标签');
  });

  it('FieldsTab 默认文案：标题新增选项字典、占位符编码/标签，简模式隐藏编码列', async () => {
    const wrapper = mountDialog();
    await openDialog(wrapper);
    expect(wrapper.find('.el-dialog__title').text()).toBe('新增选项字典');
    const inputs = addRow(wrapper).findAll('input');
    expect(inputs[0].attributes('placeholder')).toBe('编码');
    expect(inputs[1].attributes('placeholder')).toBe('标签');
    expect(headerTexts(wrapper)).toContain('编码');

    const briefWrapper = mountDialog({ showCodeColumn: false });
    await openDialog(briefWrapper);
    expect(headerTexts(briefWrapper)).not.toContain('编码');
    expect(addRow(briefWrapper).findAll('input')).toHaveLength(1);
  });

  it('FormDesignerTab 绑定文案：标题新增选项、占位符为空、编码列恒显', async () => {
    const wrapper = mountDialog({
      addTitle: '新增选项',
      codePlaceholder: '',
      decodePlaceholder: '',
    });
    await openDialog(wrapper);
    expect(wrapper.find('.el-dialog__title').text()).toBe('新增选项');
    const inputs = addRow(wrapper).findAll('input');
    expect(inputs[0].attributes('placeholder')).toBe('');
    expect(inputs[1].attributes('placeholder')).toBe('');
    expect(headerTexts(wrapper)).toContain('编码');
  });

  it('编辑模式引用不存在的 codelistId 时保持空表单且不抛错', async () => {
    const wrapper = mountDialog({
      mode: 'edit',
      codelistId: 404,
      codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
    });
    await openDialog(wrapper);
    expect(nameInput(wrapper).element.value).toBe('');
  });
});
