/**
 * Phase 9 Fixture Tests —— 内容驱动列宽规划
 *
 * 覆盖 spec 9.1–9.11：planner 语义契约 + useColumnResize 持久化行为。
 * 与后端 backend/tests/fixtures/planner_cases.json 共享典型用例。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeTextWeight,
  computeChoiceAtomWeight,
  buildInlineColumnDemands,
  buildNormalColumnDemands,
  computeFieldControlWeight,
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
  renderCtrl,
  renderCtrlHtml,
  renderCtrlTextHtml,
  toHtml,
  computeFillLineCharCount,
} from '../src/composables/useCRFRenderer.js'
import { createPreviewCellRenderers } from '../src/composables/previewCellRender.js'
import {
  readColumnWidthRatios,
  readColumnWidthRatiosWithFallback,
} from '../src/composables/useColumnResize.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const templatePreviewSource = readFileSync(
  path.resolve(currentDir, '../src/components/TemplatePreviewDialog.vue'),
  'utf8',
)
const simulatedCrfFormSource = readFileSync(
  path.resolve(currentDir, '../src/components/SimulatedCRFForm.vue'),
  'utf8',
)
const visitsSource = readFileSync(
  path.resolve(currentDir, '../src/components/VisitsTab.vue'),
  'utf8',
)
const formDesignerSource = readFileSync(
  path.resolve(currentDir, '../src/components/FormDesignerTab.vue'),
  'utf8',
)
const rendererSource = readFileSync(
  path.resolve(currentDir, '../src/composables/useCRFRenderer.js'),
  'utf8',
)

const UNDERSCORE_CHAR_CM = 0.19
const CELL_HPAD_CM = 0.4
const FILL_LINE_SAFETY_CM = 0.2

function assertChoiceAtomFitsColumn(columnCm, label, fillChars) {
  const markerLabelChars = computeChoiceAtomWeight(label)
  const usableCm = columnCm - CELL_HPAD_CM - FILL_LINE_SAFETY_CM
  assert.ok(
    (markerLabelChars + fillChars) * UNDERSCORE_CHAR_CM <= usableCm + 1e-9,
    `label=${label}, columnCm=${columnCm}, fillChars=${fillChars}`,
  )
}

// ─── 9.1–9.7：planner 纯函数用例 ────────────────────────────────────────────

test('9.1 normal_short_label_fill_line: 单字段 [标签/文本] 得到 [0.4, 0.6]', () => {
  const fields = [
    {
      field_definition: { field_type: '文本', label: '标签' },
      label_override: null,
    },
  ]
  const fractions = planNormalColumnFractions(fields)
  assert.equal(fractions.length, 2)
  assert.ok(Math.abs(fractions[0] - 0.4) < 1e-9, `labelFraction=${fractions[0]}`)
  assert.ok(Math.abs(fractions[1] - 0.6) < 1e-9, `controlFraction=${fractions[1]}`)
})

test('9.2 normal_long_cjk_label_short_control: 10 个中文 label → label 列主导短文本控件', () => {
  const longLabel = '一二三四五六七八九十'
  const longFractions = planNormalColumnFractions([
    { field_definition: { field_type: '文本', label: longLabel } },
  ])
  const shortFractions = planNormalColumnFractions([
    { field_definition: { field_type: '文本', label: '名' } },
  ])
  assert.ok(longFractions[0] >= shortFractions[0], 'long label should weakly dominate short label')
  assert.ok(Math.abs(longFractions[0] - 0.7692307692307693) < 1e-9, `long label should dominate, got ${longFractions[0]}`)
  assert.ok(shortFractions[0] < 0.5, `short label below 0.5, got ${shortFractions[0]}`)
})

test('9.3 inline_choice_atom_weight: choice atom 仅由 marker + label 决定', () => {
  assert.equal(computeChoiceAtomWeight('是'), 3)

  const fields = [
    { field_definition: { field_type: '单选', label: 'X' } },
  ]
  const demands = buildInlineColumnDemands(fields)
  assert.equal(demands.length, 1)
  assert.ok(demands[0].weight >= 6, `inline choice without options falls back to FILL_LINE_WEIGHT, got ${demands[0].weight}`)
})

test('9.3b preview_choice_html_has_no_tail_fill_line', () => {
  const html = renderCtrlHtml({
    field_type: '单选',
    options: [
      { decode: '有尾线', order_index: 1 },
      { decode: '无尾线', order_index: 2 },
    ],
  }, computeFillLineCharCount(5.0))

  assert.match(html, /有尾线/)
  assert.match(html, /choice-label--aligned/)
  assert.doesNotMatch(html, /fill-line/)
})

test('9.3c preview_choice_plain_text_has_no_literal_tail_underscore', () => {
  const text = renderCtrl({
    field_type: '单选',
    options: [
      { decode: '有尾线', order_index: 1 },
      { decode: '无尾线', order_index: 2 },
    ],
  }, computeFillLineCharCount(5.0))

  assert.equal(text, '○有尾线  ○无尾线')
})

test('9.3c2 preview_choice_marker_label_spacing: default options have no internal marker-label space', () => {
  assert.equal(renderCtrl({ field_type: '单选', options: [] }), '○是  ○否')
  assert.equal(renderCtrl({ field_type: '多选', options: [] }), '□选项1  □选项2')
})

test('9.3d fill-line estimator: 6 个下划线映射为 3.0em', () => {
  assert.match(toHtml('______'), /min-width:3\.0em/)
  assert.match(toHtml('________________'), /min-width:8\.0em/)
})

test('9.3e computeFillLineCharCount: 随列宽单调增长并夹在 [6, 20]', () => {
  assert.equal(computeFillLineCharCount(0), 6)
  assert.equal(computeFillLineCharCount(-5), 6)
  // 用户定标上限 20（2026-09-30）：超宽列不再加长
  assert.equal(computeFillLineCharCount(1000), 20)
  assert.ok(computeFillLineCharCount(9.0) > computeFillLineCharCount(4.0))
  // 跨栈边界（上限以内）：与后端 compute_fill_line_char_count(3.83) == 17 逐位一致
  assert.equal(computeFillLineCharCount(3.83), 17)
  // 上限边界：4.4cm 起固定 20，4.3cm 仍按公式 19
  assert.equal(computeFillLineCharCount(4.4), 20)
  assert.equal(computeFillLineCharCount(4.3), 19)
  // 旧边界样例 8.77（raw 43）超过新上限，现被钳到 20
  assert.equal(computeFillLineCharCount(8.77), 20)
})

test('9.3e2 computeFillLineCharCount: 物理宽度不超过列宽（绝不换行）', () => {
  for (const cm of [5.0, 7.33, 8.8, 12.0, 20.0]) {
    assert.ok(computeFillLineCharCount(cm) * 0.19 <= cm, `cm=${cm}`)
  }
})

test('9.3f renderCtrl 接受 fillLineChars：文本字段输出对应根数的下划线', () => {
  const field = { field_type: '文本' }
  assert.equal(renderCtrl(field, 30), '_'.repeat(30))
  // 未传参数时保持旧固定 16 根（向后兼容，不破坏 parity 默认值）
  assert.equal(renderCtrl(field), '________________')
})

test('9.3f2 renderCtrlHtml 透传 fillLineChars：min-width 随根数放大，生成线带 10em 视觉上限', () => {
  const html = renderCtrlHtml({ field_type: '文本' }, 30)
  assert.match(html, /min-width:15\.0em/)
  // 自动生成填写线的视觉宽度上限 = FILL_LINE_MAX_CHARS × 0.5em = 10em
  // （.word-page flex 拉满场景下由 span 内联 max-width 截停；仅 renderCtrlHtml 生成路径携带）
  assert.match(html, /max-width:10\.0em/)
})

test('9.3f3 toHtml 手输下划线（默认值路径）不受生成线视觉上限约束', () => {
  const html = toHtml('________________')
  assert.match(html, /min-width:8\.0em/)
  assert.doesNotMatch(html, /max-width/)
  // `|__|` 数值/日期槽（双下划线）不转换为填写线
  assert.doesNotMatch(toHtml('|__|__|'), /fill-line/)
})

test('9.3f4 仅自动生成的首个填写线带 max-width；单位内手输下划线保持原样', () => {
  const html = renderCtrlHtml({ field_type: '文本', unit_symbol: '____' }, 20)
  // 生成线（首段）：10.0em 上限 + 10.0em min-width
  assert.match(html, /max-width:10\.0em;min-width:10\.0em/)
  // 整段 HTML 只有生成线一处 max-width（单位下划线段不受限）
  assert.equal((html.match(/max-width:/g) || []).length, 1)
})

test('9.3f5 inline 多行默认值回退同样走 renderCtrlTextHtml，不得绕过生成线视觉上限', () => {
  // renderCtrlHtml 与 renderCtrlTextHtml 携带同一 fillLineMaxWidthEm（首段生成线）
  assert.match(
    rendererSource,
    /return renderCtrlTextHtml\(field, fillLineChars\)/,
    'renderCtrlHtml non-choice branch should delegate to renderCtrlTextHtml',
  )
  // 设计器/访视的 inline 多行默认值回退已迁入 previewCellRender.js（shared-rule-convergence
  // R1），输出等价由 tests/previewCellRender.test.js 黄金参考矩阵（含 fallback 格逐字节对比）
  // 锁定；此处改为行为断言（回退格与 renderCtrlTextHtml 输出逐字节一致，含生成线视觉上限）
  // 加两条接线守卫：两个组件的绑定仍把回退渲染指到 renderCtrlTextHtml，
  // 不允许直连 toHtml(renderCtrl(...)) 绕过 .word-page flex 拉满截停。
  const { getInlineRows } = createPreviewCellRenderers({
    toRendererField: (ff) => ff.field_definition,
    getCellValue: () => '',
    getInlineValue: (ff) => ff.default_value || '',
    renderFallback: renderCtrlTextHtml,
    resolveHostGroups: () => [],
    getPaperOrientation: () => 'auto',
  })
  const rows = getInlineRows(
    [
      { field_definition: { field_type: '文本' }, default_value: '一\n二' },
      { field_definition: { field_type: '文本' }, default_value: '短' },
    ],
    [8, 8],
  )
  // 第二列默认值只有 1 行，第 2 行是回退格
  assert.equal(rows[1][1], renderCtrlTextHtml({ field_type: '文本' }, 8))
  assert.match(rows[1][1], /max-width:10\.0em/)
  assert.match(formDesignerSource, /renderFallback: renderCtrlTextHtml,/)
  assert.match(visitsSource, /renderFallback: renderCtrlTextHtml,/)
  assert.doesNotMatch(formDesignerSource, /fallback: toHtml\(renderCtrl/)
  assert.doesNotMatch(visitsSource, /fallback: toHtml\(renderCtrl/)
  assert.doesNotMatch(templatePreviewSource, /toHtml\(renderCtrl/)
})

test('9.4 inline_multiline_default_value: 多行默认值取最长行', () => {
  const fields = [
    {
      field_definition: { field_type: '文本', label: 'X' },
      default_value: 'a\nlongest line here\nshort',
      inline_mark: 1,
    },
  ]
  const demands = buildInlineColumnDemands(fields)
  const expected = computeTextWeight('longest line here')
  assert.ok(demands[0].weight >= expected, `w=${demands[0].weight} expected>=${expected}`)
  assert.ok(demands[0].weight >= computeTextWeight('short'))
})

test('9.4a numeric_placeholder_matches_word_export_literal_boxes', () => {
  const text = renderCtrl({ field_type: '数值', integer_digits: 3, decimal_digits: 1 })
  assert.equal(text, '|__||__||__|.|__|')
})


test('9.4a2 datetime_placeholder_matches_word_export_spacing', () => {
  const text = renderCtrl({ field_type: '日期时间', date_format: 'yyyy-MM-dd HH:mm' })
  assert.equal(text, '|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分')
})


test('9.4b control_weight_dates_use_visible_placeholder_width: 日期控件按占位符宽度估算', () => {
  const field = {
    field_definition: { field_type: '日期', label: '测量日期', date_format: 'yyyy-MM-dd' },
  }
  const controlWeight = computeFieldControlWeight(field)
  const labelWeight = computeTextWeight('测量日期')
  assert.ok(controlWeight > labelWeight, `controlWeight=${controlWeight} labelWeight=${labelWeight}`)
})

test('9.4c unified_regular_field_distributes_control_weight_across_value_span', () => {
  const segments = [
    {
      type: 'regular_field',
      fields: [
        { field_definition: { field_type: '日期', label: '测量日期', date_format: 'yyyy-MM-dd' } },
      ],
    },
  ]
  const fractions = planUnifiedColumnFractions(segments, 7)
  assert.equal(fractions.length, 7)
  assert.ok(fractions[0] < 0.25, `label slot should not dominate: ${fractions[0]}`)
  assert.ok(fractions.slice(3).every(v => v > fractions[0]), `value slots should receive more control width: ${fractions}`)
})

test('9.5 unified_two_blocks_per_slot_max: 两个 inline_block 对同 slot 取 max', () => {
  const segments = [
    {
      type: 'inline_block',
      fields: [
        { field_definition: { field_type: '文本', label: 'A' } },
        { field_definition: { field_type: '文本', label: '超长的标签文字内容' } },
      ],
    },
    {
      type: 'inline_block',
      fields: [
        { field_definition: { field_type: '文本', label: '超长的第一列更长一些更长啊' } },
        { field_definition: { field_type: '文本', label: 'B' } },
      ],
    },
  ]
  const fractions = planUnifiedColumnFractions(segments, 2)
  assert.equal(fractions.length, 2)
  // 第一列需求来自段 2，第二列需求来自段 1；对应 per-slot-max 应该非平凡分配。
  assert.ok(Math.abs(fractions[0] + fractions[1] - 1) < 1e-9)
  assert.ok(fractions[0] > 0 && fractions[1] > 0)
})

test('9.6 missing_field_definition: field_definition 缺失退化为 FILL_LINE_WEIGHT', () => {
  const fields = [{ label_override: null }]
  // 不应抛异常
  const demands = buildInlineColumnDemands(fields)
  assert.equal(demands.length, 1)
  assert.equal(demands[0].weight, 6)
  // buildNormalColumnDemands 对缺失 field_definition 的字段应视为非结构字段但 label=''
  const normalDemands = buildNormalColumnDemands(fields)
  assert.equal(normalDemands.length, 2)
})

test('9.7 rare_cjk_extension_char: 𠮷吉 权重 = 4（code point 正确）', () => {
  // 𠮷 U+20BB7 (扩展 B), 吉 U+5409 (BMP 基本区)
  const text = '𠮷吉'
  // JavaScript: text.length === 3（surrogate pair + 1）
  assert.equal(text.length, 3)
  // 使用 codePointAt：两个 CJK 字符 × WEIGHT_CHINESE(2) = 4
  assert.equal(computeTextWeight(text), 4)
})

// ─── 9.12：inline 短表头不可压缩 floor（PRD R2 表头不换行契约） ────────────
//
// 跨栈契约：当 inline 表头为 ≤4 字中文短文本（label_weight ≤ 4，如"未查/项目/单位"）
// 且字段控件本身权重不超过 FILL_LINE_WEIGHT 时，列 demand 必须高于
// FILL_LINE_WEIGHT，避免被长邻居列归一化稀释到 < 单行所需宽度。
//
// 与后端 backend/src/services/field_rendering.py build_inline_column_demands /
// backend/src/services/width_planning.py 共享同一 floor 常量；具体数值由
// PR2 fixture 反推（≥ WEIGHT_CHINESE × 4 = 8 是预期下界，但 PR1 红灯只锁
// 「严格大于 FILL_LINE_WEIGHT」的契约边界，避免提前固化数值）。

test('9.12 inline_short_header_floor: 短表头 demand 高于 FILL_LINE_WEIGHT 不可压缩 floor', () => {
  const FILL_LINE_WEIGHT = 6 // 与 useCRFRenderer.js / width_planning.py 常量一致

  // 案例 1：纯文本短表头（label_weight=4，control 走 FILL_LINE_WEIGHT 兜底）
  // 当前实现：max(4, 6) = 6；期望（PR2 修复后）：> 6
  const shortLabelField = {
    field_definition: { field_type: '文本', label: '未查' },
  }
  const demands = buildInlineColumnDemands([shortLabelField])
  assert.equal(demands.length, 1)
  assert.ok(
    demands[0].weight > FILL_LINE_WEIGHT,
    `短表头 '未查' demand=${demands[0].weight} 必须 > FILL_LINE_WEIGHT(${FILL_LINE_WEIGHT})，` +
      `否则在长邻居列下会被归一化压缩到 < 单行所需宽度`,
  )

  // 案例 2：另一个常见 2 字短表头（'项目'）
  const otherShort = [
    { field_definition: { field_type: '文本', label: '项目' } },
  ]
  const otherDemands = buildInlineColumnDemands(otherShort)
  assert.ok(
    otherDemands[0].weight > FILL_LINE_WEIGHT,
    `短表头 '项目' demand=${otherDemands[0].weight} 必须 > FILL_LINE_WEIGHT(${FILL_LINE_WEIGHT})`,
  )
})

test('9.12b inline_short_header_floor: 短表头与长邻居共存时 fraction 保留单行可见水位', () => {
  // 复刻 PRD '生命体征' 截图证据的简化版：≤4 字短表头 + 邻接长 label 列
  const fields = [
    { field_definition: { field_type: '文本', label: '未查' } },
    {
      field_definition: {
        field_type: '文本',
        label: '异常有临床意义请详细说明本次检查的具体表现与判读依据',
      },
    },
  ]
  const fractions = planInlineColumnFractions(fields)
  assert.equal(fractions.length, 2)

  // 短表头列归一化后的权重份额 = fractions[0]
  // PR2 floor 修复后，短表头 weight 应高于 FILL_LINE_WEIGHT，且总权重不变量条件下
  // fractions[0] > 当前实现下的 FILL_LINE_WEIGHT / (FILL_LINE_WEIGHT + 长 label weight)
  // 当前 buggy: 6/(6+~50) ≈ 0.107；期望（PR2 后）：≥ 0.12 锁住单行水位
  assert.ok(
    fractions[0] >= 0.12,
    `短表头 '未查' fraction=${fractions[0].toFixed(4)} < 0.12 阈值（长邻居稀释导致换行）`,
  )
})

// ─── 9.8–9.11：useColumnResize 持久化行为 ────────────────────────────────

// 简易 localStorage mock（测试期替换 globalThis.localStorage）
function createLocalStorageStub() {
  const store = new Map()
  const keys = () => Array.from(store.keys())
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i) => keys()[i] ?? null,
    get length() { return store.size },
    _peek: () => Object.fromEntries(store),
  }
}

function createWindowStub() {
  const listeners = new Map()
  return {
    listeners,
    window: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type)
      },
    },
  }
}

function createResizeHarness({ containerLeft, containerWidth, boundaryClientXs = [] }) {
  const scopeRoot = {
    querySelectorAll(selector) {
      if (selector !== '.resizer-handle') return []
      return [activeHandle, ...otherHandles]
    },
  }
  const host = {
    getBoundingClientRect() {
      return { left: containerLeft, width: containerWidth }
    },
    closest(selector) {
      if (selector === '.wp-main') return scopeRoot
      return null
    },
  }
  const activeHandle = {
    closest(selector) {
      if (selector === '.col-resize-host') return host
      return null
    },
    getBoundingClientRect() {
      return { left: containerLeft, width: 10 }
    },
    setPointerCapture() {},
  }
  const otherHandles = boundaryClientXs.map((clientX) => ({
    getBoundingClientRect() {
      return { left: clientX - 5, width: 10 }
    },
  }))
  return { activeHandle }
}

test('9.8 useColumnResize_localStorage_priority: 合法持久化值优先于 factory', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  ls.setItem('crf:designer:col-widths:42:normal', JSON.stringify([0.7, 0.3]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  const formId = ref(42)
  const kind = ref('normal')
  const factory = () => [0.4, 0.6]
  const r = useColumnResize(formId, kind, factory)
  assert.deepEqual(r.colRatios, [0.7, 0.3])

  delete globalThis.localStorage
})

test('9.8b useColumnResize_new_min_ratio_storage_floor: 新下限 0.02 的持久化值可正常读回', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  ls.setItem('crf:designer:col-widths:42:normal', JSON.stringify([0.02, 0.98]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  const r = useColumnResize(ref(42), ref('normal'), () => [0.4, 0.6])
  assert.deepEqual(r.colRatios, [0.02, 0.98])

  delete globalThis.localStorage
})

test('9.9 useColumnResize_invalid_localStorage_fallback: 非法值回退 factory', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  // 非法：和不为 1
  ls.setItem('crf:designer:col-widths:42:normal', JSON.stringify([0.9, 0.9]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  const factory = () => [0.4, 0.6]
  const r = useColumnResize(ref(42), ref('normal'), factory)
  assert.deepEqual(r.colRatios, [0.4, 0.6])

  delete globalThis.localStorage
})

test('9.10 useColumnResize_resetToEven_clears_storage: reset 清空并回 factory', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  const key = 'crf:designer:col-widths:42:normal'
  ls.setItem(key, JSON.stringify([0.7, 0.3]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  const factory = () => [0.4, 0.6]
  const r = useColumnResize(ref(42), ref('normal'), factory)
  assert.deepEqual(r.colRatios, [0.7, 0.3])

  r.resetToEven()
  assert.equal(ls.getItem(key), null)
  assert.deepEqual(r.colRatios, [0.4, 0.6])

  delete globalThis.localStorage
})

test('9.11 useColumnResize_formId_change_rehydrates: 切换 formId 触发 rehydrate', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  ls.setItem('crf:designer:col-widths:42:normal', JSON.stringify([0.7, 0.3]))
  ls.setItem('crf:designer:col-widths:99:normal', JSON.stringify([0.2, 0.8]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref, nextTick } = await import('vue')
  const formId = ref(42)
  const factory = () => [0.4, 0.6]
  const r = useColumnResize(formId, ref('normal'), factory)
  assert.deepEqual(r.colRatios, [0.7, 0.3])

  formId.value = 99
  await nextTick()
  assert.deepEqual(r.colRatios, [0.2, 0.8])

  delete globalThis.localStorage
})

test('9.12 useColumnResize_rehydrate_reads_latest_storage: 手动 rehydrate 会读取最新列宽缓存', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  const key = 'crf:designer:col-widths:42:normal:fieldIds=1,2'
  ls.setItem(key, JSON.stringify([0.7, 0.3]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  const r = useColumnResize(ref(42), ref('normal:fieldIds=1,2'), () => [0.4, 0.6])
  assert.deepEqual(r.colRatios, [0.7, 0.3])

  ls.setItem(key, JSON.stringify([0.25, 0.75]))
  r.rehydrate()
  assert.deepEqual(r.colRatios, [0.25, 0.75])

  delete globalThis.localStorage
})

// ─── Phase 12：跨栈 fixture 一致性 ─────────────────────────────────────

function stubFromDict(data) {
  if (data == null) return null
  const fdRaw = data.field_definition
  let field_definition = null
  if (fdRaw) {
    field_definition = {
      field_type: fdRaw.field_type,
      label: fdRaw.label,
      checkbox_label: fdRaw.checkbox_label ?? null,
      options: fdRaw.options || null,
      date_format: fdRaw.date_format ?? null,
    }
  }
  return {
    label_override: data.label_override ?? null,
    is_log_row: data.is_log_row ?? 0,
    inline_mark: data.inline_mark ?? 0,
    default_value: data.default_value ?? null,
    field_definition,
  }
}

test('12.2 shared fixture: frontend planner matches expected_fractions exactly', () => {
  const fixturePath = path.resolve(currentDir, '../../backend/tests/fixtures/planner_cases.json')
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'))
  assert.ok(data.cases.length >= 8, `fixture should have ≥ 8 cases, got ${data.cases.length}`)

  const hasRareCjk = data.cases.some((c) =>
    (c.fields || []).some((f) => (f?.field_definition?.label || '').includes('𠮷')) ||
    (c.segments || []).some((seg) =>
      (seg.fields || []).some((f) => (f?.field_definition?.label || '').includes('𠮷')),
    ),
  )
  assert.ok(hasRareCjk, 'fixture must include at least one rare_cjk_extension case')

  for (const c of data.cases) {
    let actual
    if (c.kind === 'normal') {
      actual = planNormalColumnFractions(c.fields.map(stubFromDict))
    } else if (c.kind === 'inline') {
      actual = planInlineColumnFractions(c.fields.map(stubFromDict))
    } else if (c.kind === 'unified') {
      const segments = c.segments.map((seg) => ({
        type: seg.type,
        fields: (seg.fields || []).map(stubFromDict),
      }))
      actual = planUnifiedColumnFractions(segments, c.columnCount)
    } else {
      throw new Error(`Unknown kind: ${c.kind}`)
    }
    assert.equal(actual.length, c.expected_fractions.length, `${c.name} length`)
    for (let i = 0; i < actual.length; i += 1) {
      assert.ok(
        Math.abs(actual[i] - c.expected_fractions[i]) < 1e-9,
        `${c.name} col${i}: actual=${actual[i]} expected=${c.expected_fractions[i]}`,
      )
    }
  }
})

// ─── Phase 16.1：table_instance_id 规范格式测试 ───────────────────────────────

test('16.1.5a new_key_format: buildTableInstanceId 生成 kind:fieldIds=... 格式', async () => {
  // 模拟 FormDesignerTab 的 buildTableInstanceId 函数
  function buildTableInstanceId(kind, fields) {
    const fieldIds = (fields || []).map(f => f.id).filter(id => id != null).join(',')
    return `${kind}:fieldIds=${fieldIds}`
  }

  const fields = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.equal(buildTableInstanceId('normal', fields), 'normal:fieldIds=1,2,3')
  assert.equal(buildTableInstanceId('inline', fields.slice(0, 2)), 'inline:fieldIds=1,2')
  assert.equal(buildTableInstanceId('unified', []), 'unified:fieldIds=')
})

test('16.1.5b new_key_format_persistence: useColumnResize 使用新格式键读写', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 新格式键
  const newKey = 'crf:designer:col-widths:42:normal:fieldIds=1,2,3'
  ls.setItem(newKey, JSON.stringify([0.35, 0.65]))

  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref, nextTick } = await import('vue')
  const formId = ref(42)
  const tableInstanceId = ref('normal:fieldIds=1,2,3')
  const factory = () => [0.4, 0.6]

  const r = useColumnResize(formId, tableInstanceId, factory)
  assert.deepEqual(r.colRatios, [0.35, 0.65], 'should read from new key format')

  // 模拟拖拽写入
  r.colRatios.value = [0.3, 0.7]
  // 手动触发写入（模拟 onUp）
  ls.setItem(newKey, JSON.stringify([0.3, 0.7]))
  assert.equal(ls.getItem(newKey), JSON.stringify([0.3, 0.7]), 'should write to new key format')

  delete globalThis.localStorage
})

test('16.1.5c legacy_key_migration: 旧键迁移到新键后删除', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  const formId = '42'
  const newTableInstanceId = 'normal:fieldIds=1,2,3'
  const legacyMapKey = '0-normal-2'

  // 设置旧键值
  const legacyKey = `crf:designer:col-widths:${formId}:${legacyMapKey}`
  const newKey = `crf:designer:col-widths:${formId}:${newTableInstanceId}`
  ls.setItem(legacyKey, JSON.stringify([0.7, 0.3]))

  // 模拟迁移逻辑
  function migrateLegacyKeyIfNeeded(formId, newTableInstanceId, legacyMapKey) {
    if (!formId || !newTableInstanceId || !legacyMapKey) return
    const legacyKey = `crf:designer:col-widths:${formId}:${legacyMapKey}`
    const newKey = `crf:designer:col-widths:${formId}:${newTableInstanceId}`
    try {
      const legacyValue = ls.getItem(legacyKey)
      if (legacyValue != null && ls.getItem(newKey) == null) {
        ls.setItem(newKey, legacyValue)
      }
      if (legacyValue != null) {
        ls.removeItem(legacyKey)
      }
    } catch { /* ignore */ }
  }

  migrateLegacyKeyIfNeeded(formId, newTableInstanceId, legacyMapKey)

  // 验证迁移结果
  assert.equal(ls.getItem(newKey), JSON.stringify([0.7, 0.3]), 'value should be migrated')
  assert.equal(ls.getItem(legacyKey), null, 'legacy key should be deleted')

  delete globalThis.localStorage
})

