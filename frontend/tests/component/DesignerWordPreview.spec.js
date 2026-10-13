// DesignerWordPreview 挂载测试（designer-split Step 2，设计 §3.3 / §5.2）：
// 两套 word-page 预览模板合并为单一组件后，本组件是预览分支的唯一渲染点。
// 覆盖每个模板分支（无表单 / 无字段 / 标题 / normal 常规+多行标签+log 行+标签 / inline /
// unified 常规+整行+inline 块），默认在 showAcrfAnnotations: true 下渲染，
// 使 8 个注释调用点全部走一遍并校验接线。断言重点：
//   - getResizer / normalFillChars 收到正确的 scope，行回调保持两参；
//   - 双击快编传的是被点击那一列的字段实参（不只调用次数）；
//   - 行/列拖拽回调收到正确的 row-key / boundary index 与同一原生事件；
//   - snap-guide 分支在三种分组上分别随 snapGuideX 出现/消失；
//   - 字段注释的目标 / 事件 / reset 回调值精确。
// Vue 警告门禁（tests/component/setup.js）证明每个模板标识符都能解析。
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignerWordPreview from '../../src/components/DesignerWordPreview.vue';
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
} from '../../src/composables/formFieldPresentation.js';
import { buildPreviewGroupViewModels } from '../../src/composables/formDesignerPreviewModel.js';
import {
  computeMergeSpans,
  computeLabelValueSpans,
  getScopedDefaultValue,
  createPreviewCellRenderers,
} from '../../src/composables/previewCellRender.js';
import {
  getNormalRowKey,
  getUnifiedFullRowKey,
  getInlineHeaderRowKey,
  getInlineDataRowKey,
  getUnifiedRegularRowKey,
  getUnifiedInlineHeaderRowKey,
  getUnifiedInlineDataRowKey,
} from '../../src/composables/useRowResize.js';
import { ANNOTATION_FORM_KEY } from '../../src/composables/acrfAnnotationGeometry.js';

// ─── 字段夹具（与 previewCellRender.test.js 形态一致：包装态 field_definition + 实例属性） ───
// variable_name 提供注释文本，使 aCRF 注释在所有分支下都能渲染。
const textDef = { field_type: '文本', label: '症状', variable_name: 'SYMPTOM' };
const labelDef = { field_type: '标签', label: '多行标签\n第二行', variable_name: 'LABEL1' };
const logDef = { field_type: '日志行', label: '', variable_name: 'LOG1' };
const choiceDef = {
  field_type: '单选',
  label: '性别',
  variable_name: 'SEX',
  codelist: { options: [{ text: '男' }, { text: '女' }] },
};
const numericDef = {
  field_type: '数值',
  label: '体重',
  variable_name: 'WEIGHT',
  integer_digits: 3,
  decimal_digits: 1,
};

function field(id, def, extra = {}) {
  return { id, order_index: id, field_definition: def, default_value: null, inline_mark: 0, ...extra };
}

const regularText = field(1, textDef, { default_value: '单行值' });
const labelField = field(2, labelDef);
const logRow = field(3, logDef, { is_log_row: true });
const normalChoice = field(4, choiceDef, { default_value: '男' });
const numericField = field(5, numericDef, { default_value: '12.5' });
const inlineA = field(6, textDef, { inline_mark: 1, default_value: '甲\n乙' });
const inlineB = field(7, choiceDef, { inline_mark: 1, default_value: '男' });

const NORMAL_FIELDS = [regularText, labelField, logRow, normalChoice, numericField];
const INLINE_FIELDS = [inlineA, inlineB];
// 默认夹具同时包含 normal / inline 两种分组，使 unified 的 inline_block 与独立 inline 组都渲染。
const ALL_FIELDS = [...NORMAL_FIELDS, ...INLINE_FIELDS];

