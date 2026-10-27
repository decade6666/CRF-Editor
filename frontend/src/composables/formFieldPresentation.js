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

// 设计器字段列表的行标签：沿用覆盖标签/定义标签，log 行为空时回退默认提示（与预览文案一致）
export function getFormFieldListLabel(formField) {
  return getFormFieldDisplayLabel(formField) || (isLogRowField(formField) ? '以下为log行' : '')
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

// ── 单横向表格编辑守卫（R2/R6）────────────────────────────────────────────
// 与后端 inline_table_guard 同一业务规则：横向块 = 实际字段顺序里连续 truthy
// inline_mark 的一段；允许 after <= max(1, before)（遗留多块可保留或减少）。
// 共享用例表：backend/tests/fixtures/inline_table_block_cases.json。

export const INLINE_TABLE_LIMIT_MESSAGE = '单个表单最多允许一个横向表格，本次操作会新增横向表格，已取消操作'

// 复用 buildFormDesignerRenderGroups 的分组语义（不引入第二套分组算法）：
// 先按 order_index/id 排序，再统计 inline 组数，使数组原序（如草稿行追加）
// 不会伪造出第二个横向块。
export function countInlineTableBlocks(fields) {
  const sorted = [...(fields || [])].sort(
    (a, b) =>
      (a?.order_index ?? ORDER_INDEX_FALLBACK) - (b?.order_index ?? ORDER_INDEX_FALLBACK) ||
      (a?.id ?? 0) - (b?.id ?? 0),
  )
  return buildFormDesignerRenderGroups(sorted).filter((group) => group.type === 'inline').length
}

// R6 兼容基线：合规表单（≤1 块）不得增加；遗留多块可维持或递减。
export function isInlineTableCountAllowed(beforeCount, afterCount) {
  return afterCount <= Math.max(1, beforeCount)
}