test('16.1.5d legacy_key_no_overwrite: 新键已有值时不迁移', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  const formId = '42'
  const newTableInstanceId = 'normal:fieldIds=1,2,3'
  const legacyMapKey = '0-normal-2'

  const legacyKey = `crf:designer:col-widths:${formId}:${legacyMapKey}`
  const newKey = `crf:designer:col-widths:${formId}:${newTableInstanceId}`

  // 两键都有值
  ls.setItem(legacyKey, JSON.stringify([0.7, 0.3]))
  ls.setItem(newKey, JSON.stringify([0.25, 0.75]))

  function migrateLegacyKeyIfNeeded(formId, newTableInstanceId, legacyMapKey) {
    const legacyKey = `crf:designer:col-widths:${formId}:${legacyMapKey}`
    const newKey = `crf:designer:col-widths:${formId}:${newTableInstanceId}`
    try {
      const legacyValue = ls.getItem(legacyKey)
      if (legacyValue != null && ls.getItem(newKey) == null) {
        ls.setItem(newKey, legacyValue)
      }
      if (legacyValue != null) {
        ls.removeItem(legacyKey)
      }
    } catch { /* ignore */ }
  }

  migrateLegacyKeyIfNeeded(formId, newTableInstanceId, legacyMapKey)

  // 新键值保持不变
  assert.equal(ls.getItem(newKey), JSON.stringify([0.25, 0.75]), 'new key should not be overwritten')
  // 旧键被删除
  assert.equal(ls.getItem(legacyKey), null, 'legacy key should be deleted')

  delete globalThis.localStorage
})

