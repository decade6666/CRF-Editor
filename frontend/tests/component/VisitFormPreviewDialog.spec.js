// VisitFormPreviewDialog 挂载测试（visits-preview-split 2026-10-12，design.md §3.2）：
// 预览弹窗从 VisitsTab 拆出后，本组件是访视预览的唯一渲染点。用例分组：
//   1) 挂载即开：按精确 URL 解析权威 FormResponse + 字段，标题取自表单名，Loading 分支真实渲染；
//   2) F1 矩阵：design_notes / paper_orientation(landscape|portrait|auto) / aCRF 注解文本与持久化偏移；
//   3) 拖拽 → 220ms 防抖 PATCH（精确载荷 + 两处失效 + 响应不可变合并）与 PATCH 失败（toast + 两处失效 + 重解析）；
//   4) 关闭 → 重开读取最新位置；关闭 → 立即重开时排队 PATCH 必须先于重开取数完成；
//   5) @closed 重置：内容清空、重开重新取数；
//   6) eCRF / editMode=false 零注解；关闭路径宿主 v-model 往返恰好一次 update:modelValue(false)；
//   7) 解析失败 / 表单不存在 / 字段失败三条错误路径的既有文案。
// 约定：弹窗未启用 append-to-body，内容直接位于组件子树内，直接查 wrapper；
// api 用 vi.spyOn 真对象（不 mock 模块）；窗口级 pointermove / pointerup 与
// useAcrfAnnotationDrag 的监听挂载点一致；Vue 警告门禁（tests/component/setup.js）证明
// 每个模板标识符都能解析（含 Loading 图标与共享 DesignerAcrfAnnotation）。
//
// happy-dom 限制：Element Plus 2.13.2 的 el-dialog 走 Transition + v-show，happy-dom 下
// 不派发 after-leave，`@closed` 不会自然触发。需要闭合后重置语义的用例经 DialogHost 直接
// 派发根 ElDialog 的 `closed` 事件（等价于真实浏览器过渡结束后的产品时序）。
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import VisitFormPreviewDialog from '../../src/components/VisitFormPreviewDialog.vue';
import { api } from '../../src/composables/useApi.js';
import {
  ANNOTATION_KIND_FIELD,
  buildAnnotationStyle,
  CSS_PX_PER_01CM,
} from '../../src/composables/acrfAnnotationGeometry.js';

const PROJECT_ID = 1;
const FORM_ID = 7;
const FIELD_VARIABLE_NAME = 'EDC_OID_A';
const FORM_NAME = '知情同意';
const DESIGN_NOTES = '第一行备注\n第二行';
const FORMS_URL = `/api/projects/${PROJECT_ID}/forms`;
const FIELDS_URL = `/api/forms/${FORM_ID}/fields`;

// 权威表单对象（backend/src/schemas/form.py:123-134 FormResponse 全字段形态）。
function authoritativeForm(overrides = {}) {
  return {
    id: FORM_ID,
    project_id: PROJECT_ID,
    name: FORM_NAME,
    code: 'ICF',
    domain: 'DM',
    order_index: 1,
    design_notes: null,
    annotation_positions: null,
    paper_orientation: 'auto',
    ...overrides,
  };
}

function textDefinition(variableName) {
  return {
    id: 201,
    project_id: PROJECT_ID,
    variable_name: variableName,
    label: '知情同意签署日期',
    field_type: '文本',
    checkbox_label: null,
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    codelist_id: null,
    unit_id: null,
    is_multi_record: 0,
    table_type: '固定行',
    order_index: 1,
    codelist: null,
    unit: null,
  };
}

function formField(id, definition, extra = {}) {
  return {
    id,
    form_id: FORM_ID,
    field_definition_id: definition.id,
    is_log_row: 0,
    order_index: id,
    required: 0,
    label_override: null,
    help_text: null,
    default_value: null,
    inline_mark: 0,
    bg_color: null,
    text_color: null,
    label_bold: null,
    label_font_size: null,
    field_definition: definition,
    ...extra,
  };
}

function makeFields() {
  return [formField(101, textDefinition(FIELD_VARIABLE_NAME))];
}

