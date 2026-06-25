const LABEL_FIELD_TYPE = '标签'

const HIDDEN_FIELD_LIBRARY_TYPES = new Set(['日志行', LABEL_FIELD_TYPE])

export function isVisibleInFieldLibrary(fieldDefinition) {
  if (!fieldDefinition) return false
  return !HIDDEN_FIELD_LIBRARY_TYPES.has(fieldDefinition.field_type)
}

export function isLabelFieldDefinition(fieldDefinition) {
  return fieldDefinition?.field_type === LABEL_FIELD_TYPE
}

export function buildFieldDefinitionCreatePayload(fieldDefinition) {
  const next = fieldDefinition || {}
  return {
    variable_name: next.variable_name,
    label: next.label,
    field_type: next.field_type,
    integer_digits: next.integer_digits ?? null,
    decimal_digits: next.decimal_digits ?? null,
    date_format: next.date_format ?? null,
    codelist_id: next.codelist_id ?? null,
    unit_id: next.unit_id ?? null,
    is_multi_record: next.is_multi_record ?? 0,
    table_type: next.table_type ?? '固定行',
    order_index: next.order_index ?? null,
  }
}