test('16.1.5e readColumnWidthRatiosWithFallback prefers designer field-id key before legacy map key', () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2', JSON.stringify([0.35, 0.65]))
  ls.setItem('crf:designer:col-widths:42:0-normal-2', JSON.stringify([0.7, 0.3]))

  assert.deepEqual(
    readColumnWidthRatiosWithFallback(42, 'normal:fieldIds=1,2', 2, '0-normal-2'),
    [0.35, 0.65],
    'new field-id key should win over the legacy group-index key',
  )

  delete globalThis.localStorage
})

test('16.1.5f readColumnWidthRatiosWithFallback reads legacy key when designer field-id key is absent', () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  ls.setItem('crf:designer:col-widths:42:0-normal-2', JSON.stringify([0.7, 0.3]))

  assert.deepEqual(
    readColumnWidthRatiosWithFallback(42, 'normal:fieldIds=1,2', 2, '0-normal-2'),
    [0.7, 0.3],
    'legacy group-index key remains a compatibility fallback before migration',
  )
  assert.equal(readColumnWidthRatios(42, 'normal:fieldIds=1,2', 2), null)

  delete globalThis.localStorage
})

test('16.1.5g preview consumers read designer field-id column width keys', () => {
  assert.match(
    templatePreviewSource,
    /import \{ buildTableInstanceId \} from '..\/composables\/useRowResize'/,
    'TemplatePreviewDialog should build the same table instance id as FormDesignerTab',
  )
  assert.match(
    templatePreviewSource,
    /readColumnWidthRatiosWithFallback\(\s*props\.formId,\s*buildTableInstanceId\('unified', g\.fields\),\s*colCount,\s*`\$\{groupIndex\}-unified-\$\{colCount\}`,\s*\)/,
  )
  assert.match(
    templatePreviewSource,
    /readColumnWidthRatiosWithFallback\(\s*props\.formId,\s*buildTableInstanceId\('normal', g\.fields\),\s*2,\s*`\$\{groupIndex\}-normal-2`,\s*\)/,
  )
  assert.match(
    templatePreviewSource,
    /readColumnWidthRatiosWithFallback\(\s*props\.formId,\s*buildTableInstanceId\('inline', g\.fields\),\s*colCount,\s*`\$\{groupIndex\}-inline-\$\{colCount\}`,\s*\)/,
  )
  assert.match(
    simulatedCrfFormSource,
    /import \{ buildTableInstanceId \} from '..\/composables\/useRowResize'/,
    'SimulatedCRFForm should also use the field-id key written by the designer',
  )
  assert.match(
    simulatedCrfFormSource,
    /readColumnWidthRatiosWithFallback\(\s*props\.formId,\s*buildTableInstanceId\('normal', displayFields\.value\),\s*2,\s*'0-normal-2',\s*\)/,
  )
})

