import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { genFieldVarName } from '../src/composables/useApi.js'
import { buildCopyVariableName } from '../src/composables/fieldDefinitionAutocomplete.js'
import {
  applyLabelOidTransition,
  buildBindingProfileCommand,
  buildDefinitionPayload,
  buildFieldProfileCommand,
  buildLabelOidSession,
  ensureLabelVariableName,
  isSystemFieldVariableName,
  resolveLabelOidSeedDefinition,
  withLabelOidSeed,
} from '../src/composables/formDesignerPropertyEditor.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function functionBody(name) {
  const start = formDesignerSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `should locate ${name}`)
  // Skip parameter list (which may contain destructuring braces) before finding the body.
  let depth = 0
  let bodyStart = -1
  let inParams = false
  for (let index = start; index < formDesignerSource.length; index += 1) {
    const ch = formDesignerSource[index]
    if (ch === '(') {
      depth += 1
      inParams = true
      continue
    }
    if (ch === ')') {
      depth -= 1
      if (inParams && depth === 0) {
        inParams = false
        bodyStart = formDesignerSource.indexOf('{', index + 1)
        break
      }
    }
  }
  assert.notEqual(bodyStart, -1, `${name} should have a body brace after params`)
  depth = 0
  for (let index = bodyStart; index < formDesignerSource.length; index += 1) {
    if (formDesignerSource[index] === '{') depth += 1
    if (formDesignerSource[index] === '}') depth -= 1
    if (depth === 0) return formDesignerSource.slice(bodyStart + 1, index)
  }
  assert.fail(`${name} should have a complete body`)
}

// ── isSystemFieldVariableName ────────────────────────────────────────────────

test('isSystemFieldVariableName accepts generated and system-derived placeholders', () => {
  assert.equal(isSystemFieldVariableName(genFieldVarName()), true)
  assert.equal(isSystemFieldVariableName('FIELD_20260101120000_ABC123'), true)
  assert.equal(isSystemFieldVariableName('FIELD_20260101120000_ABC123_copy2'), true)
  assert.equal(isSystemFieldVariableName('FIELD_20260101120000_ABC123_IMP'), true)
})

test('isSystemFieldVariableName rejects user OIDs and malformed placeholders', () => {
  assert.equal(isSystemFieldVariableName('AGE'), false)
  assert.equal(isSystemFieldVariableName('FIELD_ABC'), false)
  assert.equal(isSystemFieldVariableName('FIELD_20260101120000_abc123'), false)
  assert.equal(isSystemFieldVariableName('FIELD_20260101120_ABC123'), false)
  assert.equal(isSystemFieldVariableName(''), false)
  assert.equal(isSystemFieldVariableName(null), false)
})

// ── ensureLabelVariableName ──────────────────────────────────────────────────

test('ensureLabelVariableName keeps a valid OID untouched', () => {
  const generated = () => 'FIELD_20260101120000_GEN001'
  assert.equal(ensureLabelVariableName('AGE', generated), 'AGE')
  assert.equal(ensureLabelVariableName('FIELD_20260101120000_ABC123', generated), 'FIELD_20260101120000_ABC123')
})

test('ensureLabelVariableName replaces empty, whitespace, null, and invalid OIDs with the generated value', () => {
  const generated = () => 'FIELD_20260101120000_GEN001'
  assert.equal(ensureLabelVariableName('', generated), 'FIELD_20260101120000_GEN001')
  assert.equal(ensureLabelVariableName('   ', generated), 'FIELD_20260101120000_GEN001')
  assert.equal(ensureLabelVariableName(null, generated), 'FIELD_20260101120000_GEN001')
  assert.equal(ensureLabelVariableName('标签A', generated), 'FIELD_20260101120000_GEN001')
})

// ── buildLabelOidSession ─────────────────────────────────────────────────────

