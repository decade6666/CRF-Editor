// WordImportDialog 挂载测试：导入Word 向导从 App.vue 外移到组件 + useWordImport 后的 UI 契约。
// 覆盖：打开重置、上传 → 第 2 步、执行导入的精确载荷、第 3 步与打开设计页事件；
// AI 复核移除后：无 AI 状态轮询、无 AI 文案、遗留 ai_task_id/ai_suggestions 响应字段被忽略。
// DocxCompareDialog 只以 vi.mock 替换（其异步图片面板不属本次契约），未使用 DOMWrapper(document.body)：
// 主弹窗未启用 append-to-body，teleport 被 Element Plus 关闭，内容直接位于组件子树内。
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, effectScope, nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import WordImportDialog from '../../src/components/WordImportDialog.vue';
import { useWordImport } from '../../src/composables/useWordImport.js';
import { api, apiUrl, getAuthHeaders } from '../../src/composables/useApi.js';

const TEMP_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const STALE_AI_TASK_ID = 'task-9c1d';
const TEN_MIB = 10 * 1024 * 1024;

vi.mock('../../src/components/DocxCompareDialog.vue', async () => {
  const { h } = await import('vue');
  return {
    // defineAsyncComponent 只在 __esModule / Symbol.toStringTag === 'Module' 时解包 .default；
    // 缺了它 Vue 会把 mock 命名空间本体当组件定义，VTU 再去读 .name / .__isTeleport 就抛错。
    __esModule: true,
    default: {
      name: 'DocxCompareDialog',
      __isTeleport: false,
      __isKeepAlive: false,
      props: {
        modelValue: { type: Boolean, default: false },
        formData: { type: Object, default: null },
        tempId: { type: String, default: '' },
        projectId: { type: Number, default: 0 },
        allFormNames: { type: Array, default: () => [] },
        allFormsData: { type: Array, default: () => [] },
      },
      emits: ['update:modelValue'],
      setup() {
        return () => h('div', { 'data-test': 'compare-stub' });
      },
    },
  };
});

function makeForms() {
  return [
    { index: 0, name: '知情同意', field_count: 3, fields: [{ index: 0, field_type: '文本' }] },
    {
      index: 1,
      name: '访视日期',
      field_count: 2,
      fields: [{ index: 0, field_type: '文本' }],
    },
  ];
}

function mountDialog(props = {}) {
  const refreshKey = ref(0);
  const wrapper = mount(WordImportDialog, {
    props: { modelValue: false, projectId: 1, ...props },
    global: { provide: { refreshKey } },
  });
  return { wrapper, refreshKey };
}

async function openDialog(wrapper) {
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
}

function uploadComponent(wrapper) {
  return wrapper.findComponent({ name: 'ElUpload' });
}

async function uploadDocx(wrapper, response) {
  uploadComponent(wrapper).props('onSuccess')(response);
  await flushPromises();
}

function buttonByText(wrapper, text) {
  const button = wrapper.findAll('button').find((item) => item.text().trim() === text);
  expect(button, `应存在按钮「${text}」`).toBeTruthy();
  return button;
}

async function selectAllForms(wrapper) {
  await buttonByText(wrapper, '全选').trigger('click');
  await nextTick();
}

// 每个表单行各有一个「预览」按钮，按行文本定位目标表单（否则会点到第一行）。
async function openPreviewForForm(wrapper, formName) {
  const row = wrapper.findAll('.docx-form-checkbox').find((item) => item.text().includes(formName));
  expect(row, `应存在表单行「${formName}」`).toBeTruthy();
  const previewButton = row.findAll('button').find((item) => item.text().trim() === '预览');
  expect(previewButton, `表单「${formName}」应有预览按钮`).toBeTruthy();
  await previewButton.trigger('click');
  await flushPromises();
}

async function confirmImport(wrapper) {
  await buttonByText(wrapper, '确认导入').trigger('click');
  await flushPromises();
}

function compareStub(wrapper) {
  return wrapper.findComponent({ name: 'DocxCompareDialog' });
}

function hostComponent() {
  return defineComponent({
    components: { WordImportDialog },
    props: {
      projectId: { type: Number, default: 1 },
      initiallyVisible: { type: Boolean, default: true },
    },
    setup(props) {
      const alive = ref(true);
      const modelValue = ref(props.initiallyVisible);
      function openFromHost() {
        modelValue.value = true;
      }
      return { alive, modelValue, openFromHost };
    },
    template: `
      <div>
        <button data-test="host-opener" @click="openFromHost">打开导入Word</button>
        <WordImportDialog v-if="alive" v-model="modelValue" :project-id="projectId" />
      </div>
    `,
  });
}

