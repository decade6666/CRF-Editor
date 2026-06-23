// Word 预览/导出页面宽度契约（与后端 export_service.py 对齐）
// PORTRAIT/LANDSCAPE_CONTENT_WIDTH_CM 必须与后端同名常量保持一致。
export const AVAILABLE_CM_PORTRAIT = 14.66
export const AVAILABLE_CM_LANDSCAPE = 23.36

export function shouldUseLandscapePreview(renderGroups) {
  return renderGroups.some(group => group.type === 'inline' && group.fields.length > 4)
}

/**
 * 镜像后端 _classify_form_layout 的 mixed_landscape 判定：
 * has_regular && has_inline && max_inline_block_width > 4 && paper_orientation !== 'portrait'。
 * mixed_landscape 模式下后端对 normal field group 也使用 LANDSCAPE 宽度（23.36cm）。
 * @param {Array<{type:string, fields:Array}>} renderGroups - buildFormDesignerRenderGroups 输出
 * @param {string} paperOrientation - 'auto' | 'portrait' | 'landscape'
 */
export function isMixedLandscape(renderGroups, paperOrientation = 'auto') {
  if (paperOrientation === 'portrait') return false
  const groups = renderGroups || []
  const hasRegular = groups.some(g => g.type === 'normal' && g.fields.length > 0)
  const inlineWidths = groups
    .filter(g => g.type === 'inline')
    .map(g => g.fields.length)
  const maxInlineBlock = inlineWidths.length ? Math.max(...inlineWidths) : 0
  return hasRegular && maxInlineBlock > 4
}

/**
 * 解析 normal 表的可用内容宽度（cm），用于填写线下划线根数自适应。
 * 与后端 _build_form_table 一致：可用宽度为 LANDSCAPE 当且仅当
 *   ① 显式 paper_orientation === 'landscape'（legacy force_landscape），或
 *   ② mixed_landscape 模式（auto 下普通字段 + 连续 inline>4）。
 * 否则为 PORTRAIT。
 * @param {Array} renderGroups - 整张表单的 render groups（非单个分组）
 * @param {string} paperOrientation - 'auto' | 'portrait' | 'landscape'
 * @returns {number} 可用内容宽度（cm）
 */
export function resolveNormalTableAvailableCm(renderGroups, paperOrientation = 'auto') {
  const landscape =
    paperOrientation === 'landscape' || isMixedLandscape(renderGroups, paperOrientation)
  return landscape ? AVAILABLE_CM_LANDSCAPE : AVAILABLE_CM_PORTRAIT
}

/**
 * 解析单个 inline 表（横向分组）的可用内容宽度（cm），用于填写线根数自适应。
 * 与后端 _add_inline_table 收到的 available_cm 一致：
 *   显式 portrait → PORTRAIT（force_portrait 抑制临时横版）；
 *   显式 landscape → LANDSCAPE；
 *   mixed_landscape 表单 → LANDSCAPE（所有 inline 组）；
 *   否则按该 inline 组自身宽度：>4 列 → LANDSCAPE（needs_temporary_landscape），≤4 列 → PORTRAIT。
 * @param {Array} renderGroups - 整张表单的 render groups
 * @param {{type:string, fields:Array}} group - 当前 inline 分组
 * @param {string} paperOrientation - 'auto' | 'portrait' | 'landscape'
 */
export function resolveInlineTableAvailableCm(renderGroups, group, paperOrientation = 'auto') {
  if (paperOrientation === 'portrait') return AVAILABLE_CM_PORTRAIT
  if (paperOrientation === 'landscape') return AVAILABLE_CM_LANDSCAPE
  if (isMixedLandscape(renderGroups, paperOrientation)) return AVAILABLE_CM_LANDSCAPE
  if ((group?.fields?.length || 0) > 4) return AVAILABLE_CM_LANDSCAPE
  return AVAILABLE_CM_PORTRAIT
}