test('buildLabelOidSession seeds the label OID from the loaded definition only', () => {
  // 加载时即标签：合法 OID（占位或用户命名）可直接复用（原地转换，不分叉）
  assert.deepEqual(buildLabelOidSession({ variable_name: 'FIELD_20260101120000_LBL001', field_type: '标签' }), {
    rememberedVariableName: null,
    labelVariableName: 'FIELD_20260101120000_LBL001',
  })
  assert.deepEqual(buildLabelOidSession({ variable_name: 'LBL_USER', field_type: '标签' }), {
    rememberedVariableName: null,
    labelVariableName: 'LBL_USER',
  })
  // 非标签但 OID 为系统占位值（简版模式典型）：也视为可原地转换的标签 OID
  assert.deepEqual(buildLabelOidSession({ variable_name: 'FIELD_20260101120000_BRIEF1', field_type: '文本' }), {
    rememberedVariableName: null,
    labelVariableName: 'FIELD_20260101120000_BRIEF1',
  })
  // 非标签且 OID 为用户定义 / 非法 / 缺失：留空，切入标签时再生成
  assert.deepEqual(buildLabelOidSession({ variable_name: 'AGE', field_type: '文本' }), {
    rememberedVariableName: null,
    labelVariableName: null,
  })
  assert.deepEqual(buildLabelOidSession({ variable_name: '标签A', field_type: '文本' }), {
    rememberedVariableName: null,
    labelVariableName: null,
  })
  assert.deepEqual(buildLabelOidSession({ variable_name: '', field_type: '标签' }), {
    rememberedVariableName: null,
    labelVariableName: null,
  })
  assert.deepEqual(buildLabelOidSession(null), { rememberedVariableName: null, labelVariableName: null })
})

// ── withLabelOidSeed / resolveLabelOidSeedDefinition ─────────────────────────

test('withLabelOidSeed captures the creation-time variable_name and field_type', () => {
  const draft = withLabelOidSeed({
    id: '__draft__',
    __draft: true,
    field_definition: { id: '__draft__', variable_name: 'FIELD_20260101120000_DRAFT1', field_type: '文本', label: '新字段' },
  })
  assert.deepEqual(draft.__labelOidSeed, { variable_name: 'FIELD_20260101120000_DRAFT1', field_type: '文本' })
})

test('withLabelOidSeed returns a new object without touching the input', () => {
  const input = {
    id: '__draft__',
    __draft: true,
    field_definition: { variable_name: 'AGE', field_type: '文本' },
  }
  const inputSnapshot = JSON.stringify(input)
  const draft = withLabelOidSeed(input)
  assert.notEqual(draft, input)
  assert.equal('__labelOidSeed' in input, false)
  assert.equal(JSON.stringify(input), inputSnapshot)
})

test('withLabelOidSeed keeps the other draft keys', () => {
  const draft = withLabelOidSeed({
    id: '__draft__',
    __draft: true,
    __draftOrigin: 'copy',
    order_index: 3.5,
    field_definition: { variable_name: 'TITLE', field_type: '标签' },
  })
  assert.equal(draft.id, '__draft__')
  assert.equal(draft.__draft, true)
  assert.equal(draft.__draftOrigin, 'copy')
  assert.equal(draft.order_index, 3.5)
})

test('resolveLabelOidSeedDefinition returns null for missing fields and log rows', () => {
  assert.equal(resolveLabelOidSeedDefinition(null), null)
  assert.equal(resolveLabelOidSeedDefinition({ id: 5, is_log_row: 1 }), null)
})

test('resolveLabelOidSeedDefinition returns the loaded definition for persisted fields', () => {
  const definition = { id: 7, variable_name: 'AGE', field_type: '文本' }
  assert.equal(resolveLabelOidSeedDefinition({ id: 5, is_log_row: 0, field_definition: definition }), definition)
  assert.equal(resolveLabelOidSeedDefinition({ id: 6 }), null)
})

test('resolveLabelOidSeedDefinition prefers the draft seed over the mirrored candidate definition', () => {
  const draft = withLabelOidSeed({
    id: '__draft__',
    __draft: true,
    is_log_row: 0,
    field_definition: { id: '__draft__', variable_name: 'FIELD_20260101120000_DRAFT1', field_type: '文本' },
  })
  // applyEditorToDraft 会让草稿 field_definition 镜像候选（系统占位 OID），种子仍取创建态定义
  const mirroredDraft = {
    ...draft,
    field_definition: { id: 42, variable_name: 'FIELD_20250101120000_CCCCCC', field_type: '文本', label: '年龄' },
  }
  assert.deepEqual(resolveLabelOidSeedDefinition(mirroredDraft), {
    variable_name: 'FIELD_20260101120000_DRAFT1',
    field_type: '文本',
  })
})

