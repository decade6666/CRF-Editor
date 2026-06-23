import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')

test('FieldsTab field editor footer uses equal-width cancel and save buttons', () => {
  const footerMatch = source.match(/<div style="display:flex;gap:8px;margin-top:4px">([\s\S]*?)<\/div>/)
  assert.ok(footerMatch, 'field editor footer action row should exist')
  const footer = footerMatch[1]
  assert.match(footer, /<el-button size="small" style="flex:1" @click="clearSelection">取消<\/el-button>/)
  assert.match(footer, /<el-button type="primary" size="small" style="flex:1" @click="save">保存<\/el-button>/)
})
