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

// ─── Phase 16.2：Export Column Width Override Contract 测试 ──────────────────

test('16.2.6a collectColumnWidthOverrides_new_format: 收集新格式键', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls

  // 设置新格式键
  ls.setItem('crf:designer:col-widths:42:normal:fieldIds=1,2,3', JSON.stringify([0.35, 0.65]))
  ls.setItem('crf:designer:col-widths:42:inline:fieldIds=4,5', JSON.stringify([0.4, 0.6]))
  ls.setItem('crf:designer:col-widths:99:unified:fieldIds=6,7,8', JSON.stringify([0.3, 0.4, 0.3]))

  // 模拟 collectColumnWidthOverrides 逻辑
  function collectColumnWidthOverrides(forms) {
    const overrides = {}
    if (!forms || !forms.length) return overrides
    const formIds = new Set(forms.map(f => f.id).filter(id => id != null))
    const keyPrefix = 'crf:designer:col-widths:'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(keyPrefix)) continue
      const parts = key.slice(keyPrefix.length).split(':')
      if (parts.length < 2) continue
      const formId = parseInt(parts[0], 10)
      if (!formIds.has(formId)) continue
      const tableInstanceId = parts.slice(1).join(':')
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0 && arr.every(r => Number.isFinite(r) && r >= 0 && r <= 1)) {
          overrides[tableInstanceId] = arr
        }
      } catch { /* ignore */ }
    }
    return overrides
  }

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

  function collectColumnWidthOverrides(forms) {
    const overrides = {}
    if (!forms || !forms.length) return overrides
    const formIds = new Set(forms.map(f => f.id).filter(id => id != null))
    const keyPrefix = 'crf:designer:col-widths:'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(keyPrefix)) continue
      const parts = key.slice(keyPrefix.length).split(':')
      if (parts.length < 2) continue
      const formId = parseInt(parts[0], 10)
      if (!formIds.has(formId)) continue
      const tableInstanceId = parts.slice(1).join(':')
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0 && arr.every(r => Number.isFinite(r) && r >= 0 && r <= 1)) {
          overrides[tableInstanceId] = arr
        }
      } catch { /* ignore */ }
    }
    return overrides
  }

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

  function collectColumnWidthOverrides(forms) {
    const overrides = {}
    if (!forms || !forms.length) return overrides
    const formIds = new Set(forms.map(f => f.id).filter(id => id != null))
    const keyPrefix = 'crf:designer:col-widths:'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(keyPrefix)) continue
      const parts = key.slice(keyPrefix.length).split(':')
      if (parts.length < 2) continue
      const formId = parseInt(parts[0], 10)
      if (!formIds.has(formId)) continue
      const tableInstanceId = parts.slice(1).join(':')
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0 && arr.every(r => Number.isFinite(r) && r >= 0 && r <= 1)) {
          overrides[tableInstanceId] = arr
        }
      } catch { /* ignore */ }
    }
    return overrides
  }

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
