import test from 'node:test'
import assert from 'node:assert/strict'

import {
  shouldUseLandscapePreview,
  isMixedLandscape,
  resolveNormalTableAvailableCm,
  resolveInlineTableAvailableCm,
  AVAILABLE_CM_PORTRAIT,
  AVAILABLE_CM_LANDSCAPE,
} from '../src/composables/visitPreviewLandscape.js'

const inlineGroup = (n) => ({ type: 'inline', fields: Array.from({ length: n }, (_, i) => ({ id: i })) })

const mixedGroups = () => [
  { type: 'normal', fields: [{ id: 1 }] },
  { type: 'inline', fields: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
]

test('returns true when an inline group has more than four fields', () => {
  const groups = [
    { type: 'normal', fields: [{ id: 1 }] },
    { type: 'inline', fields: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
  ]

  assert.equal(shouldUseLandscapePreview(groups), true)
})

test('returns false when inline groups have at most four fields', () => {
  const groups = [
    { type: 'inline', fields: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] },
  ]

  assert.equal(shouldUseLandscapePreview(groups), false)
})

test('returns false when there are no inline groups', () => {
  const groups = [
    { type: 'normal', fields: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
  ]

  assert.equal(shouldUseLandscapePreview(groups), false)
})

test('returns false for empty groups', () => {
  assert.equal(shouldUseLandscapePreview([]), false)
})

// ── mixed_landscape 判定 + normal 表可用宽度解析（镜像后端 _classify_form_layout / _build_form_table）──

test('isMixedLandscape: regular + inline>4 + 非 portrait → true', () => {
  assert.equal(isMixedLandscape(mixedGroups(), 'auto'), true)
  assert.equal(isMixedLandscape(mixedGroups(), 'landscape'), true)
})

test('isMixedLandscape: 显式 portrait 抑制 mixed', () => {
  assert.equal(isMixedLandscape(mixedGroups(), 'portrait'), false)
})

test('isMixedLandscape: 无普通字段（纯宽 inline）→ false', () => {
  const groups = [{ type: 'inline', fields: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] }]
  assert.equal(isMixedLandscape(groups, 'auto'), false)
})

test('isMixedLandscape: inline 块 ≤4 → false', () => {
  const groups = [
    { type: 'normal', fields: [{ id: 1 }] },
    { type: 'inline', fields: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] },
  ]
  assert.equal(isMixedLandscape(groups, 'auto'), false)
})

test('resolveNormalTableAvailableCm: auto + mixed_landscape → 23.36（修复 GPT 三轮缺陷）', () => {
  assert.equal(resolveNormalTableAvailableCm(mixedGroups(), 'auto'), AVAILABLE_CM_LANDSCAPE)
})

test('resolveNormalTableAvailableCm: 显式 landscape（非 mixed）→ 23.36', () => {
  const groups = [{ type: 'normal', fields: [{ id: 1 }, { id: 2 }] }]
  assert.equal(resolveNormalTableAvailableCm(groups, 'landscape'), AVAILABLE_CM_LANDSCAPE)
})

test('resolveNormalTableAvailableCm: auto 非 mixed → 14.66', () => {
  const groups = [{ type: 'normal', fields: [{ id: 1 }, { id: 2 }] }]
  assert.equal(resolveNormalTableAvailableCm(groups, 'auto'), AVAILABLE_CM_PORTRAIT)
})

test('resolveNormalTableAvailableCm: 显式 portrait + 宽 inline → 14.66（portrait 抑制）', () => {
  assert.equal(resolveNormalTableAvailableCm(mixedGroups(), 'portrait'), AVAILABLE_CM_PORTRAIT)
})

// ── inline 表可用宽度（镜像后端 _add_inline_table available_cm 的 per-group 解析）──

test('resolveInlineTableAvailableCm: 纯 inline 组 >4 列 → 23.36（needs_temporary_landscape）', () => {
  const g = inlineGroup(7)
  assert.equal(resolveInlineTableAvailableCm([g], g, 'auto'), AVAILABLE_CM_LANDSCAPE)
})

test('resolveInlineTableAvailableCm: 纯 inline 组 ≤4 列 → 14.66', () => {
  const g = inlineGroup(4)
  assert.equal(resolveInlineTableAvailableCm([g], g, 'auto'), AVAILABLE_CM_PORTRAIT)
})

test('resolveInlineTableAvailableCm: 显式 portrait 抑制（即使 >4 列）→ 14.66', () => {
  const g = inlineGroup(7)
  assert.equal(resolveInlineTableAvailableCm([g], g, 'portrait'), AVAILABLE_CM_PORTRAIT)
})

test('resolveInlineTableAvailableCm: 显式 landscape → 23.36', () => {
  const g = inlineGroup(3)
  assert.equal(resolveInlineTableAvailableCm([g], g, 'landscape'), AVAILABLE_CM_LANDSCAPE)
})

test('resolveInlineTableAvailableCm: mixed_landscape 表单里的 ≤4 inline 组 → 23.36', () => {
  // 含普通字段 + 宽 inline 组 → mixed；此时即使是窄 inline 组也走 landscape
  const narrow = inlineGroup(3)
  const groups = [{ type: 'normal', fields: [{ id: 99 }] }, inlineGroup(6)]
  assert.equal(resolveInlineTableAvailableCm(groups, narrow, 'auto'), AVAILABLE_CM_LANDSCAPE)
})
