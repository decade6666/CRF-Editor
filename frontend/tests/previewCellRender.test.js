/**
 * previewCellRender 共享模块等价性测试（10-08-shared-rule-convergence R1/R2）。
 *
 * 黄金参考 = 三个组件在合并前（base f68ebe1 / a4431b0 锚点复核）的逐字函数快照：
 *   - FormDesignerTab getScopedDefaultValue / renderCellHtml / getInlineRows /
 *     getInlineColumnCms / getInlineFillChars / computeMergeSpans / computeLabelValueSpans
 *   - VisitsTab 同一组（renderCellHtml 含「单行截断」历史缺陷，见 R2 锁）
 *   - TemplatePreviewDialog 同一组（cell / inline 两条默认值谓词硬编码，另有扁平类型回退）
 *
 * 断言方式：按各组件的绑定构造 createPreviewCellRenderers 适配器，CELL 与 INLINE
 * 两条默认值策略分开断言（TP 硬编码 false/true + 扁平回退；FD/VT inline_mark 感知），
 * 输出与黄金参考逐元素相等；golden 函数中组件状态读取（renderGroups /
 * paperOrientation ref）按 design.md §3 第 8/10 行的「参数化」接缝换成等价参数。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderCtrlHtml,
  renderCtrlTextHtml,
  toHtml,
  isDefaultValueSupported,
  normalizeDefaultValue,
  planInlineColumnFractions,
  computeFillLineCharCount,
} from '../src/composables/useCRFRenderer.js';
import { resolveInlineTableAvailableCm } from '../src/composables/visitPreviewLandscape.js';
import { buildFormDesignerUnifiedSegments } from '../src/composables/formFieldPresentation.js';
import { buildPreviewGroupViewModels } from '../src/composables/formDesignerPreviewModel.js';
import {
  computeMergeSpans,
  computeLabelValueSpans,
  getScopedDefaultValue,
  createPreviewCellRenderers,
} from '../src/composables/previewCellRender.js';

// ─── 夹具：包装形态（field_definition + default_value / inline_mark）与扁平形态 ───

const textDef = { field_type: '文本', label: '症状' };
const numericDef = { field_type: '数值', label: '体重', integer_digits: 3, decimal_digits: 1 };
const choiceDef = {
  field_type: '单选',
  label: '性别',
  codelist: { options: [{ text: '男' }, { text: '女' }] },
};
const checkboxDef = { field_type: '复选', label: '确认', checkbox_label: '已确认' };
const dateDef = { field_type: '日期', label: '访视日期', date_format: 'yyyy-MM-dd' };

const textNoDefault = { field_definition: textDef, default_value: null, inline_mark: 0 };
const textSingle = { field_definition: textDef, default_value: '单行值', inline_mark: 0 };
const textMulti = { field_definition: textDef, default_value: '第一行\n第二行', inline_mark: 1 };
const textMultiTrail = {
  field_definition: textDef,
  default_value: '甲\n乙\n\n',
  inline_mark: 1,
};
const numericDefault = { field_definition: numericDef, default_value: '12.5', inline_mark: 0 };
const choiceCell = { field_definition: choiceDef, default_value: '男', inline_mark: 0 };
const choiceInline = { field_definition: choiceDef, default_value: '男', inline_mark: 1 };
const checkboxField = { field_definition: checkboxDef, default_value: '是', inline_mark: 1 };
const dateInline = { field_definition: dateDef, default_value: '2026-01-01', inline_mark: 1 };
const logRow = { field_definition: null, default_value: null, is_log_row: true };
const flatOnly = { field_type: '文本', default_value: '扁平默认', id: 9001 };

// ─── 黄金参考：pre-merge per-symbol snapshot of FormDesignerTab getScopedDefaultValue /
// renderCellHtml / getInlineRows / getInlineColumnCms / getInlineFillChars /
// computeMergeSpans / computeLabelValueSpans · VisitsTab same set ·
// TemplatePreviewDialog same set @ a4431b0（f68ebe1 同值，行号见 design.md §3） ───

// FormDesignerTab :1362（组件保留该函数，此处快照供 golden / 适配器使用）
function fdGoldenGetPreviewField(ff) {
  if (!ff?.field_definition) return null;
  return {
    field_type: ff.field_definition.field_type,
    label: ff.field_definition.label,
    checkbox_label: ff.field_definition.checkbox_label,
    options: ff.field_definition.codelist?.options || [],
    unit_symbol: ff.field_definition.unit?.symbol,
    integer_digits: ff.field_definition.integer_digits,
    decimal_digits: ff.field_definition.decimal_digits,
    date_format: ff.field_definition.date_format,
  };
}

// VisitsTab :396（组件保留该函数，此处快照供 golden / 适配器使用）
function vtGoldenToRendererField(fd) {
  if (!fd) return null;
  return {
    field_type: fd.field_type,
    label: fd.label,
    checkbox_label: fd.checkbox_label,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  };
}

// VisitsTab :410（组件保留；golden renderCellHtml 的默认值分支引用）
function vtGoldenEscapePreviewText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// FormDesignerTab :1381
function fdGoldenGetScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type;
  const inlineMark = Boolean(ff?.inline_mark);
  if (!fieldType || !ff?.default_value) return '';
  if (!isDefaultValueSupported(fieldType, inlineMark)) return '';
  return normalizeDefaultValue(ff.default_value, singleLine);
}

// FormDesignerTab :1389
function fdGoldenRenderCellHtml(ff, fillLineChars = null) {
  const previewField = fdGoldenGetPreviewField(ff);
  if (!previewField) return '<span class="fill-line"></span>';
  const defaultValue = fdGoldenGetScopedDefaultValue(ff, false);
  if (defaultValue) return toHtml(defaultValue);
  return renderCtrlHtml(previewField, fillLineChars);
}

// FormDesignerTab :1413
function fdGoldenGetInlineRows(fields, fillCharsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null;
    const defaultValue = fdGoldenGetScopedDefaultValue(ff);
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n');
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return {
        lines: lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: renderCtrlTextHtml(fdGoldenGetPreviewField(ff), fillChars),
      };
    }
    const ctrl = renderCtrlHtml(fdGoldenGetPreviewField(ff), fillChars);
    return { lines: [ctrl], repeat: true, fallback: ctrl };
  });
  const maxRows = Math.max(1, ...cols.filter((c) => !c.repeat).map((c) => c.lines.length));
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map((col) => (col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))),
  );
}

// FormDesignerTab :1437 的状态读取按「参数化」接缝换成参数（其余逐字一致）
function fdGoldenResolveInlineHostGroups(fields, primaryGroups, secondaryGroups) {
  if (primaryGroups.some((group) => group.type === 'inline' && group.fields === fields)) {
    return primaryGroups;
  }
  if (secondaryGroups.some((group) => group.type === 'inline' && group.fields === fields)) {
    return secondaryGroups;
  }
  return primaryGroups;
}

// FormDesignerTab :1447（renderGroups/selectedFormPaperOrientation → 参数）
function fdGoldenGetInlineColumnCms(fields, hostGroups, paperOrientation) {
  const fractions = planInlineColumnFractions(fields);
  const availableCm = resolveInlineTableAvailableCm(hostGroups, { type: 'inline', fields }, paperOrientation);
  return fractions.map((f) => f * availableCm);
}

// FormDesignerTab :1457
function fdGoldenGetInlineFillChars(fields, hostGroups, paperOrientation) {
  return fdGoldenGetInlineColumnCms(fields, hostGroups, paperOrientation).map((columnCm) =>
    computeFillLineCharCount(columnCm),
  );
}

// FormDesignerTab :1461
function fdGoldenComputeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1);
  const base = Math.floor(N / M),
    extra = N % M;
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0));
}

// FormDesignerTab :1468
function fdGoldenComputeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)));
  return { labelSpan, valueSpan: N - labelSpan };
}

// VisitsTab :418
function vtGoldenGetScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type;
  const inlineMark = Boolean(ff?.inline_mark);
  if (!fieldType || !ff?.default_value) return '';
  if (!isDefaultValueSupported(fieldType, inlineMark)) return '';
  return normalizeDefaultValue(ff.default_value, singleLine);
}

// VisitsTab :427（历史实现：singleLine=true + escapePreviewText —— R2 缺陷本体）
function vtGoldenRenderCellHtml(ff, fillLineChars = null) {
  if (!ff.field_definition) return '<span class="fill-line"></span>';
  const fd = ff.field_definition;
  const field = vtGoldenToRendererField(fd);
  const defaultValue = vtGoldenGetScopedDefaultValue(ff, true);
  if (defaultValue) {
    return vtGoldenEscapePreviewText(defaultValue);
  }
  return renderCtrlHtml(field, fillLineChars);
}

// VisitsTab :438
function vtGoldenGetInlineRows(fields, fillCharsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null;
    const defaultValue = vtGoldenGetScopedDefaultValue(ff);
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n');
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return {
        lines: lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: renderCtrlTextHtml(vtGoldenToRendererField(ff.field_definition), fillChars),
      };
    }
    const ctrl = renderCtrlHtml(vtGoldenToRendererField(ff.field_definition), fillChars);
    return { lines: [ctrl], repeat: true, fallback: ctrl };
  });
  const maxRows = Math.max(1, ...cols.filter((c) => !c.repeat).map((c) => c.lines.length));
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map((col) => (col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))),
  );
}

// VisitsTab :463（previewRenderGroups/formPreviewPaperOrientation → 参数）
function vtGoldenGetInlineColumnCms(fields, hostGroups, paperOrientation) {
  const fractions = planInlineColumnFractions(fields);
  const availableCm = resolveInlineTableAvailableCm(hostGroups, { type: 'inline', fields }, paperOrientation);
  return fractions.map((f) => f * availableCm);
}

// VisitsTab :473
function vtGoldenGetInlineFillChars(fields, hostGroups, paperOrientation) {
  return vtGoldenGetInlineColumnCms(fields, hostGroups, paperOrientation).map((columnCm) =>
    computeFillLineCharCount(columnCm),
  );
}

// VisitsTab :644
function vtGoldenComputeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1);
  const base = Math.floor(N / M);
  const extra = N % M;
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0));
}

// VisitsTab :651
function vtGoldenComputeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)));
  return { labelSpan, valueSpan: N - labelSpan };
}

// TemplatePreviewDialog :203
function tpGoldenComputeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1);
  const base = Math.floor(N / M),
    extra = N % M;
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0));
}

// TemplatePreviewDialog :209
function tpGoldenComputeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)));
  return { labelSpan, valueSpan: N - labelSpan };
}

// TemplatePreviewDialog :215
function tpGoldenGetInlineRows(fields, fillCharsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null;
    const defaultValue = ff.default_value;
    if (defaultValue && isDefaultValueSupported(ff.field_definition?.field_type || ff.field_type, true)) {
      const lines = normalizeDefaultValue(defaultValue).split('\n');
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return {
        lines: lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: renderCtrlHtml(ff, fillChars),
      };
    }
    const ctrl = renderCtrlHtml(ff, fillChars);
    return { lines: [ctrl], repeat: true, fallback: ctrl };
  });
  const maxRows = Math.max(1, ...cols.filter((c) => !c.repeat).map((c) => c.lines.length));
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map((col) => (col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))),
  );
}

// TemplatePreviewDialog :236（previewRenderGroups/paperOrientation → 参数）
function tpGoldenGetInlineColumnCms(fields, hostGroups, paperOrientation) {
  const fractions = planInlineColumnFractions(fields);
  const availableCm = resolveInlineTableAvailableCm(hostGroups, { type: 'inline', fields }, paperOrientation);
  return fractions.map((f) => f * availableCm);
}

// TemplatePreviewDialog :246
function tpGoldenGetInlineFillChars(fields, hostGroups, paperOrientation) {
  return tpGoldenGetInlineColumnCms(fields, hostGroups, paperOrientation).map((columnCm) =>
    computeFillLineCharCount(columnCm),
  );
}

// TemplatePreviewDialog :292（cell 谓词硬编码 inlineMark=false + toHtml(normalize(dv, false))）
function tpGoldenRenderCellHtml(ff, fillLineChars = null) {
  if (!ff.field_definition) return '<span class="fill-line"></span>';
  const defaultValue = ff.default_value;
  if (defaultValue && isDefaultValueSupported(ff.field_definition?.field_type, false)) {
    return toHtml(normalizeDefaultValue(defaultValue, false));
  }
  return renderCtrlHtml(ff, fillLineChars);
}

// ─── 按组件绑定构造共享渲染器（与 design.md §2.1「Component wiring」一致） ───

const primaryGroups = [
  { type: 'normal', fields: [textNoDefault] },
  { type: 'inline', fields: [choiceInline, dateInline, numericDefault] },
];
const secondaryGroups = [
  { type: 'normal', fields: [textNoDefault] },
  { type: 'inline', fields: [textMulti, textSingle, textMultiTrail, checkboxField, choiceCell] },
];

const fdBound = createPreviewCellRenderers({
  toRendererField: fdGoldenGetPreviewField,
  getCellValue: (ff) => getScopedDefaultValue(ff, false),
  getInlineValue: (ff) => getScopedDefaultValue(ff),
  renderFallback: renderCtrlTextHtml,
  resolveHostGroups: (fields) => fdGoldenResolveInlineHostGroups(fields, primaryGroups, secondaryGroups),
  getPaperOrientation: () => 'auto',
});

const vtBound = createPreviewCellRenderers({
  toRendererField: (ff) => vtGoldenToRendererField(ff.field_definition),
  getCellValue: (ff) => getScopedDefaultValue(ff, false), // R2 修复：cell 策略由 singleLine=true 改为 false
  getInlineValue: (ff) => getScopedDefaultValue(ff),
  renderFallback: renderCtrlTextHtml,
  resolveHostGroups: () => primaryGroups,
  getPaperOrientation: () => 'landscape',
});

// TP 的两条默认值谓词逐字保留（design.md §3 第 3 行：TP 不采用共享 getScopedDefaultValue）
const tpBound = createPreviewCellRenderers({
  toRendererField: (ff) => ff,
  getCellValue: (ff) => {
    const defaultValue = ff.default_value;
    return defaultValue && isDefaultValueSupported(ff.field_definition?.field_type, false)
      ? normalizeDefaultValue(defaultValue, false)
      : '';
  },
  getInlineValue: (ff) => {
    const defaultValue = ff.default_value;
    return defaultValue && isDefaultValueSupported(ff.field_definition?.field_type || ff.field_type, true)
      ? defaultValue
      : '';
  },
  renderFallback: renderCtrlHtml,
  resolveHostGroups: () => primaryGroups,
  getPaperOrientation: () => 'portrait',
});

// ─── 测试 ───

test('computeMergeSpans / computeLabelValueSpans 与三份黄金参考逐元素相等（unified 段值路径）', () => {
  for (let n = 1; n <= 9; n += 1) {
    for (let m = 0; m <= 6; m += 1) {
      assert.deepEqual(computeMergeSpans(n, m), fdGoldenComputeMergeSpans(n, m));
      assert.deepEqual(computeMergeSpans(n, m), vtGoldenComputeMergeSpans(n, m));
      assert.deepEqual(computeMergeSpans(n, m), tpGoldenComputeMergeSpans(n, m));
    }
    assert.deepEqual(computeLabelValueSpans(n), fdGoldenComputeLabelValueSpans(n));
    assert.deepEqual(computeLabelValueSpans(n), vtGoldenComputeLabelValueSpans(n));
    assert.deepEqual(computeLabelValueSpans(n), tpGoldenComputeLabelValueSpans(n));
  }
});

test('getScopedDefaultValue（FD/VT 策略）与黄金参考相等：类型 × inline_mark × singleLine 矩阵', () => {
  const matrix = [
    textNoDefault,
    textSingle,
    textMulti,
    textMultiTrail,
    numericDefault,
    choiceCell,
    choiceInline,
    checkboxField,
    dateInline,
    logRow,
    flatOnly,
  ];
  for (const ff of matrix) {
    for (const singleLine of [false, true]) {
      assert.equal(getScopedDefaultValue(ff, singleLine), fdGoldenGetScopedDefaultValue(ff, singleLine));
      assert.equal(getScopedDefaultValue(ff, singleLine), vtGoldenGetScopedDefaultValue(ff, singleLine));
    }
  }
});

test('FD 绑定 renderCellHtml 与黄金参考逐元素相等（cell 策略 = getScopedDefaultValue(ff, false)）', () => {
  const matrix = [
    textNoDefault,
    textSingle,
    textMulti,
    numericDefault,
    choiceCell,
    choiceInline,
    checkboxField,
    dateInline,
    logRow,
  ];
  for (const ff of matrix) {
    for (const fillChars of [null, 12]) {
      assert.equal(fdBound.renderCellHtml(ff, fillChars), fdGoldenRenderCellHtml(ff, fillChars));
    }
  }
});

test('TP 绑定 renderCellHtml 与黄金参考逐元素相等（cell 谓词硬编码 false，含扁平行守卫）', () => {
  const matrix = [
    textNoDefault,
    textSingle,
    textMulti,
    numericDefault,
    choiceCell,
    choiceInline,
    checkboxField,
    dateInline,
    logRow,
    flatOnly,
  ];
  for (const ff of matrix) {
    for (const fillChars of [null, 12]) {
      assert.equal(tpBound.renderCellHtml(ff, fillChars), tpGoldenRenderCellHtml(ff, fillChars));
    }
  }
});

test('VT 绑定 renderCellHtml：单行纯文本默认值与控件回退路径和旧实现一致', () => {
  // 不受 R2 影响的路径（单行、无连续下划线）必须与旧输出逐字节相等
  assert.equal(vtBound.renderCellHtml(textSingle, null), vtGoldenRenderCellHtml(textSingle, null));
  for (const ff of [textNoDefault, choiceCell, checkboxField, logRow]) {
    assert.equal(vtBound.renderCellHtml(ff, null), vtGoldenRenderCellHtml(ff, null));
    assert.equal(vtBound.renderCellHtml(ff, 12), vtGoldenRenderCellHtml(ff, 12));
  }
});

test('R2 锁：VT 绑定 renderCellHtml 多行默认值经 toHtml 渲染全部行（<br>），旧实现截断为首行', () => {
  const fixed = vtBound.renderCellHtml(textMulti, null);
  assert.ok(fixed.includes('第一行<br>第二行'), `multi-line via toHtml, got: ${fixed}`);
  const legacy = vtGoldenRenderCellHtml(textMulti, null);
  assert.equal(legacy, '第一行');
  assert.ok(!legacy.includes('<br>'));
  // toHtml 切换的声明差异之二：连续下划线默认值按填写线 span 渲染（与设计器/模板预览一致）
  const underscores = vtBound.renderCellHtml(
    { field_definition: textDef, default_value: '____', inline_mark: 0 },
    null,
  );
  assert.match(underscores, /fill-line/);
});

const inlineFixtureSets = [
  [textNoDefault, numericDefault],
  [textMulti, textSingle],
  [textMultiTrail, numericDefault],
  [choiceInline, dateInline],
  [checkboxField, textNoDefault],
];
const fillCharsByColVariants = [null, [12, 8]];

test('FD 绑定 getInlineRows 与黄金参考逐元素相等（inline 策略 = inline_mark 感知）', () => {
  for (const fields of inlineFixtureSets) {
    for (const fillCharsByCol of fillCharsByColVariants) {
      assert.deepEqual(fdBound.getInlineRows(fields, fillCharsByCol), fdGoldenGetInlineRows(fields, fillCharsByCol));
    }
  }
});

test('VT 绑定 getInlineRows 与黄金参考逐元素相等', () => {
  for (const fields of inlineFixtureSets) {
    for (const fillCharsByCol of fillCharsByColVariants) {
      assert.deepEqual(vtBound.getInlineRows(fields, fillCharsByCol), vtGoldenGetInlineRows(fields, fillCharsByCol));
    }
  }
});

test('TP 绑定 getInlineRows 与黄金参考逐元素相等（inline 谓词硬编码 true + 扁平类型回退）', () => {
  for (const fields of inlineFixtureSets) {
    for (const fillCharsByCol of fillCharsByColVariants) {
      assert.deepEqual(tpBound.getInlineRows(fields, fillCharsByCol), tpGoldenGetInlineRows(fields, fillCharsByCol));
    }
  }
  // TP 扁平回退：无 field_definition 的扁平行在 inline 路径仍按 field_type 判定默认值
  assert.deepEqual(tpBound.getInlineRows([flatOnly], null), tpGoldenGetInlineRows([flatOnly], null));
  assert.deepEqual(tpBound.getInlineRows([flatOnly], null), [['扁平默认']]);
  // 同一扁平行在 FD/VT 绑定下不进默认值分支（getScopedDefaultValue 要求 field_definition）
  assert.deepEqual(fdBound.getInlineRows([flatOnly], null), [['']]);
  assert.deepEqual(vtBound.getInlineRows([flatOnly], null), [['']]);
});

test('getInlineColumnCms / getInlineFillChars 与黄金参考相等（分组来源与纸张方向经适配器注入）', () => {
  const cases = [
    {
      binding: fdBound,
      orientation: 'auto',
      goldenCms: fdGoldenGetInlineColumnCms,
      goldenFill: fdGoldenGetInlineFillChars,
      hostGroupsFor: (fields) => fdGoldenResolveInlineHostGroups(fields, primaryGroups, secondaryGroups),
    },
    {
      binding: vtBound,
      orientation: 'landscape',
      goldenCms: vtGoldenGetInlineColumnCms,
      goldenFill: vtGoldenGetInlineFillChars,
      hostGroupsFor: () => primaryGroups,
    },
    {
      binding: tpBound,
      orientation: 'portrait',
      goldenCms: tpGoldenGetInlineColumnCms,
      goldenFill: tpGoldenGetInlineFillChars,
      hostGroupsFor: () => primaryGroups,
    },
  ];
  const inlineFieldSets = [primaryGroups[1].fields, secondaryGroups[1].fields];
  for (const { binding, orientation, goldenCms, goldenFill, hostGroupsFor } of cases) {
    for (const fields of inlineFieldSets) {
      const hostGroups = hostGroupsFor(fields);
      assert.deepEqual(binding.getInlineColumnCms(fields), goldenCms(fields, hostGroups, orientation));
      assert.deepEqual(binding.getInlineFillChars(fields), goldenFill(fields, hostGroups, orientation));
    }
  }
  // FD 的 resolveHostGroups 按字段数组恒等选择宿主分组（secondary 命中时用 secondary 上下文）
  const secondaryFields = secondaryGroups[1].fields;
  assert.equal(fdGoldenResolveInlineHostGroups(secondaryFields, primaryGroups, secondaryGroups), secondaryGroups);
  assert.deepEqual(
    fdBound.getInlineColumnCms(secondaryFields),
    fdGoldenGetInlineColumnCms(secondaryFields, secondaryGroups, 'auto'),
  );
});

test('getPaperOrientation 适配器按次解析：同一绑定随适配器返回值切换可用宽度', () => {
  const fields = primaryGroups[1].fields;
  for (const orientation of ['auto', 'portrait', 'landscape']) {
    const binding = createPreviewCellRenderers({
      toRendererField: (ff) => ff,
      getCellValue: () => '',
      getInlineValue: () => '',
      renderFallback: renderCtrlHtml,
      resolveHostGroups: () => primaryGroups,
      getPaperOrientation: () => orientation,
    });
    assert.deepEqual(
      binding.getInlineColumnCms(fields),
      fdGoldenGetInlineColumnCms(fields, primaryGroups, orientation),
    );
  }
});

test('previewModelHelpers 注入缝：共享 helpers 与黄金 helpers 的视图模型逐元素相等', () => {
  const unifiedFields = [textSingle, choiceInline, dateInline, textMultiTrail];
  const groups = [
    { type: 'unified', fields: unifiedFields, colCount: 4 },
    { type: 'inline', fields: primaryGroups[1].fields },
    { type: 'normal', fields: [textNoDefault] },
  ];
  const goldenHelpers = {
    buildSegments: buildFormDesignerUnifiedSegments,
    getInlineRows: fdGoldenGetInlineRows,
    getInlineFillChars: (fields) => fdGoldenGetInlineFillChars(fields, groups, 'auto'),
    getInlineColumnCms: (fields) => fdGoldenGetInlineColumnCms(fields, groups, 'auto'),
    computeMergeSpans: fdGoldenComputeMergeSpans,
    computeLabelValueSpans: fdGoldenComputeLabelValueSpans,
  };
  const sharedHelpers = {
    buildSegments: buildFormDesignerUnifiedSegments,
    getInlineRows: fdBound.getInlineRows,
    getInlineFillChars: fdBound.getInlineFillChars,
    getInlineColumnCms: fdBound.getInlineColumnCms,
    computeMergeSpans,
    computeLabelValueSpans,
  };
  assert.deepEqual(
    buildPreviewGroupViewModels(groups, sharedHelpers),
    buildPreviewGroupViewModels(groups, goldenHelpers),
  );
});
