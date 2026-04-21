/**
 * CRF表单渲染工具 - 统一的字段控件渲染逻辑
 * 用于 SimulatedCRFForm 和 FormDesignerTab 的预览渲染
 *
 * ⚠️ 列宽规划契约（前后端对等）
 * 本文件的 computeCharWeight / buildInlineColumnDemands / buildNormalColumnDemands /
 * planWidth / planInlineColumnFractions / planNormalColumnFractions /
 * planUnifiedColumnFractions 与后端 backend/src/services/width_planning.py
 * 共享同一语义契约（权重常量、CJK 码点范围、per-slot-max 聚合、最小宽度保护、
 * 等比缩放回退）。修改任意一端需前后端对等同步，并在 backend/tests/fixtures/
 * planner_cases.json 更新跨栈 fixture。
 */

// ─────────────────────────────────────────────────────────────────────────────
// 宽度规划模块（与后端 width_planning.py 共享同一语义契约）
// ─────────────────────────────────────────────────────────────────────────────

/** 字符权重常量 */
const WEIGHT_CHINESE = 2  // 中文字符权重
const WEIGHT_ASCII = 1    // 英文/数字/标点权重
const FILL_LINE_WEIGHT = 6  // 填写线默认权重

/**
 * 计算单个字符的宽度权重
 * @param {string} char - 单个字符
 * @returns {number} 权重值
 */
function computeCharWeight(char) {
  // 使用 codePointAt 以正确处理 BMP 之外的辅助平面字符（如 𠮷 U+20BB7）
  const code = char.codePointAt(0)
  // CJK 统一汉字范围（基本区 + 扩展 A–I + 兼容汉字 + 兼容补充）
  if (
    (code >= 0x4E00 && code <= 0x9FFF) ||      // 基本区
    (code >= 0x3400 && code <= 0x4DBF) ||      // 扩展 A
    (code >= 0x20000 && code <= 0x2A6DF) ||    // 扩展 B
    (code >= 0x2A700 && code <= 0x2B73F) ||    // 扩展 C
    (code >= 0x2B740 && code <= 0x2B81F) ||    // 扩展 D
    (code >= 0x2B820 && code <= 0x2CEAF) ||    // 扩展 E
    (code >= 0x2CEB0 && code <= 0x2EBEF) ||    // 扩展 F
    (code >= 0x2EBF0 && code <= 0x2EE5F) ||    // 扩展 I
    (code >= 0x30000 && code <= 0x3134F) ||    // 扩展 G
    (code >= 0x31350 && code <= 0x323AF) ||    // 扩展 H
    (code >= 0xF900 && code <= 0xFAFF) ||      // 兼容汉字
    (code >= 0x2F800 && code <= 0x2FA1F)       // 兼容补充
  ) {
    return WEIGHT_CHINESE
  }
  return WEIGHT_ASCII
}

/**
 * 计算文本的总宽度权重
 * @param {string} text - 文本内容
 * @returns {number} 总权重
 */
export function computeTextWeight(text) {
  if (!text) return 0
  let weight = 0
  for (const char of text) {
    weight += computeCharWeight(char)
  }
  return weight
}

/**
 * 计算 choice atom 的宽度权重
 * @param {string} label - 选项标签
 * @param {boolean} hasTrailing - 是否有尾部填写线
 * @returns {number} 权重
 */
export function computeChoiceAtomWeight(label, hasTrailing) {
  // 符号（○或□）+ 空格
  let weight = 2 * WEIGHT_ASCII
  // 标签文本
  weight += computeTextWeight(label)
  // 尾部填写线
  if (hasTrailing) {
    weight += FILL_LINE_WEIGHT
  }
  return weight
}

/**
 * 构建 inline 表格各列的内容需求权重。
 * 兼容 designer 字段（{ field_definition: {...}, label_override, ... }）与
 * 运行态字段（{ field_type, label, options, ... } 扁平形态，如 SimulatedCRFForm 输入）。
 * @param {Array} fields - 字段列表
 * @returns {Array<{label: string, weight: number}>} 列需求列表
 */