// 5 列 inline 分组 > 4 → 规划器判定横版（visitPreviewLandscape.shouldUseLandscapePreview）。
function makeInlineHeavyFields() {
  return Array.from({ length: 5 }, (_unused, index) =>
    formField(200 + index, textDefinition(`INLINE_${index + 1}`), { inline_mark: 1 }),
  );
}

// 按 URL 分派（不依赖调用次序）；表单/字段响应可经 resolvedForms / resolvedFields 逐次替换。
function stageApiMocks({ forms = [authoritativeForm()], fields = makeFields() } = {}) {
  const resolvedForms = { current: forms };
  const resolvedFields = { current: fields };
  const cachedGetSpy = vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    if (url === FORMS_URL) return Promise.resolve(resolvedForms.current);
    if (url === FIELDS_URL) return Promise.resolve(resolvedFields.current);
    return Promise.reject(new Error(`未预期 URL：${url}`));
  });
  return { cachedGetSpy, resolvedForms, resolvedFields };
}

function countCalls(spy, url) {
  return spy.mock.calls.filter(([calledUrl]) => calledUrl === url).length;
}

// 逐次解析器：把每次取数的 resolve 记进队列，用例自行决定响应内容与时机（含挂起）。
function makePendingQueue() {
  const pending = [];
  return {
    next: () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
    release(index, value) {
      pending[index](value);
    },
  };
}

function mountDialog(props = {}, { editMode = true, storedViewMode = 'aCRF' } = {}) {
  if (storedViewMode) localStorage.setItem('crf_view_mode', storedViewMode);
  return mount(VisitFormPreviewDialog, {
    props: { modelValue: true, projectId: PROJECT_ID, formId: FORM_ID, ...props },
    global: { provide: { editMode: ref(editMode) } },
  });
}

// 宿主壳：真实 v-model 往返（关闭路径的 update:modelValue 回写到宿主状态）。
const DialogHost = defineComponent({
  components: { VisitFormPreviewDialog },
  setup() {
    const modelValue = ref(true);
    return { modelValue };
  },
  template: `<VisitFormPreviewDialog v-model="modelValue" :project-id="1" :form-id="7" />`,
});

function mountHost({ editMode = true, storedViewMode = 'aCRF' } = {}) {
  if (storedViewMode) localStorage.setItem('crf_view_mode', storedViewMode);
  const wrapper = mount(DialogHost, { global: { provide: { editMode: ref(editMode) } } });
  const dialog = wrapper.findComponent(VisitFormPreviewDialog);
  const finishClose = async () => {
    dialog.findComponent({ name: 'ElDialog' }).vm.$emit('closed');
    await nextTick();
  };
  return { wrapper, dialog, finishClose };
}

function expectedFieldTop(deltaY01cm) {
  return buildAnnotationStyle({
    text: FIELD_VARIABLE_NAME,
    kind: ANNOTATION_KIND_FIELD,
    deltaY01cm,
  })['--acrf-annotation-top'];
}

function fieldAnnotation(wrapper) {
  const annotation = wrapper.find('.wp-acrf-annotation--field');
  expect(annotation.exists(), '应渲染字段级 aCRF 注解').toBe(true);
  return annotation;
}

function fieldAnnotationTop(wrapper) {
  return fieldAnnotation(wrapper).element.style.getPropertyValue('--acrf-annotation-top');
}