test('resolveLabelOidSeedDefinition ignores a leftover seed once the row is no longer a draft', () => {
  // saveDraftField 无刷新回退分支把草稿映射为 { ...f, __draft: false, ... }，陈旧种子不得生效
  const promoted = {
    id: 99,
    __draft: false,
    __labelOidSeed: { variable_name: 'FIELD_20260101120000_DRAFT1', field_type: '文本' },
    is_log_row: 0,
    field_definition: { id: 88, variable_name: 'FIELD_20260101120000_SAVED01', field_type: '标签' },
  }
  assert.equal(resolveLabelOidSeedDefinition(promoted), promoted.field_definition)
})

// ── applyLabelOidTransition ──────────────────────────────────────────────────

test('entering a label with a seeded OID reuses it without generating', () => {
  let generateCalls = 0
  const generateVariableName = () => {
    generateCalls += 1
    return 'FIELD_20260101120000_GEN001'
  }
  const session = { rememberedVariableName: null, labelVariableName: 'FIELD_20260101120000_LBL001' }

  const result = applyLabelOidTransition({
    variableName: 'AGE',
    session,
    previousType: '文本',
    nextType: '标签',
    generateVariableName,
  })

  assert.equal(result.variableName, 'FIELD_20260101120000_LBL001')
  assert.equal(generateCalls, 0)
  assert.deepEqual(result.session, { rememberedVariableName: 'AGE', labelVariableName: 'FIELD_20260101120000_LBL001' })
})

test('entering a label without a seed generates exactly once and stores the placeholder', () => {
  let generateCalls = 0
  const generateVariableName = () => {
    generateCalls += 1
    return 'FIELD_20260101120000_GEN001'
  }
  const session = buildLabelOidSession({ variable_name: 'AGE', field_type: '文本' })

  const result = applyLabelOidTransition({
    variableName: 'AGE',
    session,
    previousType: '文本',
    nextType: '标签',
    generateVariableName,
  })

  assert.equal(generateCalls, 1)
  assert.equal(result.variableName, 'FIELD_20260101120000_GEN001')
  assert.equal(result.session.labelVariableName, 'FIELD_20260101120000_GEN001')
  assert.equal(result.session.rememberedVariableName, 'AGE')
})

test('re-entering a label after leaving reuses the stored placeholder', () => {
  const generateVariableName = () => 'FIELD_20260101120000_GEN001'
  let session = buildLabelOidSession({ variable_name: 'AGE', field_type: '文本' })
  let variableName = 'AGE'

  const entered = applyLabelOidTransition({ variableName, session, previousType: '文本', nextType: '标签', generateVariableName })
  session = entered.session
  variableName = entered.variableName

  const left = applyLabelOidTransition({ variableName, session, previousType: '标签', nextType: '文本', generateVariableName })
  assert.equal(left.variableName, 'AGE')
  session = left.session

  const reentered = applyLabelOidTransition({ variableName: left.variableName, session, previousType: '文本', nextType: '标签', generateVariableName })
  assert.equal(reentered.variableName, 'FIELD_20260101120000_GEN001')
  assert.equal(reentered.session.labelVariableName, 'FIELD_20260101120000_GEN001')
})

test('leaving a label restores the remembered OID, including an empty value', () => {
  const generateVariableName = () => 'FIELD_20260101120000_GEN001'
  const entered = applyLabelOidTransition({
    variableName: '',
    session: buildLabelOidSession(null),
    previousType: '文本',
    nextType: '标签',
    generateVariableName,
  })

  const left = applyLabelOidTransition({
    variableName: entered.variableName,
    session: entered.session,
    previousType: '标签',
    nextType: '文本',
    generateVariableName,
  })

  assert.equal(left.variableName, '')
  assert.equal(left.session.rememberedVariableName, null)
})

test('leaving a label without memory keeps the current OID (label loaded directly)', () => {
  const session = buildLabelOidSession({ variable_name: 'FIELD_20260101120000_LBL001', field_type: '标签' })
  const result = applyLabelOidTransition({
    variableName: 'FIELD_20260101120000_LBL001',
    session,
    previousType: '标签',
    nextType: '文本',
    generateVariableName: () => 'FIELD_20260101120000_GEN001',
  })
  assert.equal(result.variableName, 'FIELD_20260101120000_LBL001')
  assert.deepEqual(result.session, session)
})

