import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('sidebar collapsed state uses zero width and hides sidebar content', () => {
  assert.match(appSource, /const isCollapsed = ref\(false\)/)
  assert.match(appSource, /:class="\{ collapsed: isCollapsed \}"/)
  assert.match(appSource, /width: isCollapsed \? '0px' : sidebarWidth \+ 'px'/)
  assert.match(appSource, /<div class="sidebar-content" v-show="!isCollapsed">/)
})

test('collapsed state removes resizer and short-circuits resize handling', () => {
  assert.match(appSource, /function startResize\(e\) \{\s*if \(isCollapsed\.value\) return/s)
  assert.match(appSource, /<button[\s\S]*?v-if="!isCollapsed"[\s\S]*?class="sidebar-resizer"/)
})

test('header renders expand control for collapsed sidebar state', () => {
  assert.match(appSource, /<h1 v-if="!isCollapsed">CRF编辑器<\/h1>/)
  assert.match(appSource, /<el-button[\s\S]*?v-else[\s\S]*?class="header-icon-btn"[\s\S]*?aria-label="展开侧边栏"[\s\S]*?title="展开侧边栏"[\s\S]*?@click="isCollapsed = false"[\s\S]*?>/)
})
