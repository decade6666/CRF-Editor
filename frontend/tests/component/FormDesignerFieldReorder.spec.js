// 【组件挂载回归 · 字段拖拽落点】任务 10-14-designer-field-drag-offset
//
// 真实挂载 FormDesignerTab，走「selectFormById → 原生 dragstart/dragover/drop → POST reorder」
// 全链路，钉住拖拽落点缺陷：行落点按字段 ID 定位“该行上方”边界，末尾落点区域提供绝对末尾边界。
// 行为级细粒度矩阵（方向/no-op/回滚/undo-redo/键盘）见 tests/designerFieldReorder.test.js；
// 本文件证明模板接线与 DOM 顺序在真实组件里同步。
//
// 用法：npm run test:component -- tests/component/FormDesignerFieldReorder.spec.js
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import { api } from '../../src/composables/useApi.js';

// SortableJS 用于左侧表单列表（useSortableTable），happy-dom 下无可拖拽布局。
vi.mock('sortablejs', () => ({
  default: {
    create: () => ({ destroy() {} }),
  },
}));

const PROJECT_ID = 1;
const FORM_ID = 7;

function makeField(id, variableName, label, orderIndex) {
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
    inline_mark: 0,
    bg_color: null,
    text_color: null,
    label_bold: null,
    label_font_size: null,
    field_definition: {
      id: 200 + orderIndex,
      project_id: PROJECT_ID,
      variable_name: variableName,
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

const FIELD_A = makeField(101, 'EDC_OID_A', '甲字段', 1);
const FIELD_B = makeField(102, 'EDC_OID_B', '乙字段', 2);
const FIELD_C = makeField(103, 'EDC_OID_C', '丙字段', 3);
const FIELD_D = makeField(104, 'EDC_OID_D', '丁字段', 4);

// 按 URL 分派；未预期的 URL 记录并返回空，排序契约断言只盯 reorder POST 与 DOM 顺序。
function stageApiMocks() {
  const posts = [];
  const gets = [];
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    gets.push(url);
    if (url === `/api/projects/${PROJECT_ID}/forms`) {
      return Promise.resolve([
        { id: FORM_ID, project_id: PROJECT_ID, name: '知情同意', code: 'ICF', order_index: 1 },
      ]);
    }
    if (url === `/api/forms/${FORM_ID}/fields`) {
      return Promise.resolve([FIELD_A, FIELD_B, FIELD_C, FIELD_D]);
    }
    return Promise.resolve([]);
  });
  vi.spyOn(api, 'post').mockImplementation((url, body) => {
    posts.push([url, body]);
    return Promise.resolve(undefined);
  });
  vi.spyOn(api, 'put').mockImplementation(() => Promise.resolve(undefined));
  vi.spyOn(api, 'del').mockImplementation(() => Promise.resolve(undefined));
  return { posts, gets };
}

function dragEvent(extra = {}) {
  return { dataTransfer: { effectAllowed: '', dropEffect: '' }, ...extra };
}

async function mountDesignerAndSelectForm() {
  const refreshKey = ref(0);
  const editMode = ref(false);
  const mocks = stageApiMocks();
  const wrapper = mount(FormDesignerTab, {
    props: { projectId: PROJECT_ID },
    global: { provide: { refreshKey, editMode } },
  });
  await flushPromises();
  await nextTick();
  await wrapper.vm.selectFormById(FORM_ID);
  await flushPromises();
  await nextTick();
  // 真实用户路径：点「设计表单」打开全屏设计器对话框
  const openButton = wrapper.findAll('button').find((button) => button.text().includes('设计表单'));
  expect(openButton, '选中表单后应出现「设计表单」入口').toBeTruthy();
  await openButton.trigger('click');
  await flushPromises();
  await nextTick();
  await flushPromises();
  return { wrapper, mocks };
}

const renderedFieldLabels = (wrapper) =>
  wrapper.findAll('.fd-canvas-list .ff-item .ff-label').map((node) => node.text().trim());

describe('FormDesignerTab 字段拖拽落点（真实挂载）', () => {
  it('向下拖动：A 放到 C 上方后 DOM 顺序为 [乙,甲,丙,丁] 且 POST 完整排列', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm();
    expect(renderedFieldLabels(wrapper)).toEqual(['甲字段', '乙字段', '丙字段', '丁字段']);

    const rows = wrapper.findAll('.fd-canvas-list .ff-item');
    await rows[0].trigger('dragstart', dragEvent());
    await rows[2].trigger('dragover', dragEvent());
    await rows[2].trigger('drop', dragEvent());
    await flushPromises();
    await nextTick();

    expect(renderedFieldLabels(wrapper)).toEqual(['乙字段', '甲字段', '丙字段', '丁字段']);
    const reorderPosts = mocks.posts.filter(([url]) => url === `/api/forms/${FORM_ID}/fields/reorder`);
    expect(reorderPosts).toEqual([[`/api/forms/${FORM_ID}/fields/reorder`, { ordered_ids: [102, 101, 103, 104] }]]);
  });

  it('末尾落点：拖入末尾区域后 A 移到绝对末尾且 POST [乙,丙,丁,甲]', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm();

    const endZone = wrapper.find('.ff-drop-end');
    expect(endZone.exists(), '字段列表末尾应有可识别的落点区域').toBe(true);

    const rows = wrapper.findAll('.fd-canvas-list .ff-item');
    await rows[0].trigger('dragstart', dragEvent());
    await endZone.trigger('dragover', dragEvent());
    expect(endZone.classes(), '悬停时末尾落点应高亮').toContain('ff-drop-end-active');
    await endZone.trigger('drop', dragEvent());
    await flushPromises();
    await nextTick();

    expect(renderedFieldLabels(wrapper)).toEqual(['乙字段', '丙字段', '丁字段', '甲字段']);
    const reorderPosts = mocks.posts.filter(([url]) => url === `/api/forms/${FORM_ID}/fields/reorder`);
    expect(reorderPosts).toEqual([[`/api/forms/${FORM_ID}/fields/reorder`, { ordered_ids: [102, 103, 104, 101] }]]);
  });

  it('相邻 no-op：A 放到紧邻下一行 B 上方零请求且顺序不变', async () => {
    const { wrapper, mocks } = await mountDesignerAndSelectForm();

    const rows = wrapper.findAll('.fd-canvas-list .ff-item');
    await rows[0].trigger('dragstart', dragEvent());
    await rows[1].trigger('drop', dragEvent());
    await flushPromises();
    await nextTick();

    expect(renderedFieldLabels(wrapper)).toEqual(['甲字段', '乙字段', '丙字段', '丁字段']);
    const reorderPosts = mocks.posts.filter(([url]) => url === `/api/forms/${FORM_ID}/fields/reorder`);
    expect(reorderPosts, '相邻 no-op 不应发起排序请求').toEqual([]);
  });
});