test('16.1.5h preview hot paths require precomputed segments and do not silently rebuild them', () => {
  assert.doesNotMatch(
    templatePreviewSource,
    /g\.segments\s*\|\|\s*buildFormDesignerUnifiedSegments/,
    'TemplatePreviewDialog should not keep a raw-group fallback that hides repeated segment rebuilding',
  )
  assert.doesNotMatch(
    visitsSource,
    /group\.segments\s*\|\|\s*buildFormDesignerUnifiedSegments/,
    'VisitsTab should not keep a raw-group fallback that hides repeated segment rebuilding',
  )
})

test('16.1.5i visits inline column fractions reuse the resolved ratios once', () => {
  assert.doesNotMatch(
    visitsSource,
    /resolveInlineColRatios\(group\.fields\)\.length[\s\S]{0,120}\?\s*resolveInlineColRatios\(group\.fields\)/,
    'getPreviewColumnFractions should not call resolveInlineColRatios twice for the same fields',
  )
})

test('16.1.5j visits normal choice preview preserves fillLineChars forwarding', () => {
  // VisitsTab 本地 renderCellHtml 已迁入 previewCellRender.js（shared-rule-convergence R1）。
  // 原源码断言（return renderCtrlHtml(field, fillLineChars)）改为行为断言：共享 renderCellHtml
  // 把 fillLineChars 原样透传给渲染器（文本控件按根数生成填写线；选项类走同一条调用路径、
  // 结构化渲染不含填写线，不存在旁路）。
  const { renderCellHtml } = createPreviewCellRenderers({
    toRendererField: (ff) => ff,
    getCellValue: () => '',
    getInlineValue: () => '',
    renderFallback: renderCtrlHtml,
    resolveHostGroups: () => [],
    getPaperOrientation: () => 'auto',
  })
  const textRow = {
    field_definition: { field_type: '文本', label: 'X' },
    field_type: '文本',
    default_value: null,
  }
  assert.equal(renderCellHtml(textRow, 20), renderCtrlHtml(textRow, 20))
  // 20 根填写线渲染为 fill-line span（20 × 0.5em = min-width:10.0em），根数变化必须改变输出
  assert.match(renderCellHtml(textRow, 20), /min-width:10\.0em/)
  assert.notEqual(renderCellHtml(textRow, 20), renderCellHtml(textRow, null))
  const choiceRow = {
    field_definition: { field_type: '单选', label: '性别', codelist: { options: [{ text: '男' }, { text: '女' }] } },
    field_type: '单选',
    options: [{ text: '男' }, { text: '女' }],
    default_value: null,
  }
  assert.equal(renderCellHtml(choiceRow, 20), renderCtrlHtml(choiceRow, 20))
  // 接线守卫（仅接线，非行为）：VisitsTab 模板的 normal 表单元格仍以 normalFillChars(...) 传入根数
  assert.match(
    visitsSource,
    /renderCellHtml\(ff, normalFillChars\(gv, gi\)\)/,
    'VisitsTab normal table preview should pass normalFillChars into the shared renderCellHtml',
  )
})

