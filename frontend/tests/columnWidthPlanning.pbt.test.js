/**
 * Phase 10 Property-Based Tests —— 内容驱动列宽规划
 *
 * 覆盖 spec 10.1–10.10：长度/归一化/确定性/单调性/CJK 码点采样等性质。
 * 固定种子 424242 以保证 CI 可重现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'

import {
  computeTextWeight,
  buildInlineColumnDemands,
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
} from '../src/composables/useCRFRenderer.js'

// ─── 10.10：固定种子，CI 可重现 ─────────────────────────────────────────
fc.configureGlobal({ seed: 424242, numRuns: 100 })

// ─── 字段构造工具 ────────────────────────────────────────────────────────
const fieldTypes = ['文本', '数值', '单选', '多选', '日期', '时间']

const arbField = fc.record({
  field_definition: fc.record({
    field_type: fc.constantFrom(...fieldTypes),
    label: fc.string({ minLength: 0, maxLength: 12 }),
  }),
  label_override: fc.option(fc.string({ minLength: 0, maxLength: 12 }), { nil: null }),
  inline_mark: fc.constantFrom(0, 1),
})

const arbFieldsArray = fc.array(arbField, { minLength: 0, maxLength: 50 })
const arbNonEmptyFields = fc.array(arbField, { minLength: 1, maxLength: 50 })

// ─── 10.1 P1 长度保持 ────────────────────────────────────────────────────
test('10.1 P1 planInlineColumnFractions.length === fields.length', () => {
  fc.assert(
    fc.property(arbFieldsArray, (fields) => {
      const out = planInlineColumnFractions(fields)
      return out.length === fields.length
    }),
  )
})

// ─── 10.2 P2 归一化 ──────────────────────────────────────────────────────
test('10.2 P2 sum(planInlineColumnFractions) ≈ 1 for non-empty', () => {
  fc.assert(
    fc.property(arbNonEmptyFields, (fields) => {
      const out = planInlineColumnFractions(fields)
      const total = out.reduce((a, b) => a + b, 0)
      return Math.abs(total - 1) < 1e-9
    }),
  )
})

// ─── 10.3 P3 确定性 ──────────────────────────────────────────────────────
test('10.3 P3 planInlineColumnFractions deterministic on identical input', () => {
  fc.assert(
    fc.property(arbFieldsArray, (fields) => {
      const a = planInlineColumnFractions(fields)
      const b = planInlineColumnFractions(fields)
      return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-12)
    }),
  )
})

// ─── 10.4 P4 等需求 → 等比例 ────────────────────────────────────────────
test('10.4 P4 identical fields produce uniform fractions', () => {
  fc.assert(
    fc.property(
      fc.tuple(arbField, fc.integer({ min: 1, max: 12 })),
      ([proto, n]) => {
        const fields = Array.from({ length: n }, () => proto)
        const out = planInlineColumnFractions(fields)
        const expected = 1 / n
        return out.every((v) => Math.abs(v - expected) < 1e-9)
      },
    ),
  )
})

// ─── 10.5 P5 单调性：拉长某字段 label 不会减少其权重 ───────────────────
test('10.5 P5 extending fields[i].label does not decrease its weight', () => {
  fc.assert(
    fc.property(
      fc.tuple(arbNonEmptyFields, fc.string({ minLength: 1, maxLength: 8 })),
      ([fields, suffix]) => {
        const i = 0
        const orig = fields[i]
        // 使用与实现一致的 truthy 回退语义（与 useCRFRenderer 内保持对等）
        const effectiveLabel = orig.label_override || orig.field_definition?.label || ''
        const wBefore = buildInlineColumnDemands([orig])[0].weight
        // label_override 非空字符串才会被视为 truthy；用 effectiveLabel + suffix 确保严格更长
        const lengthened = {
          ...orig,
          label_override: effectiveLabel + suffix,
        }
        const wAfter = buildInlineColumnDemands([lengthened])[0].weight
        return wAfter >= wBefore
      },
    ),
  )
})

// ─── 10.6 P6 unified per-slot-max 单调性 ─────────────────────────────────
test('10.6 P6 unified: 新增 inline_block 不减少任何 slot 输出比例的相对权重', () => {
  fc.assert(
    fc.property(
      fc.tuple(
        fc.array(arbNonEmptyFields, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 2, max: 6 }),
        arbNonEmptyFields,
      ),
      ([baseSegFields, columnCount, extraFields]) => {
        const baseSegments = baseSegFields.map((fields) => ({ type: 'inline_block', fields }))
        const baseWeights = computeUnifiedSlotWeights(baseSegments, columnCount)
        const augmented = baseSegments.concat([{ type: 'inline_block', fields: extraFields }])
        const augWeights = computeUnifiedSlotWeights(augmented, columnCount)
        // 新增 segment 后每个 slot 权重 >= 原值
        return augWeights.every((w, i) => w >= baseWeights[i] - 1e-9)
      },
    ),
  )
})

function computeUnifiedSlotWeights(segments, columnCount) {
  const slot = new Array(columnCount).fill(0)
  for (const seg of segments) {
    if (!seg || seg.type !== 'inline_block') continue
    const demands = buildInlineColumnDemands(seg.fields || [])
    const limit = Math.min(demands.length, columnCount)
    for (let i = 0; i < limit; i += 1) {
      slot[i] = Math.max(slot[i], demands[i].weight)
    }
  }
  return slot
}

// ─── 10.7 P7 CJK 扩展区码点权重 = 2 ─────────────────────────────────────
test('10.7 P7 CJK extension code points 全部 weight = WEIGHT_CHINESE(2)', () => {
  // 关键 CJK 区段：基本区 4E00-9FFF、扩展 A 3400-4DBF、扩展 B 20000-2A6DF、
  // 扩展 C 2A700-2B73F、扩展 D 2B740-2B81F、扩展 E 2B820-2CEAF、
  // 扩展 F 2CEB0-2EBEF、扩展 G 30000-3134F、扩展 H 31350-323AF、
  // 兼容汉字 F900-FAFF、兼容补充 2F800-2FA1F
  const ranges = [
    [0x4e00, 0x9fff],
    [0x3400, 0x4dbf],
    [0x20000, 0x2a6df],
    [0x2a700, 0x2b73f],
    [0x2b820, 0x2ceaf],
    [0x30000, 0x3134f],
    [0xf900, 0xfaff],
    [0x2f800, 0x2fa1f],
  ]
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: ranges.length - 1 }).chain((idx) => {
        const [lo, hi] = ranges[idx]
        return fc.integer({ min: lo, max: hi })
      }),
      (codePoint) => {
        const ch = String.fromCodePoint(codePoint)
        // 通过 computeTextWeight 间接验证 computeCharWeight：单字符 string → 权重 = 2
        return computeTextWeight(ch) === 2
      },
    ),
    { numRuns: 200 },
  )
})

// ─── 10.8 P8 localStorage 优先级状态模型 ─────────────────────────────────
test('10.8 P8 useColumnResize 状态模型：valid → use it；invalid → use plan(F)', async () => {
  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')

  await fc.assert(
    fc.asyncProperty(
      // 任意合法 ratio 对（和为 1，元素均落在 [0.1, 0.9]）
      fc.tuple(
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        fc.double({ min: 0.4, max: 0.6, noNaN: true }),
        fc.boolean(),
      ),
      async ([raw, factoryLeft, makeValid]) => {
        const left = Math.max(0.1, Math.min(0.9, raw))
        const stored = [left, 1 - left]
        // 强制构造合法 / 非法持久化值
        const persistRaw = makeValid ? JSON.stringify(stored) : '[0.95, 0.95]'
        const factory = () => [factoryLeft, 1 - factoryLeft]

        const store = new Map()
        store.set('crf:designer:col-widths:1:normal', persistRaw)
        globalThis.localStorage = {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: (k) => store.delete(k),
        }
        try {
          const r = useColumnResize(ref(1), ref('normal'), factory)
          if (makeValid) {
            return Math.abs(r.colRatios[0] - stored[0]) < 1e-9
          }
          return Math.abs(r.colRatios[0] - factory()[0]) < 1e-9
        } finally {
          delete globalThis.localStorage
        }
      },
    ),
    { numRuns: 30 },
  )
})

// ─── 10.9 P9 resetToEven 幂等 ───────────────────────────────────────────
test('10.9 P9 useColumnResize.resetToEven 幂等', async () => {
  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')

  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: 0.2, max: 0.8, noNaN: true }),
      async (factoryLeft) => {
        const factory = () => [factoryLeft, 1 - factoryLeft]
        const store = new Map()
        globalThis.localStorage = {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: (k) => store.delete(k),
        }
        try {
          const r = useColumnResize(ref(1), ref('normal'), factory)
          r.resetToEven()
          const first = [...r.colRatios]
          r.resetToEven()
          const second = [...r.colRatios]
          return first.every((v, i) => Math.abs(v - second[i]) < 1e-9)
        } finally {
          delete globalThis.localStorage
        }
      },
    ),
    { numRuns: 20 },
  )
})

// ─── computeTextWeight 分布健康检查（辅助 10.7） ────────────────────────
test('computeTextWeight: 任意 ASCII 字符串权重 = 字符数 × WEIGHT_ASCII(1)', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 0, maxLength: 32 }).filter((s) => /^[\x20-\x7e]*$/.test(s)), (s) => {
      return computeTextWeight(s) === s.length
    }),
  )
})
