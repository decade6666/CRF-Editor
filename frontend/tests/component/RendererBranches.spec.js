import { describe, it, expect } from 'vitest'
import {
  CHECKBOX_DEFAULT_TEXT,
  DEFAULT_DATE_FORMATS,
  computeFillLineCharCount,
  computeTextWeight,
  computeChoiceAtomWeight,
  buildInlineColumnDemands,
  computeFieldControlWeight,
  planWidth,
  planInlineColumnFractions,
  buildNormalColumnDemands,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
  isChoiceField,
  isDefaultValueSupported,
  normalizeDefaultValue,
  toHtml,
  renderCtrlHtml,
  renderCtrlTextHtml,
  renderCtrl,
} from '../../src/composables/useCRFRenderer'

const sum = (arr) => arr.reduce((a, b) => a + b, 0)

describe('width weight primitives', () => {
  it('computeFillLineCharCount clamps to the same floor below the usable minimum and a plateau above the maximum', () => {
    expect(computeFillLineCharCount(0)).toBe(computeFillLineCharCount(-5))
    expect(computeFillLineCharCount(1000)).toBe(computeFillLineCharCount(50))
    expect(computeFillLineCharCount(50)).toBeGreaterThanOrEqual(computeFillLineCharCount(2))
  })

  it('computeTextWeight weights CJK above ASCII and treats empty text as zero', () => {
    expect(computeTextWeight('')).toBe(0)
    expect(computeTextWeight(null)).toBe(0)
    const perAscii = computeTextWeight('a')
    const cjk = computeTextWeight('一')
    expect(cjk).toBeGreaterThan(perAscii)
    expect(computeTextWeight('𠮷')).toBe(cjk)
    expect(computeTextWeight('一一')).toBe(cjk * 2)
    expect(computeTextWeight('一a')).toBe(cjk + perAscii)
    expect(computeTextWeight('ab')).toBe(perAscii * 2)
  })

  it('computeChoiceAtomWeight adds the ASCII marker to the label weight', () => {
    expect(computeChoiceAtomWeight('')).toBe(computeTextWeight('a'))
    expect(computeChoiceAtomWeight('甲')).toBe(computeTextWeight('a') + computeTextWeight('甲'))
  })
})

describe('buildInlineColumnDemands', () => {
  it('returns an empty demand list for missing fields', () => {
    expect(buildInlineColumnDemands(null)).toEqual([])
    expect(buildInlineColumnDemands([])).toEqual([])
  })

  it('short labels share the header floor while long labels exceed it', () => {
    const shortA = buildInlineColumnDemands([{ field_definition: { field_type: '文本', label: '未查' } }])[0]
    const shortB = buildInlineColumnDemands([{ field_definition: { field_type: '文本', label: '项目' } }])[0]
    expect(shortA.weight).toBe(shortB.weight)
    expect(shortA.weight).toBeGreaterThan(0)
    const long = buildInlineColumnDemands([{ field_definition: { field_type: '文本', label: '一二三四五六七八九十甲乙丙丁戊' } }])[0]
    expect(long.weight).toBeGreaterThan(shortA.weight)
  })

  it('supports the flat runtime shape, label_override and blank entries', () => {
    const flat = buildInlineColumnDemands([{ field_type: '文本', label: '甲乙丙丁戊己庚辛壬' }])[0]
    expect(flat.label).toBe('甲乙丙丁戊己庚辛壬')
    const overridden = buildInlineColumnDemands([
      { field_definition: { field_type: '文本', label: '内定' }, label_override: '覆盖后名' },
    ])[0]
    expect(overridden.label).toBe('覆盖后名')
    const blank = buildInlineColumnDemands([null])[0]
    expect(blank.label).toBe('')
    const typeless = buildInlineColumnDemands([{ label: '' }])[0]
    expect(typeless).toEqual({ label: '', weight: blank.weight })
  })
})