export function buildInlineColumnDemands(fields) {
  if (!fields || !fields.length) return []

  return fields.map(ff => {
    if (!ff) return { label: '', weight: FILL_LINE_WEIGHT }
    // 兼容两种字段形状：designer 侧包装于 field_definition，运行态扁平在 ff 上
    const fd = ff.field_definition
    const fieldType = fd ? fd.field_type : ff.field_type
    const rawOptions = fd ? (fd.options || fd.codelist?.options || []) : (ff.options || [])
    const label = ff.label_override || (fd ? fd.label : ff.label) || ''

    if (!fieldType && !label) {
      return { label: '', weight: FILL_LINE_WEIGHT }
    }

    let weight = computeTextWeight(label)

    const defaultValue = ff.default_value
    if (defaultValue && isDefaultValueSupported(fieldType, Boolean(ff.inline_mark))) {
      const lines = normalizeDefaultValue(defaultValue).split('\n')
      for (const line of lines) {
        weight = Math.max(weight, computeTextWeight(line))
      }
    } else if (isChoiceField(fieldType)) {
      const options = normalizeChoiceOptions(rawOptions)
      if (options.length > 0) {
        const maxOptWeight = Math.max(
          ...options.map(opt => computeChoiceAtomWeight(opt.text, opt.trailingUnderscore))
        )
        weight = Math.max(weight, maxOptWeight)
      } else {
        weight = Math.max(weight, FILL_LINE_WEIGHT)
      }
    } else {
      weight = Math.max(weight, FILL_LINE_WEIGHT)
    }

    return { label, weight }
  })
}

/**
 * 规划列宽分配
 * @param {Array<number>} demands - 各列的权重需求
 * @param {number} availableWeight - 可用总宽度
 * @returns {Array<number>} 各列的比例
 */
export function planWidth(demands, availableWeight) {
  if (!demands || demands.length === 0) {
    return []
  }

  const totalDemand = demands.reduce((sum, d) => sum + d, 0)
  const columnCount = demands.length

  // 归一化：计算每列比例
  let fractions
  if (totalDemand === 0) {
    fractions = new Array(columnCount).fill(1.0 / columnCount)
  } else {
    fractions = demands.map(d => d / totalDemand)
  }

  // 检查是否超预算，应用等比缩放
  if (totalDemand > availableWeight) {
    const scale = availableWeight / totalDemand
    fractions = fractions.map(f => f * scale)
    // 重新归一化
    const totalFractions = fractions.reduce((sum, f) => sum + f, 0)
    if (totalFractions > 0) {
      fractions = fractions.map(f => f / totalFractions)
    }
  }

  return fractions
}

/**
 * 为 inline 表格规划列宽比例
 * @param {Array} fields - 字段列表
 * @returns {Array<number>} 各列的比例（0-1）
 */
export function planInlineColumnFractions(fields) {
  const demands = buildInlineColumnDemands(fields)
  if (demands.length === 0) return []
  const weights = demands.map(d => d.weight)
  return planWidth(weights, 100) // 使用 100 作为虚拟可用宽度
}

/**
 * 判断字段是否为"结构字段"（标签 / 日志行）——不参与 normal 列宽聚合
 * @param {Object} ff - 表单字段实例
 * @returns {boolean}
 */
function isStructuralField(ff) {
  const fd = ff?.field_definition
  const fieldType = fd ? fd.field_type : ff?.field_type
  return fieldType === '标签' || fieldType === '日志行' || Boolean(ff?.is_log_row)
}

/**
 * 构建 normal 表格两列（label / control）的内容需求权重。
 * 规则：
 *   1. 剔除标签 / 日志行等结构字段
 *   2. 对每个字段调用 buildInlineColumnDemands([ff])[0] 获取 control 权重
 *   3. 分别聚合 label / control 两列的 max
 *   4. 应用 max(weight, WEIGHT_ASCII * 4) 最小保护
 * @param {Array} fields - 字段列表
 * @returns {[{label: string, weight: number}, {label: string, weight: number}]}
 *          两个列需求：label 列与 control 列
 */