test('non-label to non-label and label to label switches are no-ops', () => {
  const generateVariableName = () => 'FIELD_20260101120000_GEN001'
  const session = { rememberedVariableName: null, labelVariableName: null }
  const nonLabel = applyLabelOidTransition({ variableName: 'AGE', session, previousType: '文本', nextType: '数值', generateVariableName })
  assert.equal(nonLabel.variableName, 'AGE')
  assert.deepEqual(nonLabel.session, session)

  const labelSession = { rememberedVariableName: 'AGE', labelVariableName: 'FIELD_20260101120000_LBL001' }
  const label = applyLabelOidTransition({ variableName: 'FIELD_20260101120000_LBL001', session: labelSession, previousType: '标签', nextType: '标签', generateVariableName })
  assert.equal(label.variableName, 'FIELD_20260101120000_LBL001')
  assert.deepEqual(label.session, labelSession)
})

test('applyLabelOidTransition never mutates its inputs', () => {
  const session = { rememberedVariableName: null, labelVariableName: null }
  const inputSnapshot = JSON.stringify(session)
  applyLabelOidTransition({
    variableName: 'AGE',
    session,
    previousType: '文本',
    nextType: '标签',
    generateVariableName: () => 'FIELD_20260101120000_GEN001',
  })
  assert.equal(JSON.stringify(session), inputSnapshot)
})

// ── 命令集成：编辑会话迁移 + buildBindingProfileCommand ────────────────────────

function simulateEditingSession({ definition, editor }) {
  let state = { ...editor }
  let session = buildLabelOidSession(definition)
  let generated = 0
  const generateVariableName = () => {
    generated += 1
    return `FIELD_20260101120000_GEN${String(generated).padStart(3, '0')}`
  }
  return {
    switchType(nextType) {
      const result = applyLabelOidTransition({
        variableName: state.variable_name,
        session,
        previousType: state.field_type,
        nextType,
        generateVariableName,
      })
      session = result.session
      state = { ...state, variable_name: result.variableName, field_type: nextType }
    },
    setVariableName(value) {
      state = { ...state, variable_name: value }
    },
    editorState: () => ({ ...state }),
  }
}

test('persisted label round trip (label → text → clear → label) saves update_shared with the original OID', () => {
  const sim = simulateEditingSession({
    definition: { variable_name: 'FIELD_20260101120000_LBL001', field_type: '标签' },
    editor: { variable_name: 'FIELD_20260101120000_LBL001', field_type: '标签', label: '知情同意' },
  })
  sim.switchType('文本')
  sim.setVariableName('')
  sim.switchType('标签')

  const command = buildBindingProfileCommand({
    currentDefinitionId: 5,
    currentDefinitionOid: 'FIELD_20260101120000_LBL001',
    editorState: sim.editorState(),
  })

  assert.equal(command.definition_operation.operation, 'update_shared')
  assert.equal(command.definition_operation.update_shared.target_definition_id, 5)
  assert.equal(command.definition_operation.update_shared.definition.variable_name, 'FIELD_20260101120000_LBL001')
  assert.equal(command.definition_operation.update_shared.definition.field_type, '标签')
  assert.equal(command.binding.mode, 'keep')
})

test('placeholder text field with a typed AGE switched to label converts in place (update_shared keeps FIELD_x)', () => {
  const sim = simulateEditingSession({
    definition: { variable_name: 'FIELD_20260101120000_BRIEF1', field_type: '文本' },
    editor: { variable_name: 'FIELD_20260101120000_BRIEF1', field_type: '文本', label: '年龄' },
  })
  sim.setVariableName('AGE')
  sim.switchType('标签')

  const command = buildBindingProfileCommand({
    currentDefinitionId: 5,
    currentDefinitionOid: 'FIELD_20260101120000_BRIEF1',
    editorState: sim.editorState(),
  })

  assert.equal(command.definition_operation.operation, 'update_shared')
  assert.equal(command.definition_operation.update_shared.definition.variable_name, 'FIELD_20260101120000_BRIEF1')
  assert.equal(command.definition_operation.update_shared.definition.variable_name !== 'AGE', true)
})

