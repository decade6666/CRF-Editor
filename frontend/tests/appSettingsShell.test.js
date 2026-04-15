import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
const loginSource = readFileSync(path.resolve(currentDir, '../src/components/LoginView.vue'), 'utf8')

test('settings dialog provides logout entry and only saves admin settings', () => {
  assert.match(appSource, /<el-button type="danger" plain @click="logout">退出登录<\/el-button>/)
  assert.match(appSource, /<el-button v-if="isAdmin" type="primary" @click="saveSettings">保存<\/el-button>/)
  assert.match(appSource, /if \(!isAdmin\.value\) return/)
})

test('settings dialog routes database export by user role', () => {
  assert.match(appSource, /const exportUrl = isAdmin\.value \? '\/api\/export\/database' : '\/api\/projects\/export\/database'/)
  assert.match(appSource, /导出所有项目/)
})


test('settings dialog export actions and main tabs use scoped layout hooks', () => {
  assert.match(appSource, /<el-tabs class="main-content-tabs" v-model="activeTab"/)
  assert.match(appSource, /<div class="settings-transfer-actions">[\s\S]*导出所有项目[\s\S]*导出当前项目[\s\S]*:loading="importProjectLoading"[\s\S]*导入项目/s)
  assert.match(appSource, /\.settings-transfer-actions\s*\{[\s\S]*width:\s*100%/)
  assert.match(appSource, /\.settings-transfer-actions\s*:deep\(\.el-button\)\s*\{[\s\S]*width:\s*100%/)
  assert.match(appSource, /\.main-content-tabs[\s\S]*padding-left:\s*20px/)
})

test('app remembers username on logout and auth expiry', () => {
  assert.match(appSource, /localStorage\.setItem\('crf_last_username', normalized\)/)
  assert.match(appSource, /function logout\(\) \{[\s\S]*rememberUsername\(\)[\s\S]*resetSessionState\(\)/)
  assert.match(appSource, /function handleAuthExpired\(\) \{[\s\S]*rememberUsername\(\)[\s\S]*resetSessionState\(\)/)
})

test('login view restores and persists the last username', () => {
  assert.match(loginSource, /const username = ref\(localStorage\.getItem\('crf_last_username'\) \|\| ''\)/)
  assert.match(loginSource, /localStorage\.setItem\('crf_last_username', username\.value\.trim\(\)\)/)
})

test('admin dialog delegates logout through the shared app logout flow', () => {
  assert.match(appSource, /<AdminView @logout="logout" \/>/)
})
