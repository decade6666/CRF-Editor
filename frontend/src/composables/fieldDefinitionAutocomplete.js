/**
 * 字段库自动完成纯逻辑：候选过滤/排序、当前/已添加状态、候选选择后的编辑状态水合。
 *
 * 用于全屏设计器属性编辑器的 OID / 字段标签两个输入框（同一套字段库候选）。
 * 规则：
 * - 空输入不返回候选（由调用方在 trigger-on-focus=false 下再保证）；
 * - 候选经 isVisibleInFieldLibrary 过滤（排除「标签」「日志行」）；
 * - 排序复用共享 rankFuzzyMatches（OID + 标签双候选文本）；
 * - 当前实例引用的定义标「当前字段」；
 * - 已被当前表单其他实例引用的定义标「已添加」且不可选择（键盘/鼠标都拒绝）；
 * - 候选附带 value = 原始关键词（不修剪）：el-autocomplete 选中时先写回 item[valueKey]
 *   （默认 'value'）再 emit select，回显原输入可让被拒绝的「已添加」候选不清空输入框，
 *   且写回值始终是字符串（undefined 会触发 emit 校验告警）。
 */

import { rankFuzzyMatches } from './searchRanking.js'

export const CANDIDATE_STATE_CURRENT = 'current'
export const CANDIDATE_STATE_ADDED = 'added'

export function candidateTexts(definition) {
  return [definition?.variable_name, definition?.label]
}

export function buildAutocompleteCandidates({
  definitions,
  keyword,
  currentDefinitionId = null,
  formFieldDefinitionIds = [],
  excludeOwnFormFieldId = null,
}) {
  const keywordText = String(keyword ?? '')
  const query = keywordText.trim()
  if (!query) return []

  const scopedFormIds = new Set(
    formFieldDefinitionIds.filter((id) => id !== null && id !== undefined && id !== excludeOwnFormFieldId),
  )

  const ranked = rankFuzzyMatches(definitions, query, candidateTexts)

  return ranked.map((definition) => {
    let state = null
    if (definition.id === currentDefinitionId) {
      state = CANDIDATE_STATE_CURRENT
    } else if (scopedFormIds.has(definition.id)) {
      state = CANDIDATE_STATE_ADDED
    }
    return { definition, state, selectable: state !== CANDIDATE_STATE_ADDED, value: keywordText }
  })
}

export function candidateDisplayText(definition) {
  return {
    oid: definition?.variable_name || '',
    label: definition?.label || '',
    fieldType: definition?.field_type || '',
  }
}

/**
 * 点击候选后水合属性编辑器（DEC1）：仅替换候选定义级内容（9 个可编辑键）；
 * 编辑器中的展示属性（bg_color/text_color/label_bold/label_font_size，含未保存修改
 * 与 'default' 字号哨兵）经 ...editor 原样保留，不被已保存实例覆盖；
 * required/label_override/help_text 仍取自实例；
 * default_value / inline_mark 由调用方按候选类型归一后写入。
 */
export function hydrateEditorFromCandidate({
  editor,
  definition,
  instance = {},
  normalizedDefaultValue = null,
  normalizedInlineMark = 0,
}) {
  return {
    ...editor,
    variable_name: definition.variable_name ?? '',
    label: definition.label ?? '',
    field_type: definition.field_type ?? editor.field_type,
    integer_digits: definition.integer_digits ?? null,
    decimal_digits: definition.decimal_digits ?? null,
    date_format: definition.date_format ?? null,
    checkbox_label: definition.checkbox_label ?? null,
    codelist_id: definition.codelist_id ?? null,
    unit_id: definition.unit_id ?? null,
    default_value: normalizedDefaultValue ?? null,
    inline_mark: normalizedInlineMark,
    required: instance.required ?? editor.required,
    label_override: instance.label_override ?? null,
    help_text: instance.help_text ?? null,
  }
}

/**
 * 为字段复制生成与后端一致的最小可用 OID：X_copy、X_copy1、X_copy2……。
 * existingNames 应覆盖项目内全部字段定义，而不只是字段库可见候选。
 */
export function buildCopyVariableName(existingNames = [], sourceVariableName = '') {
  const usedNames = new Set(
    existingNames.filter((name) => name !== null && name !== undefined).map((name) => String(name)),
  )
  const baseName = `${String(sourceVariableName ?? '')}_copy`
  if (!usedNames.has(baseName)) return baseName

  let suffix = 1
  while (usedNames.has(`${baseName}${suffix}`)) suffix += 1
  return `${baseName}${suffix}`
}

/**
 * 保存前的 OID 冲突判定：手输 OID 命中其他现有定义（非当前绑定）时必须阻止，
 * 提示用户从候选中明确选择（后端唯一约束兜底）。
 */
export function findOidConflict(definitions, oid, currentDefinitionId = null) {
  const normalized = String(oid ?? '').trim()
  if (!normalized) return null
  return (
    definitions.find(
      (definition) =>
        definition.variable_name === normalized && definition.id !== currentDefinitionId,
    ) || null
  )
}
