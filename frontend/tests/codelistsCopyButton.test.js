import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')

function extractBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `${startMarker} must exist`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${endMarker} must exist after ${startMarker}`)
  return source.slice(start, end)
}

test('CodelistsTab exposes copy action through project-scoped copy endpoint', () => {
  const copyFn = extractBetween('async function copyCl(c)', 'async function delCl(c)')

  assert.match(copyFn, /api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{c\.id\}\/copy`, \{\}\)/)
  assert.match(copyFn, /await reload\(\)/)
  assert.match(copyFn, /ElMessage\.success\('复制成功'\)/)
})

test('CodelistsTab operation column matches form list copy edit delete layout', () => {
  const column = extractBetween('<el-table-column label="操作" width="150" fixed="right">', '</el-table-column>')

  assert.match(column, /@click\.stop="copyCl\(row\)"[^>]*>复制<\/el-button>/)
  assert.match(column, /@click\.stop="openEditCl\(row\)"[^>]*>编辑<\/el-button>/)
  assert.match(column, /@click\.stop="delCl\(row\)"[^>]*>删除<\/el-button>/)
  assert.ok(column.indexOf('copyCl(row)') < column.indexOf('openEditCl(row)'))
  assert.ok(column.indexOf('openEditCl(row)') < column.indexOf('delCl(row)'))
})
