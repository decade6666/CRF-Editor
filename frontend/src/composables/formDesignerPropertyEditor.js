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