// 与 useAcrfAnnotationDrag 的窗口级监听一致：pointerdown 在注解元素上，移动/释放派发到 window。
async function dragFieldAnnotation(wrapper, deltaPx) {
  const annotation = fieldAnnotation(wrapper);
  annotation.element.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 100, pointerId: 1 }),
  );
  await nextTick();
  window.dispatchEvent(new PointerEvent('pointermove', { clientY: 100 + deltaPx, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  await nextTick();
}

describe('VisitFormPreviewDialog 打开解析', () => {
  it('挂载即开：按精确 URL 解析表单与字段，标题取自解析出的表单名，加载分支渲染 Loading', async () => {
    const formsQueue = makePendingQueue();
    const cachedGetSpy = vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
      if (url === FORMS_URL) return formsQueue.next();
      if (url === FIELDS_URL) return Promise.resolve(makeFields());
      return Promise.reject(new Error(`未预期 URL：${url}`));
    });

    const wrapper = mountDialog();
    // 表单解析挂起：flushPromises 后加载分支停在 pending 的取数上，
    // 加载态必须真实渲染 Loading（警告门禁证明图标已解析，不再是不存在组件）。
    await flushPromises();
    expect(wrapper.text()).toContain('加载中...');
    expect(wrapper.find('.is-loading').exists()).toBe(true);

    formsQueue.release(0, [authoritativeForm()]);
    await flushPromises();

    expect(cachedGetSpy).toHaveBeenCalledWith(FORMS_URL);
    expect(cachedGetSpy).toHaveBeenCalledWith(FIELDS_URL);
    expect(wrapper.find('.wp-form-title').text()).toBe(FORM_NAME);
    expect(wrapper.find('.word-page').exists()).toBe(true);
  });
});

describe('VisitFormPreviewDialog F1 权威数据（design_notes / paper_orientation / aCRF 注解）', () => {
  it('设计备注 aside 渲染权威表单的 design_notes（换行转 <br>）', async () => {
    stageApiMocks({ forms: [authoritativeForm({ design_notes: DESIGN_NOTES })] });
    const wrapper = mountDialog();
    await flushPromises();

    const notes = wrapper.find('[aria-label="设计备注"]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain('第一行备注');
    expect(notes.text()).toContain('第二行');
    expect(notes.html()).toContain('第一行备注<br>第二行');
  });

  it('paper_orientation=landscape 落到 .word-page 的 landscape class', async () => {
    stageApiMocks({ forms: [authoritativeForm({ paper_orientation: 'landscape' })] });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('.word-page').classes('landscape')).toBe(true);
  });

  it('paper_orientation=portrait 压过 inline>4 的自动横版判定', async () => {
    stageApiMocks({
      forms: [authoritativeForm({ paper_orientation: 'portrait' })],
      fields: makeInlineHeavyFields(),
    });
    const wrapper = mountDialog();
    await flushPromises();

    // 同一字段集在 auto 下会横版（下一用例），portrait 必须压住该自动判定。
    expect(wrapper.find('.word-page').classes('landscape')).toBe(false);
  });

  it('paper_orientation=auto + inline 分组 >4 列 → 规划器判定横版', async () => {
    stageApiMocks({ fields: makeInlineHeavyFields() });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('.word-page').classes('landscape')).toBe(true);
  });

  it('paper_orientation=auto + 普通字段 → 保持竖版', async () => {
    stageApiMocks();
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('.word-page').classes('landscape')).toBe(false);
  });

  it('aCRF（editMode + aCRF）渲染表单 domain 注解与字段 OID 注解', async () => {
    stageApiMocks();
    const wrapper = mountDialog();
    await flushPromises();

    const formAnnotation = wrapper.find('.wp-acrf-annotation--form');
    expect(formAnnotation.exists()).toBe(true);
    expect(formAnnotation.text()).toContain('DM');

    const oidAnnotation = fieldAnnotation(wrapper);
    expect(oidAnnotation.text()).toContain(FIELD_VARIABLE_NAME);
  });

  it('持久化 annotation_positions 的字段偏移落到注解样式（与默认值可区分）', async () => {
    const persistedDelta = 12345;
    stageApiMocks({
      forms: [authoritativeForm({ annotation_positions: { [FIELD_VARIABLE_NAME]: { y: persistedDelta } } })],
    });
    const wrapper = mountDialog();
    await flushPromises();

    // 期望值由几何模块导出计算（不复刻常数），并先证明两个期望值本身可区分。
    expect(expectedFieldTop(persistedDelta)).not.toBe(expectedFieldTop(0));
    expect(fieldAnnotationTop(wrapper)).toBe(expectedFieldTop(persistedDelta));
  });
});