describe('computeFieldControlWeight', () => {
  const fillWeight = computeFieldControlWeight(null)

  it('uses the default-value line weight when supported', () => {
    const withDefault = computeFieldControlWeight({
      field_definition: { field_type: '文本', label: 'x' },
      default_value: '一二三四五六七八',
    })
    expect(withDefault).toBeGreaterThanOrEqual(fillWeight)
  })

  it('checkbox fields weigh their resolved control text', () => {
    const plain = computeFieldControlWeight({ field_definition: { field_type: '复选' } })
    const labelled = computeFieldControlWeight({ field_definition: { field_type: '复选', checkbox_label: '是的是的是的是的' } })
    expect(plain).toBe(fillWeight)
    expect(labelled).toBeGreaterThan(fillWeight)
  })

  it('choice fields take the widest option atom, falling back without options', () => {
    const withOptions = computeFieldControlWeight({
      field_definition: { field_type: '单选', label: 'x', options: [{ decode: '某某某' }] },
    })
    expect(withOptions).toBeGreaterThan(fillWeight)
    const noOptions = computeFieldControlWeight({ field_definition: { field_type: '单选', label: 'x' } })
    expect(noOptions).toBe(fillWeight)
  })

  it('numeric placeholders weigh the rendered control', () => {
    const numeric = computeFieldControlWeight({ field_definition: { field_type: '数值', label: 'x' } })
    expect(numeric).toBeGreaterThan(fillWeight)
  })
})

describe('planWidth and planner entry points', () => {
  it('planWidth normalizes, equal-splits zero demand, and renormalizes over-budget demands', () => {
    expect(planWidth([], 10)).toEqual([])
    expect(planWidth(null, 10)).toEqual([])
    expect(planWidth([1, 1], 100)).toEqual([0.5, 0.5])
    expect(planWidth([0, 0], 10)).toEqual([0.5, 0.5])
    expect(planWidth([1, 3], 100)).toEqual([0.25, 0.75])
    const squeezed = planWidth([3, 1], 2)
    expect(squeezed[0]).toBeGreaterThan(squeezed[1])
    expect(sum(squeezed)).toBeCloseTo(1, 10)
  })

  it('inline and normal planners return sum-to-one fractions', () => {
    const inline = planInlineColumnFractions([
      { field_definition: { field_type: '文本', label: '甲' } },
      { field_definition: { field_type: '文本', label: '乙乙乙乙乙乙乙乙' } },
    ])
    expect(inline).toHaveLength(2)
    expect(sum(inline)).toBeCloseTo(1, 10)
    expect(inline[1]).toBeGreaterThan(inline[0])
    expect(planInlineColumnFractions([])).toEqual([])

    const normal = planNormalColumnFractions([
      { field_definition: { field_type: '文本', label: '甲' } },
    ])
    expect(normal).toHaveLength(2)
    expect(sum(normal)).toBeCloseTo(1, 10)
  })

  it('normal demands filter structural fields and fall back to minimum weights', () => {
    const empty = buildNormalColumnDemands([])
    expect(empty[0].weight).toBeGreaterThan(0)
    expect(empty[0].weight).toBe(empty[1].weight)
    const filtered = buildNormalColumnDemands([
      { field_definition: { field_type: '标签' } },
      { field_definition: { field_type: '文本', label: '甲' }, is_log_row: false },
    ])
    expect(filtered[0].label).toBe('label')
    const onlyStructural = buildNormalColumnDemands([
      { field_definition: { field_type: '日志行' } },
    ])
    expect(onlyStructural[0].weight).toBe(empty[0].weight)
  })

  it('unified planner aggregates inline slots and spreads regular spans', () => {
    expect(planUnifiedColumnFractions([], 0)).toEqual([])
    expect(planUnifiedColumnFractions(null, 4)).toHaveLength(4)
    const fractions = planUnifiedColumnFractions([
      null,
      { type: 'inline_block', fields: [{ field_definition: { field_type: '文本', label: '甲乙丙丁戊己庚辛壬' } }] },
      { type: 'regular_field', fields: [{ field_definition: { field_type: '文本', label: '乙' } }] },
      { type: 'other', fields: [] },
    ], 6)
    expect(fractions).toHaveLength(6)
    expect(sum(fractions)).toBeCloseTo(1, 10)
    expect(Math.min(...fractions)).toBeGreaterThan(0)
    // regular_field 在 columnCount < 2 时被跳过，仍保持和为 1
    const tiny = planUnifiedColumnFractions([
      { type: 'regular_field', fields: [{ field_definition: { field_type: '文本', label: '乙' } }] },
    ], 1)
    expect(tiny).toEqual([1])
  })
})

