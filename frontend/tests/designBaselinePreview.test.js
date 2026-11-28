import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildBaselineForms,
  baselineTables,
  columnWeightsToOverrides,
  buildBaselinePreview,
} from '../src/composables/designBaselinePreview.js';

function snapshot() {
  return {
    schema_version: 1,
    project: { id: 1, name: '冻结项目' },
    asset_references: { company_logo: null },
    tables: {
      form: [
        {
          id: 2,
          name: '冻结表单',
          code: 'legacy.lower',
          domain: 'Lb',
          order_index: 1,
          paper_orientation: 'portrait',
          annotation_positions: '{"_form":{"y":-18}}',
        },
      ],
      form_field: [{ id: 4, form_id: 2, field_definition_id: 3, order_index: 1, inline_mark: 0 }],
      field_definition: [
        {
          id: 3,
          project_id: 1,
          variable_name: 'Legacy.lower',
          field_type: '单选',
          label: '<安全文本>',
          codelist_id: 5,
          unit_id: 7,
        },
      ],
      codelist: [{ id: 5, project_id: 1, name: '字典' }],
      codelist_option: [{ id: 6, codelist_id: 5, order_index: 1, code: 'a', decode: '是' }],
      unit: [{ id: 7, project_id: 1, symbol: 'kg' }],
      field: [],
      visit: [],
      visit_form: [],
    },
  };
}

test('snapshot preview denormalizes the frozen graph without rewriting source identifiers or input', () => {
  const source = snapshot();
  const before = JSON.stringify(source);
  const [form] = buildBaselineForms(source);
  assert.equal(form.code, 'legacy.lower');
  assert.equal(form.fields[0].field_definition.variable_name, 'Legacy.lower');
  assert.equal(form.fields[0].field_definition.codelist.options[0].decode, '是');
  assert.equal(form.fields[0].field_definition.unit.symbol, 'kg');
  assert.deepEqual(form.annotation_positions, { _form: { y: -18 } });
  form.fields[0].field_definition.label = 'local';
  assert.equal(JSON.stringify(source), before);
});

test('layout targets use the shared true table identities and default planners', () => {
  const [form] = buildBaselineForms(snapshot());
  const tables = baselineTables(form);
  assert.equal(tables[0].key, 'normal:fieldIds=4');
  assert.equal(tables[0].kind, 'normal');
  assert.equal(tables[0].ratios.length, 2);
  assert.ok(Math.abs(tables[0].ratios.reduce((a, b) => a + b) - 1) < 1e-6);
});

test('nullable form order mirrors the existing Word sentinel without replacing saved NULL values', () => {
  const source = snapshot();
  source.tables.form.push(
    { id: 1, name: '未排序表单', order_index: null, annotation_positions: null },
    { id: 3, name: '大序号表单', order_index: 2000000, annotation_positions: null },
  );
  const before = JSON.stringify(source);
  assert.deepEqual(
    buildBaselineForms(source).map((form) => form.id),
    [2, 1, 3],
  );
  assert.equal(JSON.stringify(source), before);
});

test('nullable option order remains last after explicit indexes without rewriting frozen data', () => {
  const source = snapshot();
  source.tables.codelist_option.unshift({ id: 1, codelist_id: 5, order_index: null, code: 'U', decode: '未排序' });
  const before = JSON.stringify(source);
  const [form] = buildBaselineForms(source);
  assert.deepEqual(
    form.fields[0].field_definition.codelist.options.map((option) => option.code),
    ['a', 'U'],
  );
  assert.equal(JSON.stringify(source), before);
});

test('only explicitly authored positive weights become this-capture normalized layout overrides', () => {
  const weights = { 'normal:fieldIds=4': [30, 70] };
  assert.deepEqual(columnWeightsToOverrides(weights), { 'normal:fieldIds=4': [0.3, 0.7] });
  assert.deepEqual(columnWeightsToOverrides({}), {});
  for (const invalid of [[0, 10], [NaN, 10], [true, 1], [-1, 2], []]) {
    assert.throws(() => columnWeightsToOverrides({ key: invalid }));
  }
  assert.deepEqual(weights, { 'normal:fieldIds=4': [30, 70] });
});

test('read-only preview uses only explicit widths and shared safe field rendering, never designer localStorage', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => assert.fail('read designer storage') };
  try {
    const [form] = buildBaselineForms(snapshot());
    const preview = buildBaselinePreview(form, { 'normal:fieldIds=4': [0.25, 0.75] });
    assert.deepEqual(preview.handlers.getResizer('normal', 2, 0, preview.groups[0]).colRatios, [0.25, 0.75]);
    assert.equal(preview.handlers.isAnnotationDraggable(), false);
    assert.match(preview.handlers.renderCellHtml(form.fields[0]), /是/);
    assert.equal(preview.handlers.getFormDomainAnnotationText(form), 'Lb');
    assert.ok(preview.handlers.getAnnotationStyle('Lb', 'form', { key: '_form' }));
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('unsupported snapshot versions fail visibly rather than being shown as complete designs', () => {
  assert.throws(() => buildBaselineForms({ ...snapshot(), schema_version: 99 }), /不支持/);
});

test('the archive viewport scrolls full-size portrait and landscape paper instead of squeezing its title on narrow screens', () => {
  const source = readFileSync(new URL('../src/components/DesignBaselinePreview.vue', import.meta.url), 'utf8');
  assert.match(source, /<style scoped>/);
  assert.match(source, /\.preview-scroll\s*\{[^}]*overflow:\s*auto/);
  assert.match(source, /\.preview-scroll\s*:deep\(\.word-page\)\s*\{[^}]*max-width:\s*none/);
});
