const ORDER_INDEX_FALLBACK = Number.MAX_SAFE_INTEGER

export function normalizePreviewHexColor(value) {
  const normalized = String(value ?? '').trim().replace(/^#/, '')
  return /^[0-9A-F]{6}$/i.test(normalized) ? normalized : null
}

export function getFormFieldDisplayLabel(formField, fallback = '') {
  return formField?.label_override || formField?.field_definition?.label || fallback
}

export function getFormFieldTextColorStyle(formField) {
  const normalized = normalizePreviewHexColor(formField?.text_color)
  return normalized ? `color:#${normalized}` : ''
}

export function getFormFieldPreviewStyle(formField, defaultBackground = '') {
  const normalizedBg = normalizePreviewHexColor(formField?.bg_color)
  const normalizedText = normalizePreviewHexColor(formField?.text_color)
  const background = normalizedBg ? `background:#${normalizedBg};` : defaultBackground
  const textColor = normalizedText ? `color:#${normalizedText}` : 'color:#000000'
  return `${background}${textColor}`
}

export function isLogRowField(formField) {
  const fieldType = formField?.field_definition?.field_type || formField?.field_type
  return fieldType === '日志行' || Boolean(formField?.is_log_row)
}

export function getFormFieldStructurePreviewStyle(formField) {
  const defaultBackground = isLogRowField(formField) ? 'background:var(--preview-structure-bg);' : ''
  return getFormFieldPreviewStyle(formField, defaultBackground)
}

// 标签字号档位 -> 预览像素值；默认档位不写 font-size，沿用 CSS 默认
const LABEL_FONT_SIZE_PX = { large: '16px', small: '11px' }

export function isFormFieldLabelBold(formField) {
  // label_bold 为 0 表示不加粗；NULL/1/undefined 视为加粗以兼容旧数据
  return formField?.label_bold !== 0
}

export function getFormFieldLabelFontSizeStyle(formField) {
  const px = LABEL_FONT_SIZE_PX[formField?.label_font_size]
  return px ? `font-size:${px};` : ''
}

// 标签单元格的完整预览样式：加粗 + 字号 + 底纹/文字颜色。
// includeBackground=false 用于保留组件自有单元格底色/默认文字色的场景，仅追加自定义文字色；
// 此时 structure 不再参与样式分支，只有 includeBackground=true 时才会切到结构行灰底逻辑。
export function getFormFieldLabelPreviewStyle(formField, { structure = false, includeBackground = true } = {}) {
  let base = getFormFieldTextColorStyle(formField)
  if (includeBackground) {
    base = structure ? getFormFieldStructurePreviewStyle(formField) : getFormFieldPreviewStyle(formField)
  }
  const weight = isFormFieldLabelBold(formField) ? 'bold' : 'normal'
  return `font-weight:${weight};${getFormFieldLabelFontSizeStyle(formField)}${base}`
}

export function buildFormDesignerUnifiedSegments(fields) {
  const sorted = [...fields].sort(
    (a, b) => (a.order_index ?? ORDER_INDEX_FALLBACK) - (b.order_index ?? ORDER_INDEX_FALLBACK) || a.id - b.id,
  )
  const segments = []
  const inlineBuffer = []

  for (const field of sorted) {
    if (field.inline_mark === 1) {
      inlineBuffer.push(field)
      continue
    }

    if (inlineBuffer.length) {
      segments.push({ type: 'inline_block', fields: [...inlineBuffer] })
      inlineBuffer.length = 0
    }

    const fieldType = field.field_definition?.field_type
    if (fieldType === '标签' || fieldType === '日志行' || field.is_log_row) {
      segments.push({ type: 'full_row', fields: [field] })
    } else {
      segments.push({ type: 'regular_field', fields: [field] })
    }
  }

  if (inlineBuffer.length) {
    segments.push({ type: 'inline_block', fields: [...inlineBuffer] })
  }

  return segments
}

export function buildFormDesignerRenderGroups(fields) {
  if (!fields.length) return []

  let maxBlockWidth = 0
  let currentWidth = 0

  for (const field of fields) {
    if (field.inline_mark === 1) currentWidth += 1
    else {
      maxBlockWidth = Math.max(maxBlockWidth, currentWidth)
      currentWidth = 0
    }
  }
  maxBlockWidth = Math.max(maxBlockWidth, currentWidth)

  const groups = []
  let index = 0
  while (index < fields.length) {
    const field = fields[index]
    if (field.inline_mark) {
      const inlineFields = []
      while (index < fields.length && fields[index].inline_mark) {
        inlineFields.push(fields[index])
        index += 1
      }
      groups.push({ type: 'inline', fields: inlineFields })
    } else {
      const normalFields = []
      while (index < fields.length && !fields[index].inline_mark) {
        normalFields.push(fields[index])
        index += 1
      }
      groups.push({ type: 'normal', fields: normalFields })
    }
  }

  return groups
}
