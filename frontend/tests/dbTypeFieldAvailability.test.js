import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allowsMultiselect,
  buildFieldTypeOptions,
  isMultiselectFieldType,
  MULTISELECT_FIELD_TYPES,
} from '../src/composables/fieldTypeAvailability.js'

const FIELD_TYPES = [
  '文本',
  '数值',
  '日期',
  '日期时间',
  '时间',
  '单选',
  '多选',
  '单选（纵向）',
  '多选（纵向）',
  '复选',
]

describe('fieldTypeAvailability', () => {
  it('allowsMultiselect only for 赛美斯', () => {
    assert.equal(allowsMultiselect('赛美斯'), true)
    assert.equal(allowsMultiselect('其他'), false)
    assert.equal(allowsMultiselect(undefined), false)
    assert.equal(allowsMultiselect(null), false)
  })

  it('isMultiselectFieldType recognizes both multiselect labels', () => {
    assert.equal(isMultiselectFieldType('多选'), true)
    assert.equal(isMultiselectFieldType('多选（纵向）'), true)
    assert.equal(isMultiselectFieldType('单选'), false)
    assert.deepEqual([...MULTISELECT_FIELD_TYPES], ['多选', '多选（纵向）'])
  })

  it('hides both multiselect types under 其他 when current is non-multi', () => {
    const opts = buildFieldTypeOptions(FIELD_TYPES, '其他', '文本')
    assert.equal(opts.some((o) => o.value === '多选'), false)
    assert.equal(opts.some((o) => o.value === '多选（纵向）'), false)
    assert.equal(opts.find((o) => o.value === '文本')?.disabled, false)
  })

  it('keeps current 多选 as disabled under 其他 and drops 多选（纵向）', () => {
    const opts = buildFieldTypeOptions(FIELD_TYPES, '其他', '多选')
    const multi = opts.filter((o) => o.value === '多选')
    assert.equal(multi.length, 1)
    assert.equal(multi[0].disabled, true)
    assert.equal(opts.some((o) => o.value === '多选（纵向）'), false)
  })

  it('includes both multiselect types under 赛美斯', () => {
    const opts = buildFieldTypeOptions(FIELD_TYPES, '赛美斯', '文本')
    const multi = opts.filter((o) => isMultiselectFieldType(o.value))
    assert.equal(multi.length, 2)
    assert.ok(multi.every((o) => o.disabled === false))
  })

  it('preserves relative order of non-filtered types', () => {
    const opts = buildFieldTypeOptions(FIELD_TYPES, '其他', '文本')
    const values = opts.map((o) => o.value)
    assert.deepEqual(
      values,
      FIELD_TYPES.filter((t) => !isMultiselectFieldType(t)),
    )
  })
})
