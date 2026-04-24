#!/usr/bin/env node
/**
 * 生成 backend/tests/fixtures/planner_cases.json 的跨栈 fixture。
 * 使用前端 useCRFRenderer 作为权威 planner，后端测试需匹配其归一化结果（误差 ≤ 1e-6）。
 *
 * 用法：node scripts/generatePlannerFixtures.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
} from '../src/composables/useCRFRenderer.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(currentDir, '../../backend/tests/fixtures/planner_cases.json')

// ─── 构造 fixture 用例 ───────────────────────────────────────────────────
// 字段结构复刻 SQLAlchemy FormField 在 JSON 序列化后的外观，便于后端构造 stub 对象。

const textField = (label, extras = {}) => ({
  label_override: null,
  is_log_row: 0,
  inline_mark: extras.inline_mark ?? 0,
  default_value: extras.default_value ?? null,
  field_definition: {
    field_type: '文本',
    label,
    options: extras.options ?? null,
  },
})

const choiceField = (label, options, extras = {}) => ({
  label_override: null,
  is_log_row: 0,
  inline_mark: 1,
  default_value: null,
  field_definition: {
    field_type: '单选',
    label,
    options: options.map((o) => ({
      decode: o.decode,
      trailingUnderscore: Boolean(o.trailing),
      order_index: o.order_index ?? 0,
    })),
  },
  ...extras,
})

const structuralLabelField = (label) => ({
  label_override: null,
  is_log_row: 0,
  inline_mark: 0,
  default_value: null,
  field_definition: { field_type: '标签', label },
})

const logRow = (label = '以下为log行') => ({
  label_override: label,
  is_log_row: 1,
  inline_mark: 0,
  default_value: null,
  field_definition: { field_type: '文本', label },
})

const rareCjkField = () => ({
  label_override: null,
  is_log_row: 0,
  inline_mark: 0,
  default_value: null,
  field_definition: { field_type: '文本', label: '𠮷吉' },
})

const cases = [
  // ── normal ──
  {
    name: 'normal_short_label_fill_line',
    kind: 'normal',
    description: '单字段 [标签/文本] → [0.4, 0.6]',
    fields: [textField('标签')],
  },
  {
    name: 'normal_long_cjk_label',
    kind: 'normal',
    description: '10 字中文 label → label 与 control 同步上行，平分',
    fields: [textField('一二三四五六七八九十')],
  },
  {
    name: 'normal_mixed_with_structural',
    kind: 'normal',
    description: '混合含标签/log 行 → 结构字段被剔除',
    fields: [
      structuralLabelField('章节标题'),
      textField('姓名'),
      logRow(),
      textField('电话号码'),
    ],
  },
  {
    name: 'normal_rare_cjk_extension',
    kind: 'normal',
    description: '扩展 B 汉字 𠮷 → 权重 = 2 并保留',
    fields: [rareCjkField()],
  },

  // ── inline ──
  {
    name: 'inline_choice_trailing_underscore',
    kind: 'inline',
    description: '单选 + trailing_underscore → atom 权重含 FILL_LINE_WEIGHT',
    fields: [
      choiceField('性别', [
        { decode: '男', trailing: true },
        { decode: '女', trailing: true },
        { decode: '其他', trailing: true },
      ]),
    ],
  },
  {
    name: 'inline_multiline_default_value',
    kind: 'inline',
    description: '多行默认值 → 取最长行权重',
    fields: [
      textField('备注', {
        inline_mark: 1,
        default_value: 'a\nlongest line here\nshort',
      }),
    ],
  },
  {
    name: 'inline_missing_field_definition',
    kind: 'inline',
    description: 'field_definition 缺失 → FILL_LINE_WEIGHT 兜底，不抛异常',
    fields: [{ label_override: null, field_definition: null }],
  },

  // ── unified ──
  {
    name: 'unified_two_blocks_per_slot_max',
    kind: 'unified',
    columnCount: 2,
    description: '两个 inline_block 对同 slot 取最大权重',
    segments: [
      {
        type: 'inline_block',
        fields: [textField('A'), textField('超长的标签文字内容')],
      },
      {
        type: 'inline_block',
        fields: [textField('超长的第一列更长一些更长啊'), textField('B')],
      },
    ],
  },
]

// ─── 计算 expected fractions ─────────────────────────────────────────────
for (const c of cases) {
  if (c.kind === 'normal') {
    c.expected_fractions = planNormalColumnFractions(c.fields)
  } else if (c.kind === 'inline') {
    c.expected_fractions = planInlineColumnFractions(c.fields)
  } else if (c.kind === 'unified') {
    c.expected_fractions = planUnifiedColumnFractions(c.segments, c.columnCount)
  }
}

const output = {
  schemaVersion: 1,
  description: 'Shared planner fixtures used by both frontend (useCRFRenderer) and backend (width_planning) tests. Each case specifies an input field sequence and the normalized expected fractions computed by the canonical frontend planner; backend implementations must match within 1e-6 after normalization.',
  generator: 'frontend/scripts/generatePlannerFixtures.mjs',
  cases,
}

writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8')
console.log(`Wrote ${cases.length} cases to ${outPath}`)
