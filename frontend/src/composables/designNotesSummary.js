// 设计备注顶栏摘要 / 悬浮提示纯函数
// 顶栏空间有限：多行备注只取第一条非空行，完整原文交给悬浮提示按原样分行（white-space: pre-wrap）

export const HEADER_NOTES_MAX_LENGTH = 60

const LINE_BREAK_RE = /\r\n|\r|\n/

/** 顶栏摘要：多行只取第一条非空行；该行内部折叠连续空白；有后续非空行或首行超长时补省略号。 */
export function summarizeDesignNotes(text, maxLength = HEADER_NOTES_MAX_LENGTH) {
  const lines = String(text ?? '').split(LINE_BREAK_RE)
  const firstNonEmpty = lines.find((line) => line.trim() !== '')
  if (firstNonEmpty === undefined) return ''
  const collapsed = firstNonEmpty.replace(/\s+/g, ' ').trim()
  const hasMore = lines.some((line, index) => index > lines.indexOf(firstNonEmpty) && line.trim() !== '')
  if (collapsed.length > maxLength) return collapsed.slice(0, maxLength) + '…'
  return hasMore ? collapsed + '…' : collapsed
}

/** 悬浮提示原文：统一换行为 \n，去掉首尾空白行（含行内空白），保留行内缩进（配合 pre-wrap 渲染）。 */
export function normalizeDesignNotesTooltip(text) {
  const lines = String(text ?? '').replace(/\r\n|\r/g, '\n').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}
