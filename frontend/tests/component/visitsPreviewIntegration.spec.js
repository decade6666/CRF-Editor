// 【集成回归 · F1 验收】design.md §3.1 / §3.2（任务 10-08-visits-preview-split）
//
// 全仓第一条真实挂载 VisitsTab 的 vitest 用例：走完整用户路径
// 「访视流程 → 列表(single) → 点选访视行 → 点「预览」」，钉住 F1 缺陷
// （预览数据来源不是权威 FormResponse，而是只有 {id,name,sequence} 的矩阵行对象）。
// F1 根因：openFormPreview(form) 用 visitForms 行对象播种 formPreviewForm，该对象来自
// visit-form-matrix 接口（backend/src/routers/visits.py:249-253 只返回 id/name），于是
// design_notes / paper_orientation / domain / annotation_positions 四项全部丢失。
//
// RED→GREEN 见证：2026-10-12 在 main @ 0d111a1（拆分前）四条断言全部失败，原始输出见
// research/f1-red-evidence-2026-10-12.txt；拆分为 VisitFormPreviewDialog.vue 后本文件必须转绿，
// 且此后不得删除（design.md 修订 A1）——它是该缺陷在生产中真实发生过的唯一全过程守卫。
//
// 用法：npx vitest run tests/component/visitsPreviewIntegration.spec.js
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import VisitsTab from '../../src/components/VisitsTab.vue';
import { api } from '../../src/composables/useApi.js';
import { ANNOTATION_KIND_FIELD, buildAnnotationStyle } from '../../src/composables/acrfAnnotationGeometry.js';

// SortableJS 是真实拖拽库，happy-dom 下没有可拖拽的布局；useSortableTable 调用
// Sortable.create(el, options)，返回实例仅需 destroy()。
vi.mock('sortablejs', () => ({
  default: {
    create: () => ({ destroy() {} }),
  },
}));

const PROJECT_ID = 1;
const FORM_ID = 7;
const VISIT_ID = 11;
const FIELD_VARIABLE_NAME = 'EDC_OID_A';
const PERSISTED_DELTA_Y = 12345;
const DESIGN_NOTES = '第一行备注\n第二行';

// 权威表单对象（backend/src/schemas/form.py:123-134 FormResponse 全字段）。
// /api/projects/1/forms 返回它；matrix 的 forms[] 只有 {id,name} —— 这正是 F1 的根因形态。
function authoritativeForm() {
  return {
    id: FORM_ID,
    project_id: PROJECT_ID,
    name: '知情同意',
    code: 'ICF',
    domain: 'DM',
    order_index: 1,
    design_notes: DESIGN_NOTES,
    annotation_positions: { [FIELD_VARIABLE_NAME]: { y: PERSISTED_DELTA_Y } },
    paper_orientation: 'landscape',
  };
}

// 字段夹具形态与 tests/component/DesignerWordPreview.spec.js 一致：包装态 field_definition + 实例列。
function makeFields() {
  return [
    {
      id: 101,
      form_id: FORM_ID,
      field_definition_id: 201,
      is_log_row: 0,
      order_index: 1,
      required: 0,
      label_override: null,
      help_text: null,
      default_value: null,
      inline_mark: 0,
      bg_color: null,
      text_color: null,
      label_bold: null,
      label_font_size: null,
      field_definition: {
        id: 201,
        project_id: PROJECT_ID,
        variable_name: FIELD_VARIABLE_NAME,
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
      },
    },
    {
      id: 102,
      form_id: FORM_ID,
      field_definition_id: 202,
      is_log_row: 0,
      order_index: 2,
      required: 0,
      label_override: null,
      help_text: null,
      default_value: null,
      inline_mark: 0,
      bg_color: null,
      text_color: null,
      label_bold: null,
      label_font_size: null,
      field_definition: {
        id: 202,
        project_id: PROJECT_ID,
        variable_name: 'LABEL_ROW',
        label: '以下为标签行',
        field_type: '标签',
        checkbox_label: null,
        integer_digits: null,
        decimal_digits: null,
        date_format: null,
        codelist_id: null,
        unit_id: null,
        is_multi_record: 0,
        table_type: '固定行',
        order_index: 2,
        codelist: null,
        unit: null,
      },
    },
  ];
}

// 按 URL 分派（不依赖调用次序）：矩阵行对象故意只带 {id,name,sequence}，与真实接口逐字节同形。
function stageApiMocks() {
  const calls = [];
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    calls.push(url);
    if (url === `/api/projects/${PROJECT_ID}/visits`) {
      return Promise.resolve([{ id: VISIT_ID, name: '访视一', sequence: 1 }]);
    }
    if (url === `/api/projects/${PROJECT_ID}/visit-form-matrix`) {
      return Promise.resolve({
        visits: [{ id: VISIT_ID, name: '访视一', sequence: 1 }],
        forms: [{ id: FORM_ID, name: '知情同意' }],
        matrix: { [VISIT_ID]: { [FORM_ID]: 1 } },
      });
    }
    if (url === `/api/projects/${PROJECT_ID}/forms`) {
      return Promise.resolve([authoritativeForm()]);
    }
    if (url === `/api/forms/${FORM_ID}/fields`) {
      return Promise.resolve(makeFields());
    }
    return Promise.reject(new Error(`F1 集成回归未预期 URL：${url}`));
  });
  return calls;
}

