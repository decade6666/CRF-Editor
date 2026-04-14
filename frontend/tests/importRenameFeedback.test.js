import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('single-project import success message uses project name from unified response', () => {
  assert.match(appSource, /if \(data\.count === 1\)/)
  assert.match(appSource, /ElMessage\.success\(`导入成功：\$\{names\}`\)/)
})

test('database merge import result shows renamed project mapping when present', () => {
  assert.match(appSource, /const renamedInfo = data\.renamed\.length/)
  assert.match(appSource, /data\.renamed\.map\(r => `\$\{r\.original\} → \$\{r\.new\}`\)\.join\('、'\)/)
  assert.match(appSource, /ElMessageBox\.alert\(`导入 \$\{data\.count\} 个项目：\$\{names\}\$\{renamedInfo\}`/)
})

// Task 4.4 / 4.6: 错误响应契约测试
test('import error handling uses detail field from backend response', () => {
  // 单项目导入：错误时使用 data.detail
  assert.match(appSource, /if \(!resp\.ok\) throw new Error\(data\.detail/)
  // 错误消息显示：ElMessage.error 显示 detail 内容
  assert.match(appSource, /ElMessage\.error\('导入失败: ' \+ err\.message\)/)
})

test('unified import error handling uses detail field from backend response', () => {
  // 统一导入入口：错误时使用 data.detail
  assert.match(appSource, /if \(!resp\.ok\) throw new Error\(data\.detail/)
})
