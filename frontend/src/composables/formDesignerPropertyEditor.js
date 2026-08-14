import { isChoiceField } from './useCRFRenderer.js'

const UNIT_FIELD_TYPES = ['文本', '数值']
const DATE_FIELD_TYPES = ['日期', '日期时间', '时间']

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

const DEFINITION_PAYLOAD_KEYS = [
  'variable_name', 'label', 'field_type', 'checkbox_label',
  'integer_digits', 'decimal_digits', 'date_format',
  'codelist_id', 'unit_id', 'is_multi_record', 'table_type',
]

const INSTANCE_KEYS = [
  'required', 'label_override', 'help_text', 'default_value',
  'inline_mark', 'bg_color', 'text_color', 'label_bold', 'label_font_size',
]

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

/** 从实例快照提取 instance upsert 载荷（显式 null 可清值）。 */
export function buildInstanceUpsert(instance = {}, keys = INSTANCE_KEYS) {
  const payload = {}
  for (const key of keys) {
    if (key in instance) payload[key] = instance[key]
  }
  return payload
}

/** 设计器「保存字段属性」命令：明确选候选 → 换绑；OID 变更 → 分叉；否则共享更新。 */
export function buildBindingProfileCommand({
  currentDefinitionId,
  currentDefinitionOid,
  editorState,
  selectedDefinitionId = null,
  candidateOid = null,
  preferredDefinitionId = null,
  cleanupDefinitionId = null,
}) {
  const definitionPayload = buildDefinitionPayload(editorState)
  const command = {
    instance: { mode: 'upsert', upsert: buildInstanceUpsert(editorState) },
  }
  if (cleanupDefinitionId != null) command.cleanup_definition_id = cleanupDefinitionId

  const isCandidateRebind =
    selectedDefinitionId != null &&
    selectedDefinitionId !== currentDefinitionId &&
    (candidateOid == null || editorState.variable_name === candidateOid)

  const oidChanged =
    currentDefinitionOid != null && editorState.variable_name !== currentDefinitionOid

  if (isCandidateRebind) {
    // 明确点击候选换绑：绑定既有定义 + 共享更新该定义（OID 与候选一致，后端校验通过）
    command.definition_operation = {
      operation: 'update_shared',
      update_shared: {
        target_definition_id: selectedDefinitionId,
        definition: definitionPayload,
      },
    }
    command.binding = { mode: 'existing', target_field_definition_id: selectedDefinitionId }
    return command
  }

  if (oidChanged) {
    command.definition_operation = {
      operation: 'create_or_restore',
      create_or_restore: {
        definition: definitionPayload,
        ...(preferredDefinitionId != null ? { preferred_definition_id: preferredDefinitionId } : {}),
      },
    }
    command.binding = { mode: 'operation_result' }
    return command
  }

  command.definition_operation = {
    operation: 'update_shared',
    update_shared: {
      target_definition_id: currentDefinitionId,
      definition: definitionPayload,
    },
  }
  command.binding = { mode: 'keep' }
  return command
}

/** 新增草稿命令：绑定既有定义（OID 未改），或创建/恢复定义并绑定（含选候选后改 OID 的分叉）。 */
export function buildFieldProfileCommand({
  editorState,
  selectedDefinitionId = null,
  candidateOid = null,
  preferredDefinitionId = null,
}) {
  const instance = buildInstanceUpsert(editorState)
  const isCandidateAttach =
    selectedDefinitionId != null && (candidateOid == null || editorState.variable_name === candidateOid)
  if (isCandidateAttach) {
    return {
      binding: { mode: 'existing', target_field_definition_id: selectedDefinitionId },
      instance: { mode: 'upsert', upsert: instance },
    }
  }
  return {
    definition_operation: {
      operation: 'create_or_restore',
      create_or_restore: {
        definition: buildDefinitionPayload(editorState),
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
 * 保存前解析共享写入目标（与 buildBindingProfileCommand 的判定顺序一致）：
 * 返回真正会被 update_shared 写入的定义 id；OID 分叉（新建定义）返回 null，
 * 此时不存在对其他表单的共享影响，无需引用确认。
 */
export function resolveSharedWriteTarget({
  currentDefinitionId,
  currentDefinitionOid,
  editorState,
  selectedDefinitionId = null,
  candidateOid = null,
}) {
  const isCandidateRebind =
    selectedDefinitionId != null &&
    selectedDefinitionId !== currentDefinitionId &&
    (candidateOid == null || editorState.variable_name === candidateOid)
  if (isCandidateRebind) return selectedDefinitionId
  const oidChanged = currentDefinitionOid != null && editorState.variable_name !== currentDefinitionOid
  if (oidChanged) return null
  return currentDefinitionId
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