// 访视表单右侧面板只在 workspace="flow" 的「列表」（single）视图存在；
// 切换 el-switch 会 emit update:modelValue('single')，v-model="flowView" 随即生效。
async function switchFlowViewToListSingle(wrapper) {
  const flowSwitch = wrapper.find('.visit-flow-header .el-switch');
  expect(flowSwitch.exists(), '访视流程头部应有矩阵/列表切换 el-switch').toBe(true);
  await flowSwitch.trigger('click');
  await flushPromises();
  await nextTick();
}

async function selectFlowVisitRow(wrapper) {
  const rows = wrapper.findAll('.el-table__row');
  expect(rows.length, '访视单列表应渲染至少一行').toBeGreaterThan(0);
  await rows[0].trigger('click');
  await flushPromises();
  await nextTick();
  await nextTick();
}

async function openPreview(wrapper) {
  const previewButtons = wrapper.findAll('button[aria-label="预览"]');
  expect(previewButtons.length, '关联表单行应有「预览」按钮').toBe(1);
  await previewButtons[0].trigger('click');
  await flushPromises();
  await nextTick();
  await nextTick();
  await flushPromises();
}

async function mountAndOpenPreview() {
  const refreshKey = ref(0);
  const editMode = ref(true);
  localStorage.setItem('crf_view_mode', 'aCRF');
  const calls = stageApiMocks();
  const wrapper = mount(VisitsTab, {
    props: { projectId: PROJECT_ID, workspace: 'flow' },
    global: { provide: { refreshKey, editMode } },
  });
  await flushPromises();
  await nextTick();
  await switchFlowViewToListSingle(wrapper);
  await selectFlowVisitRow(wrapper);
  await openPreview(wrapper);
  return { wrapper, calls };
}

describe('F1 集成回归：访视预览使用 /api/projects/{id}/forms 的权威 FormResponse', () => {
  it('症状 1：设计备注 aside 出现（design_notes 来自权威表单）', async () => {
    const { wrapper } = await mountAndOpenPreview();
    expect(wrapper.find('[aria-label="设计备注"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('设计备注');
    expect(wrapper.text()).toContain('第一行备注');
    expect(wrapper.text()).toContain('第二行');
  });

  it('症状 2：paper_orientation=landscape 落到 .word-page 的 landscape class', async () => {
    const { wrapper } = await mountAndOpenPreview();
    const wordPage = wrapper.find('.word-page');
    // 注意：'landscape' 是绑定在 .word-page 自身上的动态 class（VisitsTab.vue:1012），
    // 不是任何祖父元素的 class —— 祖父上的 presence 断言无法代理本症状。
    expect(wordPage.classes('landscape'), '.word-page 应带 landscape class').toBe(true);
  });

  it('症状 3：aCRF（editMode + aCRF）下渲染表单 domain 注解', async () => {
    const { wrapper } = await mountAndOpenPreview();
    const formAnnotation = wrapper.find('.wp-acrf-annotation--form');
    expect(formAnnotation.exists(), '应渲染 form 级注解（当前因 formState.domain 缺失而不渲染）').toBe(true);
    expect(formAnnotation.text()).toContain('DM');
  });

  it('症状 4：字段注解 top 偏移等于 annotation_positions 持久化位置', async () => {
    const { wrapper } = await mountAndOpenPreview();
    const fieldAnnotation = wrapper.find('.wp-acrf-annotation--field');
    expect(fieldAnnotation.exists(), '应渲染字段 OID 注解').toBe(true);
    expect(fieldAnnotation.text()).toContain(FIELD_VARIABLE_NAME);

    // 期望值由既有几何模块导出计算（不复刻常数）：
    //   top = resolveAnnotationTopCm(kind, 持久化 delta) = (-26940 + 12345*3600) / 360000 cm
    const expectedPersisted = buildAnnotationStyle({
      text: FIELD_VARIABLE_NAME,
      kind: ANNOTATION_KIND_FIELD,
      deltaY01cm: PERSISTED_DELTA_Y,
    });
    const expectedDefault = buildAnnotationStyle({
      text: FIELD_VARIABLE_NAME,
      kind: ANNOTATION_KIND_FIELD,
      deltaY01cm: 0,
    });
    // 先证明两个期望值本身可区分（否则本症状断言无意义）。
    expect(expectedPersisted['--acrf-annotation-top']).not.toBe(expectedDefault['--acrf-annotation-top']);

    expect(fieldAnnotation.element.style.getPropertyValue('--acrf-annotation-top')).toBe(
      expectedPersisted['--acrf-annotation-top'],
    );
  });
});
