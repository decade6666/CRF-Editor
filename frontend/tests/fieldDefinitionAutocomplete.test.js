import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/composables/fieldDefinitionAutocomplete.js'),
  'utf8',
)

const DEFINITIONS = [
  { id: 1, variable_name: 'AGE', label: '年龄', field_type: '数值' },
  { id: 2, variable_name: 'SEX', label: '性别', field_type: '单选' },
  { id: 3, variable_name: 'HEIGHT', label: '身高', field_type: '数值' },
  { id: 4, variable_name: 'WEIGHT', label: '体重', field_type: '数值' },
  { id: 5, variable_name: 'LABEL_DEF', label: '章节', field_type: '标签' },
  { id: 6, variable_name: 'LOG_DEF', label: '日志', field_type: '日志行' },
]

async function loadModule() {
  return import('../src/composables/fieldDefinitionAutocomplete.js')
}

describe('fieldDefinitionAutocomplete pure logic', () => {
  test('empty keyword returns no candidates', async () => {
    const { buildAutocompleteCandidates } = await loadModule()
    const result = buildAutocompleteCandidates({ definitions: DEFINITIONS, keyword: '  ' })
    assert.deepEqual(result, [])
  })

  test('ranks candidates by shared fuzzy rules across oid and label', async () => {
    const { buildAutocompleteCandidates } = await loadModule()
    const result = buildAutocompleteCandidates({ definitions: DEFINITIONS, keyword: 'sx' })
    // 编辑距离 1 命中 SEX；HEIGHT/WEIGHT 不匹配
    assert.deepEqual(result.map((item) => item.definition.id), [2])
  })

  test('subsequence tier beats edit-distance tier (HGT → HEIGHT before WEIGHT)', async () => {
    const { buildAutocompleteCandidates } = await loadModule()
    const result = buildAutocompleteCandidates({ definitions: DEFINITIONS, keyword: 'hgt' })
    assert.deepEqual(result.map((item) => item.definition.id), [3, 4])
  })

  test('marks current definition and added definitions, added is not selectable', async () => {
    const { buildAutocompleteCandidates, CANDIDATE_STATE_ADDED, CANDIDATE_STATE_CURRENT } =
      await loadModule()
    const definitions = [
      { id: 1, variable_name: 'WEIGHT', label: '体重', field_type: '数值' },
      { id: 2, variable_name: 'TEMP', label: '体温', field_type: '数值' },
    ]
    const result = buildAutocompleteCandidates({
      definitions,
      keyword: '体',
      currentDefinitionId: 1,
      formFieldDefinitionIds: [1, 2],
    })
    const byId = new Map(result.map((item) => [item.definition.id, item]))
    assert.equal(byId.get(1).state, CANDIDATE_STATE_CURRENT)
    assert.equal(byId.get(1).selectable, true)
    assert.equal(byId.get(2).state, CANDIDATE_STATE_ADDED)
    assert.equal(byId.get(2).selectable, false)
  })

  test('excludes own form field id from added set', async () => {
    const { buildAutocompleteCandidates } = await loadModule()
    const definitions = [
      { id: 1, variable_name: 'WEIGHT', label: '体重', field_type: '数值' },
      { id: 2, variable_name: 'TEMP', label: '体温', field_type: '数值' },
    ]
    const result = buildAutocompleteCandidates({
      definitions,
      keyword: '体',
      currentDefinitionId: 1,
      formFieldDefinitionIds: [1, 2],
      excludeOwnFormFieldId: 2,
    })
    const item = result.find((entry) => entry.definition.id === 2)
    assert.equal(item.state, null)
    assert.equal(item.selectable, true)
  })

  test('returns all matches without truncation', async () => {
    const { buildAutocompleteCandidates } = await loadModule()
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: 100 + index,
      variable_name: `V${index}`,
      label: `体重字段${index}`,
      field_type: '文本',
    }))
    const result = buildAutocompleteCandidates({ definitions: many, keyword: '体重' })
    assert.equal(result.length, 30)
  })

  test('hydrates editor from candidate definition and keeps instance overrides', async () => {
    const { hydrateEditorFromCandidate } = await loadModule()
    const hydrated = hydrateEditorFromCandidate({
      editor: { field_type: '文本', label: '旧', variable_name: 'OLD' },
      definition: {
        variable_name: 'NEW_DEF',
        label: '新字段',
        field_type: '数值',
        integer_digits: 3,
        decimal_digits: 1,
        date_format: null,
        checkbox_label: null,
        codelist_id: null,
        unit_id: null,
      },
      instance: { required: 1, bg_color: 'FFEEDD', label_bold: 0, label_font_size: 'large' },
      normalizedDefaultValue: '5',
      normalizedInlineMark: 0,
    })
    assert.equal(hydrated.variable_name, 'NEW_DEF')
    assert.equal(hydrated.label, '新字段')
    assert.equal(hydrated.field_type, '数值')
    assert.equal(hydrated.integer_digits, 3)
    assert.equal(hydrated.default_value, '5')
    assert.equal(hydrated.inline_mark, 0)
    assert.equal(hydrated.required, 1)
    assert.equal(hydrated.bg_color, 'FFEEDD')
    assert.equal(hydrated.label_bold, 0)
    assert.equal(hydrated.label_font_size, 'large')
    assert.equal(hydrated.label_override, null)
  })

  test('findOidConflict flags handwritten oid hitting another definition', async () => {
    const { findOidConflict } = await loadModule()
    const conflict = findOidConflict(DEFINITIONS, 'SEX', 1)
    assert.equal(conflict.id, 2)
    assert.equal(findOidConflict(DEFINITIONS, 'SEX', 2), null)
    assert.equal(findOidConflict(DEFINITIONS, '  ', 1), null)
    assert.equal(findOidConflict(DEFINITIONS, 'NOPE', 1), null)
  })

  test('module reuses shared rankFuzzyMatches and visibility filter upstream', () => {
    assert.match(source, /import \{ rankFuzzyMatches \} from '\.\/searchRanking\.js'/)
    assert.match(source, /rankFuzzyMatches\(definitions, query, candidateTexts\)/)
  })
})
