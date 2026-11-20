import { describe, it, expect } from 'vitest'
import {
  getScopedDefaultValue,
  computeMergeSpans,
  computeLabelValueSpans,
  createPreviewCellRenderers,
} from '../../src/composables/previewCellRender'
import {
  DB_TYPE_SAIMEISI,
  DB_TYPE_OTHER,
  allowsMultiselect,
  isMultiselectFieldType,
  buildFieldTypeOptions,
} from '../../src/composables/fieldTypeAvailability'
import {
  isVisibleInFieldLibrary,
  isLabelFieldDefinition,
  buildFieldDefinitionCreatePayload,
} from '../../src/composables/fieldDefinitionVisibility'

describe('previewCellRender pure helpers', () => {
  it('getScopedDefaultValue gates on type, inline mark and emptiness', () => {
    expect(getScopedDefaultValue(null)).toBe('')
    expect(getScopedDefaultValue({ field_definition: { field_type: '文本' } })).toBe('')
    expect(getScopedDefaultValue({ field_definition: { field_type: '文本' }, default_value: '' })).toBe('')
    expect(getScopedDefaultValue({ field_definition: { field_type: '日期' }, default_value: 'x' })).toBe('')
    expect(getScopedDefaultValue({ field_definition: { field_type: '单选' }, default_value: 'x', inline_mark: 1 })).toBe('x')
    expect(getScopedDefaultValue({ field_definition: { field_type: '文本' }, default_value: '甲\n乙' })).toBe('甲\n乙')
    expect(getScopedDefaultValue({ field_definition: { field_type: '文本' }, default_value: '甲\n乙' }, true)).toBe('甲')
  })

  it('computeMergeSpans distributes columns evenly with the remainder first', () => {
    expect(computeMergeSpans(4, 0)).toEqual([1, 1, 1, 1])
    expect(computeMergeSpans(4, 5)).toEqual([1, 1, 1, 1])
    expect(computeMergeSpans(4, 2)).toEqual([2, 2])
    expect(computeMergeSpans(5, 2)).toEqual([3, 2])
    expect(computeMergeSpans(3, 3)).toEqual([1, 1, 1])
  })

  it('computeLabelValueSpans keeps at least one column on each side', () => {
    expect(computeLabelValueSpans(2)).toEqual({ labelSpan: 1, valueSpan: 1 })
    expect(computeLabelValueSpans(5)).toEqual({ labelSpan: 2, valueSpan: 3 })
    expect(computeLabelValueSpans(10)).toEqual({ labelSpan: 4, valueSpan: 6 })
  })

  it('renderCellHtml guards missing definitions, prefers the cell default and renders controls', () => {
    const renderers = createPreviewCellRenderers({
      toRendererField: (ff) => ff.field_definition,
      getCellValue: (ff) => ff.default_value || '',
      getInlineValue: (ff) => ff.default_value || '',
      renderFallback: () => '<fallback></fallback>',
      resolveHostGroups: () => [],
      getPaperOrientation: () => 'portrait',
    })
    expect(renderers.renderCellHtml({})).toBe('<span class="fill-line"></span>')
    expect(renderers.renderCellHtml(null)).toBe('<span class="fill-line"></span>')
    expect(renderers.renderCellHtml({ field_definition: { field_type: '文本' }, default_value: '甲\n乙' }))
      .toBe('甲<br>乙')
    expect(renderers.renderCellHtml({ field_definition: { field_type: '单选', options: ['甲'] } }))
      .toContain('choice-atom')
    expect(renderers.renderCellHtml({ field_definition: { field_type: '文本' } }, 6))
      .toContain('fill-line')
  })

  it('getInlineRows splits multiline defaults, repeats controls and pads with fallbacks', () => {
    const renderers = createPreviewCellRenderers({
      toRendererField: (ff) => ff.field_definition,
      getCellValue: () => '',
      getInlineValue: (ff) => ff.default_value || '',
      renderFallback: (field) => `<fallback>${field.field_type}</fallback>`,
      resolveHostGroups: () => [],
      getPaperOrientation: () => 'portrait',
    })
    const fields = [
      { field_definition: { field_type: '单选', options: ['甲'] } },
      { field_definition: { field_type: '文本' }, default_value: '一\n二\n' },
      { field_definition: { field_type: '文本' } },
    ]
    const rows = renderers.getInlineRows(fields)
    expect(rows).toHaveLength(2)
    expect(rows[0][1]).toContain('一')
    expect(rows[1][1]).toContain('二')
    expect(rows[0][0]).toBe(rows[1][0])
    expect(rows[0][0]).toContain('choice-atom')
    expect(rows[1][2]).toContain('fill-line')
    expect(rows[0][1]).toContain('一')
    const fallbackOnly = createPreviewCellRenderers({
      toRendererField: (ff) => ff.field_definition,
      getCellValue: () => '',
      getInlineValue: (ff) => ff.default_value || '',
      renderFallback: (field) => `<fallback>${field.field_type}</fallback>`,
      resolveHostGroups: () => [],
      getPaperOrientation: () => 'portrait',
    })
    const mixed = fallbackOnly.getInlineRows([
      { field_definition: { field_type: '文本' }, default_value: '一\n二' },
      { field_definition: { field_type: '数值' }, default_value: '甲\n乙\n丙' },
    ])
    expect(mixed).toHaveLength(3)
    expect(mixed[0][0]).toContain('一')
    expect(mixed[2][0]).toContain('<fallback>文本</fallback>')
    expect(mixed[2][1]).toContain('丙')
    expect(renderers.getInlineRows([])).toEqual([[]])
    const escapeOnly = createPreviewCellRenderers({
      toRendererField: (ff) => ff.field_definition,
      getCellValue: () => '',
      getInlineValue: (ff) => ff.default_value || '',
      renderFallback: () => 'fb',
      resolveHostGroups: () => [],
      getPaperOrientation: () => 'portrait',
    })
    const escaped = escapeOnly.getInlineRows([{ field_definition: { field_type: '文本' }, default_value: '<b>&"x</b>\n二' }])
    expect(escaped[0][0]).toContain('&lt;b&gt;&amp;"x&lt;/b&gt;')
    expect(escaped[0][0]).not.toContain('&quot;')
  })

  it('getInlineColumnCms scales planned fractions by the orientation-resolved width', () => {
    const renderers = createPreviewCellRenderers({
      toRendererField: (ff) => ff.field_definition,
      getCellValue: () => '',
      getInlineValue: () => '',
      renderFallback: () => 'fb',
      resolveHostGroups: (fields) => [{ type: 'inline', fields }],
      getPaperOrientation: () => 'landscape',
    })
    const fields = [{ field_definition: { field_type: '文本', label: '甲' } }]
    const cms = renderers.getInlineColumnCms(fields)
    expect(cms).toHaveLength(1)
    expect(cms[0]).toBeGreaterThan(10)
    const fillChars = renderers.getInlineFillChars(fields)
    expect(fillChars).toHaveLength(1)
    expect(Number.isInteger(fillChars[0])).toBe(true)
    expect(fillChars[0]).toBeGreaterThan(0)
  })
})