export function buildNormalColumnDemands(fields) {
  const effective = (fields || []).filter(ff => ff && !isStructuralField(ff))
  const minWeight = WEIGHT_ASCII * 4

  if (effective.length === 0) {
    return [
      { label: '', weight: minWeight },
      { label: '', weight: minWeight },
    ]
  }

  let labelWeight = 0
  let controlWeight = 0

  for (const ff of effective) {
    const fd = ff?.field_definition
    const labelText = ff?.label_override || (fd ? fd.label : ff?.label) || ''
    labelWeight = Math.max(labelWeight, computeTextWeight(labelText))

    const inlineDemand = buildInlineColumnDemands([ff])[0]
    if (inlineDemand) {
      controlWeight = Math.max(controlWeight, inlineDemand.weight)
    }
  }

  return [
    { label: 'label', weight: Math.max(labelWeight, minWeight) },
    { label: 'control', weight: Math.max(controlWeight, minWeight) },
  ]
}

/**
 * 为 normal 表格规划 label / control 两列比例
 * @param {Array} fields - 字段列表
 * @returns {[number, number]} [labelFraction, controlFraction]（和为 1）
 */
export function planNormalColumnFractions(fields) {
  const demands = buildNormalColumnDemands(fields)
  const weights = demands.map(d => d.weight)
  const totalWeight = weights[0] + weights[1]
  const result = planWidth(weights, totalWeight)
  if (result.length !== 2) return [0.5, 0.5]
  return [result[0], result[1]]
}

/**
 * 为 unified 表格规划列宽比例。
 * 仅 inline_block 类型 segment 参与；对每个 inline_block 计算每列的 inline 权重，
 * 然后按 per-slot-max 聚合；空 slot 使用 WEIGHT_ASCII * 4 最小保护。
 * @param {Array<{type: string, fields: Array}>} segments - unified 段落列表
 * @param {number} columnCount - 统一列数
 * @returns {Array<number>} 各列比例，长度等于 columnCount
 */
export function planUnifiedColumnFractions(segments, columnCount) {
  if (!columnCount || columnCount <= 0) return []
  const minWeight = WEIGHT_ASCII * 4
  const slotWeights = new Array(columnCount).fill(0)

  for (const segment of segments || []) {
    if (!segment || segment.type !== 'inline_block') continue
    const demands = buildInlineColumnDemands(segment.fields || [])
    const limit = Math.min(demands.length, columnCount)
    for (let i = 0; i < limit; i += 1) {
      slotWeights[i] = Math.max(slotWeights[i], demands[i].weight)
    }
  }

  const protectedWeights = slotWeights.map(w => Math.max(w, minWeight))
  const totalWeight = protectedWeights.reduce((sum, w) => sum + w, 0)
  return planWidth(protectedWeights, totalWeight || columnCount * minWeight)
}

// ─────────────────────────────────────────────────────────────────────────────
// 渲染工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将渲染字符串转为 HTML（转义 + 下划线 → fill-line span + 换行 → br）
 * @param {string} text - renderCtrl 返回的原始字符串
 * @returns {string} 安全的 HTML 字符串
 */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildFillLineHtml(length = 20) {
  const safeLength = Math.max(4, Number(length) || 20)
  const minWidth = (safeLength * 0.55).toFixed(1)
  return `<span class="fill-line" style="min-width:${minWidth}em"></span>`
}

function getChoiceSymbol(fieldType) {
  return fieldType.includes('单选') ? '○' : '□'
}

function isVerticalChoice(fieldType) {
  return ['单选（纵向）', '多选（纵向）'].includes(fieldType)
}