test('user-OID text field AGE switched to label forks with a non-empty placeholder, never AGE', () => {
  const sim = simulateEditingSession({
    definition: { variable_name: 'AGE', field_type: '文本' },
    editor: { variable_name: 'AGE', field_type: '文本', label: '年龄' },
  })
  sim.switchType('标签')

  const command = buildBindingProfileCommand({
    currentDefinitionId: 5,
    currentDefinitionOid: 'AGE',
    editorState: sim.editorState(),
  })

  assert.equal(command.definition_operation.operation, 'create_or_restore')
  const forkedOid = command.definition_operation.create_or_restore.definition.variable_name
  assert.equal(isSystemFieldVariableName(forkedOid), true)
  assert.equal(forkedOid !== 'AGE', true)
  assert.equal(command.binding.mode, 'operation_result')
})

test('candidate LIB picked then switched to label is not a candidate rebind and never targets LIB', () => {
  const sim = simulateEditingSession({
    definition: { variable_name: 'BASE', field_type: '文本' },
    editor: { variable_name: 'BASE', field_type: '文本', label: '基础字段' },
  })
  sim.setVariableName('LIB')
  sim.switchType('标签')

  const command = buildBindingProfileCommand({
    currentDefinitionId: 5,
    currentDefinitionOid: 'BASE',
    editorState: sim.editorState(),
    selectedDefinitionId: 8,
    candidateOid: 'LIB',
  })

  assert.notEqual(command.binding.mode, 'existing')
  assert.notEqual(command.binding.target_field_definition_id, 8)
  assert.equal(command.definition_operation.operation, 'create_or_restore')
  assert.equal(command.definition_operation.create_or_restore.definition.variable_name !== 'LIB', true)
})

test('draft re-selection after picking a candidate seeds from the creation snapshot, never the candidate', () => {
  const draft = withLabelOidSeed({
    id: '__draft__',
    __draft: true,
    is_log_row: 0,
    field_definition: { id: '__draft__', variable_name: 'FIELD_20260101120000_DRAFT1', field_type: '文本', label: '新字段' },
  })
  // 草稿 field_definition 已镜像候选（系统占位 OID，简版模式典型）
  const candidate = { id: 42, variable_name: 'FIELD_20250101120000_CCCCCC', field_type: '文本', label: '年龄' }
  const mirroredDraft = { ...draft, field_definition: { ...candidate } }

  // 重选草稿行：会话以创建态种子初始化，而不是候选占位 OID
  let session = buildLabelOidSession(resolveLabelOidSeedDefinition(mirroredDraft))
  assert.equal(session.labelVariableName, 'FIELD_20260101120000_DRAFT1')

  // 再次点击候选并切换 文本→标签（编辑器当前 OID 为候选占位值）
  const selectedDefinitionId = candidate.id
  const candidateOid = candidate.variable_name
  const candidateDefinitionPayload = buildDefinitionPayload(candidate)
  const transition = applyLabelOidTransition({
    variableName: candidateOid,
    session,
    previousType: '文本',
    nextType: '标签',
    generateVariableName: () => 'FIELD_20260101120000_GEN001',
  })
  session = transition.session

  const command = buildFieldProfileCommand({
    editorState: { variable_name: transition.variableName, label: candidate.label, field_type: '标签' },
    selectedDefinitionId,
    candidateOid,
    candidateDefinitionPayload,
  })

  assert.equal(command.definition_operation.operation, 'create_or_restore')
  assert.equal(command.binding.mode, 'operation_result')
  assert.equal(command.definition_operation.create_or_restore.definition.variable_name, 'FIELD_20260101120000_DRAFT1')
  // 永不换绑候选、永不共享更新候选定义（否则候选定义会被悄悄改成隐藏标签）
  assert.notEqual(command.binding.mode, 'existing')
  assert.notEqual(command.definition_operation.operation, 'update_shared')
})

// ── FormDesignerTab 源码接线 ──────────────────────────────────────────────────

test('designer type selector is controlled and routes through onDesignerFieldTypeChange', () => {
  assert.match(
    formDesignerSource,
    /<el-select\s+:model-value="editProp\.field_type"[\s\S]*?@update:model-value="onDesignerFieldTypeChange"/,
  )
  assert.doesNotMatch(formDesignerSource, /v-model="editProp\.field_type"/)
})

