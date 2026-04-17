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


test('word export blocks rapid repeat triggers at three attempts', () => {
  assert.match(appSource, /const MAX_EXPORT_WORD_TRIGGERS = 3/)
  assert.match(appSource, /let exportWordResetTimer = null/)
  assert.match(appSource, /if \(!selectedProject\.value \|\| exportWordLoading\.value\) return/)
  assert.match(appSource, /if \(exportWordTriggerCount\.value >= MAX_EXPORT_WORD_TRIGGERS\) \{[\s\S]*ElMessage\.warning\(`导出过于频繁，请在 \$\{Math\.ceil\(EXPORT_WORD_TRIGGER_WINDOW_MS \/ 1000\)\} 秒后重试`\)[\s\S]*return/)
  assert.match(appSource, /exportWordTriggerCount\.value \+= 1/)
  assert.match(appSource, /exportWordResetTimer = setTimeout\(\(\) => \{[\s\S]*exportWordTriggerCount\.value = 0[\s\S]*exportWordResetTimer = null[\s\S]*\}, EXPORT_WORD_TRIGGER_WINDOW_MS\)/)
  assert.match(appSource, /watch\(\(\) => selectedProject\.value\?\.id, \(\) => \{[\s\S]*resetExportWordTriggerCount\(\)/)
  assert.match(appSource, /onBeforeUnmount\(\(\) => \{[\s\S]*if \(exportWordResetTimer\) clearTimeout\(exportWordResetTimer\)/)
})


test('settings dialog uses inline prompt edit mode copy', () => {
  assert.match(appSource, /<el-switch v-model="editMode" inline-prompt active-text="完全" inactive-text="简要"\s*\/>/)
  assert.match(appSource, /关闭时保留基础浏览与设计入口，开启后显示完整编辑能力/)
  assert.doesNotMatch(appSource, /开启后显示选项\/单位\/字段标签及表单编辑按钮/)
  assert.match(appSource, /const ADVANCED_EDIT_TABS = new Set\(\['codelists', 'units', 'fields'\]\)/)
  assert.match(appSource, /watch\(editMode, v => \{[\s\S]*if \(!v && ADVANCED_EDIT_TABS\.has\(activeTab\.value\)\) activeTab\.value = 'info'/)
})

test('header keeps template import and word export only', () => {
  const headerSection = appSource.match(/<div class="header-right">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(headerSection, /@click="openImportDialog">导入模板<\/el-button>/)
  assert.match(headerSection, /@click="exportWord">导出Word<\/el-button>/)
  assert.doesNotMatch(headerSection, /导入Word/)
  assert.match(appSource, /<el-button v-if="selectedProject" type="warning" size="small" @click="openImportDialog">导入模板<\/el-button>/)
})

test('settings dialog moves import word below project import and keeps scoped layout hooks', () => {
  assert.match(appSource, /<el-tabs class="main-content-tabs" v-model="activeTab"/)
  assert.doesNotMatch(appSource, /<el-divider>数据导出<\/el-divider>/)
  assert.match(appSource, /<el-divider\s*\/>\s*<div class="settings-transfer-actions">/)
  const actionsSection = appSource.match(/<div class="settings-transfer-actions">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(actionsSection, /导出所有项目/)
  assert.match(actionsSection, /导出当前项目/)
  assert.match(actionsSection, /:loading="importProjectLoading"[\s\S]*导入项目/s)
  assert.match(actionsSection, /:disabled="!selectedProject" @click="openImportWordDialog">导入Word<\/el-button>/)
  assert.ok(actionsSection.indexOf('导入项目') < actionsSection.indexOf('导入Word'))
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
