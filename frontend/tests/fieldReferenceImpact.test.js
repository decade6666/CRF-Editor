import test from 'node:test'
import assert from 'node:assert/strict'
import { countDistinctForms, formatFieldImpactMessage } from '../src/composables/fieldReferenceImpact.js'

test('countDistinctForms counts unique form_name and form_code pairs', () => {
  const refs = [
    { form_name: '筛选表', form_code: 'SCR' },
    { form_name: '筛选表', form_code: 'SCR' },
    { form_name: '访视表', form_code: 'VIS' },
  ]

  assert.equal(countDistinctForms(refs), 2)
})

test('countDistinctForms does not treat repeated instances in one form as multiple forms', () => {
  const refs = [
    { form_name: '日志表', form_code: 'LOG' },
    { form_name: '日志表', form_code: 'LOG' },
    { form_name: '日志表', form_code: 'LOG' },
  ]

  assert.equal(countDistinctForms(refs), 1)
})

test('countDistinctForms ignores null refs and refs without form identity', () => {
  const refs = [
    null,
    {},
    { form_name: '', form_code: '' },
    { form_name: '  ', form_code: null },
    { form_name: '筛选表', form_code: null },
    { form_name: '筛选表', form_code: null },
  ]

  assert.equal(countDistinctForms(refs), 1)
  assert.equal(formatFieldImpactMessage(refs), '筛选表()')
})

test('formatFieldImpactMessage formats distinct forms with truncRefs-style truncation', () => {
  const refs = [
    { form_name: '筛选表', form_code: 'SCR' },
    { form_name: '筛选表', form_code: 'SCR' },
    { form_name: '基线表', form_code: 'BASE' },
    { form_name: '随访表', form_code: 'FU' },
    { form_name: '安全性表', form_code: 'SAFE' },
  ]

  assert.equal(
    formatFieldImpactMessage(refs, { max: 3, sep: '、' }),
    '筛选表(SCR)、基线表(BASE)、随访表(FU)、...等共4条',
  )
})

test('formatFieldImpactMessage keeps all distinct forms when below the limit', () => {
  const refs = [
    { form_name: '筛选表', form_code: 'SCR' },
    { form_name: '基线表', form_code: 'BASE' },
  ]

  assert.equal(
    formatFieldImpactMessage(refs, { max: 5, sep: '、' }),
    '筛选表(SCR)、基线表(BASE)',
  )
})