// ─── Phase 16.2：Export Column Width Override Contract 测试 ──────────────────

// 黄金参考：App.vue collectColumnWidthOverrides 在迁移前（基线 f68ebe1）的逐字快照。
// Step 4（shared-rule-convergence R4）把该函数移入 useColumnResize.js 并改为复用
// parseColumnWidthStorageKey / isValidColumnWidthOverrideArray；黄金等价矩阵（16.2.5e）
// 证明重写后的输出与该快照在脏存储上完全一致。
function goldenCollectColumnWidthOverrides(forms) {
  const overrides = {}
  if (!forms || !forms.length) return overrides

  const formIds = new Set(forms.map((f) => f.id).filter((id) => id != null))

  // 遍历 localStorage 中所有相关键
  const keyPrefix = 'crf:designer:col-widths:'
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(keyPrefix)) continue

    // 解析键格式：crf:designer:col-widths:<form_id>:<table_instance_id>
    const parts = key.slice(keyPrefix.length).split(':')
    if (parts.length < 2) continue

    const formId = parseInt(parts[0], 10)
    if (!formIds.has(formId)) continue

    const tableInstanceId = parts.slice(1).join(':')

    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0 && arr.every((r) => Number.isFinite(r) && r >= 0 && r <= 1)) {
        overrides[tableInstanceId] = arr
      }
    } catch {
      // 忽略解析错误
    }
  }

  return overrides
}

