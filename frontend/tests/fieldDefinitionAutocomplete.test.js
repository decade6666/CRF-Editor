import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/composables/fieldDefinitionAutocomplete.js'),
  'utf8',
)

const formDesignerSource = readFileSync(
  resolve(import.meta.dirname, '../src/components/FormDesignerTab.vue'),
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
  test('empty and whitespace-only keywords return no candidates', async () => {
    const { buildAutocompleteCandidates } = await loadModule()
    assert.deepEqual(buildAutocompleteCandidates({ definitions: DEFINITIONS, keyword: '' }), [])
    assert.deepEqual(buildAutocompleteCandidates({ definitions: DEFINITIONS, keyword: '  ' }), [])
  })

  test('value echoes the raw untrimmed keyword for current, added, and plain states', async () => {
    const { buildAutocompleteCandidates, CANDIDATE_STATE_ADDED, CANDIDATE_STATE_CURRENT } =
      await loadModule()
    const definitions = [
      { id: 1, variable_name: 'WEIGHT', label: '体重', field_type: '数值' },
      { id: 2, variable_name: 'TEMP', label: '体温', field_type: '数值' },
      { id: 3, variable_name: 'BMI', label: '体型', field_type: '文本' },
    ]
    // 匹配走 trim 后的「体」，value 回显未修剪的原始关键词
    const result = buildAutocompleteCandidates({
      definitions,
      keyword: '  体 ',
      currentDefinitionId: 1,
      formFieldDefinitionIds: [1, 2],
    })
    const byId = new Map(result.map((item) => [item.definition.id, item]))
    assert.equal(byId.get(1).state, CANDIDATE_STATE_CURRENT)
    assert.equal(byId.get(1).value, '  体 ')
    assert.equal(byId.get(2).state, CANDIDATE_STATE_ADDED)
    assert.equal(byId.get(2).value, '  体 ')
    assert.equal(byId.get(3).state, null)
    assert.equal(byId.get(3).value, '  体 ')
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

  test('candidate pick replaces definition keys but keeps the active editor presentation', async () => {
    const { hydrateEditorFromCandidate } = await loadModule()
    const hydrated = hydrateEditorFromCandidate({
      editor: {
        field_type: '文本',
        label: '旧',
        variable_name: 'OLD',
        bg_color: 'FF0000',
        text_color: '00FF00',
        label_bold: 0,
        label_font_size: 'large',
      },
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
      instance: {
        required: 1,
        bg_color: 'FFEEDD',
        text_color: '0000FF',
        label_bold: 1,
        label_font_size: null,
      },
      normalizedDefaultValue: '5',
      normalizedInlineMark: 1,
    })
    assert.equal(hydrated.variable_name, 'NEW_DEF')
    assert.equal(hydrated.label, '新字段')
    assert.equal(hydrated.field_type, '数值')
    assert.equal(hydrated.integer_digits, 3)
    assert.equal(hydrated.default_value, '5')
    assert.equal(hydrated.inline_mark, 1)
    assert.equal(hydrated.required, 1)
    // DEC1：未保存的展示属性以编辑器为准，不被已保存实例覆盖
    assert.equal(hydrated.bg_color, 'FF0000')
    assert.equal(hydrated.text_color, '00FF00')
    assert.equal(hydrated.label_bold, 0)
    assert.equal(hydrated.label_font_size, 'large')
    assert.equal(hydrated.label_override, null)
  })

  test('keeps the default font-size sentinel from the active editor', async () => {
    const { hydrateEditorFromCandidate } = await loadModule()
    const hydrated = hydrateEditorFromCandidate({
      editor: { field_type: '文本', label_font_size: 'default' },
      definition: { variable_name: 'D', label: '字段', field_type: '文本' },
      instance: { label_font_size: null },
      normalizedDefaultValue: null,
      normalizedInlineMark: 0,
    })
    assert.equal(hydrated.label_font_size, 'default')
  })

  test('candidate pick derives pending inline/default from the editor and normalizes after hydration', () => {
    const body = /function selectAutocompleteCandidate\(item\) \{([\s\S]*?)\n\}/.exec(formDesignerSource)?.[1]
    assert.ok(body, 'should locate selectAutocompleteCandidate body')
    // DEC1：内嵌标记与默认值取编辑器当前（可能未保存）值，而非已保存实例
    assert.match(body, /if \(isSavingFieldProp\.value \|\|/)
    assert.match(body, /const currentInlineMark = editProp\.inline_mark \? 1 : 0/)
    assert.match(body, /normalizeDefaultValue\(editProp\.default_value \|\| '', !normalizedInlineMark\)/)
    // 水合后按候选类型归一（与 selectField 同规则），类型 watcher 幂等
    assert.match(
      body,
      /syncFieldTypeSpecificProps\(editProp, editProp\.field_type, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)/,
    )
    // 基线与标签 OID 会话不被候选选择改写：取消仍可完整恢复，标签 OID 保持系统托管
    assert.doesNotMatch(body, /labelOidSession\s*=/)
    assert.doesNotMatch(body, /fieldPropBaseline\.value\s*=/)
  })

  test('candidateDisplayText exposes oid, label, and field type with empty fallbacks', async () => {
    const { candidateDisplayText } = await loadModule()
    assert.deepEqual(
      candidateDisplayText({ variable_name: 'AGE', label: '年龄', field_type: '数值' }),
      { oid: 'AGE', label: '年龄', fieldType: '数值' },
    )
    assert.deepEqual(candidateDisplayText(null), { oid: '', label: '', fieldType: '' })
  })

  test('findOidConflict flags handwritten oid hitting another definition', async () => {
    const { findOidConflict } = await loadModule()
    const conflict = findOidConflict(DEFINITIONS, 'SEX', 1)
    assert.equal(conflict.id, 2)
    assert.equal(findOidConflict(DEFINITIONS, 'SEX', 2), null)
    assert.equal(findOidConflict(DEFINITIONS, '  ', 1), null)
    assert.equal(findOidConflict(DEFINITIONS, 'NOPE', 1), null)
  })

  test('buildCopyVariableName follows the backend copy suffix ladder', async () => {
    const { buildCopyVariableName } = await loadModule()
    assert.equal(buildCopyVariableName([], 'TEST'), 'TEST_copy')
    assert.equal(buildCopyVariableName(['TEST_copy'], 'TEST'), 'TEST_copy1')
    assert.equal(
      buildCopyVariableName(['TEST_copy', 'TEST_copy1', 'TEST_copy3'], 'TEST'),
      'TEST_copy2',
    )
  })

  test('buildCopyVariableName receives all definition names, including hidden definitions', async () => {
    const { buildCopyVariableName } = await loadModule()
    const definitions = [
      { variable_name: 'TEST' },
      { variable_name: 'TEST_copy', field_type: '标签' },
    ]
    assert.equal(
      buildCopyVariableName(definitions.map((definition) => definition.variable_name), 'TEST'),
      'TEST_copy1',
    )
  })

  test('module reuses shared rankFuzzyMatches and visibility filter upstream', () => {
    assert.match(source, /import \{ rankFuzzyMatches \} from '\.\/searchRanking\.js'/)
    assert.match(source, /rankFuzzyMatches\(definitions, query, candidateTexts\)/)
  })

  test('FormDesignerTab imports every CANDIDATE_STATE_* it references and keeps the default valueKey', () => {
    // 模板引用未导入的常量时徽标静默不渲染（Vue 只给 render 警告）
    const referenced = [...new Set(formDesignerSource.match(/CANDIDATE_STATE_[A-Z]+/g) || [])]
    const importMatch = formDesignerSource.match(
      /import\s*\{([^}]+)\}\s*from\s*'[^']*fieldDefinitionAutocomplete'/,
    )
    assert.ok(importMatch, 'FormDesignerTab must import from fieldDefinitionAutocomplete')
    const imported = new Set(
      importMatch[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    )
    for (const identifier of referenced) {
      assert.ok(
        imported.has(identifier),
        `${identifier} must be imported from fieldDefinitionAutocomplete`,
      )
    }
    // 两个 el-autocomplete 均不设置 value-key：保持默认 valueKey='value'，
    // 候选的 value 才会被写回 v-model 而不是 undefined
    const autocompleteTags = [...formDesignerSource.matchAll(/<el-autocomplete\b([\s\S]*?)\n\s*>\n/g)]
    assert.equal(autocompleteTags.length, 2, 'the designer keeps the OID and 字段标签 autocomplete pair')
    for (const [, attributes] of autocompleteTags) {
      assert.doesNotMatch(attributes, /value-key/)
    }
  })
})