describe('fieldTypeAvailability', () => {
  it('restricts multiselect authoring to the Saimeisi database', () => {
    expect(DB_TYPE_SAIMEISI).toBe('赛美斯')
    expect(DB_TYPE_OTHER).toBe('其他')
    expect(allowsMultiselect('赛美斯')).toBe(true)
    expect(allowsMultiselect('其他')).toBe(false)
    expect(allowsMultiselect(null)).toBe(false)
    expect(isMultiselectFieldType('多选')).toBe(true)
    expect(isMultiselectFieldType('多选（纵向）')).toBe(true)
    expect(isMultiselectFieldType('单选')).toBe(false)
  })

  it('buildFieldTypeOptions keeps the current multiselect type disabled for other databases', () => {
    const all = ['文本', '多选', '单选', '多选（纵向）']
    expect(buildFieldTypeOptions(all, '赛美斯', '单选').every((o) => !o.disabled)).toBe(true)
    const restricted = buildFieldTypeOptions(all, '其他', '多选')
    expect(restricted.map((o) => o.value)).toEqual(['文本', '多选', '单选'])
    expect(restricted.find((o) => o.value === '多选')).toEqual({ value: '多选', label: '多选', disabled: true })
    expect(buildFieldTypeOptions([], '其他', '多选')).toEqual([])
    expect(buildFieldTypeOptions(null, '赛美斯', '多选')).toEqual([])
  })
})

describe('fieldDefinitionVisibility', () => {
  it('hides label and log-row types from the field library', () => {
    expect(isVisibleInFieldLibrary(null)).toBe(false)
    expect(isVisibleInFieldLibrary({ field_type: '文本' })).toBe(true)
    expect(isVisibleInFieldLibrary({ field_type: '标签' })).toBe(false)
    expect(isVisibleInFieldLibrary({ field_type: '日志行' })).toBe(false)
    expect(isLabelFieldDefinition({ field_type: '标签' })).toBe(true)
    expect(isLabelFieldDefinition({ field_type: '文本' })).toBe(false)
    expect(isLabelFieldDefinition(null)).toBe(false)
  })

  it('builds create payloads with structural defaults', () => {
    expect(buildFieldDefinitionCreatePayload(null)).toEqual({
      variable_name: undefined, label: undefined, field_type: undefined,
      integer_digits: null, decimal_digits: null, date_format: null,
      codelist_id: null, unit_id: null, is_multi_record: 0, table_type: '固定行', order_index: null,
    })
    expect(buildFieldDefinitionCreatePayload({ variable_name: 'OID1', is_multi_record: 1, order_index: 3 }))
      .toMatchObject({ variable_name: 'OID1', is_multi_record: 1, order_index: 3, table_type: '固定行' })
  })
})
