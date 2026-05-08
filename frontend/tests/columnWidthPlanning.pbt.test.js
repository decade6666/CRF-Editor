/**
 * Phase 10 Property-Based Tests —— 内容驱动列宽规划
 *
 * 覆盖 spec 10.1–10.10：长度/归一化/确定性/单调性/CJK 码点采样等性质。
 * 固定种子 424242 以保证 CI 可重现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  asciiString,
  boolean,
  double,
  forAll,
  integer,
  maybe,
  repeat,
  sample,
  string,
} from './testProperty.js'

import {
  computeTextWeight,
  buildInlineColumnDemands,
  computeFieldControlWeight,
  planInlineColumnFractions,
  planUnifiedColumnFractions,
} from '../src/composables/useCRFRenderer.js'

const SEED = 424242
const RUNS = 100
const fieldTypes = ['文本', '数值', '单选', '多选', '日期', '时间']

function makeField(random) {
  return {
    field_definition: {
      field_type: sample(fieldTypes, random),
      label: string(random, 0, 12),
    },
    label_override: maybe(random, () => string(random, 0, 12), null),
    inline_mark: sample([0, 1], random),
  }
}

function makeFieldsArray(random, minLength, maxLength) {
  return repeat(integer(random, minLength, maxLength), () => makeField(random))
}

function computeUnifiedSlotWeights(segments, columnCount) {
  const WEIGHT_ASCII = 1
  const slot = new Array(columnCount).fill(0)
  for (const seg of segments) {
    if (!seg) continue
    if (seg.type === 'inline_block') {
      const demands = buildInlineColumnDemands(seg.fields || [])
      const limit = Math.min(demands.length, columnCount)
      for (let i = 0; i < limit; i += 1) {
        slot[i] = Math.max(slot[i], demands[i].weight)
      }
    } else if (seg.type === 'regular_field' && seg.fields?.length && columnCount >= 2) {
      const field = seg.fields[0]
      if (field) {
        const { labelSpan, valueSpan } = computeRegularFieldSpans(columnCount)
        const labelText = field.label_override || field.field_definition?.label || ''
        applySpannedWeight(slot, 0, labelSpan, computeTextWeight(labelText))
        applySpannedWeight(slot, labelSpan, valueSpan, computeFieldControlWeight(field))
      }
    }
  }
  return slot.map((weight) => Math.max(weight, WEIGHT_ASCII * 4))
}

function computeRegularFieldSpans(columnCount) {
  const labelSpan = Math.max(1, Math.min(columnCount - 1, Math.round(columnCount * 0.4)))
  return { labelSpan, valueSpan: columnCount - labelSpan }
}

function applySpannedWeight(slot, start, span, weight) {
  if (!Number.isFinite(weight) || weight <= 0 || span <= 0) return
  const end = Math.min(slot.length, start + span)
  const perSlotWeight = weight / (end - start)
  for (let i = start; i < end; i += 1) {
    slot[i] = Math.max(slot[i], perSlotWeight)
  }
}

test('10.1 P1 planInlineColumnFractions.length === fields.length', async () => {
  await forAll({
    seed: SEED,
    runs: RUNS,
    property: ({ random, run }) => {
      const fields = makeFieldsArray(random, 0, 50)
      const out = planInlineColumnFractions(fields)
      assert.equal(out.length, fields.length, `run=${run}`)
    },
  })
})

test('10.2 P2 sum(planInlineColumnFractions) ≈ 1 for non-empty', async () => {
  await forAll({
    seed: SEED + 1,
    runs: RUNS,
    property: ({ random, run }) => {
      const fields = makeFieldsArray(random, 1, 50)
      const total = planInlineColumnFractions(fields).reduce((a, b) => a + b, 0)
      assert.ok(Math.abs(total - 1) < 1e-9, `run=${run} total=${total}`)
    },
  })
})

test('10.3 P3 planInlineColumnFractions deterministic on identical input', async () => {
  await forAll({
    seed: SEED + 2,
    runs: RUNS,
    property: ({ random, run }) => {
      const fields = makeFieldsArray(random, 0, 50)
      const a = planInlineColumnFractions(fields)
      const b = planInlineColumnFractions(fields)
      assert.equal(a.length, b.length, `run=${run}`)
      assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-12), `run=${run}`)
    },
  })
})

test('10.4 P4 identical fields produce uniform fractions', async () => {
  await forAll({
    seed: SEED + 3,
    runs: RUNS,
    property: ({ random, run }) => {
      const proto = makeField(random)
      const count = integer(random, 1, 12)
      const fields = Array.from({ length: count }, () => proto)
      const out = planInlineColumnFractions(fields)
      const expected = 1 / count
      assert.ok(out.every((value) => Math.abs(value - expected) < 1e-9), `run=${run} count=${count}`)
    },
  })
})

test('10.5 P5 extending fields[i].label does not decrease its weight', async () => {
  await forAll({
    seed: SEED + 4,
    runs: RUNS,
    property: ({ random, run }) => {
      const fields = makeFieldsArray(random, 1, 50)
      const suffix = string(random, 1, 8)
      const orig = fields[0]
      const effectiveLabel = orig.label_override || orig.field_definition?.label || ''
      const wBefore = buildInlineColumnDemands([orig])[0].weight
      const lengthened = { ...orig, label_override: effectiveLabel + suffix }
      const wAfter = buildInlineColumnDemands([lengthened])[0].weight
      assert.ok(wAfter >= wBefore, `run=${run}`)
    },
  })
})

test('10.6 P6 unified: 新增 inline_block 或 regular_field 不减少任何 slot 输出比例的相对权重', async () => {
  await forAll({
    seed: SEED + 5,
    runs: RUNS,
    property: ({ random, run }) => {
      const segmentCount = integer(random, 1, 4)
      const baseSegments = Array.from({ length: segmentCount }, () => ({
        type: 'inline_block',
        fields: makeFieldsArray(random, 1, 50),
      }))
      const columnCount = integer(random, 2, 6)
      const extraFields = makeFieldsArray(random, 1, 50)
      const isRegular = boolean(random)
      const baseWeights = computeUnifiedSlotWeights(baseSegments, columnCount)
      const newSegment = isRegular
        ? { type: 'regular_field', fields: extraFields.slice(0, 1) }
        : { type: 'inline_block', fields: extraFields }
      const augWeights = computeUnifiedSlotWeights(baseSegments.concat([newSegment]), columnCount)
      assert.ok(augWeights.every((weight, index) => weight >= baseWeights[index] - 1e-9), `run=${run}`)
    },
  })
})

test('10.7 P7 CJK extension code points 全部 weight = WEIGHT_CHINESE(2)', async () => {
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
  await forAll({
    seed: SEED + 6,
    runs: 200,
    property: ({ random, run }) => {
      const [lo, hi] = sample(ranges, random)
      const codePoint = integer(random, lo, hi)
      const ch = String.fromCodePoint(codePoint)
      assert.equal(computeTextWeight(ch), 2, `run=${run} codePoint=${codePoint}`)
    },
  })
})

test('10.8 P8 useColumnResize 状态模型：valid → use it；invalid → use plan(F)', async () => {
  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  await forAll({
    seed: SEED + 7,
    runs: 30,
    property: async ({ random, run }) => {
      const raw = double(random, 0.1, 0.9)
      const factoryLeft = double(random, 0.4, 0.6)
      const makeValid = boolean(random)
      const left = Math.max(0.1, Math.min(0.9, raw))
      const stored = [left, 1 - left]
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
          assert.ok(Math.abs(r.colRatios[0] - stored[0]) < 1e-9, `run=${run}`)
        } else {
          assert.ok(Math.abs(r.colRatios[0] - factory()[0]) < 1e-9, `run=${run}`)
        }
      } finally {
        delete globalThis.localStorage
      }
    },
  })
})

test('10.9 P9 useColumnResize.resetToEven 幂等', async () => {
  const { useColumnResize } = await import('../src/composables/useColumnResize.js')
  const { ref } = await import('vue')
  await forAll({
    seed: SEED + 8,
    runs: 20,
    property: async ({ random, run }) => {
      const factoryLeft = double(random, 0.2, 0.8)
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
        assert.ok(first.every((value, index) => Math.abs(value - second[index]) < 1e-9), `run=${run}`)
      } finally {
        delete globalThis.localStorage
      }
    },
  })
})

test('computeTextWeight: 任意 ASCII 字符串权重 = 字符数 × WEIGHT_ASCII(1)', async () => {
  await forAll({
    seed: SEED + 9,
    runs: RUNS,
    property: ({ random, run }) => {
      const value = asciiString(random, 0, 32)
      assert.equal(computeTextWeight(value), value.length, `run=${run}`)
    },
  })
})
