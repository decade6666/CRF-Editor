// CodelistQuickEditDialog 挂载测试：FieldsTab / FormDesignerTab 共用的字典快捷增/改弹窗。
// 验证 design.md §2.2 流程契约：缓存失效在弹窗内统一完成（codelists + field-definitions），
// 宿主通过 awaitable afterChange 承接刷新/绑定；新增成功提示仅在宿主传入 addSuccessMessage
// 时由弹窗在关闭后发出（保持 FieldsTab 原 close→toast 顺序），设计器不传则静默。
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
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

async function fillPendingLabel(wrapper, decode, code = null) {
  // 只填待添加行、不点「添加」：模拟用户输入标签后直接点确认的场景
  const inputs = addRow(wrapper).findAll('input');
  if (code !== null) await inputs[0].setValue(code);
  await inputs[inputs.length - 1].setValue(decode);
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
    const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
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
    // F1：afterChange 事件携带过渡证据；测试桩无响应头 → 前后标签为 null（旧服务端，无链边）。
    expect(afterChange).toHaveBeenCalledWith('add', {
      codelist: { id: 9, name: '字典A' },
      isCurrent: expect.any(Function),
      transition: { projectId: 1, beforeRevision: null, revision: null },
    });
    expect(afterChange.mock.calls[0][1].isCurrent()).toBe(true);
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
    vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
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
    vi.spyOn(api, 'postWithTransitionMetadata').mockRejectedValue(new Error('网络错误'));
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
    vi.spyOn(api, 'postWithTransitionMetadata').mockRejectedValue(new Error('网络错误'));
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
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue([
      { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
      { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
    ]);
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
      { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
    ]);

    await clickConfirm(wrapper);

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(afterChange).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  describe('影响提醒按受影响表单数判定', () => {
    it('零引用编辑：不弹影响提醒，直接 snapshot 保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue([]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);

      expect(getSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/references');
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', expect.anything());
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('仅一个表单的一条引用：不弹影响提醒，直接 snapshot 保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('同一表单的多条字段引用：合并为单表单，不弹影响提醒直接保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '随访', form_code: 'V1', field_label: '年龄', field_var: 'age' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('同一表单的重复引用行：合并计数后不弹影响提醒直接保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('同名不同编码的两个表单：视为两个表单，弹一次影响提醒后保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '随访', form_code: 'V2', field_label: '心率', field_var: 'hr' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][0]).toContain('随访(V1)');
      expect(confirmSpy.mock.calls[0][0]).toContain('随访(V2)');
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    });

    it('两个表单的重复引用行合并后：仍恰好弹一次影响提醒并保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
        { form_name: '体格检查', form_code: 'PEx', field_label: '体重', field_var: 'weight' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('影响提醒未决期间不发起写入，确认后才发 snapshot 请求', async () => {
      let resolveConfirm;
      vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
      );
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await clickConfirm(wrapper);
      expect(putSpy).not.toHaveBeenCalled();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();

      resolveConfirm('confirm');
      await flushPromises();

      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    });
  });

  it('取消按钮：只发出关闭事件，不发请求、不失效缓存、不回调 afterChange', async () => {
    const postSpy = vi.spyOn(api, 'postWithTransitionMetadata');
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
    const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const wrapper = mountDialog({ afterChange });
    await openDialog(wrapper);

    await nameInput(wrapper).setValue('字典A');
    const confirming = clickConfirm(wrapper);
    await wrapper.setProps({ projectId: 2 });
    resolvePost({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
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
    vi.spyOn(api, 'get').mockResolvedValue([
      { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
      { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
    ]);
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
    vi.spyOn(api, 'get').mockResolvedValue([
      { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
      { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
    ]);
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

  describe('未添加选项确认提醒', () => {
    const PENDING_MESSAGE = '有一项标签尚未点击“添加”，是否添加并保存？';

    it('编辑模式有未添加标签：先弹提醒（纯文本、两个按钮），接受后按 C.3 追加并随 snapshot 保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue([]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const invalidateSpy = vi.spyOn(api, 'invalidateCache');
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [
          {
            id: 5,
            name: '字典A',
            description: '',
            options: [
              { id: 11, code: 'Y', decode: '是' },
              { id: 12, code: 'N', decode: '否，复发性中风' },
            ],
          },
        ],
        afterChange,
      });
      await openDialog(wrapper);

      await fillPendingLabel(wrapper, '其他');
      await clickConfirm(wrapper);

      // 提醒先于引用查询与写入；纯文本渲染，提供 添加并保存 / 返回编辑 两个动作
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      const [message, title, options] = confirmSpy.mock.calls[0];
      expect(message).toBe(PENDING_MESSAGE);
      expect(title).toBe('未添加选项');
      expect(options).toEqual({
        type: 'warning',
        confirmButtonText: '添加并保存',
        cancelButtonText: '返回编辑',
      });
      expect(options.dangerouslyUseHTMLString).toBeFalsy();
      expect(getSpy.mock.invocationCallOrder[0]).toBeGreaterThan(confirmSpy.mock.invocationCallOrder[0]);
      expect(putSpy.mock.invocationCallOrder[0]).toBeGreaterThan(confirmSpy.mock.invocationCallOrder[0]);

      // 接受后：待添加行按 C.<n> 兜底追加到既有行之后，走既有编辑保存链路
      expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', {
        name: '字典A',
        description: '',
        options: [
          { id: 11, code: 'Y', decode: '是' },
          { id: 12, code: 'N', decode: '否，复发性中风' },
          { id: null, code: 'C.3', decode: '其他' },
        ],
      });
      expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/codelists');
      expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/1/field-definitions');
      expect(afterChange).toHaveBeenCalledWith('save', { codelist: { id: 5 } });
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('新增模式简形态（隐藏编码列，FieldsTab 文案）：接受后按 C.1 追加并随 POST 保存，关闭后提示新增成功', async () => {
      vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ showCodeColumn: false, addSuccessMessage: '新增成功' });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await fillPendingLabel(wrapper, '其他');
      await clickConfirm(wrapper);

      expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/projects/1/codelists', {
        name: '字典A',
        description: '',
        options: [{ code: 'C.1', decode: '其他', order_index: 1 }],
      });
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.success).toHaveBeenCalledWith('新增成功');
    });

    it('仅空白的标签不触发提醒：保持原有直接保存流程，不产生额外选项', async () => {
      vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog();
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await fillPendingLabel(wrapper, '   ');
      await clickConfirm(wrapper);

      expect(ElMessageBox.confirm).not.toHaveBeenCalled();
      expect(postSpy).toHaveBeenCalledWith('/api/projects/1/codelists', {
        name: '字典A',
        description: '',
        options: [],
      });
    });

    it.each(['cancel', 'close'])(
      '提醒选择 %s（返回编辑/关闭）：不写入不回调不提示，弹窗保持打开且输入原样保留',
      async (outcome) => {
        vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(outcome);
        const getSpy = vi.spyOn(api, 'get').mockResolvedValue([]);
        const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
        const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
        const invalidateSpy = vi.spyOn(api, 'invalidateCache');
        const afterChange = vi.fn().mockResolvedValue(undefined);
        const wrapper = mountDialog({ afterChange });
        await openDialog(wrapper);

        await nameInput(wrapper).setValue('字典A');
        await fillPendingLabel(wrapper, '其他');
        await clickConfirm(wrapper);

        expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
        expect(getSpy).not.toHaveBeenCalled();
        expect(postSpy).not.toHaveBeenCalled();
        expect(putSpy).not.toHaveBeenCalled();
        expect(invalidateSpy).not.toHaveBeenCalled();
        expect(afterChange).not.toHaveBeenCalled();
        expect(ElMessage.error).not.toHaveBeenCalled();
        expect(ElMessage.success).not.toHaveBeenCalled();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        // 返回编辑：待添加输入与既有行保持原样
        const inputs = addRow(wrapper).findAll('input');
        expect(inputs[inputs.length - 1].element.value).toBe('其他');
        expect(wrapper.findAll('.el-table__body tr')).toHaveLength(0);
      },
    );

    it('先点击添加再确认：不弹提醒，提交只包含已添加行一次', async () => {
      vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog();
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await addOptionRow(wrapper, 'C.1', '男');
      await clickConfirm(wrapper);

      expect(ElMessageBox.confirm).not.toHaveBeenCalled();
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/projects/1/codelists', {
        name: '字典A',
        description: '',
        options: [{ code: 'C.1', decode: '男', order_index: 1 }],
      });
    });

    it('提醒未决时重复确认只弹一次；接受后只追加一行并发起一次保存', async () => {
      let resolveConfirm;
      vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
      );
      vi.spyOn(api, 'get').mockResolvedValue([]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await fillPendingLabel(wrapper, '其他');
      await footerButtons(wrapper)[1].trigger('click');
      await footerButtons(wrapper)[1].trigger('click');
      await flushPromises();

      expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);

      resolveConfirm('confirm');
      await flushPromises();

      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', {
        name: '字典A',
        description: '',
        options: [{ id: null, code: 'C.1', decode: '其他' }],
      });
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    });

    it('提醒返回编辑后再次确认可正常保存（取消释放操作锁）', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm');
      confirmSpy.mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm');
      vi.spyOn(api, 'get').mockResolvedValue([]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [] }],
      });
      await openDialog(wrapper);

      await fillPendingLabel(wrapper, '其他');
      await clickConfirm(wrapper);
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();

      await clickConfirm(wrapper);
      expect(confirmSpy).toHaveBeenCalledTimes(2);
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', {
        name: '字典A',
        description: '',
        options: [{ id: null, code: 'C.1', decode: '其他' }],
      });
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    });

    it('提醒未决时项目切换：迟到的接受不写入新项目也不回调宿主', async () => {
      let resolveConfirm;
      vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
      );
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await fillPendingLabel(wrapper, '其他');
      await footerButtons(wrapper)[1].trigger('click');
      await wrapper.setProps({ projectId: 2 });
      resolveConfirm('confirm');
      await flushPromises();

      expect(postSpy).not.toHaveBeenCalled();
      expect(afterChange).not.toHaveBeenCalled();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('提醒未决时弹窗关闭重开：迟到的接受对新草稿失效', async () => {
      let resolveConfirm;
      vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
      );
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await fillPendingLabel(wrapper, '其他');
      await footerButtons(wrapper)[1].trigger('click');
      await wrapper.setProps({ modelValue: false });
      await flushPromises();
      await wrapper.setProps({ modelValue: true });
      await flushPromises();

      // 重开后已是一轮全新草稿；迟到的接受不得写入也不得回调宿主
      expect(nameInput(wrapper).element.value).toBe('');
      resolveConfirm('confirm');
      await flushPromises();

      expect(postSpy).not.toHaveBeenCalled();
      expect(afterChange).not.toHaveBeenCalled();
      const inputs = addRow(wrapper).findAll('input');
      expect(inputs[inputs.length - 1].element.value).toBe('');
    });

    it('编辑模式存在引用：未添加选项提醒先于影响提醒，两步依次通过后再保存', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
      vi.spyOn(api, 'get').mockResolvedValue([
        { form_name: '随访', form_code: 'V1', field_label: '性别', field_var: 'sex' },
        { form_name: '体格检查', form_code: 'PEx', field_label: '身高', field_var: 'height' },
      ]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A', description: '', options: [{ id: 11, code: 'C.1', decode: '男' }] }],
      });
      await openDialog(wrapper);

      await fillPendingLabel(wrapper, '其他');
      await clickConfirm(wrapper);

      expect(confirmSpy).toHaveBeenCalledTimes(2);
      expect(confirmSpy.mock.calls[0][1]).toBe('未添加选项');
      expect(confirmSpy.mock.calls[1][1]).toBe('影响提醒');
      expect(confirmSpy.mock.invocationCallOrder[0]).toBeLessThan(confirmSpy.mock.invocationCallOrder[1]);
      expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', {
        name: '字典A',
        description: '',
        options: [
          { id: 11, code: 'C.1', decode: '男' },
          { id: null, code: 'C.2', decode: '其他' },
        ],
      });
    });

    it('名称为空时确认：先提示名称校验，不弹未添加选项提醒也不写入', async () => {
      vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog();
      await openDialog(wrapper);

      await fillPendingLabel(wrapper, '其他');
      await clickConfirm(wrapper);

      expect(ElMessage.warning).toHaveBeenCalledWith('请输入字典名称');
      expect(ElMessageBox.confirm).not.toHaveBeenCalled();
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  // ── CL-2：已提交创建 ≠ 刷新失败 ──────────────────────────────────────────────
  // POST 成功后宿主 afterChange 的失败是「已创建但刷新失败」：原弹窗一次性终态（关闭 +
  // 唯一如实警告），绝不是创建失败，也绝不允许对同一会话再次 POST。
  describe('已提交创建与宿主刷新失败分离', () => {
    const COMMITTED_REFRESH_FAILED_MESSAGE = '字典已创建，但列表刷新失败，请刷新后核对，勿重复新增。';
    const COMMITTED_NOT_VISIBLE_MESSAGE = '字典已创建，但当前列表尚未显示新字典，请刷新后核对，勿重复新增。';

    it('POST 成功后宿主刷新失败：关闭原弹窗为终态并给出唯一警告，重复确认不再第二次 POST', async () => {
      const afterChange = vi.fn().mockRejectedValue(new Error('读取暂不可用'));
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ afterChange, addSuccessMessage: '新增成功' });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);
      // 关闭传播期间原弹窗仍归本会话所有：再次确认不得发起第二次 POST
      await clickConfirm(wrapper);

      expect(postSpy, '已提交创建绝不重试 POST').toHaveBeenCalledTimes(1);
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.warning).toHaveBeenCalledTimes(1);
      expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_REFRESH_FAILED_MESSAGE);
      expect(ElMessage.error, '刷新失败不是创建失败，不得报创建错误').not.toHaveBeenCalled();
      expect(ElMessage.success, '刷新失败不得误报新增成功').not.toHaveBeenCalled();
    });

    it('宿主刷新成功但新字典不在列表：关闭并给出唯一「尚未显示」警告，不绑定也不报错', async () => {
      const afterChange = vi.fn().mockResolvedValue({ status: 'not-visible' });
      vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);

      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.warning).toHaveBeenCalledTimes(1);
      expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_NOT_VISIBLE_MESSAGE);
      expect(ElMessage.error).not.toHaveBeenCalled();
      expect(ElMessage.success).not.toHaveBeenCalled();
    });

    it('宿主返回 cancelled（编辑器生命周期已结束）：静默关闭原弹窗，无成功/失败提示', async () => {
      const afterChange = vi.fn().mockResolvedValue({ status: 'cancelled' });
      vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ afterChange, addSuccessMessage: '新增成功' });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);

      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.warning).not.toHaveBeenCalled();
      expect(ElMessage.error).not.toHaveBeenCalled();
      expect(ElMessage.success).not.toHaveBeenCalled();
    });

    it('宿主返回 refreshed：保持既有 close→success 顺序', async () => {
      const onUpdateModelValue = vi.fn();
      const afterChange = vi.fn().mockResolvedValue({ status: 'refreshed' });
      vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ afterChange, addSuccessMessage: '新增成功', 'onUpdate:modelValue': onUpdateModelValue });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);

      expect(afterChange).toHaveBeenCalledTimes(1);
      expect(onUpdateModelValue).toHaveBeenCalledWith(false);
      expect(ElMessage.success).toHaveBeenCalledWith('新增成功');
      expect(onUpdateModelValue.mock.invocationCallOrder[0]).toBeLessThan(ElMessage.success.mock.invocationCallOrder[0]);
    });

    it('真实 POST 失败仍保留原弹窗与输入（与已提交创建的终态区分）', async () => {
      const afterChange = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(api, 'postWithTransitionMetadata').mockRejectedValue(new Error('网络错误'));
      const wrapper = mountDialog({ afterChange, addSuccessMessage: '新增成功' });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);

      expect(ElMessage.error).toHaveBeenCalledWith('网络错误');
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(nameInput(wrapper).element.value).toBe('字典A');
      expect(afterChange).not.toHaveBeenCalled();
    });

    it('刷新期间弹窗关闭重开：旧会话的迟到失败不得警告、关闭或清空新会话输入', async () => {
      let rejectOldAfterChange;
      const afterChange = vi.fn(
        () =>
          new Promise((_, reject) => {
            rejectOldAfterChange = reject;
          }),
      );
      vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);
      // 关闭并重开：新一轮全新草稿
      await wrapper.setProps({ modelValue: false });
      await flushPromises();
      await wrapper.setProps({ modelValue: true });
      await flushPromises();
      expect(nameInput(wrapper).element.value).toBe('');

      const emitsBefore = wrapper.emitted('update:modelValue')?.length ?? 0;
      rejectOldAfterChange(new Error('读取暂不可用'));
      await flushPromises();

      expect(ElMessage.warning, '旧会话迟到失败不得打扰新会话').not.toHaveBeenCalled();
      expect(ElMessage.error, '旧会话迟到失败也不得弹旧错误提示').not.toHaveBeenCalled();
      expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(emitsBefore);
      expect(nameInput(wrapper).element.value).toBe('');
    });

    it('旧会话收尾不得解锁新会话的提交忙状态', async () => {
      let rejectOldAfterChange;
      const afterChange = vi.fn()
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectOldAfterChange = reject;
            }),
        )
        .mockResolvedValueOnce(undefined);
      let resolveSecondPost;
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata')
        .mockResolvedValueOnce({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecondPost = resolve;
            }),
        );
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);
      await wrapper.setProps({ modelValue: false });
      await flushPromises();
      await wrapper.setProps({ modelValue: true });
      await flushPromises();
      await nameInput(wrapper).setValue('新会话字典');
      await clickConfirm(wrapper);
      expect(postSpy).toHaveBeenCalledTimes(2);

      // 第二次提交仍在途时，旧会话迟到收尾：不得释放新会话按钮的忙状态
      rejectOldAfterChange(new Error('读取暂不可用'));
      await flushPromises();
      const confirmButton = footerButtons(wrapper)[1];
      expect(confirmButton.attributes('disabled'), '旧收尾不得解锁新提交').toBeDefined();

      resolveSecondPost({ data: { id: 10, name: '新会话字典' }, beforeRevision: null, revision: null });
      await flushPromises();
      expect(ElMessage.warning).not.toHaveBeenCalled();
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    });

    it('刷新期间鉴权会话变化：迟到的失败读取不再产生任何反馈', async () => {
      let rejectAfterChange;
      const afterChange = vi.fn(
        () =>
          new Promise((_, reject) => {
            rejectAfterChange = reject;
          }),
      );
      vi.spyOn(api, 'postWithTransitionMetadata').mockResolvedValue({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);

      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);
      localStorage.setItem('crf_token', 'session-changed-mid-refresh');
      rejectAfterChange(new Error('读取暂不可用'));
      await flushPromises();

      expect(ElMessage.warning).not.toHaveBeenCalled();
      expect(ElMessage.error, '鉴权已离开：不再报旧操作的错误').not.toHaveBeenCalled();
    });

    it('真实 v-model 宿主：终态关闭后重开是全新会话，可正常再次提交', async () => {
      const afterChange = vi.fn()
        .mockRejectedValueOnce(new Error('读取暂不可用'))
        .mockResolvedValueOnce(undefined);
      vi.spyOn(api, 'postWithTransitionMetadata')
        .mockResolvedValueOnce({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null })
        .mockResolvedValueOnce({ data: { id: 10, name: '字典B' }, beforeRevision: null, revision: null });
      const Host = {
        components: { CodelistQuickEditDialog },
        props: { afterChange: { type: Function, required: true } },
        setup() {
          const visible = ref(false);
          return { visible };
        },
        template: '<div><CodelistQuickEditDialog v-model="visible" :project-id="1" mode="add" :codelists="[]" :after-change="afterChange" /></div>',
      };
      const wrapper = mount(Host, {
        props: { afterChange },
      });
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
      await wrapper.get('.el-form input').setValue('字典A');
      await clickConfirm(wrapper);
      expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_REFRESH_FAILED_MESSAGE);
      expect(wrapper.vm.visible, '宿主 v-model 收到终态关闭').toBe(false);

      // 重开是全新会话：输入已重置，可正常提交（不是自动重试）
      wrapper.vm.visible = true;
      await flushPromises();
      expect(wrapper.get('.el-form input').element.value).toBe('');
      await wrapper.get('.el-form input').setValue('字典B');
      await clickConfirm(wrapper);
      expect(wrapper.vm.visible).toBe(false);
      expect(ElMessage.warning, '新会话成功不得再报旧警告').toHaveBeenCalledTimes(1);
    });

    it('跨会话提交覆盖：迟到的旧 POST 成功不得接管新会话的提交状态', async () => {
      // 交付顺序（与 A 探针一致）：POST1 扣住 → 取消并重开（会话2）→ POST2 成功且其宿主
      // 读取扣住 → POST1 迟到成功 → 会话2 读取失败。迟到的旧提交不得覆盖会话2 的提交标记；
      // 会话2 的已提交读取失败必须终态关闭并只警告一次，重复确认不得发起 POST3。
      let resolvePost1;
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata')
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolvePost1 = resolve;
            }),
        )
        .mockResolvedValueOnce({ data: { id: 10, name: '字典B' }, beforeRevision: null, revision: null });
      let rejectAfterChange2;
      const afterChange = vi.fn().mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectAfterChange2 = reject;
          }),
      );
      const Host = {
        components: { CodelistQuickEditDialog },
        props: { afterChange: { type: Function, required: true } },
        setup() {
          const visible = ref(false);
          return { visible };
        },
        template: '<div><CodelistQuickEditDialog v-model="visible" :project-id="1" mode="add" :codelists="[]" :after-change="afterChange" /></div>',
      };
      const wrapper = mount(Host, { props: { afterChange } });
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
      await wrapper.get('.el-form input').setValue('字典A');
      await clickConfirm(wrapper);
      expect(postSpy).toHaveBeenCalledTimes(1);

      // 保存期间取消按钮禁用：由宿主 v-model 关闭并重开（与头部 × 一样走 @close 收尾，
      // happy-dom 不派发 headerbtn 点击）
      wrapper.vm.visible = false;
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
      await wrapper.get('.el-form input').setValue('字典B');
      await clickConfirm(wrapper);
      expect(postSpy).toHaveBeenCalledTimes(2);
      expect(afterChange, '会话2 的宿主刷新已发起且被扣住').toHaveBeenCalledTimes(1);

      // 迟到的 POST1 成功：不得关闭会话2 弹窗、不得清空输入、不得改变提交忙归属
      resolvePost1({ data: { id: 9, name: '字典A' }, beforeRevision: null, revision: null });
      await flushPromises();
      expect(wrapper.vm.visible, '迟到的旧提交不得关闭新会话弹窗').toBe(true);
      expect(wrapper.get('.el-form input').element.value).toBe('字典B');

      // 会话2 的已提交读取失败：终态关闭 + 唯一警告（不是创建失败）
      rejectAfterChange2(new Error('读取暂不可用'));
      await flushPromises();
      expect(ElMessage.warning).toHaveBeenCalledTimes(1);
      expect(ElMessage.warning).toHaveBeenCalledWith(COMMITTED_REFRESH_FAILED_MESSAGE);
      expect(ElMessage.error, '不得误报创建失败').not.toHaveBeenCalled();
      expect(wrapper.vm.visible, '已提交读取失败终态关闭').toBe(false);

      // 关闭传播期间重复确认：不得发起 POST3
      wrapper.vm.visible = true;
      await flushPromises();
      expect(wrapper.get('.el-form input').element.value).toBe('');
      await clickConfirm(wrapper);
      expect(postSpy, '终态后同一会话不得再次 POST').toHaveBeenCalledTimes(2);
    });

    it('混合模式归属：迟到的旧编辑收尾不得刷新/关闭/解锁重开后的新增会话', async () => {
      // 交付顺序（与 A 探针一致）：编辑 PUT 扣住 → 关闭并以新增模式重开（会话2）→
      // 新增 POST1 扣住 → 旧编辑 PUT 迟到成功。旧编辑的完成不得触发宿主保存刷新、
      // 不得关闭会话2 弹窗、不得发出保存成功提示、不得清除会话2 的提交忙状态
      // （否则重复确认会发起新增 POST2）；随后新增 POST1 正常完成且只此一次。
      let resolveEditPut;
      const putSpy = vi
        .spyOn(api, 'put')
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveEditPut = resolve;
            }),
        );
      vi.spyOn(api, 'get').mockResolvedValue([]);
      let resolveAddPost;
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAddPost = resolve;
          }),
      );
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const Host = {
        components: { CodelistQuickEditDialog },
        props: { afterChange: { type: Function, required: true } },
        setup() {
          const visible = ref(false);
          const mode = ref('edit');
          return { visible, mode };
        },
        template:
          '<div><CodelistQuickEditDialog v-model="visible" :project-id="1" :mode="mode" :codelist-id="12" ' +
          ':codelists="[{ id: 12, name: \'旧字典\', description: \'\', options: [] }]" :after-change="afterChange" /></div>',
      };
      const wrapper = mount(Host, { props: { afterChange } });
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
      expect(nameInput(wrapper).element.value, '编辑模式按 codelistId 回填').toBe('旧字典');
      await clickConfirm(wrapper);
      expect(putSpy, '编辑快照 PUT 已发起且被扣住').toHaveBeenCalledTimes(1);

      // 保存期间关闭并以新增模式重开（共享 visible watcher 的重开会话复位路径）
      wrapper.vm.visible = false;
      await flushPromises();
      wrapper.vm.mode = 'add';
      wrapper.vm.visible = true;
      await flushPromises();
      expect(wrapper.get('.el-form input').element.value, '重开为新增：表单重置').toBe('');
      await nameInput(wrapper).setValue('字典B');
      await clickConfirm(wrapper);
      expect(postSpy, '新增 POST1 已发起且被扣住').toHaveBeenCalledTimes(1);

      // 旧编辑 PUT 迟到成功：不得接管新会话
      resolveEditPut({});
      await flushPromises();
      expect(afterChange, '被替换的旧编辑不得触发宿主保存刷新').not.toHaveBeenCalled();
      expect(
        afterChange.mock.calls.filter(([kind]) => kind === 'save'),
        '不得出现迟到的 save 刷新',
      ).toHaveLength(0);
      expect(wrapper.vm.visible, '旧编辑收尾不得关闭新增会话弹窗').toBe(true);
      expect(ElMessage.success, '旧编辑收尾不得发出保存成功提示').not.toHaveBeenCalled();

      // 新增 POST1 正常完成：唯一一次 POST，正常终态
      resolveAddPost({ data: { id: 10, name: '字典B' }, beforeRevision: null, revision: null });
      await flushPromises();
      expect(postSpy, '重复提交忙被会话所有权保护：不得出现 POST2').toHaveBeenCalledTimes(1);
      expect(wrapper.vm.visible, '新增会话正常终态关闭').toBe(false);
    });
  });

  describe('选项行与校验补充守卫', () => {
    it('未输入标签时点击添加提示且不新增行', async () => {
      const wrapper = mountDialog();
      await openDialog(wrapper);

      await addRow(wrapper).findAll('button')[0].trigger('click');
      await flushPromises();

      expect(ElMessage.warning).toHaveBeenCalledWith('请输入标签');
      expect(wrapper.findAll('.el-table__body input')).toHaveLength(0);
    });

    it('编码留空时按 C.<n+1> 兜底生成', async () => {
      const wrapper = mountDialog();
      await openDialog(wrapper);
      const inputs = addRow(wrapper).findAll('input');

      await inputs[0].setValue(' ');
      await inputs[inputs.length - 1].setValue('甲');
      await addRow(wrapper).findAll('button')[0].trigger('click');
      await flushPromises();

      const rowInputs = wrapper.findAll('.el-table__body input');
      expect(rowInputs).toHaveLength(2);
      expect(rowInputs[0].element.value).toBe('C.1');
      // 下一行预填推进为 C.2
      expect(addRow(wrapper).findAll('input')[0].element.value).toBe('C.2');
    });

    it('选项行删除经确认后移除该行', async () => {
      const wrapper = mountDialog();
      await openDialog(wrapper);
      vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
      const inputs = addRow(wrapper).findAll('input');
      await inputs[inputs.length - 1].setValue('甲');
      await addRow(wrapper).findAll('button')[0].trigger('click');
      const inputs2 = addRow(wrapper).findAll('input');
      await inputs2[inputs2.length - 1].setValue('乙');
      await addRow(wrapper).findAll('button')[0].trigger('click');
      await flushPromises();
      expect(wrapper.findAll('.el-table__body input')).toHaveLength(4);

      await wrapper.findAll('.el-table__body')[0].findAll('button')[0].trigger('click');
      await flushPromises();

      expect(wrapper.findAll('.el-table__body input')).toHaveLength(2);
      expect(ElMessage.error).not.toHaveBeenCalled();
    });

    it('选项行删除确认失败（非取消）时提示错误且保留行', async () => {
      const wrapper = mountDialog();
      await openDialog(wrapper);
      vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('确认组件异常'));
      const inputs = addRow(wrapper).findAll('input');
      await inputs[inputs.length - 1].setValue('甲');
      await addRow(wrapper).findAll('button')[0].trigger('click');
      await flushPromises();

      await wrapper.findAll('.el-table__body')[0].findAll('button')[0].trigger('click');
      await flushPromises();

      expect(ElMessage.error).toHaveBeenCalledWith('确认组件异常');
      expect(wrapper.findAll('.el-table__body input')).toHaveLength(2);
    });

    it('存在不完整选项行时确认先提示行号且不提交', async () => {
      const wrapper = mountDialog();
      const afterChange = wrapper.props('afterChange');
      await openDialog(wrapper);
      const inputs = addRow(wrapper).findAll('input');
      await inputs[inputs.length - 1].setValue('甲');
      await addRow(wrapper).findAll('button')[0].trigger('click');
      await flushPromises();
      // 清空第 1 行的标签后确认
      await wrapper.findAll('.el-table__body input')[1].setValue('');
      await nameInput(wrapper).setValue('字典A');

      await clickConfirm(wrapper);

      expect(ElMessage.warning).toHaveBeenCalledWith('请完整填写第 1 行的编码和值标签');
      expect(wrapper.props('modelValue')).toBe(true);
      expect(afterChange).not.toHaveBeenCalled();
    });

    it('编辑回显容忍缺失描述与选项', async () => {
      const wrapper = mountDialog({
        mode: 'edit',
        codelistId: 5,
        codelists: [{ id: 5, name: '字典A' }],
      });
      await openDialog(wrapper);

      expect(nameInput(wrapper).element.value).toBe('字典A');
      expect(wrapper.findAll('.el-table__body input')).toHaveLength(0);

      // S3：本用例此前未模拟引用读与快照写边界，确认会发起真实请求（无测试服务时成功路径
      // 不可达，且迟到的保存失败提示会污染相邻用例）。本地补齐两个边界并断言预期成功。
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue([]);
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue({});
      const afterChange = wrapper.props('afterChange');

      await clickConfirm(wrapper);
      await flushPromises();

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/references');
      expect(putSpy, '缺失描述/选项时快照载荷与回显一致').toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledWith('/api/projects/1/codelists/5/snapshot', {
        name: '字典A',
        description: '',
        options: [],
      });
      expect(afterChange).toHaveBeenCalledWith('save', { codelist: { id: 5 } });
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
      expect(ElMessage.error).not.toHaveBeenCalled();
    });

    it('鉴权会话变化后迟到的 POST 失败静默：不弹错误也不关闭新状态', async () => {
      let rejectPost;
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPost = reject;
          }),
      );
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountDialog({ afterChange });
      await openDialog(wrapper);
      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);
      expect(postSpy).toHaveBeenCalledTimes(1);

      localStorage.setItem('crf_token', 'dialog-late-fail-auth');
      rejectPost(new Error('网络断开'));
      await flushPromises();

      expect(ElMessage.error).not.toHaveBeenCalled();
      expect(wrapper.props('modelValue')).toBe(true);
      expect(afterChange).not.toHaveBeenCalled();
    });

    it('项目切换后 POST 失败只报原始错误并关闭，不触发宿主刷新', async () => {
      let rejectPost;
      const postSpy = vi.spyOn(api, 'postWithTransitionMetadata').mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPost = reject;
          }),
      );
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountDialog({ projectId: 1, afterChange });
      await openDialog(wrapper);
      await nameInput(wrapper).setValue('字典A');
      await clickConfirm(wrapper);
      await wrapper.setProps({ projectId: 2 });

      rejectPost(new Error('跨项目失败'));
      await flushPromises();

      expect(ElMessage.error).toHaveBeenCalledWith('跨项目失败');
      expect(afterChange).not.toHaveBeenCalled();
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    });
  });

  describe('S1 同目标编辑关闭重开', () => {
    // 真实宿主使用独立固定 mode="edit" 实例：保存在途时关闭并以同目标重开，重开会话播种
    // 宿主旧行（陈旧种子）。快照 PUT 会整份替换名称/描述/标签并删除未包含的选项——陈旧
    // 种子的第二次提交会回退已提交数据；旧保存完成仍必须触发宿主刷新/广播。
    function mountFixedEditHost(afterChange) {
      const Host = {
        components: { CodelistQuickEditDialog },
        props: { afterChange: { type: Function, required: true } },
        setup() {
          const visible = ref(false);
          return { visible };
        },
        template:
          '<div><CodelistQuickEditDialog v-model="visible" :project-id="1" mode="edit" :codelist-id="12" ' +
          ':codelists="[{ id: 12, name: \'旧名称\', description: \'旧描述\', options: [{ id: 121, code: \'C.1\', decode: \'旧选项\' }] }]" ' +
          ':after-change="afterChange" /></div>',
      };
      return mount(Host, { props: { afterChange } });
    }

    async function reopenSameTarget(wrapper) {
      wrapper.vm.visible = false;
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
    }

    it('引用读在途时同目标关闭重开：重开种子不得再次提交，旧保存完成保留宿主刷新', async () => {
      let releaseRefs;
      const getSpy = vi.spyOn(api, 'get').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseRefs = resolve;
          }),
      );
      let releasePut;
      const putSpy = vi.spyOn(api, 'put').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releasePut = resolve;
          }),
      );
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountFixedEditHost(afterChange);
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
      expect(nameInput(wrapper).element.value).toBe('旧名称');
      await nameInput(wrapper).setValue('新名称');
      // S2：描述随名称一起修改；引用读在途期间重开会把描述播种回宿主旧值，
      // 快照载荷必须仍携带最初提交的描述。
      const descItem = () =>
        wrapper.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text() === '描述');
      await descItem().get('textarea').setValue('新描述');
      await clickConfirm(wrapper);
      expect(putSpy, '引用读在途时 PUT 未发起').not.toHaveBeenCalled();

      await reopenSameTarget(wrapper);
      expect(nameInput(wrapper).element.value, '重开播种宿主旧行').toBe('旧名称');
      expect(descItem().get('textarea').element.value, '重开同时播种回旧描述').toBe('旧描述');
      await clickConfirm(wrapper);
      await flushPromises();

      expect(
        getSpy.mock.calls.filter(([url]) => url.endsWith('/references')),
        '重开的陈旧种子不得再次提交（引用读不得重复发起）',
      ).toHaveLength(1);

      releaseRefs([]);
      await flushPromises();
      expect(putSpy, '原保存恰好一份快照 PUT').toHaveBeenCalledTimes(1);
      expect(
        putSpy.mock.calls[0][1].description,
        'S2：快照载荷携带最初提交的描述，而非重开播种回的旧描述',
      ).toBe('新描述');
      releasePut({});
      await flushPromises();

      expect(afterChange, '已提交编辑保留宿主刷新/广播').toHaveBeenCalledWith('save', { codelist: { id: 12 } });
      expect(wrapper.vm.visible, '陈旧种子的重开弹窗由已提交收尾关闭').toBe(false);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });

    it('PUT 在途时同目标关闭重开：陈旧整份快照不得二次提交', async () => {
      vi.spyOn(api, 'get').mockResolvedValue([]);
      let releasePut;
      const putSpy = vi.spyOn(api, 'put').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releasePut = resolve;
          }),
      );
      const afterChange = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountFixedEditHost(afterChange);
      await flushPromises();
      wrapper.vm.visible = true;
      await flushPromises();
      await nameInput(wrapper).setValue('新名称');
      const inputs = addRow(wrapper).findAll('input');
      await inputs[inputs.length - 1].setValue('新选项');
      await addRow(wrapper).findAll('button')[0].trigger('click');
      await clickConfirm(wrapper);
      expect(putSpy).toHaveBeenCalledTimes(1);
      const firstPayload = putSpy.mock.calls[0][1];
      expect(firstPayload.name, '最初提交数据一致').toBe('新名称');
      expect(firstPayload.options.map((o) => o.decode)).toEqual(['旧选项', '新选项']);

      await reopenSameTarget(wrapper);
      expect(nameInput(wrapper).element.value, '重开播种宿主旧行（新选项不在其中）').toBe('旧名称');
      await clickConfirm(wrapper);
      await flushPromises();

      expect(putSpy, '陈旧种子不得二次提交整份快照').toHaveBeenCalledTimes(1);

      releasePut({});
      await flushPromises();
      expect(afterChange).toHaveBeenCalledWith('save', { codelist: { id: 12 } });
      expect(wrapper.vm.visible).toBe(false);
      expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
    });
  });
});
