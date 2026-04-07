import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('single-project import success message uses final project_name from backend', () => {
  assert.match(appSource, /ElMessage\.success\(`导入成功：\$\{data\.project_name\}`\)/)
})

test('database merge import result shows renamed project mapping when present', () => {
  assert.match(appSource, /const renamedInfo = data\.renamed\.length/)
  assert.match(appSource, /data\.renamed\.map\(r => `\$\{r\.original\} → \$\{r\.new\}`\)\.join\('、'\)/)
  assert.match(appSource, /ElMessageBox\.alert\(`导入 \$\{data\.imported\.length\} 个项目：\$\{names\}\$\{renamedInfo\}`/)
})