function normalizeChoiceOptions(rawOptions) {
  // 先按 order_index 排序，缺失时回退到 id
  const sorted = [...(rawOptions || [])].sort((a, b) => {
    const orderA = a?.order_index ?? Infinity
    const orderB = b?.order_index ?? Infinity
    if (orderA !== orderB) return orderA - orderB
    return (a?.id ?? 0) - (b?.id ?? 0)
  })
  return sorted
    .map(option => {
      if (typeof option === 'string') {
        return { text: option, trailingUnderscore: false }
      }
      return {
        text: option?.decode || '',
        trailingUnderscore: Boolean(option?.trailing_underscore),
      }
    })
    .filter(option => option.text)
}

export function isChoiceField(fieldType) {
  return ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(fieldType)
}

export function isDefaultValueSupported(fieldType, inlineMark = false) {
  if (inlineMark) return true
  return ['文本', '数值'].includes(fieldType)
}

export function normalizeDefaultValue(defaultValue, singleLine = false) {
  const normalized = String(defaultValue ?? '')
  if (!singleLine) return normalized
  return normalized.split(/\r?\n/, 1)[0]
}

function renderChoiceHtml(fieldType, rawOptions) {
  const options = normalizeChoiceOptions(rawOptions)
  if (!options.length) {
    return toHtml(renderCtrl({ field_type: fieldType, options: [] }))
  }

  const symbol = getChoiceSymbol(fieldType)
  const vertical = isVerticalChoice(fieldType)
  const maxLabelLength = Math.max(...options.map(option => option.text.length), 0)
  const separator = vertical ? '<br>' : '&nbsp;&nbsp;'

  return options.map(option => {
    const labelHtml = escapeHtml(option.text)
    // 选项文本：保证最小宽度且不换行
    const optionTextHtml = `<span style="display:inline-block;min-width:${maxLabelLength}ch;white-space:nowrap">${labelHtml}</span>`
    // 下划线后缀：对齐到底部
    const suffixHtml = option.trailingUnderscore
      ? buildFillLineHtml(12)
      : ''
    // 整个选项不拆行，对齐到底部
    return `<span style="display:inline-flex;align-items:flex-end;gap:0.2em;white-space:nowrap"><span>${symbol}</span>${optionTextHtml}${suffixHtml}</span>`
  }).join(separator)
}

export function toHtml(text) {
  if (!text) return ''
  // 转义 HTML 特殊字符（防止 XSS），保留换行
  const escaped = escapeHtml(text)
  // 将连续 4 个或以上的下划线替换为 border-bottom span
  // 每个 _ 约 0.6em 宽度
  const html = escaped.replace(/_{4,}/g, (match) => buildFillLineHtml(match.length))
  // 将紧跟在 fill-line span 之后的单位/文字包裹为 vertical-align:bottom 的 span
  // 使单位与填写线底边对齐，避免 inline-block 撑高行框导致单位偏上
  const aligned = html.replace(
    /(<\/span>)([ \t]*[^<\n]+)/g,
    (_, closeTag, content) => `${closeTag}<span style="vertical-align:bottom">${content}</span>`
  )
  // 将换行转为 <br>
  return aligned.replace(/\n/g, '<br>')
}

/**
 * 渲染字段控件（返回 HTML 字符串，供 v-html 使用）
 * 解决 _ 字符字形间距导致下划线断续的问题
 *
 * ⚠️ 输入形状契约：field 必须为扁平形态（`{field_type, options, ...}`），
 * 不接受 designer 侧 `{field_definition: {...}}` 包装体。
 * 调用方若持有包装体，需先 `ff.field_definition` 解包（参考 FormDesignerTab
 * 的 getPreviewField / VisitsTab 的 toRendererField）。与 planner
 * （buildInlineColumnDemands 等）支持双形态不同——renderer 仅接受扁平输入。
 *
 * @param {Object} field - 扁平形态字段对象
 * @returns {string} HTML 字符串
 */
export function renderCtrlHtml(field) {
  if (!field) return ''
  if (isChoiceField(field.field_type)) {
    return renderChoiceHtml(field.field_type, field.options)
  }
  return toHtml(renderCtrl(field))
}

