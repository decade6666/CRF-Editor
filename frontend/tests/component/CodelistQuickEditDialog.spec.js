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
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
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
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
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
        const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
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
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
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
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
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
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
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
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 9, name: '字典A' });
      const wrapper = mountDialog();
      await openDialog(wrapper);

      await fillPendingLabel(wrapper, '其他');
      await clickConfirm(wrapper);

      expect(ElMessage.warning).toHaveBeenCalledWith('请输入字典名称');
      expect(ElMessageBox.confirm).not.toHaveBeenCalled();
      expect(postSpy).not.toHaveBeenCalled();
    });
  });
});