describe('VisitFormPreviewDialog 拖拽保存', () => {
  it('拖拽 → 220ms 防抖 PATCH：精确载荷、两处缓存失效、响应合并进弹窗自持表单且不改写缓存对象', async () => {
    vi.useFakeTimers();
    const fixture = authoritativeForm();
    stageApiMocks({ forms: [fixture] });
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({
      id: FORM_ID,
      annotation_positions: { [FIELD_VARIABLE_NAME]: { y: 30 } },
    });

    const wrapper = mountDialog();
    await flushPromises();
    await dragFieldAnnotation(wrapper, CSS_PX_PER_01CM * 15);

    expect(patchSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(patchSpy).toHaveBeenCalledTimes(1);
    const [url, payload, options] = patchSpy.mock.calls[0];
    expect(url).toBe(`/api/forms/${FORM_ID}`);
    expect(payload).toEqual({ annotation_positions: { [FIELD_VARIABLE_NAME]: { y: 15 } } });
    expect(options.invalidate).toEqual([FIELDS_URL, FORMS_URL]);

    // PATCH 响应（服务端回写 y=30）经 onPersisted 合并进弹窗自持 form，注解位置随之更新。
    expect(fieldAnnotationTop(wrapper)).toBe(expectedFieldTop(30));
    // 不可变：cachedGet 返回的表单对象绝不被就地改写。
    expect(fixture.annotation_positions).toBe(null);
  });

  it('拖拽保存失败：toast + 两处缓存失效 + 弹窗重解析并回到已持久化的位置', async () => {
    vi.useFakeTimers();
    const stage = stageApiMocks();
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');
    vi.spyOn(api, 'patch').mockRejectedValue(new Error('网络错误'));

    const wrapper = mountDialog();
    await flushPromises();
    await dragFieldAnnotation(wrapper, CSS_PX_PER_01CM * 12);
    // 乐观位置先落在弹窗自持 form 上（区别于已持久化的默认偏移）。
    expect(fieldAnnotationTop(wrapper)).toBe(expectedFieldTop(12));

    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('aCRF 标注位置保存失败：网络错误');
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith(FORMS_URL);
    expect(invalidateSpy).toHaveBeenCalledWith(FIELDS_URL);
    // 重解析：表单列表再次读取，注解回到服务器上的已持久化位置（fixture 无偏移 → 默认）。
    expect(countCalls(stage.cachedGetSpy, FORMS_URL)).toBe(2);
    expect(fieldAnnotationTop(wrapper)).toBe(expectedFieldTop(0));
  });
});

describe('VisitFormPreviewDialog 关闭与重开', () => {
  it('关闭 → 重开：读取最新的 annotation_positions（无陈旧状态）', async () => {
    const stage = stageApiMocks();
    const { wrapper, dialog, finishClose } = mountHost();
    await flushPromises();
    expect(fieldAnnotationTop(dialog)).toBe(expectedFieldTop(0));

    wrapper.vm.modelValue = false;
    await nextTick();
    await finishClose();

    stage.resolvedForms.current = [authoritativeForm({ annotation_positions: { [FIELD_VARIABLE_NAME]: { y: 40 } } })];
    wrapper.vm.modelValue = true;
    await flushPromises();

    expect(fieldAnnotationTop(dialog)).toBe(expectedFieldTop(40));
  });

  it('关闭 → 立即重开：排队 PATCH 先于重开取数完成，绝不读到未失效前的缓存', async () => {
    const stage = stageApiMocks();
    let releasePatch;
    const patchSpy = vi.spyOn(api, 'patch').mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePatch = () => resolve({ id: FORM_ID, annotation_positions: { [FIELD_VARIABLE_NAME]: { y: 25 } } });
        }),
    );

    const { wrapper, dialog, finishClose } = mountHost();
    await flushPromises();
    // 拖拽但不推进防抖计时器：关闭路径的重置会立即冲掉排队 PATCH。
    await dragFieldAnnotation(dialog, CSS_PX_PER_01CM * 20);
    expect(patchSpy).not.toHaveBeenCalled();

    wrapper.vm.modelValue = false;
    await nextTick();
    await finishClose();
    expect(patchSpy).toHaveBeenCalledTimes(1);

    // PATCH 未落地前重开：表单列表不得再次取数（等待 flush，而不是读未失效的缓存）。
    wrapper.vm.modelValue = true;
    await flushPromises();
    expect(countCalls(stage.cachedGetSpy, FORMS_URL)).toBe(1);

    stage.resolvedForms.current = [authoritativeForm({ annotation_positions: { [FIELD_VARIABLE_NAME]: { y: 25 } } })];
    releasePatch();
    await flushPromises();

    expect(countCalls(stage.cachedGetSpy, FORMS_URL)).toBe(2);
    expect(fieldAnnotationTop(dialog)).toBe(expectedFieldTop(25));
    // 调用序：PATCH 早于重开后的那次表单取数。
    const formsCallOrders = stage.cachedGetSpy.mock.calls
      .map((call, index) => (call[0] === FORMS_URL ? stage.cachedGetSpy.mock.invocationCallOrder[index] : null))
      .filter((value) => value != null);
    expect(formsCallOrders).toHaveLength(2);
    expect(patchSpy.mock.invocationCallOrder[0]).toBeLessThan(formsCallOrders[1]);
  });

  it('@closed 重置：关闭后预览内容清空，重开重新取数（cachedGet 计数增加）', async () => {
    const stage = stageApiMocks({ forms: [authoritativeForm({ design_notes: DESIGN_NOTES })] });
    const { wrapper, dialog, finishClose } = mountHost();
    await flushPromises();
    expect(countCalls(stage.cachedGetSpy, FORMS_URL)).toBe(1);

    wrapper.vm.modelValue = false;
    await nextTick();
    await finishClose();
    // resetPreviewState 清空 fields → 渲染「暂无字段」占位，word-page 树已不在。
    expect(dialog.find('.word-page').exists()).toBe(false);
    expect(dialog.text()).toContain('暂无字段');

    wrapper.vm.modelValue = true;
    await flushPromises();

    expect(countCalls(stage.cachedGetSpy, FORMS_URL)).toBe(2);
    expect(countCalls(stage.cachedGetSpy, FIELDS_URL)).toBe(2);
    expect(dialog.find('.word-page').exists()).toBe(true);
  });
});

