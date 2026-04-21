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
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
} from '../src/composables/useCRFRenderer.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

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

test('9.2 normal_long_cjk_label_short_control: 10 个中文 label → label 至少与 control 平分', () => {
  // 设计契约：control_weight = max(label_text, FILL_LINE_WEIGHT, 选项 atom, 默认值行)
  // 因此当 label 超过 FILL_LINE_WEIGHT 时，control 与 label 同步上行，二者并列。
  // 反之短 label 时 control 由 FILL_LINE_WEIGHT 兜底，label 落入更小占比。
  const longLabel = '一二三四五六七八九十'
  const longFractions = planNormalColumnFractions([
    { field_definition: { field_type: '文本', label: longLabel } },
  ])
  const shortFractions = planNormalColumnFractions([
    { field_definition: { field_type: '文本', label: '名' } },
  ])
  assert.ok(longFractions[0] >= shortFractions[0], 'long label should weakly dominate short label')
  assert.ok(Math.abs(longFractions[0] - 0.5) < 1e-9, `long label tied at 0.5, got ${longFractions[0]}`)
  assert.ok(shortFractions[0] < 0.5, `short label below 0.5, got ${shortFractions[0]}`)
})

test('9.3 inline_choice_with_trailing_underscore: trailing 增加 FILL_LINE_WEIGHT', () => {
  const withTrailing = computeChoiceAtomWeight('是', true)
  const withoutTrailing = computeChoiceAtomWeight('是', false)
  // FILL_LINE_WEIGHT = 6
  assert.equal(withTrailing - withoutTrailing, 6)

  // buildInlineColumnDemands 对单选字段在 normalize 后传入 trailingUnderscore
  // 兼容：useCRFRenderer 通过 normalizeChoiceOptions 读取 option.trailingUnderscore
  // 直接调用 atom 权重函数已足够覆盖契约（trailing 注入 FILL_LINE_WEIGHT）。
  // 同时确认在缺省 atom 时 fallback 到 FILL_LINE_WEIGHT，保证 inline 列对该字段
  // 至少分配填写线宽度。
  const fields = [
    { field_definition: { field_type: '单选', label: 'X' } },
  ]
  const demands = buildInlineColumnDemands(fields)
  assert.equal(demands.length, 1)
  assert.ok(demands[0].weight >= 6, `inline choice without options falls back to FILL_LINE_WEIGHT, got ${demands[0].weight}`)
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

// ─── 9.8–9.11：useColumnResize 持久化行为 ────────────────────────────────

// 简易 localStorage mock（测试期替换 globalThis.localStorage）
function createLocalStorageStub() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    _peek: () => Object.fromEntries(store),
  }
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

// ─── Phase 12：跨栈 fixture 一致性 ─────────────────────────────────────

function stubFromDict(data) {
  if (data == null) return null
  const fdRaw = data.field_definition
  let field_definition = null
  if (fdRaw) {
    field_definition = {
      field_type: fdRaw.field_type,
      label: fdRaw.label,
      options: fdRaw.options || null,
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
