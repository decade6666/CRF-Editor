/**
 * 日期时间 / 时间字段「仅到小时」格式契约
 *
 * 覆盖 design.md 的占位表（preview/export 双侧锚点）与共享选项模块：
 * - dateFormatOptions.js 是字段库 + 设计器共用的唯一选项来源
 * - renderCtrl 对 HH / yyyy-MM-dd HH / hh AP 输出「时」标签
 * - computeFieldControlWeight 与导出占位文本等重（跨栈宽度契约）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS } from '../src/composables/dateFormatOptions.js'
import { normalizeDateFormat } from '../src/composables/formDesignerPropertyEditor.js'
import {
  renderCtrl,
  computeFieldControlWeight,
} from '../src/composables/useCRFRenderer.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fieldsTabSource = readFileSync(
  path.resolve(currentDir, '../src/components/FieldsTab.vue'),
  'utf8',
)
const formDesignerSource = readFileSync(
  path.resolve(currentDir, '../src/components/FormDesignerTab.vue'),
  'utf8',
)

test('shared DATE_FORMAT_OPTIONS lists the hour-only formats in the designed order', () => {
  assert.deepEqual(DATE_FORMAT_OPTIONS, {
    日期: ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MMM/yyyy', 'dd-MMM-yyyy', 'yyyy/MM/dd'],
    日期时间: ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH', 'yyyy/MM/dd HH:mm:ss', 'dd/MM/yyyy HH:mm:ss'],
    时间: ['HH:mm:ss', 'HH:mm', 'HH', 'hh:mm:ss AP', 'hh:mm AP', 'hh AP'],
  })
})

test('shared DEFAULT_DATE_FORMATS keeps the existing type defaults', () => {
  assert.deepEqual(DEFAULT_DATE_FORMATS, {
    日期: 'yyyy-MM-dd',
    日期时间: 'yyyy-MM-dd HH:mm',
    时间: 'HH:mm',
  })
})

test('field library and designer import the shared lists and keep no local copy', () => {
  const importPattern = /import\s*\{[^}]*DATE_FORMAT_OPTIONS[^}]*\}\s*from\s*'\.\.\/composables\/dateFormatOptions\.js'/
  assert.match(fieldsTabSource, importPattern)
  assert.match(formDesignerSource, importPattern)
  assert.doesNotMatch(fieldsTabSource, /const\s+DATE_FORMAT_OPTIONS|const\s+DEFAULT_DATE_FORMATS/)
  assert.doesNotMatch(formDesignerSource, /const\s+DATE_FORMAT_OPTIONS|const\s+DEFAULT_DATE_FORMATS/)
})

test('normalizeDateFormat keeps the new hour-only values', () => {
  assert.equal(normalizeDateFormat('日期时间', 'yyyy-MM-dd HH', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'yyyy-MM-dd HH')
  assert.equal(normalizeDateFormat('时间', 'HH', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'HH')
  assert.equal(normalizeDateFormat('时间', 'hh AP', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'hh AP')
})

test('renderCtrl placeholder table — new hour-only formats', () => {
  assert.equal(
    renderCtrl({ field_type: '日期时间', date_format: 'yyyy-MM-dd HH' }),
    '|__|__|__|__|年|__|__|月|__|__|日  |__|__|时',
  )
  assert.equal(
    renderCtrl({ field_type: '时间', date_format: 'HH' }),
    '|__|__|时',
  )
  assert.equal(
    renderCtrl({ field_type: '时间', date_format: 'hh AP' }),
    '|__|__|时  AP',
  )
})

test('renderCtrl placeholder table — existing formats stay byte-identical', () => {
  assert.equal(
    renderCtrl({ field_type: '日期时间', date_format: 'yyyy-MM-dd HH:mm' }),
    '|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分',
  )
  assert.equal(
    renderCtrl({ field_type: '日期时间', date_format: 'yyyy-MM-dd HH:mm:ss' }),
    '|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分|__|__|秒',
  )
  assert.equal(
    renderCtrl({ field_type: '时间', date_format: 'HH:mm' }),
    '|__|__|时|__|__|分',
  )
  assert.equal(
    renderCtrl({ field_type: '时间', date_format: 'HH:mm:ss' }),
    '|__|__|时|__|__|分|__|__|秒',
  )
  assert.equal(
    renderCtrl({ field_type: '时间', date_format: 'hh:mm AP' }),
    '|__|__|时|__|__|分  AP',
  )
  assert.equal(
    renderCtrl({ field_type: '日期时间', date_format: null }),
    '|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分',
  )
  assert.equal(
    renderCtrl({ field_type: '时间', date_format: '' }),
    '|__|__|时|__|__|分',
  )
})

test('computeFieldControlWeight matches the exported placeholder text for hour-only formats', () => {
  const asFormField = (field_type, date_format) => ({
    field_definition: { field_type, date_format },
  })
  assert.equal(computeFieldControlWeight(asFormField('时间', 'HH')), 9)
  assert.equal(computeFieldControlWeight(asFormField('日期时间', 'yyyy-MM-dd HH')), 44)
})