/**
 * 渲染字段控件
 * @param {Object} field - 字段对象
 * @param {string} field.field_type - 字段类型
 * @param {Array} field.options - 选项列表（可以是字符串数组或对象数组）
 * @param {string} field.unit_symbol - 单位符号
 * @param {number} field.integer_digits - 整数位数
 * @param {number} field.decimal_digits - 小数位数
 * @param {string} field.date_format - 日期格式
 * @returns {string} 渲染后的控件字符串
 */
export function renderCtrl(field) {
  if (!field) return '________________'
  const opts = normalizeChoiceOptions(field.options).map(option => (
    option.trailingUnderscore ? `${option.text}____________________` : option.text
  ))
  const unit = field.unit_symbol ? ' ' + field.unit_symbol : ''

  function boxes(n) { return n > 0 ? '|' + '__|'.repeat(n) : '' }

  if (field.field_type === '数值') {
    const ints = field.integer_digits || 10
    const decs = field.decimal_digits ?? 2
    return boxes(ints) + (decs > 0 ? '.' + boxes(decs) : '') + unit
  }

  function renderDateFmt(fmt) {
    if (!fmt) return boxes(4) + '年' + boxes(2) + '月' + boxes(2) + '日'
    const spaceIdx = fmt.indexOf(' ')
    const datePart = spaceIdx >= 0 ? fmt.slice(0, spaceIdx) : fmt
    const timePart = spaceIdx >= 0 ? fmt.slice(spaceIdx + 1) : ''
    const hasDateChars = /[yYMdD]/.test(datePart)

    function renderPart(str, isDate) {
      let result = '', boxCount = 0, sepCount = 0
      for (const c of str) {
        const isBox = isDate ? 'yYMdD'.includes(c) : 'HhmsS'.includes(c)
        if (isBox) { boxCount++ }
        else {
          if (boxCount > 0) { result += boxes(boxCount); boxCount = 0 }
          if (isDate && (c === '-' || c === '/')) { result += ['年', '月'][sepCount] || c; sepCount++ }
          // 时间分隔符转换为中文：: 或 - 转为 时/分/秒
          else if (!isDate && (c === ':' || c === '-' || c === '：')) {
            const timeLabels = ['时', '分', '秒']
            result += timeLabels[sepCount] || c
            sepCount++
          }
          else result += c
        }
      }
      if (boxCount > 0) result += boxes(boxCount)
      // 时间部分末尾追加最后一个标签（HH:mm→分，HH:mm:ss→秒）
      if (!isDate && sepCount > 0) {
        const timeLabels = ['时', '分', '秒']
        result += timeLabels[sepCount] || ''
      }
      return result
    }

    const dateResult = hasDateChars ? renderPart(datePart, true) + '日' : renderPart(datePart, false)
    const timeResult = renderPart(timePart, false)
    return (dateResult && timeResult) ? dateResult + ' ' + timeResult : dateResult || timeResult
  }

  if (field.field_type === '日期') return renderDateFmt(field.date_format || 'yyyy-MM-dd')
  if (field.field_type === '日期时间') return renderDateFmt(field.date_format || 'yyyy-MM-dd HH:mm')
  if (field.field_type === '时间') return renderDateFmt(field.date_format || 'HH:mm')
  if (field.field_type === '单选') return (opts.length ? opts.map(o => '○ ' + o) : ['○ 是', '○ 否']).join('  ')
  if (field.field_type === '多选') return (opts.length ? opts.map(o => '□ ' + o) : ['□ 选项1', '□ 选项2']).join('  ')
  if (field.field_type === '单选（纵向）') return (opts.length ? opts.map(o => '○ ' + o) : ['○ 是', '○ 否']).join('\n')
  if (field.field_type === '多选（纵向）') return (opts.length ? opts.map(o => '□ ' + o) : ['□ 选项1', '□ 选项2']).join('\n')
  if (field.field_type === '标签') return ''
  return '________________' + unit
}