describe('type and default value predicates', () => {
  it('isChoiceField covers the four choice spellings only', () => {
    for (const t of ['单选', '多选', '单选（纵向）', '多选（纵向）']) expect(isChoiceField(t)).toBe(true)
    for (const t of ['文本', '数值', '复选', '标签']) expect(isChoiceField(t)).toBe(false)
  })

  it('isDefaultValueSupported excludes checkbox, allows inline anywhere, else text/numeric', () => {
    expect(isDefaultValueSupported('复选', true)).toBe(false)
    expect(isDefaultValueSupported('日期', true)).toBe(true)
    expect(isDefaultValueSupported('文本')).toBe(true)
    expect(isDefaultValueSupported('数值')).toBe(true)
    expect(isDefaultValueSupported('日期')).toBe(false)
    expect(isDefaultValueSupported(undefined, false)).toBe(false)
  })

  it('normalizeDefaultValue keeps multiline text or reduces to the first line', () => {
    expect(normalizeDefaultValue(null)).toBe('')
    expect(normalizeDefaultValue('a\nb')).toBe('a\nb')
    expect(normalizeDefaultValue('a\r\nb', true)).toBe('a')
    expect(normalizeDefaultValue('a\nb', true)).toBe('a')
  })
})

describe('toHtml escaping and fill-line conversion', () => {
  it('escapes HTML specials and preserves plain text', () => {
    expect(toHtml('')).toBe('')
    expect(toHtml(null)).toBe('')
    expect(toHtml('abc')).toBe('abc')
    expect(toHtml('<b>&"</b>')).toBe('&lt;b&gt;&amp;&quot;&lt;/b&gt;')
  })

  it('converts underscore runs into fill-line spans with a max-width on the first run only', () => {
    const html = toHtml('____甲____')
    expect(html).toContain('class="fill-line"')
    expect(html).toContain('min-width:2.0em')
    expect(html).not.toContain('max-width')
    expect(html).toContain('甲')
    const capped = toHtml('____甲____', { fillLineMaxWidthEm: 3.5 })
    expect(capped).toContain('max-width:3.5em;')
    expect(capped.match(/max-width/g)).toHaveLength(1)
    expect(toHtml('_')).not.toContain('fill-line')
    expect(toHtml('___')).not.toContain('fill-line')
  })

  it('aligns trailing unit text and converts newlines', () => {
    const aligned = toHtml('____ kg')
    expect(aligned).toContain('<span style="vertical-align:bottom"> kg</span>')
    expect(toHtml('a\nb')).toBe('a<br>b')
  })
})

