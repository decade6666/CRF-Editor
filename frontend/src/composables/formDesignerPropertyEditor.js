import { isChoiceField } from './useCRFRenderer.js'

const UNIT_FIELD_TYPES = ['文本', '数值']
const DATE_FIELD_TYPES = ['日期', '日期时间', '时间']

export function syncFieldTypeSpecificProps(editProp, newType, dateFormatOptions, defaultDateFormats) {
  const next = { ...editProp }

  if (DATE_FIELD_TYPES.includes(newType)) {
    const opts = dateFormatOptions[newType] || []
    if (!opts.includes(next.date_format)) next.date_format = defaultDateFormats[newType]
  } else {
    next.date_format = null
  }

  if (!isChoiceField(newType)) next.codelist_id = null
  if (!UNIT_FIELD_TYPES.includes(newType)) next.unit_id = null

  if (newType !== '数值') {
    next.integer_digits = null
    next.decimal_digits = null
  }

  return next
}

export function normalizeHexColorInput(value) {
  const normalized = String(value ?? '').trim().replace(/^#/, '').toUpperCase()
  if (!normalized) return null
  return /^[0-9A-F]{3}([0-9A-F]{3})?$/.test(normalized) ? normalized : null
}
