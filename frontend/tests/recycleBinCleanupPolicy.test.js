import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const adminViewSource = readFileSync(path.resolve(currentDir, '../src/components/AdminView.vue'), 'utf8')

test('cleanup policy dialog uses constrained inputs and canonical unit values', () => {
  assert.match(adminViewSource, /v-model="cleanupPolicyForm\.age\.value"[^\n>]*:min="1"/)
  assert.match(adminViewSource, /v-model="cleanupPolicyForm\.size\.value"[^\n>]*:min="1"/)
  assert.match(adminViewSource, /v-model="cleanupPolicyForm\.min_retain_hours"[^\n>]*:min="0"/)
  assert.match(adminViewSource, /v-model="cleanupPolicyForm\.interval_minutes"[^\n>]*:min="1"[^\n>]*:max="1440"/)
  assert.match(adminViewSource, /<el-option label="天" value="day" \/>/)
  assert.match(adminViewSource, /<el-option label="月" value="month" \/>/)
  assert.match(adminViewSource, /<el-option label="年" value="year" \/>/)
  assert.match(adminViewSource, /<el-option label="MB" value="MB" \/>/)
  assert.match(adminViewSource, /<el-option label="GB" value="GB" \/>/)
})

test('cleanup policy dialog wires preview and enable confirmation before save', () => {
  assert.match(adminViewSource, /@click="previewCleanup"/)
  assert.match(adminViewSource, /previewingCleanup/)
  assert.match(adminViewSource, /confirmDelete\(ElMessageBox\.confirm, \{/)
  assert.match(adminViewSource, /actionText: '启用自动清理'/)
  assert.match(adminViewSource, /const enablingAge = cleanupPolicyForm\.age\.enabled && !previous\?\.age\?\.enabled/)
  assert.match(adminViewSource, /const enablingSize = cleanupPolicyForm\.size\.enabled && !previous\?\.size\?\.enabled/)
  assert.match(adminViewSource, /api\.put\(`\$\{adminApiBase\}\/recycle-bin\/cleanup-policy`, payload\)/)
})