describe('renderCtrl control text', () => {
  it('falls back for missing fields and honours the fill-line length argument', () => {
    expect(renderCtrl(null)).toBeTruthy()
    expect(renderCtrl(null, 8)).toBeTruthy()
    const text = renderCtrl({ field_type: '文本' }, 10)
    expect(text).toBe('__________')
    expect(renderCtrl({ field_type: '文本', unit_symbol: 'cm' }, 4)).toBe('____ cm')
    expect(renderCtrl({ field_type: '文本' })).toContain('_')
  })

  it('renders numeric boxes with optional decimals and unit', () => {
    expect(renderCtrl({ field_type: '数值' })).toBe('|__|'.repeat(10))
    expect(renderCtrl({ field_type: '数值', integer_digits: 3, decimal_digits: 2 })).toBe('|__|'.repeat(3) + '.' + '|__|'.repeat(2))
    expect(renderCtrl({ field_type: '数值', integer_digits: 2, decimal_digits: 0, unit_symbol: 'kg' })).toBe('|__|'.repeat(2) + ' kg')
  })

  it('renders date formats with Chinese separators', () => {
    expect(renderCtrl({ field_type: '日期' })).toBe(renderCtrl({ field_type: '日期', date_format: DEFAULT_DATE_FORMATS['日期'] }))
    const box = (n) => `|${'__|'.repeat(n)}`
    expect(renderCtrl({ field_type: '日期', date_format: 'yyyy-MM-dd' })).toBe(box(4) + '年' + box(2) + '月' + box(2) + '日')
    expect(renderCtrl({ field_type: '日期时间', date_format: 'yyyy-MM-dd HH:mm' })).toBe(box(4) + '年' + box(2) + '月' + box(2) + '日  ' + box(2) + '时' + box(2) + '分')
    expect(renderCtrl({ field_type: '时间', date_format: 'HH:mm:ss' })).toBe(box(2) + '时' + box(2) + '分' + box(2) + '秒')
    expect(renderCtrl({ field_type: '日期', date_format: 'HH:mm' })).toBe(box(2) + '时' + box(2) + '分')
  })

  it('renders checkbox, choice and label types', () => {
    expect(renderCtrl({ field_type: '复选' })).toBe(`□${CHECKBOX_DEFAULT_TEXT}`)
    expect(renderCtrl({ field_type: '复选', checkbox_label: '是' })).toBe('□是')
    expect(renderCtrl({ field_type: '单选' })).toBe('○是  ○否')
    expect(renderCtrl({ field_type: '单选', options: ['甲', '乙'] })).toBe('○甲  ○乙')
    expect(renderCtrl({ field_type: '多选' })).toBe('□选项1  □选项2')
    expect(renderCtrl({ field_type: '多选（纵向）', options: ['甲'] })).toBe('□甲')
    expect(renderCtrl({ field_type: '单选（纵向）', options: ['甲', '乙'] })).toBe('○甲\n○乙')
    expect(renderCtrl({ field_type: '标签', options: [] })).toBe('')
    expect(renderCtrl({ field_type: '未知类型' })).toContain('_')
  })
})

describe('renderCtrlHtml / renderCtrlTextHtml', () => {
  it('renders structured choice groups with markers and aligned labels', () => {
    const html = renderCtrlHtml({ field_type: '单选', options: [{ decode: '甲', order_index: 2 }, { decode: '乙', order_index: 1 }] })
    expect(html).toContain('choice-group')
    expect(html).toContain('>乙<')
    expect(html).toContain('>甲<')
    expect(html.indexOf('乙')).toBeLessThan(html.indexOf('甲'))
    expect(html).toContain('choice-marker">○<')
    expect(html).toContain('--choice-label-min:1ch')
    const vertical = renderCtrlHtml({ field_type: '多选（纵向）', options: ['甲', '乙'] })
    expect(vertical).toContain('choice-group--vertical')
    expect(vertical).toContain('□')
    const fallback = renderCtrlHtml({ field_type: '单选', options: [] })
    expect(fallback).toContain('○是')
    expect(renderCtrlHtml(null)).toBe('')
    expect(renderCtrlHtml({ field_type: '文本' })).toContain('fill-line')
  })

  it('wraps horizontal choice text output in a choice-text span', () => {
    const wrapped = renderCtrlTextHtml({ field_type: '单选', options: ['甲'] })
    expect(wrapped.startsWith('<span class="choice-text">')).toBe(true)
    expect(renderCtrlTextHtml({ field_type: '单选（纵向）', options: ['甲'] })).not.toContain('choice-text')
    expect(renderCtrlTextHtml({ field_type: '文本' })).toContain('fill-line')
  })
})
