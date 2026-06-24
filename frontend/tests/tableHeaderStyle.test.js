import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const cssSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8')
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `${startMarker} must exist`)

  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${endMarker} must exist after ${startMarker}`)

  return source.slice(start, end)
}

test('Element Plus table headers keep themed fill and centered header text', () => {
  assert.match(
    cssSource,
    /\.el-table__header-wrapper th\.el-table__cell\s*\{[\s\S]*background-color:\s*var\(--color-primary-subtle\);[\s\S]*color:\s*var\(--color-text-primary\);[\s\S]*text-align:\s*center;/,
  )
})

test('Element Plus fixed operation column headers override the fixed-column background rule', () => {
  assert.match(
    cssSource,
    /\.el-table \.el-table__header-wrapper tr th\.el-table-fixed-column--left,\s*\.el-table \.el-table__header-wrapper tr th\.el-table-fixed-column--right\s*\{[\s\S]*background:\s*var\(--color-primary-subtle\);[\s\S]*background-color:\s*var\(--color-primary-subtle\);/,
  )
  assert.match(
    cssSource,
    /\.el-table \.el-table__header-wrapper tr th\.el-table__fixed-right-patch\s*\{[\s\S]*background:\s*var\(--color-primary-subtle\);/,
  )
})

test('CodelistsTab option list uses Element Plus bordered table headers', () => {
  const optionTable = extractBetween(codelistsSource, '<!-- 选项列表 -->', '</el-table>')

  assert.match(optionTable, /<el-table[\s\S]*border/)
  assert.match(optionTable, /label="序号"/)
  assert.match(optionTable, /label="标签"/)
  assert.match(optionTable, /label="后加下划线"/)
  assert.match(optionTable, /label="操作"/)
  assert.doesNotMatch(optionTable, /manual-list-header option-list-header/)
})

test('VisitsTab visit-form list header centers all visible header labels', () => {
  const visitFormHeader = extractBetween(visitsSource, '<!-- 表单列表表头 -->', '<!-- 表单列表（按 sequence 顺序，只读，添加/删除） -->')

  assert.match(visitFormHeader, /class="manual-list-header visit-form-list-header"/)
  assert.match(visitFormHeader, /class="visit-form-order-header">序号<\/span>/)
  assert.match(visitFormHeader, /class="visit-form-name-header">表单名称<\/span>/)
  assert.match(visitFormHeader, /class="visit-form-action-header">操作<\/span>/)
  assert.doesNotMatch(visitFormHeader, /text-align\s*:\s*(right|left)/)
})