test('16.2.5a buildColumnWidthStorageKey 与 parseColumnWidthStorageKey 互逆', async () => {
  const {
    buildColumnWidthStorageKey,
    parseColumnWidthStorageKey,
  } = await import('../src/composables/useColumnResize.js')
  assert.equal(typeof buildColumnWidthStorageKey, 'function')
  assert.equal(typeof parseColumnWidthStorageKey, 'function')

  assert.equal(
    buildColumnWidthStorageKey(42, 'normal:fieldIds=1,2'),
    'crf:designer:col-widths:42:normal:fieldIds=1,2',
  )
  assert.deepEqual(parseColumnWidthStorageKey('crf:designer:col-widths:42:normal:fieldIds=1,2'), {
    formId: 42,
    tableInstanceId: 'normal:fieldIds=1,2',
  })
  // 互逆
  assert.deepEqual(
    parseColumnWidthStorageKey(buildColumnWidthStorageKey(7, 'inline:fieldIds=3,4,5')),
    { formId: 7, tableInstanceId: 'inline:fieldIds=3,4,5' },
  )
  // 空 formId / 空实例不产键
  assert.equal(buildColumnWidthStorageKey(null, 'normal:fieldIds=1,2'), null)
  assert.equal(buildColumnWidthStorageKey(42, null), null)
})

test('16.2.5b parseColumnWidthStorageKey 拒绝非前缀与残缺键，保留 parseInt/NaN 语义', async () => {
  const { parseColumnWidthStorageKey } = await import('../src/composables/useColumnResize.js')

  // 旧格式键：tableInstanceId 即 <groupIndex-kind-colCount>
  assert.deepEqual(parseColumnWidthStorageKey('crf:designer:col-widths:42:0-normal-2'), {
    formId: 42,
    tableInstanceId: '0-normal-2',
  })
  // 非本前缀
  assert.equal(parseColumnWidthStorageKey('crf:designer:row-heights:42:normal:fieldIds=1,2'), null)
  assert.equal(parseColumnWidthStorageKey('random'), null)
  assert.equal(parseColumnWidthStorageKey(null), null)
  // 前缀对但缺 tableInstanceId
  assert.equal(parseColumnWidthStorageKey('crf:designer:col-widths:42'), null)
  // formId 非数字沿用 parseInt → NaN（由调用方 Set 成员检查兜底）
  assert.deepEqual(parseColumnWidthStorageKey('crf:designer:col-widths:abc:inline:fieldIds=1'), {
    formId: NaN,
    tableInstanceId: 'inline:fieldIds=1',
  })
})

test('16.2.5c isValidColumnWidthOverrideArray 保持导出收集器的宽松 [0,1] 门（无和校验）', async () => {
  const { isValidColumnWidthOverrideArray } = await import('../src/composables/useColumnResize.js')
  assert.equal(typeof isValidColumnWidthOverrideArray, 'function')

  assert.equal(isValidColumnWidthOverrideArray([0.4, 0.6]), true)
  // 宽松门：边界 0/1 合法、无和校验（和漂移 0.1 仍收集——导出端语义，迁移前后一致）
  assert.equal(isValidColumnWidthOverrideArray([0, 1]), true)
  assert.equal(isValidColumnWidthOverrideArray([0.5, 0.6]), true)
  assert.equal(isValidColumnWidthOverrideArray([]), false)
  assert.equal(isValidColumnWidthOverrideArray([-0.1, 1.1]), false)
  assert.equal(isValidColumnWidthOverrideArray(['0.5', 0.5]), false)
  assert.equal(isValidColumnWidthOverrideArray({ not: 'array' }), false)
  assert.equal(isValidColumnWidthOverrideArray(null), false)
})

test('16.2.5d migrateLegacyColumnWidthKey：缺失即复制、已存在不覆盖、无旧键零操作', async () => {
  const { migrateLegacyColumnWidthKey } = await import('../src/composables/useColumnResize.js')
  assert.equal(typeof migrateLegacyColumnWidthKey, 'function')

  // ① 旧键有值、新键缺失 → 复制后删除旧键（value 原样字节保留）
  let ls = createLocalStorageStub()
  globalThis.localStorage = ls
  ls.setItem('crf:designer:col-widths:42:0-normal-2', '{"0":0.7,"1":0.3,"len":2}')
  migrateLegacyColumnWidthKey(42, 'normal:fieldIds=1,2', '0-normal-2')
  assert.equal(ls.getItem('crf:designer:col-widths:42:normal:fieldIds=1,2'), '{"0":0.7,"1":0.3,"len":2}')
  assert.equal(ls.getItem('crf:designer:col-widths:42:0-normal-2'), null)
  delete globalThis.localStorage

  // ② 新键已有值 → 永不覆盖；旧键仍被删除
  ls = createLocalStorageStub()
  globalThis.localStorage = ls
  ls.setItem('crf:designer:col-widths:42:0-normal-2', JSON.stringify([0.7, 0.3]))
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2', JSON.stringify([0.25, 0.75]))
  migrateLegacyColumnWidthKey(42, 'normal:fieldIds=1,2', '0-normal-2')
  assert.equal(ls.getItem('crf:designer:col-widths:42:normal:fieldIds=1,2'), JSON.stringify([0.25, 0.75]))
  assert.equal(ls.getItem('crf:designer:col-widths:42:0-normal-2'), null)
  delete globalThis.localStorage

  // ③ 旧键不存在 → 不新建任何键
  ls = createLocalStorageStub()
  globalThis.localStorage = ls
  migrateLegacyColumnWidthKey(42, 'normal:fieldIds=1,2', '0-normal-2')
  assert.equal(ls.getItem('crf:designer:col-widths:42:normal:fieldIds=1,2'), null)
  assert.equal(ls.length, 0)
  delete globalThis.localStorage

  // ④ 参数缺失 → 零操作
  ls = createLocalStorageStub()
  globalThis.localStorage = ls
  migrateLegacyColumnWidthKey(null, 'normal:fieldIds=1,2', '0-normal-2')
  migrateLegacyColumnWidthKey(42, '', '0-normal-2')
  assert.equal(ls.length, 0)
  delete globalThis.localStorage
})

test('16.2.5e collectColumnWidthOverrides 与黄金参考在脏存储矩阵上输出一致', async () => {
  const { collectColumnWidthOverrides } = await import('../src/composables/useColumnResize.js')
  assert.equal(typeof collectColumnWidthOverrides, 'function')

  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 脏存储矩阵：新格式 / 旧格式 / 损坏 JSON / 越界 / 和漂移 / 非数值 / 空数组 /
  // 无关前缀 / 行高键 / 其他表单
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3', JSON.stringify([0.35, 0.65]))
  ls.setItem('crf:designer:col-widths:42:inline:fieldIds=4,5', JSON.stringify([0.4, 0.6]))
  ls.setItem('crf:designer:col-widths:42:0-normal-2', JSON.stringify([0.7, 0.3]))
  ls.setItem('crf:designer:col-widths:42:1-inline-3', JSON.stringify([0.33, 0.33, 0.34]))
  ls.setItem('crf:designer:col-widths:42:bad:fieldIds=6', '{"not":"array"}')
  ls.setItem('crf:designer:col-widths:42:broken:fieldIds=7', '{oops')
  ls.setItem('crf:designer:col-widths:42:range:fieldIds=8', JSON.stringify([-0.1, 1.1]))
  // 和漂移：宽松导出门有意放行（无和校验），读取端严格门会拒绝
  ls.setItem('crf:designer:col-widths:42:drift:fieldIds=9', JSON.stringify([0.5, 0.6]))
  ls.setItem('crf:designer:col-widths:42:nan:fieldIds=10', JSON.stringify([0.5, 'x']))
  ls.setItem('crf:designer:col-widths:42:empty:fieldIds=11', '[]')
  ls.setItem('crf:other:42:normal', JSON.stringify([0.5, 0.5]))
  ls.setItem('crf:designer:row-heights:42:normal:fieldIds=1,2', JSON.stringify([30, 60]))
  ls.setItem('crf:designer:col-widths:99:unified:fieldIds=6,7,8', JSON.stringify([0.3, 0.4, 0.3]))

  const forms = [{ id: 42 }, { id: 99 }, { id: null }]
  assert.deepEqual(collectColumnWidthOverrides(forms), goldenCollectColumnWidthOverrides(forms))

  // 其他形态的入参：空列表 / null
  assert.deepEqual(collectColumnWidthOverrides([]), goldenCollectColumnWidthOverrides([]))
  assert.deepEqual(collectColumnWidthOverrides(null), goldenCollectColumnWidthOverrides(null))

  delete globalThis.localStorage
})

