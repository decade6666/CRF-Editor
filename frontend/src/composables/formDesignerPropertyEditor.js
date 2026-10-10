import { isChoiceField } from './useCRFRenderer.js'
import { isValidRequiredOid } from './oidValidation.js'

const UNIT_FIELD_TYPES = ['文本', '数值']
const DATE_FIELD_TYPES = ['日期', '日期时间', '时间']
const LABEL_FIELD_TYPE = '标签'
// 系统占位 OID 前缀规则（与 backend/src/database.py::_LABEL_PLACEHOLDER_RE 一致）：
// genFieldVarName / generate_code("FIELD") 生成值及其系统派生后缀（_copy、_IMP 等）
const SYSTEM_FIELD_VARIABLE_NAME_RE = /^FIELD_\d{14}_[A-Z0-9]{6}/

export function normalizeDateFormat(fieldType, value, dateFormatOptions, defaultDateFormats) {
  if (!DATE_FIELD_TYPES.includes(fieldType)) return null
  if (value === '') return ''
  const opts = dateFormatOptions[fieldType] || []
  return opts.includes(value) ? value : (defaultDateFormats[fieldType] ?? null)
}

export function syncFieldTypeSpecificProps(editProp, newType, dateFormatOptions, defaultDateFormats) {
  const next = { ...editProp }

  next.date_format = normalizeDateFormat(newType, next.date_format, dateFormatOptions, defaultDateFormats)

  if (!isChoiceField(newType)) next.codelist_id = null
  if (!UNIT_FIELD_TYPES.includes(newType)) next.unit_id = null
  if (newType !== '复选') next.checkbox_label = null

  if (newType !== '数值') {
    next.integer_digits = null
    next.decimal_digits = null
  }

  return next
}

/** 是否为系统生成（或系统派生）的字段 OID。 */
export function isSystemFieldVariableName(value) {
  return SYSTEM_FIELD_VARIABLE_NAME_RE.test(String(value ?? '').trim())
}

/** 标签 OID 保存兜底：合法则原样保留，否则生成系统占位值（标签永不因 OID 阻塞保存）。 */
export function ensureLabelVariableName(variableName, generateVariableName) {
  return isValidRequiredOid(variableName) ? variableName : generateVariableName()
}

/**
 * 选中字段时初始化标签 OID 会话：加载时的定义若是标签，或其 OID 为系统占位值，
 * 则该 OID 可直接作为标签 OID（原地转换，不分叉、不产生孤儿定义）；否则留空，切入标签时再生成。
 */
export function buildLabelOidSession(definition = null) {
  const variableName = definition?.variable_name
  const reusable =
    isValidRequiredOid(variableName) &&
    (definition?.field_type === LABEL_FIELD_TYPE || isSystemFieldVariableName(variableName))
  return { rememberedVariableName: null, labelVariableName: reusable ? variableName : null }
}

/** 新建/复制草稿时附加创建态 OID+类型快照（__labelOidSeed），供草稿重选中重建标签 OID 会话。 */
export function withLabelOidSeed(draft) {
  return {
    ...draft,
    __labelOidSeed: {
      variable_name: draft?.field_definition?.variable_name ?? null,
      field_type: draft?.field_definition?.field_type ?? null,
    },
  }
}

/**
 * selectField 的标签 OID 会话种子解析：缺失字段 / 日志行无种子；
 * 草稿（__draft === true）取创建态快照——其 field_definition 会随编辑器镜像候选，
 * 不能再作种子；其余（含保存后无刷新转正的行，__draft 已为 false）取加载态定义。
 */
export function resolveLabelOidSeedDefinition(formField) {
  if (!formField || formField.is_log_row) return null
  if (formField.__draft === true && formField.__labelOidSeed) return formField.__labelOidSeed
  return formField.field_definition ?? null
}

