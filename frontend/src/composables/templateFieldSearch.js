/**
 * 模板字段查询的纯逻辑：搜索候选文本、字段/表单四组优先级排序、格式列文案、
 * 来源行文案、复制提示与分页常量。
 * 数据形状来自 GET /api/template-fields（TemplateFieldEntry，见 cross-stack-contracts §12）。
 */

import { CHECKBOX_DEFAULT_TEXT, DEFAULT_DATE_FORMATS, isChoiceField } from './useCRFRenderer.js'
import { normalizeSearchText, rankFuzzyMatches } from './searchRanking.js'

export const TEMPLATE_FIELD_PAGE_SIZE = 50

/**
 * rankFuzzyMatches 的字段级候选文本提取器：OID + 标签 + 表单级显示标签。
 * @param {object} entry - TemplateFieldEntry
 * @returns {string[]}
 */
export function templateFieldSearchTexts(entry) {
  return [entry?.variable_name, entry?.label, ...(entry?.label_aliases || [])]
}

/**
 * rankFuzzyMatches 的表单 OID 候选文本提取器（不含表单名/项目元数据）。
 * @param {object} entry - TemplateFieldEntry
 * @returns {string[]}
 */
export function templateFieldFormCodes(entry) {
  return (entry?.sources || []).map((source) => source?.form_code)
}

function hasStrongCandidate(item, keyword, getCandidates) {
  // 两个内部提取器恒返回数组（normalize 后的空值由 length 检查跳过），无需再泛化包装。
  return getCandidates(item).some((value) => {
    const text = normalizeSearchText(value)
    return text.length > 0 && text.includes(keyword)
  })
}

/** 把已排序结果按「候选文本包含关键词」划分为强匹配（精确/包含）与其余弱匹配。 */
function partitionByStrength(rankedItems, keyword, getCandidates) {
  const isStrong = (item) => hasStrongCandidate(item, keyword, getCandidates)
  return [rankedItems.filter(isStrong), rankedItems.filter((item) => !isStrong(item))]
}

/**
 * 模板字段查询专用排序：字段强匹配 > 表单 OID 强匹配 > 字段模糊 > 表单 OID 模糊。
 * 组内沿用共享 rankFuzzyMatches 的匹配强度与稳定顺序；同一entry只在其最高组出现一次；
 * 空白关键词原样返回模板顺序。不修改入参。
 * @param {object[]} entries - 模板顺序的 TemplateFieldEntry 列表
 * @param {string} keyword - 用户输入的搜索词
 * @returns {object[]}
 */
export function rankTemplateFieldMatches(entries, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword)
  if (!normalizedKeyword) return entries

  const fieldRanked = rankFuzzyMatches(entries, normalizedKeyword, templateFieldSearchTexts)
  const formRanked = rankFuzzyMatches(entries, normalizedKeyword, templateFieldFormCodes)
  const [fieldStrong, fieldWeak] = partitionByStrength(fieldRanked, normalizedKeyword, templateFieldSearchTexts)
  const [formStrong, formWeak] = partitionByStrength(formRanked, normalizedKeyword, templateFieldFormCodes)

  const seen = new Set()
  return [...fieldStrong, ...formStrong, ...fieldWeak, ...formWeak].filter((entry) => {
    if (seen.has(entry)) return false
    seen.add(entry)
    return true
  })
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
 * 单条来源的内联文案：「表单OID 表单名称（显示为：xx）」；
 * 无 OID 时仅表单名称，两者皆无（仅字段库）时为「仅字段库」。
 * @param {object} source - TemplateFieldSource
 * @returns {string}
 */
export function formatTemplateFieldSource(source) {
  if (!source) return ''
  const head = [source.form_code, source.form_name].filter(Boolean).join(' ')
  if (!head) return '仅字段库'
  const suffix = source.display_label ? `（显示为：${source.display_label}）` : ''
  return `${head}${suffix}`
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