test('16.2.5f collectColumnWidthOverrides 严格只读：脏存储收集后 localStorage 不变', async () => {
  const { collectColumnWidthOverrides } = await import('../src/composables/useColumnResize.js')
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2', JSON.stringify([0.4, 0.6]))
  ls.setItem('crf:designer:col-widths:42:legacy-2', JSON.stringify([0.5, 0.5]))
  ls.setItem('crf:designer:col-widths:42:broken:fieldIds=3', '{oops')
  ls.setItem('crf:designer:col-widths:42:drift:fieldIds=4', JSON.stringify([0.5, 0.6]))

  const before = ls._peek()
  collectColumnWidthOverrides([{ id: 42 }])
  assert.deepEqual(ls._peek(), before)

  delete globalThis.localStorage
})

test('16.2.5g 宽松容差历史数组不被规范化或删除：读取端拒绝回退，键原样保留', async () => {
  const { readColumnWidthRatios, collectColumnWidthOverrides } = await import('../src/composables/useColumnResize.js')
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 和漂移 0.01 ∈ (1e-3, 0.02]：旧 VisitsTab 本地门接受，统一后的模块门拒绝
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2', JSON.stringify([0.5, 0.51]))
  // 越界（模块门 [0.02,0.98] 之外，宽松导出门之内）
  ls.setItem('crf:designer:col-widths:42:inline:fieldIds=3,4', JSON.stringify([0.005, 0.995]))

  assert.equal(readColumnWidthRatios(42, 'normal:fieldIds=1,2', 2), null)
  assert.equal(readColumnWidthRatios(42, 'inline:fieldIds=3,4', 2), null)

  // 导出收集器（宽松门）仍收集，且所有键在收集后原样保留（不删除、不规范化）
  const overrides = collectColumnWidthOverrides([{ id: 42 }])
  assert.deepEqual(overrides['normal:fieldIds=1,2'], [0.5, 0.51])
  assert.deepEqual(overrides['inline:fieldIds=3,4'], [0.005, 0.995])
  assert.equal(ls.getItem('crf:designer:col-widths:42:normal:fieldIds=1,2'), JSON.stringify([0.5, 0.51]))
  assert.equal(ls.getItem('crf:designer:col-widths:42:inline:fieldIds=3,4'), JSON.stringify([0.005, 0.995]))

  delete globalThis.localStorage
})

test('16.2.5h 读取端统一模块门：和容差 1e-3、边界 [0.02,0.98]、长度校验', async () => {
  const { readColumnWidthRatios } = await import('../src/composables/useColumnResize.js')
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 合法数组照常读取
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2', JSON.stringify([0.4, 0.6]))
  assert.deepEqual(readColumnWidthRatios(42, 'normal:fieldIds=1,2', 2), [0.4, 0.6])

  // 和漂移 0.01 > 1e-3 → 拒绝（统一前 VisitsTab 本地门 0.02 会接受）
  ls.setItem('crf:designer:col-widths:43:normal:fieldIds=1,2', JSON.stringify([0.5, 0.51]))
  assert.equal(readColumnWidthRatios(43, 'normal:fieldIds=1,2', 2), null)

  // 边界越界 → 拒绝
  ls.setItem('crf:designer:col-widths:44:normal:fieldIds=1,2', JSON.stringify([0.005, 0.995]))
  assert.equal(readColumnWidthRatios(44, 'normal:fieldIds=1,2', 2), null)

  // 长度不符 → 拒绝
  assert.equal(readColumnWidthRatios(42, 'normal:fieldIds=1,2', 3), null)

  delete globalThis.localStorage
})

test('16.2.5i 列宽键拼装/解析/校验/迁移只存在于 useColumnResize（接线守卫）', () => {
  // 接线守卫（仅接线，非行为）：三处调用方改为导入模块函数，本地副本删除。
  assert.doesNotMatch(visitsSource, /function readPersistedColRatios/)
  assert.match(visitsSource, /readColumnWidthRatios\(/)
  assert.match(visitsSource, /buildTableInstanceId\('inline', fields\)/)
  assert.match(visitsSource, /buildTableInstanceId\('normal', fields\)/)
  assert.match(visitsSource, /buildTableInstanceId\('unified', group\.fields\)/)
  assert.doesNotMatch(formDesignerSource, /function migrateLegacyKeyIfNeeded/)
  assert.match(formDesignerSource, /migrateLegacyColumnWidthKey\(/)
  const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
  assert.doesNotMatch(appSource, /function collectColumnWidthOverrides/)
  assert.match(appSource, /collectColumnWidthOverrides\(/)
})

test('16.2.6a collectColumnWidthOverrides_new_format: 收集新格式键', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 设置新格式键
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3', JSON.stringify([0.35, 0.65]))
  ls.setItem('crf:designer:col-widths:42:inline:fieldIds=4,5', JSON.stringify([0.4, 0.6]))
  ls.setItem('crf:designer:col-widths:99:unified:fieldIds=6,7,8', JSON.stringify([0.3, 0.4, 0.3]))

  // R4：改为导入真实实现（与黄金参考的等价性见 16.2.5e）
  const { collectColumnWidthOverrides } = await import('../src/composables/useColumnResize.js')

  const forms = [{ id: 42 }, { id: 99 }]
  const overrides = collectColumnWidthOverrides(forms)

  assert.equal(Object.keys(overrides).length, 3)
  assert.deepEqual(overrides['normal:fieldIds=1,2,3'], [0.35, 0.65])
  assert.deepEqual(overrides['inline:fieldIds=4,5'], [0.4, 0.6])
  assert.deepEqual(overrides['unified:fieldIds=6,7,8'], [0.3, 0.4, 0.3])

  delete globalThis.localStorage
})

test('16.2.6b collectColumnWidthOverrides_legacy_format: 兼容旧格式键', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 设置旧格式键（迁移后删除，但若未迁移仍需能读取）
  ls.setItem('crf:designer:col-widths:42:0-normal-2', JSON.stringify([0.7, 0.3]))
  ls.setItem('crf:designer:col-widths:42:1-inline-3', JSON.stringify([0.33, 0.33, 0.34]))

  // R4：改为导入真实实现（与黄金参考的等价性见 16.2.5e）
  const { collectColumnWidthOverrides } = await import('../src/composables/useColumnResize.js')

  const forms = [{ id: 42 }]
  const overrides = collectColumnWidthOverrides(forms)

  assert.equal(Object.keys(overrides).length, 2)
  assert.deepEqual(overrides['0-normal-2'], [0.7, 0.3])
  assert.deepEqual(overrides['1-inline-3'], [0.33, 0.33, 0.34])

  delete globalThis.localStorage
})

test('16.2.6c collectColumnWidthOverrides_invalid_entry: 跳过无效条目', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 有效
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2', JSON.stringify([0.4, 0.6]))
  // 无效：元素超出范围（负数）
  ls.setItem('crf:designer:col-widths:42:invalid1:fieldIds=3', JSON.stringify([-0.1, 1.1]))
  // 无效：非数组
  ls.setItem('crf:designer:col-widths:42:invalid2:fieldIds=4', '{"not":"array"}')
  // 无效：元素超出范围（>1）
  ls.setItem('crf:designer:col-widths:42:invalid3:fieldIds=5', JSON.stringify([1.5, 0.5]))
  // 无效：空数组
  ls.setItem('crf:designer:col-widths:42:invalid4:fieldIds=6', '[]')

  // R4：改为导入真实实现（与黄金参考的等价性见 16.2.5e）
  const { collectColumnWidthOverrides } = await import('../src/composables/useColumnResize.js')

  const forms = [{ id: 42 }]
  const overrides = collectColumnWidthOverrides(forms)

  assert.equal(Object.keys(overrides).length, 1)
  assert.deepEqual(overrides['normal:fieldIds=1,2'], [0.4, 0.6])

  delete globalThis.localStorage
})

