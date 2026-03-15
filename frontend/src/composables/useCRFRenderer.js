/**
 * CRF表单渲染工具 - 统一的字段控件渲染逻辑
 * 用于 SimulatedCRFForm 和 FormDesignerTab 的预览渲染
 */

/**
 * 将渲染字符串转为 HTML（转义 + 下划线 → fill-line span + 换行 → br）
 * @param {string} text - renderCtrl 返回的原始字符串
 * @returns {string} 安全的 HTML 字符串
 */
export function toHtml(text) {
  if (!text) return ''
  // 转义 HTML 特殊字符（防止 XSS），保留换行
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // 将连续 4 个或以上的下划线替换为 border-bottom span
  // 每个 _ 约 0.6em 宽度
  const html = escaped.replace(/_{4,}/g, (match) => {
    const minWidth = (match.length * 0.55).toFixed(1)
    return `<span class="fill-line" style="min-width:${minWidth}em"></span>`
  })
  // 将换行转为 <br>
  return html.replace(/\n/g, '<br>')
}

/**
 * 渲染字段控件（返回 HTML 字符串，供 v-html 使用）
 * 解决 _ 字符字形间距导致下划线断续的问题
 * @param {Object} field - 字段对象
 * @returns {string} HTML 字符串
 */
export function renderCtrlHtml(field) {
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
  const rawOpts = field.options || []
  // 处理选项：支持字符串数组或对象数组，动态拼接下划线
  const opts = rawOpts.map(o => {
    if (typeof o === 'string') return o
    const text = o.decode || ''
    // trailing_underscore=1 时追加 8 个下划线，提供适当的填写空间
    return o.trailing_underscore ? text + '________' : text
  })
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
          else result += c
        }
      }
      if (boxCount > 0) result += boxes(boxCount)
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
