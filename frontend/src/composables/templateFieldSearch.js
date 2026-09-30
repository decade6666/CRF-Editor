/**
 * 模板字段查询的纯逻辑：搜索候选文本、格式列文案、来源行文案、复制提示与分页常量。
 * 数据形状来自 GET /api/template-fields（TemplateFieldEntry，见任务 design.md §2.1）。
 */

import { CHECKBOX_DEFAULT_TEXT, DEFAULT_DATE_FORMATS, isChoiceField } from './useCRFRenderer.js'

export const TEMPLATE_FIELD_PAGE_SIZE = 50

/**
 * rankFuzzyMatches 的候选文本提取器：OID + 标签 + 表单级显示标签。
 * @param {object} entry - TemplateFieldEntry
 * @returns {string[]}
 */
export function templateFieldSearchTexts(entry) {
  return [entry?.variable_name, entry?.label, ...(entry?.label_aliases || [])]
}

function hasDigitValue(value) {
  return value !== null && value !== undefined
}

function formatNumericDigits(entry) {
  const parts = []
  if (hasDigitValue(entry.integer_digits)) parts.push(`整数${entry.integer_digits}位`)
  if (hasDigitValue(entry.decimal_digits)) parts.push(`小数${entry.decimal_digits}位`)
  return parts.join(' ')
}

function formatChoiceSummary(entry) {
  if (!entry.codelist_name) return '未设置字典'
  const optionsText = (entry.options || [])
    .map((option) => (option?.code ? `${option.code}=${option.decode}` : option?.decode || ''))
    .filter(Boolean)
    .join(', ')
  return `${entry.codelist_name}：${optionsText}`
}

/**
 * 格式列的展示/复制文案。
 * @param {object} entry - TemplateFieldEntry
 * @returns {string} 无格式信息时为空字符串
 */
export function formatTemplateFieldFormat(entry) {
  if (!entry) return ''
  if (entry.field_type === '数值') return formatNumericDigits(entry)
  if (['日期', '日期时间', '时间'].includes(entry.field_type)) {
    return entry.date_format || DEFAULT_DATE_FORMATS[entry.field_type] || ''
  }
  if (entry.field_type === '复选') {
    return '□' + (entry.checkbox_label || CHECKBOX_DEFAULT_TEXT)
  }
  if (isChoiceField(entry.field_type)) return formatChoiceSummary(entry)
  return ''
}

/**
 * 来源数量：放在表单上的来源数（不含仅字段库）。
 * @param {object} entry - TemplateFieldEntry
 * @returns {number}
 */
export function countTemplateFieldForms(entry) {
  return (entry?.sources || []).filter((source) => source?.form_name).length
}

/**
 * 单条来源的可读文案：「项目 版本 / 表单（显示为：xx）」，仅字段库来源尾部为「仅字段库」。
 * @param {object} source - TemplateFieldSource
 * @returns {string}
 */
export function formatTemplateFieldSource(source) {
  if (!source) return ''
  const head = [source.project_name, source.project_version].filter(Boolean).join(' ')
  const tail = source.form_name || '仅字段库'
  const suffix = source.display_label ? `（显示为：${source.display_label}）` : ''
  return `${head} / ${tail}${suffix}`
}

/**
 * 复制成功提示文案，超出 max 字符截断并补省略号。
 * @param {string} text - 被复制的文本
 * @param {number} [max] - 最大展示字符数，默认 30
 * @returns {string}
 */
export function buildCopyToastText(text, max = 30) {
  const value = String(text ?? '')
  const shown = value.length > max ? `${value.slice(0, max)}…` : value
  return `已复制 ${shown}`
}