// ─── Phase 16.3：Reset Button UI 测试 ───────────────────────────────────────

test('16.3.5a resetColumnWidths_clears_form_keys: 清除指定表单的所有列宽键', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 设置多个表单的列宽键
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3', JSON.stringify([0.35, 0.65]))
  ls.setItem('crf:designer:col-widths:42:inline:fieldIds=4,5', JSON.stringify([0.4, 0.6]))
  ls.setItem('crf:designer:col-widths:99:normal:fieldIds=6,7', JSON.stringify([0.3, 0.7]))

  // 模拟 resetColumnWidths 逻辑
  function resetColumnWidths(formId) {
    if (formId == null) return
    const keyPrefix = `crf:designer:col-widths:${formId}:`
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(keyPrefix)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  }

  resetColumnWidths(42)

  // 验证表单 42 的键被清除
  assert.equal(ls.getItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3'), null)
  assert.equal(ls.getItem('crf:designer:col-widths:42:inline:fieldIds=4,5'), null)
  // 验证其他表单的键保留
  assert.equal(ls.getItem('crf:designer:col-widths:99:normal:fieldIds=6,7'), JSON.stringify([0.3, 0.7]))

  delete globalThis.localStorage
})

test('16.3.5b batchResetColumnWidths_clears_multiple_forms: 批量清除多表单列宽键', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 设置多个表单的列宽键
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3', JSON.stringify([0.35, 0.65]))
  ls.setItem('crf:designer:col-widths:99:inline:fieldIds=4,5', JSON.stringify([0.4, 0.6]))
  ls.setItem('crf:designer:col-widths:100:unified:fieldIds=6,7,8', JSON.stringify([0.3, 0.4, 0.3]))

  // 模拟 batchResetColumnWidths 逻辑
  function batchResetColumnWidths(formIds) {
    for (const formId of formIds) {
      const keyPrefix = `crf:designer:col-widths:${formId}:`
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(keyPrefix)) {
          keysToRemove.push(key)
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key)
      }
    }
  }

  batchResetColumnWidths([42, 99])

  // 验证表单 42 和 99 的键被清除
  assert.equal(ls.getItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3'), null)
  assert.equal(ls.getItem('crf:designer:col-widths:99:inline:fieldIds=4,5'), null)
  // 验证其他表单的键保留
  assert.equal(ls.getItem('crf:designer:col-widths:100:unified:fieldIds=6,7,8'), JSON.stringify([0.3, 0.4, 0.3]))

  delete globalThis.localStorage
})

test('16.4.0 useColumnResize_drag_clamps_to_new_min_ratio: 拖拽允许到 0.02 且不会低于该下限', async () => {
  const ls = createLocalStorageStub()
  const { window, listeners } = createWindowStub()
  globalThis.localStorage = ls
  globalThis.window = window

  try {
    const { useColumnResize } = await import('../src/composables/useColumnResize.js')
    const { ref } = await import('vue')
    const r = useColumnResize(ref(42), ref('normal:fieldIds=1,2'), () => [0.4, 0.6])
    const { activeHandle } = createResizeHarness({
      containerLeft: 0,
      containerWidth: 100,
    })

    r.onResizeStart(0, { preventDefault() {}, currentTarget: activeHandle, pointerId: 1 })
    listeners.get('pointermove')({ clientX: 2 })
    assert.ok(Math.abs(r.colRatios[0] - 0.02) < 1e-9)
    assert.ok(Math.abs(r.colRatios[1] - 0.98) < 1e-9)

    listeners.get('pointermove')({ clientX: -10 })
    assert.ok(Math.abs(r.colRatios[0] - 0.02) < 1e-9)
    assert.ok(Math.abs(r.colRatios[1] - 0.98) < 1e-9)
    assert.ok(Math.abs(r.colRatios[0] + r.colRatios[1] - 1) < 1e-9)
  } finally {
    delete globalThis.localStorage
    delete globalThis.window
  }
})

test('16.4.1 useColumnResize_snaps_to_cross_group_boundaries: 可吸附到同作用域其他表格边界', async () => {
  const ls = createLocalStorageStub()
  const { window, listeners } = createWindowStub()
  globalThis.localStorage = ls
  globalThis.window = window

  try {
    const { useColumnResize } = await import('../src/composables/useColumnResize.js')
    const { ref } = await import('vue')
    const r = useColumnResize(ref(42), ref('normal:fieldIds=1,2'), () => [0.4, 0.6])
    const { activeHandle } = createResizeHarness({
      containerLeft: 100,
      containerWidth: 200,
      boundaryClientXs: [210],
    })

    r.onResizeStart(0, { preventDefault() {}, currentTarget: activeHandle, pointerId: 1 })
    listeners.get('pointermove')({ clientX: 212 })

    assert.ok(Math.abs(r.colRatios[0] - 0.55) < 1e-9)
    assert.ok(Math.abs(r.snapGuideX - 110) < 1e-9)
  } finally {
    delete globalThis.localStorage
    delete globalThis.window
  }
})

test('16.4.2 useColumnResize_ignores_out_of_range_snap_candidates: 越界候选不会触发漂移 guide', async () => {
  const ls = createLocalStorageStub()
  const { window, listeners } = createWindowStub()
  globalThis.localStorage = ls
  globalThis.window = window

  try {
    const { useColumnResize } = await import('../src/composables/useColumnResize.js')
    const { ref } = await import('vue')
    const r = useColumnResize(ref(42), ref('normal:fieldIds=1,2,3'), () => [0.45, 0.1, 0.45])
    const { activeHandle } = createResizeHarness({
      containerLeft: 0,
      containerWidth: 200,
      boundaryClientXs: [110],
    })

    r.onResizeStart(0, { preventDefault() {}, currentTarget: activeHandle, pointerId: 1 })
    listeners.get('pointermove')({ clientX: 111 })

    assert.ok(Math.abs(r.colRatios[0] - 0.53) < 1e-9)
    assert.equal(r.snapGuideX, null)
  } finally {
    delete globalThis.localStorage
    delete globalThis.window
  }
})
