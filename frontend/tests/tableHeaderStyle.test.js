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

test('VisitsTab visit-form list uses Element Plus bordered table headers', () => {
  assert.match(
    visitsSource,
    /<el-table[\s\S]*ref="visitFormsTableRef"[\s\S]*:data="visitForms"[\s\S]*size="small"[\s\S]*border[\s\S]*highlight-current-row[\s\S]*row-key="id"/,
  )
  assert.match(visitsSource, /<el-table-column width="32">/)
  assert.match(visitsSource, /<el-table-column label="序号" width="100">/)
  assert.match(visitsSource, /<el-table-column prop="name" label="表单名称" show-overflow-tooltip \/>/)
  assert.match(visitsSource, /<el-table-column label="操作" width="110" fixed="right">/)
  assert.doesNotMatch(visitsSource, /manual-list-header visit-form-list-header/)
})