// 视图模型构建器所需的纯函数集合：buildSegments 直接用真实实现（与 FormDesignerTab 同源）。
const { getInlineRows, getInlineFillChars, getInlineColumnCms } = createPreviewCellRenderers({
  toRendererField: (ff) =>
    ff?.field_definition
      ? {
          field_type: ff.field_definition.field_type,
          label: ff.field_definition.label,
          checkbox_label: ff.field_definition.checkbox_label,
          options: ff.field_definition.codelist?.options || [],
          unit_symbol: ff.field_definition.unit?.symbol,
          integer_digits: ff.field_definition.integer_digits,
          decimal_digits: ff.field_definition.decimal_digits,
          date_format: ff.field_definition.date_format,
        }
      : null,
  getCellValue: (ff) => getScopedDefaultValue(ff, false),
  getInlineValue: (ff) => getScopedDefaultValue(ff),
  renderFallback: (f, chars) => (f ? `<span class="fill-line" data-chars="${chars ?? ''}"></span>` : ''),
  resolveHostGroups: () => [],
  getPaperOrientation: () => 'auto',
});

const previewModelHelpers = {
  buildSegments: buildFormDesignerUnifiedSegments,
  getInlineRows,
  getInlineFillChars,
  getInlineColumnCms,
  computeMergeSpans,
  computeLabelValueSpans,
};

function buildGroups(fields) {
  const groups = buildFormDesignerRenderGroups(fields);
  const unified = { type: 'unified', colCount: 4, fields };
  return buildPreviewGroupViewModels([unified, ...groups], previewModelHelpers);
}

// ─── 父组件闭包桩：每个 (kind[, colCount]) 复用同一个稳定引用，便于断言回调同一实例 ───
function createHarness(harnessOptions = {}, handlerOverrides = {}) {
  const snapGuideX = harnessOptions.snapGuideX || {};
  const resizers = new Map();
  const rowResizers = new Map();
  const getResizer = vi.fn((kind, colCount) => {
    const key = `${kind}:${colCount}`;
    if (!resizers.has(key)) {
      resizers.set(key, {
        colRatios: [0.5, 0.5],
        snapGuideX: snapGuideX[kind] ?? null,
        onResizeStart: vi.fn(),
        rehydrate: vi.fn(),
      });
    }
    return resizers.get(key);
  });
  const getRowResizer = vi.fn((kind, group) => {
    const key = `${kind}:${(group?.fields || []).map((f) => f.id).join(',')}`;
    if (!rowResizers.has(key)) rowResizers.set(key, { getRowHeightStyle: () => null, onResizeStart: vi.fn() });
    return rowResizers.get(key);
  });
  const handlers = {
    getResizer,
    getRowResizer,
    renderCellHtml: vi.fn((ff) => (ff ? '<span class="rendered-cell">R</span>' : '<span class="fill-line"></span>')),
    normalFillChars: vi.fn(() => 12),
    openQuickEdit: vi.fn(),
    getFormDomainAnnotationText: vi.fn((f) => f?.domain || ''),
    getFieldOidAnnotationText: vi.fn((ff) => ff?.field_definition?.variable_name || ''),
    getFormAnnotationTarget: vi.fn((f) => (f ? { formId: f.id, projectId: 7, key: ANNOTATION_FORM_KEY } : null)),
    getFieldAnnotationTarget: vi.fn((ff) =>
      ff?.field_definition?.variable_name ? { formId: 1, projectId: 7, key: ff.field_definition.variable_name } : null,
    ),
    isAnnotationDraggable: vi.fn(() => true),
    hasAnnotationOverrideForTarget: vi.fn(() => true),
    getAnnotationStyle: vi.fn(() => ({ '--acrf-annotation-top': '0cm' })),
    onAnnotationPointerDown: vi.fn(),
    resetAnnotationPosition: vi.fn(),
    ...handlerOverrides,
  };
  return {
    handlers,
    resizerFor: (kind) => resizers.get([...resizers.keys()].find((k) => k.startsWith(`${kind}:`))),
    rowResizerFor: (kind) => rowResizers.get([...rowResizers.keys()].find((k) => k.startsWith(`${kind}:`))),
  };
}

// 夹具配置（harness / handlers）在挂载前解构剥离，绝不进入组件的 props（避免未知 DOM attrs）。
function mountPreview({ handlers: handlerOverrides, harness: harnessOptions, ...previewProps } = {}) {
  const { handlers, resizerFor, rowResizerFor } = createHarness(harnessOptions, handlerOverrides);
  const wrapper = mount(DesignerWordPreview, {
    props: {
      selectedForm: { id: 1, name: '知情同意', domain: 'LB' },
      groupsView: buildGroups(ALL_FIELDS),
      scope: 'main',
      landscapeMode: false,
      noFields: false,
      showAcrfAnnotations: true,
      showFormOid: false,
      ...handlers,
      ...previewProps,
    },
  });
  return { wrapper, handlers, resizerFor, rowResizerFor };
}