describe('VisitFormPreviewDialog 视图模式与注解门禁', () => {
  it('editMode + eCRF 视图渲染零注解标记', async () => {
    stageApiMocks();
    const wrapper = mountDialog({}, { editMode: true, storedViewMode: 'eCRF' });
    await flushPromises();

    expect(wrapper.find('.wp-acrf-annotation').exists()).toBe(false);
  });

  it('editMode 关闭时渲染零注解标记', async () => {
    stageApiMocks();
    const wrapper = mountDialog({}, { editMode: false, storedViewMode: 'aCRF' });
    await flushPromises();

    expect(wrapper.find('.wp-acrf-annotation').exists()).toBe(false);
  });

  it('关闭路径恰好发出一次 update:modelValue(false)', async () => {
    stageApiMocks();
    const { wrapper, dialog } = mountHost();
    await flushPromises();

    // happy-dom 下 el-dialog 的离场过渡不派发 after-leave，update:modelValue(false) 不会自然发出；
    // 直接派发根 ElDialog 的 update:modelValue(false)，等价于真实浏览器过渡结束后的产品时序。
    dialog.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);
    await nextTick();

    // 宿主真实 v-model 往返：宿主状态回到 false，弹窗只发出一次 update:modelValue(false)。
    expect(wrapper.vm.modelValue).toBe(false);
    const emissions = dialog.emitted('update:modelValue');
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toEqual([false]);
  });
});

describe('VisitFormPreviewDialog 错误路径', () => {
  it('表单列表解析失败：错误状态 + toast 文案', async () => {
    vi.spyOn(api, 'cachedGet').mockRejectedValue(new Error('服务器错误'));
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain('加载表单信息失败：服务器错误');
    expect(ElMessage.error).toHaveBeenCalledWith('加载表单信息失败：服务器错误');
  });

  it('列表中不存在该表单：表单不存在错误状态且不弹 toast', async () => {
    stageApiMocks({ forms: [] });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain('表单不存在');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('字段解析失败：保留「加载表单字段失败：」文案与 toast', async () => {
    vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
      if (url === FORMS_URL) return Promise.resolve([authoritativeForm()]);
      return Promise.reject(new Error('字段服务异常'));
    });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain('加载表单字段失败：字段服务异常');
    expect(ElMessage.error).toHaveBeenCalledWith('加载表单字段失败：字段服务异常');
  });
});

