import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isDefaultValueSupported,
  normalizeDefaultValue,
} from '../src/composables/useCRFRenderer.js'
import { isLogRowField } from '../src/composables/formFieldPresentation.js'

const root = resolve(import.meta.dirname, '..')
const cases = JSON.parse(
  readFileSync(resolve(root, '../backend/tests/fixtures/field_normalization_cases.json'), 'utf8'),
)

function canToggleInline(fieldType, isLogRow = false) {
  if (isLogRow) return false
  return fieldType !== '标签' && fieldType !== '日志行'
}

function normalizeFieldInstanceDefaultValue(fieldType, inlineMark, defaultValue) {
  if (!isDefaultValueSupported(fieldType, Boolean(inlineMark))) return null
  const normalized = normalizeDefaultValue(defaultValue, !inlineMark)
  return normalized || null
}

function normalizeFieldInstanceInlineMark(fieldType, isLogRow, inlineMark) {
  return canToggleInline(fieldType, isLogRow) ? (inlineMark ? 1 : 0) : 0
}

for (const c of cases) {
  test(`parity case ${c.field_type}|inline=${c.inline_mark}`, () => {
    assert.equal(isDefaultValueSupported(c.field_type, Boolean(c.inline_mark)), c.default_supported)

    const finalInline = normalizeFieldInstanceInlineMark(c.field_type, false, c.inline_mark)
    assert.equal(
      normalizeFieldInstanceDefaultValue(c.field_type, finalInline, c.default_value),
      c.expected_default_value,
    )
    assert.equal(finalInline, c.expected_inline)
    assert.equal(canToggleInline(c.field_type, false), c.inline_allowed)
    assert.equal(canToggleInline(c.field_type, true), false)
  })
}

test('log-row instances never toggle inline regardless of type', () => {
  assert.equal(canToggleInline('文本', true), false)
  assert.equal(isLogRowField({ is_log_row: 1 }), true)
})

test('normalizeDefaultValue keeps whitespace-only text like the backend', () => {
  assert.equal(normalizeDefaultValue('  ', true), '  ')
})
