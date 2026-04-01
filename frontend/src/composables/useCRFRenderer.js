/**
 * CRF表单渲染工具 - 统一的字段控件渲染逻辑
 * 用于 SimulatedCRFForm 和 FormDesignerTab 的预览渲染
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
  const code = char.charCodeAt(0)
  // CJK 统一汉字范围（含扩展）
  if (
    (code >= 0x4E00 && code <= 0x9FFF) ||      // 基本区
    (code >= 0x3400 && code <= 0x4DBF) ||      // 扩展A
    (code >= 0x20000 && code <= 0x2A6DF) ||    // 扩展B-F
    (code >= 0x2A700 && code <= 0x2B73F) ||    // 扩展G
    (code >= 0x2B740 && code <= 0x2B81F) ||    // 扩展H
    (code >= 0x2B820 && code <= 0x2CEAF) ||    // 扩展I-J
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
 * 构建 inline 表格各列的内容需求权重
 * @param {Array} fields - 字段列表
 * @returns {Array<{label: string, weight: number}>} 列需求列表
 */
export function buildInlineColumnDemands(fields) {
  if (!fields || !fields.length) return []

  return fields.map(ff => {
    const fd = ff?.field_definition
    if (!fd) {
      return { label: '', weight: FILL_LINE_WEIGHT }
    }

    // 标签权重
    const label = ff.label_override || fd.label || ''
    let weight = computeTextWeight(label)

    // 默认值权重
    const defaultValue = ff?.default_value
    if (defaultValue && isDefaultValueSupported(fd.field_type, Boolean(ff.inline_mark))) {
      const lines = normalizeDefaultValue(defaultValue).split('\n')
      for (const line of lines) {
        weight = Math.max(weight, computeTextWeight(line))
      }
    } else {
      // 控件占位符权重
      const fieldType = fd.field_type
      if (isChoiceField(fieldType)) {
        const options = normalizeChoiceOptions(fd.options || fd.codelist?.options || [])
        if (options.length > 0) {
          // 取最大选项权重
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
 * @param {Object} field - 字段对象
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