test('onDesignerFieldTypeChange runs the label OID transition with genFieldVarName', () => {
  const body = functionBody('onDesignerFieldTypeChange')
  assert.match(body, /applyLabelOidTransition\(\{/)
  assert.match(body, /generateVariableName: genFieldVarName/)
  assert.match(body, /editProp\.variable_name = next\.variableName/)
  assert.match(body, /editProp\.field_type = nextType/)
})

test('selectField resets the label OID session before the log-row branch', () => {
  const body = functionBody('selectField')
  const resetIndex = body.indexOf('labelOidSession = buildLabelOidSession(')
  const logRowBranch = body.indexOf('if (ff.is_log_row)')
  assert.notEqual(resetIndex, -1, 'selectField should rebuild labelOidSession')
  assert.notEqual(logRowBranch, -1, 'selectField should keep its log-row branch')
  assert.ok(resetIndex < logRowBranch, 'session reset must precede the log-row branch')
  assert.match(body, /labelOidSession = buildLabelOidSession\(resolveLabelOidSeedDefinition\(ff\)\)/)
})

test('newField wraps its draft object literal with withLabelOidSeed', () => {
  assert.match(functionBody('newField'), /withLabelOidSeed\(\{/)
})

test('regular-field copy drafts carry the creation-time label OID seed', () => {
  // 镜像 designerFieldCopy.test.js 的运行时抽取方式：buildCopyDraft 按固定参数求值，
  // 种子必须内联构造（等价 withLabelOidSeed），不得引入新的模块级标识符。
  const buildCopyDraft = new Function(
    'ff',
    'definitions',
    'formId',
    'DRAFT_FIELD_ID',
    'buildCopyVariableName',
    'buildFormFieldCreatePayload',
    functionBody('buildCopyDraft'),
  )
  const ff = {
    order_index: 4,
    field_definition: { id: 10, variable_name: 'TEST', field_type: '文本', label: '测试字段' },
  }
  const draft = buildCopyDraft(ff, [{ variable_name: 'TEST' }], 8, '__draft__', buildCopyVariableName, () => ({}))
  assert.equal(draft.field_definition.variable_name, 'TEST_copy')
  assert.deepEqual(draft.__labelOidSeed, { variable_name: 'TEST_copy', field_type: '文本' })
})

test('selectAutocompleteCandidate never assigns the label OID session', () => {
  assert.doesNotMatch(functionBody('selectAutocompleteCandidate'), /labelOidSession\s*=/)
})

test('resetFieldPropAutoSaveState resets the label OID session unconditionally', () => {
  const body = functionBody('resetFieldPropAutoSaveState')
  assert.match(body, /labelOidSession = buildLabelOidSession\(\)/)
})

test('saveSelectedFieldProp normalizes the label OID on editProp before snapshotting', () => {
  const body = functionBody('saveSelectedFieldProp')
  const normalizeIndex = body.indexOf('ensureLabelVariableName(editProp.variable_name, genFieldVarName)')
  const snapshotIndex = body.indexOf('buildFieldPropSnapshot()')
  assert.notEqual(normalizeIndex, -1, 'saveSelectedFieldProp should normalize label OIDs')
  assert.notEqual(snapshotIndex, -1, 'saveSelectedFieldProp should build a snapshot')
  assert.ok(normalizeIndex < snapshotIndex, 'normalization must run before buildFieldPropSnapshot()')
  // 既有非标签守卫保持不变（字节级契约由 runtime 测试锁定）
  assert.match(body, /!\['标签', '日志行'\]\.includes\(snapshot\.field_type\) &&\n\s*!isValidRequiredOid\(snapshot\.variable_name\)/)
})

test('saveDraftField guards non-label OIDs and resolves the label placeholder', () => {
  const body = functionBody('saveDraftField')
  assert.match(body, /!\['标签', '日志行'\]\.includes\(fd\.field_type\) && !isValidRequiredOid\(fd\.variable_name\)/)
  assert.match(body, /ElMessage\.warning\(OID_ERROR\)/)
  assert.match(body, /ensureLabelVariableName\(fd\.variable_name, genFieldVarName\)/)
  // 解析出的 OID 同时用于冲突检查与 editorState（历史 redo 复用同一占位值）
  const guardIndex = body.indexOf('isValidRequiredOid(fd.variable_name)')
  const conflictIndex = body.indexOf('findOidConflict(')
  assert.ok(guardIndex !== -1 && conflictIndex !== -1 && guardIndex < conflictIndex)
  assert.match(body, /findOidConflict\(\n?\s*fieldDefs\.value\.filter\(isVisibleInFieldLibrary\),\n?\s*draftVariableName,/)
  assert.match(body, /variable_name: draftVariableName,/)
})