function root(wrapper) {
  return wrapper.find('div.word-page');
}

// 按分组类别定位 col-resize-host（DOM 顺序：unified → normal → inline）。
function groupHosts(wrapper) {
  const hosts = wrapper.findAll('.col-resize-host');
  return {
    unified: hosts.find((h) => h.classes().includes('unified-host')),
    normal: hosts.find((h) => !h.classes().includes('unified-host') && !h.classes().includes('inline-host')),
    inline: hosts.find((h) => h.classes().includes('inline-host')),
  };
}

function tableByClass(wrapper, tableClass) {
  return wrapper.findAll('table').find((t) => t.classes().includes(tableClass));
}

describe('DesignerWordPreview', () => {
  it('根元素固定为 word-page + form-designer-word-page + designer-scaled-word-page，landscape 由 prop 控制', async () => {
    const { wrapper } = mountPreview({ landscapeMode: false });
    expect(root(wrapper).classes()).toEqual(['word-page', 'form-designer-word-page', 'designer-scaled-word-page']);

    await wrapper.setProps({ landscapeMode: true });
    expect(root(wrapper).classes()).toContain('landscape');
  });

  it('无表单时只渲染 wp-empty 提示，不渲染标题与正文', () => {
    const { wrapper } = mountPreview({ selectedForm: null, groupsView: [] });
    expect(wrapper.find('.wp-empty').text()).toContain('请选择表单');
    expect(wrapper.find('.wp-form-title-row').exists()).toBe(false);
    expect(wrapper.find('.wp-body').exists()).toBe(false);
  });

  it('noFields=true（groupsView 为空）渲染「暂无字段」但仍保留标题行', () => {
    const { wrapper } = mountPreview({ noFields: true, groupsView: [] });
    expect(wrapper.find('.wp-form-title-row').exists()).toBe(true);
    expect(wrapper.find('.wp-form-title').text()).toBe('知情同意');
    expect(wrapper.text()).toContain('暂无字段');
    // 组件按原模板保留空的 .wp-body 容器（noFields 只切换空态提示，不删除正文容器）。
    expect(wrapper.find('.wp-body .wp-main').exists()).toBe(true);
    expect(wrapper.find('.wp-body .col-resize-host').exists()).toBe(false);
  });

  it('normal 组渲染常规字段 / 多行标签 / log 行 / 标签，单元格走 renderCellHtml 的 v-html', () => {
    const { wrapper, handlers } = mountPreview();
    const normal = groupHosts(wrapper).normal;
    expect(normal.exists()).toBe(true);
    expect(normal.find('table.unified-table').exists()).toBe(false);
    expect(normal.find('td.wp-ctrl.row-resize-anchor').exists()).toBe(true);
    expect(normal.find('.rendered-cell').exists()).toBe(true);
    expect(handlers.renderCellHtml).toHaveBeenCalled();
    // 多行标签类与 log 行回退文案
    expect(normal.find('.wp-structure-label--multiline').exists()).toBe(true);
    expect(wrapper.text()).toContain('以下为log行');
  });

  it('独立 inline 组渲染 inline-table 与表头单元格', () => {
    const { wrapper } = mountPreview();
    const inline = groupHosts(wrapper).inline;
    expect(inline.exists()).toBe(true);
    expect(inline.find('table.inline-table').exists()).toBe(true);
    expect(inline.find('td.wp-inline-header').exists()).toBe(true);
    expect(inline.find('td.wp-ctrl').exists()).toBe(true);
  });

  it('unified 组的 regular_field / full_row / inline_block 三个分支都渲染', () => {
    const unifiedGroup = { type: 'unified', colCount: 4, fields: [regularText, labelField, ...INLINE_FIELDS] };
    const groupsView = buildPreviewGroupViewModels([unifiedGroup], previewModelHelpers);
    const { wrapper } = mountPreview({ groupsView });
    const unified = groupHosts(wrapper).unified;
    expect(unified.find('table.unified-table').exists()).toBe(true);
    expect(unified.find('td.unified-label').exists()).toBe(true);
    expect(unified.find('td.unified-value').exists()).toBe(true);
    expect(unified.find('td.wp-structure-label--multiline').exists()).toBe(true);
    expect(unified.find('td.wp-inline-header').exists()).toBe(true);
    expect(unified.find('td.wp-ctrl').exists()).toBe(true);
  });

  it('getResizer / normalFillChars 收到 scope prop（main 与 designer 两种）', async () => {
    const { wrapper, handlers } = mountPreview({ scope: 'main' });
    expect(handlers.getResizer.mock.calls.length).toBeGreaterThan(0);
    expect(handlers.getResizer.mock.calls.every((call) => call[4] === 'main')).toBe(true);
    expect(handlers.normalFillChars.mock.calls.every((call) => call[2] === 'main')).toBe(true);

    handlers.getResizer.mockClear();
    handlers.normalFillChars.mockClear();
    await wrapper.setProps({ scope: 'designer' });
    expect(handlers.getResizer.mock.calls.length).toBeGreaterThan(0);
    expect(handlers.getResizer.mock.calls.every((call) => call[4] === 'designer')).toBe(true);
    expect(handlers.normalFillChars.mock.calls.length).toBeGreaterThan(0);
    expect(handlers.normalFillChars.mock.calls.every((call) => call[2] === 'designer')).toBe(true);
  });

  it('行回调 getRowResizer(kind, group) 保持两参、无 scope 参数', () => {
    const { handlers } = mountPreview();
    expect(handlers.getRowResizer).toHaveBeenCalled();
    for (const call of handlers.getRowResizer.mock.calls) {
      expect(call).toHaveLength(2);
      expect(typeof call[0]).toBe('string');
      expect(call[1]).toBeTruthy();
    }
  });

  it('双击快编传的是被点击那一列的字段实参（normal 常规列 / unified inline 第二列 / 独立 inline 第二列）', async () => {
    const { wrapper, handlers } = mountPreview();
    const hosts = groupHosts(wrapper);

    const normalCells = hosts.normal.findAll('td.wp-ctrl');
    await normalCells[0].trigger('dblclick');
    expect(handlers.openQuickEdit).toHaveBeenLastCalledWith(regularText);

    // unified inline 数据行第二个单元格 → seg.fields[1]
    const unifiedCells = hosts.unified.findAll('td.wp-ctrl');
    await unifiedCells[1].trigger('dblclick');
    expect(handlers.openQuickEdit).toHaveBeenLastCalledWith(inlineB);

    // 独立 inline 数据行第二个单元格 → gv.fields[1]
    const inlineCells = hosts.inline.findAll('td.wp-ctrl');
    await inlineCells[1].trigger('dblclick');
    expect(handlers.openQuickEdit).toHaveBeenLastCalledWith(inlineB);

    expect(handlers.openQuickEdit).toHaveBeenCalledTimes(3);
  });

  it('行/列拖拽手柄的 pointerdown 接线到稳定 resizer 引用，并传正确 row-key / boundary index 与同一事件', async () => {
    const { wrapper, resizerFor, rowResizerFor } = mountPreview();
    const hosts = groupHosts(wrapper);
    const cases = [
      {
        host: hosts.normal,
        colResizer: resizerFor('normal'),
        rowResizer: rowResizerFor('normal'),
        rowKey: getNormalRowKey(regularText),
        colIndex: 0,
      },
      {
        host: hosts.inline,
        colResizer: resizerFor('inline'),
        rowResizer: rowResizerFor('inline'),
        rowKey: getInlineHeaderRowKey(INLINE_FIELDS),
        colIndex: 0,
      },
      {
        host: hosts.unified,
        colResizer: resizerFor('unified'),
        rowResizer: rowResizerFor('unified'),
        rowKey: getUnifiedRegularRowKey(regularText),
        colIndex: 0,
      },
    ];

    for (const testCase of cases) {
      const rowHandle = testCase.host.find('.row-resizer-handle');
      await rowHandle.trigger('pointerdown');
      expect(testCase.rowResizer.onResizeStart).toHaveBeenCalledTimes(1);
      const [rowKey, rowEvent] = testCase.rowResizer.onResizeStart.mock.calls[0];
      expect(rowKey).toBe(testCase.rowKey);
      expect(rowEvent.type).toBe('pointerdown');
      expect(rowEvent.target).toBe(rowHandle.element);

      const colHandle = testCase.host.find('.resizer-handle');
      await colHandle.trigger('pointerdown');
      expect(testCase.colResizer.onResizeStart).toHaveBeenCalledTimes(1);
      const [colIndex, colEvent] = testCase.colResizer.onResizeStart.mock.calls[0];
      expect(colIndex).toBe(testCase.colIndex);
      expect(colEvent.type).toBe('pointerdown');
      expect(colEvent.target).toBe(colHandle.element);
    }
  });

  it('inline 数据行的行手柄使用带行号的 row-key', async () => {
    const { wrapper, rowResizerFor } = mountPreview();
    const inlineHost = groupHosts(wrapper).inline;
    const dataRows = inlineHost.findAll('tr').filter((row) => row.find('td.wp-ctrl').exists());
    const secondRowHandle = dataRows[1].find('.row-resizer-handle');
    await secondRowHandle.trigger('pointerdown');
    expect(rowResizerFor('inline').onResizeStart).toHaveBeenCalledWith(
      getInlineDataRowKey(INLINE_FIELDS, 1),
      expect.anything(),
    );

    const unifiedHost = groupHosts(wrapper).unified;
    const unifiedDataRows = unifiedHost.findAll('tr').filter((row) => row.find('td.wp-ctrl').exists());
    await unifiedDataRows[1].find('.row-resizer-handle').trigger('pointerdown');
    expect(rowResizerFor('unified').onResizeStart).toHaveBeenCalledWith(
      getUnifiedInlineDataRowKey(INLINE_FIELDS, 1),
      expect.anything(),
    );
  });

  it('unified full_row 行手柄使用 full-row key', async () => {
    const unifiedGroup = { type: 'unified', colCount: 4, fields: [regularText, labelField, ...INLINE_FIELDS] };
    const groupsView = buildPreviewGroupViewModels([unifiedGroup], previewModelHelpers);
    const { wrapper, rowResizerFor } = mountPreview({ groupsView });
    const unifiedHost = groupHosts(wrapper).unified;
    const fullRow = unifiedHost.findAll('tr').find((row) => row.find('td.wp-structure-label--multiline').exists());
    await fullRow.find('.row-resizer-handle').trigger('pointerdown');
    expect(rowResizerFor('unified').onResizeStart).toHaveBeenCalledWith(
      getUnifiedFullRowKey(labelField),
      expect.anything(),
    );
    // 表头行（inline_block）使用 inline-header key
    const headerRow = unifiedHost.findAll('tr').find((row) => row.find('td.wp-inline-header').exists());
    await headerRow.find('.row-resizer-handle').trigger('pointerdown');
    expect(rowResizerFor('unified').onResizeStart).toHaveBeenCalledWith(
      getUnifiedInlineHeaderRowKey(INLINE_FIELDS),
      expect.anything(),
    );
  });

  it.each([
    ['unified', 12],
    ['normal', 34],
    ['inline', 56],
  ])('%s 组的 snap-guide 随 snapGuideX 出现并带 left 偏移', async (kind, snapGuideX) => {
    const hidden = mountPreview();
    expect(groupHosts(hidden.wrapper)[kind].find('.snap-guide').exists()).toBe(false);

    const shown = mountPreview({ harness: { snapGuideX: { [kind]: snapGuideX } } });
    const guide = groupHosts(shown.wrapper)[kind].find('.snap-guide');
    expect(guide.exists()).toBe(true);
    expect(guide.element.style.left).toBe(`${snapGuideX}px`);
  });

  it('showAcrfAnnotations=false 时不渲染任何注释标记', () => {
    const { wrapper } = mountPreview({ showAcrfAnnotations: false });
    expect(wrapper.find('.wp-acrf-annotation').exists()).toBe(false);
  });

  it('showAcrfAnnotations=true 时渲染 form / field / inline-header 三类注释并接线到闭包', async () => {
    const { wrapper, handlers } = mountPreview();

    expect(wrapper.find('.wp-acrf-annotation--form').exists()).toBe(true);
    expect(wrapper.findAll('.wp-acrf-annotation--field').length).toBeGreaterThan(0);
    expect(wrapper.find('.wp-acrf-annotation--inline-header').exists()).toBe(true);

    const formTarget = { formId: 1, projectId: 7, key: ANNOTATION_FORM_KEY };
    const formAnnotation = wrapper.find('.wp-acrf-annotation--form');
    await formAnnotation.trigger('pointerdown');
    expect(handlers.onAnnotationPointerDown).toHaveBeenCalledTimes(1);
    expect(handlers.onAnnotationPointerDown.mock.calls[0][0]).toEqual(formTarget);
    expect(handlers.onAnnotationPointerDown.mock.calls[0][1].type).toBe('pointerdown');

    const formReset = wrapper.find('.wp-acrf-annotation--form button.wp-acrf-annotation-reset');
    await formReset.trigger('click');
    expect(handlers.resetAnnotationPosition).toHaveBeenCalledWith(formTarget);
    expect(handlers.onAnnotationPointerDown).toHaveBeenCalledTimes(1);
  });

  it('字段注释的目标 / 事件 / reset 回调值精确指向被注释字段', async () => {
    const { wrapper, handlers } = mountPreview();
    const fieldTarget = { formId: 1, projectId: 7, key: 'SYMPTOM' };

    const fieldAnnotation = wrapper.find('.wp-acrf-annotation--field');
    // 第一个字段注释来自 unified regular_field 的 value 单元格 → regularText
    await fieldAnnotation.trigger('pointerdown');
    expect(handlers.onAnnotationPointerDown).toHaveBeenCalledTimes(1);
    const [target, event] = handlers.onAnnotationPointerDown.mock.calls[0];
    expect(target).toEqual(fieldTarget);
    expect(event.type).toBe('pointerdown');
    expect(event.target).toBe(fieldAnnotation.element);

    const reset = fieldAnnotation.find('button.wp-acrf-annotation-reset');
    await reset.trigger('click');
    expect(handlers.resetAnnotationPosition).toHaveBeenCalledTimes(1);
    expect(handlers.resetAnnotationPosition).toHaveBeenCalledWith(fieldTarget);
    // 重置按钮上的 pointerdown 不触发拖拽上抛（组件内 .stop，此处不复制该断言，仅确认不额外计数）
    expect(handlers.onAnnotationPointerDown).toHaveBeenCalledTimes(1);
  });

  it('showFormOid=true 时标题旁渲染表单 OID 元数据，原始 .wp-form-title 保持纯名称', () => {
    const { wrapper } = mountPreview({
      selectedForm: { id: 1, name: '知情同意', code: 'F-ICF-01', domain: 'LB' },
      showFormOid: true,
    });

    expect(wrapper.find('.wp-form-title').text()).toBe('知情同意');
    const oid = wrapper.find('.wp-form-oid');
    expect(oid.exists()).toBe(true);
    expect(oid.text()).toBe('OID: F-ICF-01');
    // OID 与标题同处一个标题行，且位于 domain 标注之外（兄弟节点，不进入标题文本）
    expect(oid.element.parentElement).toBe(wrapper.find('.wp-form-title-row').element);
  });

  it('showFormOid=false 或 code 缺失/空白时不渲染 OID 元素', () => {
    const hidden = mountPreview({
      selectedForm: { id: 1, name: 'X', code: 'C1', domain: 'LB' },
      showFormOid: false,
    });
    expect(hidden.wrapper.find('.wp-form-oid').exists()).toBe(false);

    const noCode = mountPreview({ selectedForm: { id: 1, name: 'X', domain: 'LB' }, showFormOid: true });
    expect(noCode.wrapper.find('.wp-form-oid').exists()).toBe(false);

    const blank = mountPreview({ selectedForm: { id: 1, name: 'X', code: '   ', domain: 'LB' }, showFormOid: true });
    expect(blank.wrapper.find('.wp-form-oid').exists()).toBe(false);
  });

  it('两个 scope 都按各自的 showFormOid 渲染 OID', () => {
    for (const scope of ['main', 'designer']) {
      const { wrapper } = mountPreview({
        scope,
        showFormOid: true,
        selectedForm: { id: 1, name: 'N', code: 'S1', domain: 'LB' },
      });
      expect(wrapper.find('.wp-form-oid').text()).toBe('OID: S1');
    }
  });

  it('showFormOid 与 showAcrfAnnotations 相互独立：eCRF 视图也可显示 OID', () => {
    const { wrapper } = mountPreview({
      showFormOid: true,
      showAcrfAnnotations: false,
      selectedForm: { id: 1, name: 'N', code: 'S2', domain: 'LB' },
    });

    expect(wrapper.find('.wp-form-oid').text()).toBe('OID: S2');
    expect(wrapper.find('.wp-acrf-annotation').exists()).toBe(false);
  });
});