// el-dialog 的离场过渡在 happy-dom 下由 rAF 驱动（无 CSS 时长 → 0ms）；此处等一拍真实计时器，
// 让过渡与 afterLeave 的 update:modelValue(false) 落地后再重开，避免把中断过渡当成产品行为。
function settleDialogTransition() {
  return new Promise((resolve) => {
    setTimeout(resolve, 60);
  });
}

// 直接用真实 useWordImport + 独立 effectScope 驱动「卸载后迟到响应」：不挂组件、不 mock 被测代码。
// AI 复核移除后 composable 没有任何轮询/定时器或卸载守卫可断言；这里 scope.stop() 只释放 visible
// watcher、模拟组件卸载（visible 保持不变），用例保证的真实行为是：卸载前后都不存在任何轮询请求。
function setupImportScope() {
  const projectId = ref(1);
  const visible = ref(true);
  const refreshKey = ref(0);
  const scope = effectScope();
  const wordImport = scope.run(() => useWordImport({ projectId, visible, refreshKey }));
  return { scope, wordImport };
}

describe('WordImportDialog', () => {
  it('打开对话框时重置到第 1 步并清空上次会话的预览与结果', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      imported_form_count: 1,
      detail: [{ form_id: 7, name: 'A', field_count: 1 }],
    });
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });
    expect(wrapper.text()).toContain('知情同意');

    await selectAllForms(wrapper);
    await confirmImport(wrapper);
    expect(wrapper.text()).toContain('导入成功，共 1 个表单');

    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    await openDialog(wrapper);

    // 重新打开回到第 1 步（上传区），无上次会话的预览行或成功文案。
    expect(wrapper.text()).toContain('将文件拖拽至此区域');
    expect(wrapper.text()).not.toContain('导入成功，共 1 个表单');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(0);
  });

  it('上传超过 10MB 的文件被 before-upload 拒绝且不进入加载态', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    const accepted = uploadComponent(wrapper).props('beforeUpload')({ size: TEN_MIB + 1 });

    expect(accepted).toBe(false);
    expect(ElMessage.error).toHaveBeenCalledWith('文件大小不能超过 10MB');
    expect(uploadComponent(wrapper).props('beforeUpload')({ size: TEN_MIB })).toBe(true);
  });

  it('上传成功后进入第 2 步并展示表单清单', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });

    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(2);
    expect(wrapper.text()).toContain('知情同意');
    expect(wrapper.text()).toContain('访视日期');
  });

  it('上传响应缺少表单或编号时提示解析失败并弹错误', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await uploadDocx(wrapper, { temp_id: TEMP_ID });

    expect(wrapper.text()).toContain('文件解析失败或响应格式不正确。');
    expect(ElMessage.error).toHaveBeenCalledWith('文件解析失败或响应格式不正确。');
    expect(uploadComponent(wrapper).exists()).toBe(true);
  });

  it.each([
    ['{"detail":"文件类型不允许"}', '文件上传失败。 错误: 文件类型不允许'],
    ['服务器开小差了', '文件上传失败。 错误: 服务器开小差了'],
  ])('上传失败回调解析后端错误并展示（%#）', async (rawMessage, expected) => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    uploadComponent(wrapper).props('onError')(new Error(rawMessage));
    await flushPromises();

    expect(wrapper.text()).toContain(expected);
    expect(ElMessage.error).toHaveBeenCalledWith(expected);
    expect(uploadComponent(wrapper).props('beforeUpload')({ size: TEN_MIB - 1 })).toBe(true);
    expect(wrapper.text()).not.toContain('文件上传失败。 错误: undefined');
  });

  it('空表单清单进入第 2 步时展示无表单占位', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await uploadDocx(wrapper, { forms: [], temp_id: TEMP_ID });

    expect(wrapper.text()).toContain('Word文档中没有发现表单');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(0);
  });

  it('上传处理中展示加载占位且取消按钮禁用', async () => {
    let resolvePost;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });
    await selectAllForms(wrapper);

    const confirmPromise = buttonByText(wrapper, '确认导入').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('加载中...');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(0);
    const cancelButton = buttonByText(wrapper, '取消');
    expect(cancelButton.isDisabled()).toBe(true);

    resolvePost({ imported_form_count: 2, detail: [] });
    await confirmPromise;
    await flushPromises();
  });

  it('上传请求使用 apiUrl 与 getAuthHeaders', async () => {
    localStorage.setItem('crf_token', 'dialog-token');
    const { wrapper } = mountDialog({ projectId: 42 });
    await openDialog(wrapper);

    const upload = uploadComponent(wrapper);

    expect(upload.props('action')).toBe(apiUrl('/api/projects/42/import-docx/preview'));
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer dialog-token' });
    expect(upload.props('headers')).toEqual({ Authorization: 'Bearer dialog-token' });
  });

  it('上传成功后不再发起任何 AI 复核状态轮询（含遗留 ai_task_id 响应）', async () => {
    vi.useFakeTimers();
    const getSpy = vi.spyOn(api, 'get');
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID, ai_task_id: STALE_AI_TASK_ID });
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(9000);

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('第 2 步界面不再出现 AI 复核文案或状态标签', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID, ai_task_id: STALE_AI_TASK_ID });

    expect(wrapper.text()).not.toContain('AI复核');
    expect(wrapper.text()).not.toContain('AI 复核');
    expect(wrapper.text()).not.toContain('AI建议');
    expect(wrapper.text()).not.toContain('AI不可用');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(2);
  });

  it('执行导入发送精确的 temp_id 与 form_indices，遗留 ai_suggestions 不产生 ai_overrides 载荷', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ imported_form_count: 2, detail: [] });
    const forms = makeForms();
    forms[1].ai_suggestions = [{ index: 0, suggested_type: '日期', reason: '日期格式' }];
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms, temp_id: TEMP_ID });

    await selectAllForms(wrapper);
    await confirmImport(wrapper);

    expect(postSpy).toHaveBeenCalledWith('/api/projects/1/import-docx/execute', {
      temp_id: TEMP_ID,
      form_indices: [0, 1],
    });
    expect(postSpy.mock.calls[0][1]).not.toHaveProperty('ai_overrides');
  });

  it('导入成功进入第 3 步、清空缓存并递增 refreshKey', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      imported_form_count: 1,
      detail: [{ form_id: 7, name: '知情同意', field_count: 3 }],
    });
    const clearSpy = vi.spyOn(api, 'clearAllCache');
    const { wrapper, refreshKey } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });

    await selectAllForms(wrapper);
    await confirmImport(wrapper);

    expect(wrapper.text()).toContain('导入成功，共 1 个表单');
    expect(clearSpy).toHaveBeenCalled();
    expect(refreshKey.value).toBe(1);
  });

  it('导入失败停留在第 2 步并展示错误信息', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('后端不可用'));
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });

    await selectAllForms(wrapper);
    await confirmImport(wrapper);

    expect(wrapper.text()).toContain('导入失败: 后端不可用');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(2);
  });

  it('第 3 步的“打开设计页”向上抛出 open-designer 表单 id', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      imported_form_count: 1,
      detail: [{ form_id: 7, name: '知情同意', field_count: 3 }],
    });
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });
    await selectAllForms(wrapper);
    await confirmImport(wrapper);

    await buttonByText(wrapper, '打开设计页').trigger('click');

    expect(wrapper.emitted('open-designer')).toEqual([[7]]);
  });

  it('预览对话框收到精确 temp-id 与当前表单数据', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });

    await openPreviewForForm(wrapper, '访视日期');

    const stub = compareStub(wrapper);
    expect(stub.props('tempId')).toBe(TEMP_ID);
    expect(stub.props('formData').index).toBe(1);
    expect(stub.props('allFormsData')).toHaveLength(2);
    expect(stub.props('projectId')).toBe(1);
  });

  it('预览打开时再次上传替换预览列表会同步比较数据（composable 级）', async () => {
    const { wordImport } = setupImportScope();
    wordImport.handleDocxUploadSuccess({ forms: makeForms(), temp_id: TEMP_ID });
    wordImport.openDocxCompare(wordImport.importedFormsPreview.value[1]);
    expect(wordImport.compareFormData.value?.name).toBe('访视日期');

    const renamed = [
      { index: 0, name: '知情同意', field_count: 3, fields: [{ index: 0, field_type: '文本' }] },
      { index: 1, name: '访视日期（已更新）', field_count: 2, fields: [{ index: 0, field_type: '日期' }] },
    ];
    wordImport.handleDocxUploadSuccess({ forms: renamed, temp_id: TEMP_ID });

    expect(wordImport.compareFormData.value?.name).toBe('访视日期（已更新）');
    expect(wordImport.importedFormsPreview.value[1].name).toBe('访视日期（已更新）');
  });

  it('上一步返回第 1 步并清空预览与选择', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });
    await selectAllForms(wrapper);
    await openPreviewForForm(wrapper, '知情同意');
    expect(compareStub(wrapper).exists()).toBe(true);

    await buttonByText(wrapper, '上一步').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('将文件拖拽至此区域');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(0);
    expect(compareStub(wrapper).exists()).toBe(false);
  });

  it('底部取消按钮向上抛出 update:modelValue=false', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    await buttonByText(wrapper, '取消').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('对话框自身发出 update:modelValue=false 时向上转发', async () => {
    const { wrapper } = mountDialog();
    await openDialog(wrapper);

    wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('宿主未提供 refreshKey 时导入仍能完成并进入第 3 步', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      imported_form_count: 1,
      detail: [{ form_id: 7, name: '知情同意', field_count: 3 }],
    });
    const wrapper = mount(WordImportDialog, {
      props: { modelValue: false, projectId: 1 },
    });

    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });
    await selectAllForms(wrapper);
    await confirmImport(wrapper);

    expect(wrapper.text()).toContain('导入成功，共 1 个表单');
  });

  it('宿主 v-model 往返：宿主按钮打开、子组件取消回写 false、再次打开回到第 1 步', async () => {
    const wrapper = mount(hostComponent(), {
      props: { initiallyVisible: false },
      global: { provide: { refreshKey: ref(0) } },
    });
    await flushPromises();
    expect(wrapper.vm.modelValue).toBe(false);

    await wrapper.find('[data-test="host-opener"]').trigger('click');
    await flushPromises();
    expect(wrapper.vm.modelValue).toBe(true);

    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(2);

    await buttonByText(wrapper, '取消').trigger('click');
    await settleDialogTransition();
    expect(wrapper.vm.modelValue).toBe(false);

    await wrapper.find('[data-test="host-opener"]').trigger('click');
    await flushPromises();
    expect(wrapper.vm.modelValue).toBe(true);
    expect(wrapper.text()).toContain('将文件拖拽至此区域');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(0);
  });

  it('初始即可见时直接渲染第 1 步上传区且不产生警告', async () => {
    const wrapper = mount(WordImportDialog, {
      props: { modelValue: true, projectId: 1 },
    });
    await flushPromises();

    expect(uploadComponent(wrapper).exists()).toBe(true);
    expect(wrapper.text()).toContain('将文件拖拽至此区域');
    expect(wrapper.findAll('.docx-form-checkbox')).toHaveLength(0);
  });

  it('卸载后到达的上传成功响应不会再排起任何轮询', async () => {
    vi.useFakeTimers();
    const getSpy = vi.spyOn(api, 'get');
    const { scope, wordImport } = setupImportScope();
    try {
      scope.stop();

      wordImport.handleDocxUploadSuccess({ forms: makeForms(), temp_id: TEMP_ID, ai_task_id: STALE_AI_TASK_ID });
      await vi.advanceTimersByTimeAsync(9000);

      expect(getSpy).not.toHaveBeenCalled();
    } finally {
      scope.stop();
    }
  });

  it('未选择表单时确认导入只给警告且不发起请求', async () => {
    const postSpy = vi.spyOn(api, 'post');
    const { wordImport } = setupImportScope();

    await wordImport.executeImportWord();

    expect(ElMessage.warning).toHaveBeenCalledWith('请选择要导入的表单。');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('选择表单但缺少编号时确认导入只给警告且不发起请求', async () => {
    const postSpy = vi.spyOn(api, 'post');
    const { wordImport } = setupImportScope();

    wordImport.handleDocxUploadSuccess({ forms: makeForms(), temp_id: TEMP_ID });
    wordImport.selectedFormsToImport.value = [0];
    wordImport.tempDocxId.value = null;

    await wordImport.executeImportWord();

    expect(ElMessage.warning).toHaveBeenCalledWith('请选择要导入的表单。');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('关闭对话框不触发额外请求', async () => {
    vi.useFakeTimers();
    const getSpy = vi.spyOn(api, 'get');
    const { wrapper } = mountDialog();
    await openDialog(wrapper);
    await uploadDocx(wrapper, { forms: makeForms(), temp_id: TEMP_ID });

    await wrapper.setProps({ modelValue: false });
    await vi.advanceTimersByTimeAsync(9000);

    expect(getSpy).not.toHaveBeenCalled();
  });
});
