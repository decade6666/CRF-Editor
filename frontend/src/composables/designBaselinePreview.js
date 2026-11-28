// Frozen-design adapters only. Rendering/grouping/planning remain in shared helpers.
import { buildFormDesignerRenderGroups, buildFormDesignerUnifiedSegments } from './formFieldPresentation.js';
import { buildTableInstanceId } from './useRowResize.js';
import { buildPreviewGroupViewModels } from './formDesignerPreviewModel.js';
import {
  computeLabelValueSpans,
  computeMergeSpans,
  createPreviewCellRenderers,
  getScopedDefaultValue,
} from './previewCellRender.js';
import {
  computeFillLineCharCount,
  planInlineColumnFractions,
  planNormalColumnFractions,
  renderCtrlTextHtml,
} from './useCRFRenderer.js';
import {
  resolveInlineTableAvailableCm,
  resolveNormalTableAvailableCm,
  shouldUseLandscapePreview,
} from './visitPreviewLandscape.js';
import { ANNOTATION_FORM_KEY, buildAnnotationStyle, readAnnotationDelta01Cm } from './acrfAnnotationGeometry.js';

const ordered = (rows, nullOrder = 0) =>
  [...rows].sort((a, b) => (a.order_index ?? nullOrder) - (b.order_index ?? nullOrder) || a.id - b.id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const noop = () => {};
const byForeignKey = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
};

export function buildBaselineForms(snapshot) {
  if (!snapshot || snapshot.schema_version !== 1) throw new Error('不支持此留档设计格式');
  const tables = clone(snapshot.tables);
  const options = byForeignKey(tables.codelist_option, 'codelist_id');
  const fields = byForeignKey(tables.form_field, 'form_id');
  const units = new Map(tables.unit.map((row) => [row.id, row]));
  const codelists = new Map(
    tables.codelist.map((row) => [
      row.id,
      {
        ...row,
        options: ordered(options.get(row.id) || [], Number.POSITIVE_INFINITY),
      },
    ]),
  );
  const definitions = new Map(
    tables.field_definition.map((row) => [
      row.id,
      {
        ...row,
        codelist: codelists.get(row.codelist_id) ?? null,
        unit: units.get(row.unit_id) ?? null,
      },
    ]),
  );
  // Match ExportService._add_forms_content, including its legacy NULL sentinel.
  return ordered(tables.form, 999999).map((form) => ({
    ...form,
    annotation_positions:
      typeof form.annotation_positions === 'string' ? JSON.parse(form.annotation_positions) : form.annotation_positions,
    fields: ordered(fields.get(form.id) || []).map((row) => ({
      ...row,
      field_definition: definitions.get(row.field_definition_id) ?? null,
    })),
  }));
}

export function baselineTables(form) {
  return buildFormDesignerRenderGroups(form?.fields || []).map((group, index) => ({
    key: buildTableInstanceId(group.type, group.fields),
    kind: group.type,
    label: `表格 ${index + 1} · ${group.type === 'normal' ? '常规' : '横向'}`,
    fields: group.fields,
    ratios: group.type === 'normal' ? planNormalColumnFractions(group.fields) : planInlineColumnFractions(group.fields),
  }));
}

export function columnWeightsToOverrides(weights) {
  return Object.fromEntries(
    Object.entries(weights).map(([key, values]) => {
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      ) {
        throw new Error('列宽必须为正数');
      }
      const total = values.reduce((a, b) => a + b, 0);
      if (!Number.isFinite(total)) throw new Error('列宽超出范围');
      return [key, values.map((value) => value / total)];
    }),
  );
}

function rendererField(field) {
  const definition = field?.field_definition;
  return definition
    ? { ...definition, options: definition.codelist?.options || [], unit_symbol: definition.unit?.symbol }
    : null;
}

export function buildBaselinePreview(form, widths = {}) {
  const groups = buildFormDesignerRenderGroups(form?.fields || []);
  const tables = baselineTables(form);
  const orientation = form?.paper_orientation || 'auto';
  const fractions = (group) =>
    widths[buildTableInstanceId(group.type, group.fields)] ||
    tables.find((table) => table.key === buildTableInstanceId(group.type, group.fields))?.ratios ||
    [];
  const { renderCellHtml, getInlineRows } = createPreviewCellRenderers({
    toRendererField: rendererField,
    getCellValue: (field) => getScopedDefaultValue(field),
    getInlineValue: (field) => getScopedDefaultValue(field),
    renderFallback: renderCtrlTextHtml,
    resolveHostGroups: () => groups,
    getPaperOrientation: () => orientation,
  });
  const viewGroups = buildPreviewGroupViewModels(groups, {
    buildSegments: buildFormDesignerUnifiedSegments,
    getInlineRows,
    computeMergeSpans,
    computeLabelValueSpans,
    getInlineFillChars: (fields) => {
      const group = { type: 'inline', fields };
      const available = resolveInlineTableAvailableCm(groups, group, orientation);
      return fractions(group).map((ratio) => computeFillLineCharCount(ratio * available));
    },
  });
  return {
    groups: viewGroups,
    landscape: orientation === 'landscape' || (orientation === 'auto' && shouldUseLandscapePreview(groups)),
    handlers: {
      getResizer: (_kind, _count, _index, group) => ({
        colRatios: fractions(group),
        snapGuideX: null,
        onResizeStart: noop,
      }),
      getRowResizer: () => null,
      renderCellHtml,
      normalFillChars: (_index, group) =>
        computeFillLineCharCount((fractions(group)[1] || 0) * resolveNormalTableAvailableCm(groups, orientation)),
      openQuickEdit: noop,
      getFormDomainAnnotationText: (target) => String(target?.domain ?? '').trim(),
      getFieldOidAnnotationText: (target) =>
        target?.field_definition?.field_type === '标签'
          ? ''
          : String(target?.field_definition?.variable_name ?? '').trim(),
      getFormAnnotationTarget: () => ({ key: ANNOTATION_FORM_KEY }),
      getFieldAnnotationTarget: (target) => ({ key: target?.field_definition?.variable_name }),
      isAnnotationDraggable: () => false,
      hasAnnotationOverrideForTarget: () => false,
      getAnnotationStyle: (text, kind, target) =>
        buildAnnotationStyle({
          text,
          kind,
          deltaY01cm: readAnnotationDelta01Cm(form?.annotation_positions, target?.key),
        }),
      onAnnotationPointerDown: noop,
      resetAnnotationPosition: noop,
    },
  };
}
