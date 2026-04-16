import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHexColorInput, syncFieldTypeSpecificProps } from '../src/composables/formDesignerPropertyEditor.js'

const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd', 'MM/dd/yyyy'],
  日期时间: ['yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm:ss'],
  时间: ['HH:mm:ss', 'HH:mm'],
}

const DEFAULT_DATE_FORMATS = {
  日期: 'yyyy-MM-dd',
  日期时间: 'yyyy-MM-dd HH:mm',
  时间: 'HH:mm',
}

test('syncFieldTypeSpecificProps clears stale choice and unit references when type changes', () => {
  const next = syncFieldTypeSpecificProps({
    field_type: '单选',
    codelist_id: 12,
    unit_id: 9,
    integer_digits: 4,
    decimal_digits: 2,
    date_format: 'yyyy-MM-dd',
  }, '日期', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(next.codelist_id, null)
  assert.equal(next.unit_id, null)
  assert.equal(next.integer_digits, null)
  assert.equal(next.decimal_digits, null)
  assert.equal(next.date_format, 'yyyy-MM-dd')
})

test('syncFieldTypeSpecificProps preserves compatible references for numeric fields', () => {
  const next = syncFieldTypeSpecificProps({
    field_type: '文本',
    codelist_id: null,
    unit_id: 5,
    integer_digits: 6,
    decimal_digits: 1,
    date_format: 'HH:mm',
  }, '数值', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(next.unit_id, 5)
  assert.equal(next.integer_digits, 6)
  assert.equal(next.decimal_digits, 1)
  assert.equal(next.date_format, null)
})

test('syncFieldTypeSpecificProps assigns default date format when current one is incompatible', () => {
  const next = syncFieldTypeSpecificProps({
    field_type: '文本',
    codelist_id: null,
    unit_id: null,
    integer_digits: null,
    decimal_digits: null,
    date_format: 'HH:mm',
  }, '日期时间', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(next.date_format, 'yyyy-MM-dd HH:mm')
})

test('normalizeHexColorInput accepts 3 or 6 digit hex values', () => {
  assert.equal(normalizeHexColorInput('#abc'), 'ABC')
  assert.equal(normalizeHexColorInput('a1b2c3'), 'A1B2C3')
})

test('normalizeHexColorInput rejects invalid values', () => {
  assert.equal(normalizeHexColorInput(''), null)
  assert.equal(normalizeHexColorInput('xyz'), null)
  assert.equal(normalizeHexColorInput('fff;display:none'), null)
})