// 项目切换（App.vue 程序化换项目时弹窗保持挂载，VisitsTab 不重挂）与卸载路径。
// 宿主壳暴露可变的 projectId，用于复现「target 里 stamped 的旧项目 id」回归（F2）。
describe('VisitFormPreviewDialog 项目切换与卸载', () => {
  const ProjectSwitchHost = defineComponent({
    components: { VisitFormPreviewDialog },
    setup() {
      const modelValue = ref(true);
      const projectId = ref(PROJECT_ID);
      return { modelValue, projectId };
    },
    template: `<VisitFormPreviewDialog v-model="modelValue" :project-id="projectId" :form-id="7" />`,
  });

  function mountProjectSwitchHost({ editMode = true, storedViewMode = 'aCRF' } = {}) {
    if (storedViewMode) localStorage.setItem('crf_view_mode', storedViewMode);
    const wrapper = mount(ProjectSwitchHost, { global: { provide: { editMode: ref(editMode) } } });
    const dialog = wrapper.findComponent(VisitFormPreviewDialog);
    return { wrapper, dialog };
  }

  // 真实 api.patch 会把 options.invalidate 前缀交给 invalidateCache；mock 保留该边界行为，
  // 让「失效的是哪个项目的 forms」成为可观察断言（否则 mock 掉的 PATCH 永远不会触发失效）。
  function stagePatchMock() {
    return vi.spyOn(api, 'patch').mockImplementation(async (url, data, options = {}) => {
      for (const prefix of options.invalidate || []) api.invalidateCache(prefix);
      return { id: FORM_ID, annotation_positions: { [FIELD_VARIABLE_NAME]: { y: 15 } } };
    });
  }

  it('项目程序化切换后拖拽保存：失效目标用新项目 id，绝不带切换前的旧 id', async () => {
    vi.useFakeTimers();
    stageApiMocks();
    const patchSpy = stagePatchMock();
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');

    const { wrapper, dialog } = mountProjectSwitchHost();
    await flushPromises();

    wrapper.vm.projectId = 99;
    await flushPromises();

    await dragFieldAnnotation(dialog, CSS_PX_PER_01CM * 15);
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy.mock.calls[0][0]).toBe(`/api/forms/${FORM_ID}`);
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/99/forms');
    expect(invalidateSpy).not.toHaveBeenCalledWith(FORMS_URL);
  });

  it('项目切换冲掉待发防抖：未到 220ms 也立即以旧表单快照发出一次 PATCH', async () => {
    vi.useFakeTimers();
    stageApiMocks();
    const patchSpy = stagePatchMock();

    const { wrapper, dialog } = mountProjectSwitchHost();
    await flushPromises();

    await dragFieldAnnotation(dialog, CSS_PX_PER_01CM * 15);
    expect(patchSpy).not.toHaveBeenCalled();

    wrapper.vm.projectId = 99;
    await flushPromises();

    // 快照自带旧表单上下文，切换时先落地排队的保存，不允许丢一次拖拽。
    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy.mock.calls[0][0]).toBe(`/api/forms/${FORM_ID}`);
  });

  it('弹窗卸载时冲掉待发防抖：未到 220ms 也立即发出 PATCH，拖拽保存不丢失', async () => {
    vi.useFakeTimers();
    stageApiMocks();
    const patchSpy = stagePatchMock();

    const { wrapper, dialog } = mountProjectSwitchHost();
    await flushPromises();

    await dragFieldAnnotation(dialog, CSS_PX_PER_01CM * 15);
    expect(patchSpy).not.toHaveBeenCalled();

    wrapper.unmount();
    await flushPromises();

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy.mock.calls[0][0]).toBe(`/api/forms/${FORM_ID}`);
  });
});