/**
 * 用户切换字段类型时的 OID 迁移（纯函数，不修改入参）：
 * 切入标签 → 记住当前 OID，换成会话标签 OID（没有则生成并记入会话）；
 * 切出标签 → 有记忆则恢复并清空记忆，否则保持当前值；其他切换不变。
 */
export function applyLabelOidTransition({ variableName, session, previousType, nextType, generateVariableName }) {
  const wasLabel = previousType === LABEL_FIELD_TYPE
  const isLabel = nextType === LABEL_FIELD_TYPE
  if (!wasLabel && isLabel) {
    const labelVariableName = ensureLabelVariableName(session.labelVariableName, generateVariableName)
    return {
      variableName: labelVariableName,
      session: { rememberedVariableName: variableName ?? '', labelVariableName },
    }
  }
  if (wasLabel && !isLabel && session.rememberedVariableName != null) {
    return {
      variableName: session.rememberedVariableName,
      session: { ...session, rememberedVariableName: null },
    }
  }
  return { variableName, session: { ...session } }
}

export function normalizeHexColorInput(value) {
  const normalized = String(value ?? '').trim().replace(/^#/, '').toUpperCase()
  if (!normalized) return null
  if (/^[0-9A-F]{3}$/.test(normalized)) {
    return normalized.split('').map(char => char + char).join('')
  }
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : null
}

/** Snapshot of form-level props editable in the designer side pane / edit dialog. */
export function buildFormPropState(form) {
  return {
    name: form?.name || '',
    code: form?.code || '',
    paper_orientation: form?.paper_orientation || 'auto',
  }
}

export function sameFormPropState(a, b) {
  if (!a || !b) return false
  return a.name === b.name && a.code === b.code && a.paper_orientation === b.paper_orientation
}

// ── 字段 profile 原子命令构造（field-profile / binding-profile 共用）────────

// 定义级 payload 的完整键集（含结构键）；历史快照的 fd 必须由此派生，防止新增键漏进回放
export const DEFINITION_PAYLOAD_KEYS = [
  'variable_name', 'label', 'field_type', 'checkbox_label',
  'integer_digits', 'decimal_digits', 'date_format',
  'codelist_id', 'unit_id', 'is_multi_record', 'table_type',
]

const INSTANCE_KEYS = [
  'required', 'label_override', 'help_text', 'default_value',
  'inline_mark', 'bg_color', 'text_color', 'label_bold', 'label_font_size',
]

// 保留结构键：随目标快照走，不参与差异判断、不被编辑态覆盖
const STRUCTURE_KEYS = ['is_multi_record', 'table_type']

// 草稿链接候选时的定义级差异键：从完整 payload 键派生（排除结构键），新增可编辑键自动参与比较
export const DRAFT_DEFINITION_DIFF_KEYS = DEFINITION_PAYLOAD_KEYS.filter(
  (key) => !STRUCTURE_KEYS.includes(key),
)

/**
 * 判定草稿保存时「链接候选后是否改了定义级属性」：候选快照与编辑态在
 * DRAFT_DEFINITION_DIFF_KEYS 上逐键一致视为无差异。无候选快照视为无差异（纯绑定）。
 */
export function sameDraftDefinitionPayload(editorState = {}, candidateDefinitionPayload = null) {
  if (candidateDefinitionPayload == null) return true
  return DRAFT_DEFINITION_DIFF_KEYS.every(
    (key) => (editorState[key] ?? null) === (candidateDefinitionPayload[key] ?? null),
  )
}

/** 从字段定义快照中提取完整 definition payload（创建/恢复/共享更新共用）。 */
export function buildDefinitionPayload(definition = {}) {
  const payload = {}
  for (const key of DEFINITION_PAYLOAD_KEYS) {
    payload[key] = definition[key] ?? null
  }
  payload.variable_name = payload.variable_name ?? ''
  payload.label = payload.label ?? ''
  payload.field_type = payload.field_type ?? '文本'
  payload.is_multi_record = payload.is_multi_record ?? 0
  payload.table_type = payload.table_type ?? '固定行'
  return payload
}

/**
 * 定义级 payload 的类型归一（DEC2 比较基线）：与编辑器同规则
 * （syncFieldTypeSpecificProps）补日期默认格式、清理类型无关键；
 * 结构键（is_multi_record/table_type）原样保留。入参为 null（无候选快照）时
 * 返回 null，便于调用方保持「无快照」语义。
 */
export function normalizeDefinitionPayload(definition, dateFormatOptions, defaultDateFormats) {
  if (definition == null) return null
  const payload = buildDefinitionPayload(definition)
  return syncFieldTypeSpecificProps(payload, payload.field_type, dateFormatOptions, defaultDateFormats)
}

/** 从实例快照提取 instance upsert 载荷（显式 null 可清值）。 */
export function buildInstanceUpsert(instance = {}, keys = INSTANCE_KEYS) {
  const payload = {}
  for (const key of keys) {
    if (key in instance) payload[key] = instance[key]
  }
  return payload
}

function buildDefinitionPayloadFromTarget(targetDefinitionPayload, editorState) {
  const structure = targetDefinitionPayload ?? editorState
  return buildDefinitionPayload({
    ...targetDefinitionPayload,
    ...editorState,
    is_multi_record: structure.is_multi_record,
    table_type: structure.table_type,
  })
}

function buildSharedDefinitionOperation(targetDefinitionId, targetDefinitionPayload, editorState) {
  if (
    targetDefinitionPayload != null &&
    sameDraftDefinitionPayload(editorState, targetDefinitionPayload)
  ) {
    return { operation: 'none' }
  }
  return {
    operation: 'update_shared',
    update_shared: {
      target_definition_id: targetDefinitionId,
      definition: buildDefinitionPayloadFromTarget(targetDefinitionPayload, editorState),
    },
  }
}

function buildCandidateRebindCommand(baseCommand, selectedDefinitionId, candidateDefinitionPayload, editorState) {
  return {
    ...baseCommand,
    definition_operation: buildSharedDefinitionOperation(
      selectedDefinitionId,
      candidateDefinitionPayload,
      editorState,
    ),
    binding: { mode: 'existing', target_field_definition_id: selectedDefinitionId },
  }
}

function buildForkCommand(baseCommand, editorState, sourceDefinitionPayload, preferredDefinitionId) {
  return {
    ...baseCommand,
    definition_operation: {
      operation: 'create_or_restore',
      create_or_restore: {
        definition: buildDefinitionPayloadFromTarget(sourceDefinitionPayload, editorState),
        ...(preferredDefinitionId != null ? { preferred_definition_id: preferredDefinitionId } : {}),
      },
    },
    binding: { mode: 'operation_result' },
  }
}

/**
 * 设计器「保存字段属性」命令：明确选候选 → 换绑；OID 变更 → 分叉；否则共享更新。
 * 传入归一化后的 currentDefinitionPayload / candidateDefinitionPayload（DEC2）时，
 * 编辑态与目标快照在 9 个可编辑键上一致即 definition_operation: none（纯绑定/纯实例更新，
 * 不重写共享定义）；省略快照保持旧行为（始终 update_shared），兼容既有调用方与测试。
 */
export function buildBindingProfileCommand({
  currentDefinitionId,
  currentDefinitionOid,
  editorState,
  selectedDefinitionId = null,
  candidateOid = null,
  preferredDefinitionId = null,
  cleanupDefinitionId = null,
  currentDefinitionPayload = null,
  candidateDefinitionPayload = null,
}) {
  const baseCommand = {
    instance: { mode: 'upsert', upsert: buildInstanceUpsert(editorState) },
    ...(cleanupDefinitionId != null ? { cleanup_definition_id: cleanupDefinitionId } : {}),
  }
  const isCandidateRebind =
    selectedDefinitionId != null &&
    selectedDefinitionId !== currentDefinitionId &&
    (candidateOid == null || editorState.variable_name === candidateOid)

  if (isCandidateRebind) {
    return buildCandidateRebindCommand(
      baseCommand,
      selectedDefinitionId,
      candidateDefinitionPayload,
      editorState,
    )
  }

  const forkSourcePayload = candidateDefinitionPayload ?? currentDefinitionPayload
  const oidChanged =
    currentDefinitionOid != null && editorState.variable_name !== currentDefinitionOid
  if (oidChanged) {
    return buildForkCommand(baseCommand, editorState, forkSourcePayload, preferredDefinitionId)
  }

  return {
    ...baseCommand,
    definition_operation: buildSharedDefinitionOperation(
      currentDefinitionId,
      currentDefinitionPayload,
      editorState,
    ),
    binding: { mode: 'keep' },
  }
}

/**
 * 新增草稿命令：绑定既有定义（OID 未改），或创建/恢复定义并绑定（含选候选后改 OID 的分叉）。
 * candidateDefinitionPayload 为点击候选时的定义快照；草稿内对定义级属性（9 键）的修改
 * 会随保存一起 update_shared 到候选定义，避免草稿修改丢失。
 */
export function buildFieldProfileCommand({
  editorState,
  selectedDefinitionId = null,
  candidateOid = null,
  preferredDefinitionId = null,
  candidateDefinitionPayload = null,
}) {
  const instance = buildInstanceUpsert(editorState)
  const isCandidateAttach =
    selectedDefinitionId != null && (candidateOid == null || editorState.variable_name === candidateOid)
  if (isCandidateAttach) {
    const command = {
      binding: { mode: 'existing', target_field_definition_id: selectedDefinitionId },
      instance: { mode: 'upsert', upsert: instance },
    }
    // 无候选快照（省略）保持「纯绑定」语义；有快照时复用共享更新的统一封装
    if (candidateDefinitionPayload != null) {
      const definitionOperation = buildSharedDefinitionOperation(
        selectedDefinitionId,
        candidateDefinitionPayload,
        editorState,
      )
      if (definitionOperation.operation !== 'none') command.definition_operation = definitionOperation
    }
    return command
  }
  return {
    definition_operation: {
      operation: 'create_or_restore',
      create_or_restore: {
        definition: buildDefinitionPayloadFromTarget(candidateDefinitionPayload, editorState),
        ...(preferredDefinitionId != null ? { preferred_definition_id: preferredDefinitionId } : {}),
      },
    },
    binding: { mode: 'operation_result' },
    instance: { mode: 'upsert', upsert: instance },
  }
}

/** 撤销「新增字段」历史：删除实例并清理当时创建的定义。 */
export function buildDeleteProfileCommand({ cleanupDefinitionId }) {
  return {
    instance: { mode: 'delete' },
    ...(cleanupDefinitionId != null ? { cleanup_definition_id: cleanupDefinitionId } : {}),
  }
}

/** 仅实例部分更新（快编、inline 切换）：定义不动、绑定不动。 */
export function buildInstanceOnlyProfileCommand({ instance }) {
  return {
    definition_operation: { operation: 'none' },
    binding: { mode: 'keep' },
    instance: { mode: 'upsert', upsert: buildInstanceUpsert(instance) },
  }
}

/**
 * 保存前解析共享写入目标（DEC3 单一决策源）：直接派生自 buildBindingProfileCommand，
 * 返回真正会被 update_shared 写入的定义 id；definition_operation 为 none（纯绑定）
 * 或 OID 分叉（新建定义）时返回 null，此时不存在对其他表单的共享影响，无需引用确认。
 */
export function resolveSharedWriteTarget(args) {
  const command = buildBindingProfileCommand(args)
  if (command.definition_operation.operation !== 'update_shared') return null
  return command.definition_operation.update_shared.target_definition_id
}

/** 从历史快照（fd 嵌套 + 实例属性）展开为编辑态，供 undo/redo 回放命令构造。 */
export function buildEditorStateFromSnapshot(snapshot = {}) {
  const fd = snapshot.fd || {}
  return {
    variable_name: fd.variable_name ?? '',
    label: fd.label ?? '',
    field_type: fd.field_type ?? '文本',
    integer_digits: fd.integer_digits ?? null,
    decimal_digits: fd.decimal_digits ?? null,
    date_format: fd.date_format ?? null,
    checkbox_label: fd.checkbox_label ?? null,
    codelist_id: fd.codelist_id ?? null,
    unit_id: fd.unit_id ?? null,
    is_multi_record: fd.is_multi_record ?? null,
    table_type: fd.table_type ?? null,
    required: snapshot.required ?? null,
    label_override: snapshot.label_override ?? null,
    help_text: snapshot.help_text ?? null,
    default_value: snapshot.default_value ?? null,
    inline_mark: snapshot.inline_mark ?? 0,
    bg_color: snapshot.bg_color ?? null,
    text_color: snapshot.text_color ?? null,
    label_bold: snapshot.label_bold ?? 1,
    label_font_size: snapshot.label_font_size ?? null,
  }
}

/**
 * 撤销/重做属性编辑回放命令（DEC4）：按正向保存实际做过的操作重建，
 * definitionUpdated 为 false 时只回放绑定 + 实例，不重写共享定义。
 * 缺省为 false（fail-closed）：省略标记的回放绝不会误写共享定义。
 */
function buildReplayDefinitionOperation(targetDefinitionId, definition) {
  if (targetDefinitionId == null) return { operation: 'none' }
  return {
    operation: 'update_shared',
    update_shared: {
      target_definition_id: targetDefinitionId,
      definition: buildDefinitionPayload(definition ?? undefined),
    },
  }
}

function buildReplayProfileCommand({
  targetDefinitionId = null,
  definition,
  binding,
  instance,
  cleanupDefinitionId = null,
}) {
  return {
    definition_operation: buildReplayDefinitionOperation(targetDefinitionId, definition),
    binding,
    instance,
    ...(cleanupDefinitionId != null ? { cleanup_definition_id: cleanupDefinitionId } : {}),
  }
}

export function buildFieldPropReplayCommand({
  entryType,
  writtenDefinitionId,
  originalDefinitionId = null,
  originalDefinitionOid = null,
  candidateBeforePayload = null,
  definitionUpdated = false,
  snapshot,
}) {
  const editorState = buildEditorStateFromSnapshot(snapshot)
  const instance = { mode: 'upsert', upsert: buildInstanceUpsert(editorState) }
  const targetDefinitionId = definitionUpdated ? writtenDefinitionId : null
  const replayProfile = (targetId, definition, binding, cleanupDefinitionId) =>
    buildReplayProfileCommand({ targetDefinitionId: targetId, definition, binding, instance, cleanupDefinitionId })

  if (entryType === 'shared') return replayProfile(targetDefinitionId, snapshot.fd, { mode: 'keep' })
  if (entryType === 'rebind-undo') {
    // 恢复候选快照时 OID 必须与当前候选定义一致，后端才接受共享更新。
    return replayProfile(targetDefinitionId, candidateBeforePayload, {
      mode: 'existing',
      target_field_definition_id: originalDefinitionId,
    })
  }
  if (entryType === 'rebind-redo') {
    return replayProfile(targetDefinitionId, snapshot.fd, {
      mode: 'existing',
      target_field_definition_id: writtenDefinitionId,
    })
  }
  if (entryType === 'fork-undo') {
    return replayProfile(null, null, { mode: 'existing', target_field_definition_id: originalDefinitionId }, writtenDefinitionId)
  }
  if (entryType === 'fork-redo') {
    return buildBindingProfileCommand({
      currentDefinitionId: originalDefinitionId,
      currentDefinitionOid: originalDefinitionOid,
      editorState,
      preferredDefinitionId: writtenDefinitionId,
    })
  }
  throw new Error('未知的属性回放类型')
}
