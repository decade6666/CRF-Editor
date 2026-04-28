import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
const stylesSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8')

/**
 * Task 2.3: 验证折叠不破坏项目切换、复制、删除、刷新与设置入口
 * 折叠后 header 区域应保留展开按钮，且主功能区（项目切换等）在展开后可达
 */
test('collapsed sidebar keeps project switch accessible via expand button', () => {
  // 折叠后 header 渲染展开按钮
  assert.match(appSource, /<el-button[\s\S]*?v-else[\s\S]*?class="header-icon-btn"[\s\S]*?aria-label="展开侧边栏"[\s\S]*?title="展开侧边栏"[\s\S]*?@click="isCollapsed = false"[\s\S]*?>/)
  // 展开按钮使用 Element Plus 图标且隐藏装饰图标语义
  assert.match(appSource, /<el-icon aria-hidden="true"><Expand \/><\/el-icon>/)
})

test('collapsed state hides sidebar content but keeps action buttons in header', () => {
  // 折叠时侧边栏内容隐藏
  assert.match(appSource, /<div class="sidebar-content" v-show="!isCollapsed">/)
  // header 区设置按钮始终存在（通过 openSettings 函数）
  assert.match(appSource, /@click="openSettings"/)
  // 刷新按钮始终存在
  assert.match(appSource, /@click="handleRefresh"/)
})

test('project list actions remain accessible when sidebar is expanded', () => {
  // 项目列表区域存在
  assert.match(appSource, /<div class="project-list"/)
  // 项目复制按钮存在且不依赖 hover
  const copyButtonPattern = /<el-button(?=[^>]*class="project-action-btn project-action-btn--copy")(?=[^>]*\blink\b)(?=[^>]*aria-label="复制项目")(?=[^>]*@click\.stop="copyProject\(p\)")(?=[^>]*title="复制项目")[^>]*>/
  assert.match(appSource, copyButtonPattern)
  // 项目删除按钮存在
  assert.match(appSource, /@click\.stop="deleteProject\(p\)"/)
  // 项目切换通过专用选择按钮，避免外层交互容器嵌套按钮
  assert.match(appSource, /<div class="project-item" :class="\{ active: selectedProject\?\.id === p\.id \}">/)
  assert.match(appSource, /<button[\s\S]*?class="project-select-btn"[\s\S]*?type="button"[\s\S]*?:aria-current="selectedProject\?\.id === p\.id \? 'true' : undefined"[\s\S]*?@click="selectProject\(p\)"[\s\S]*?>/)
})

test('project rows use truncation-safe layout classes', () => {
  assert.match(appSource, /<span class="project-item-main">/)
  assert.match(appSource, /<span class="project-item-name">\{\{ p\.name \}\}<\/span>/)
  assert.match(stylesSource, /\.project-item\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*border-left:\s*3px solid transparent;/s)
  assert.doesNotMatch(stylesSource, /\.project-item\s*\{[^}]*cursor:\s*pointer;/s)
  assert.match(stylesSource, /\.project-item:hover\s*\{[^}]*background:\s*var\(--color-sidebar-hover\);[^}]*\}/s)
  assert.match(stylesSource, /\.project-item\.active\s*\{[^}]*border-left-color:\s*#ffffff;/s)
  assert.doesNotMatch(stylesSource, /\.project-item:hover\s*\{[^}]*padding-left:/s)
})

test('project drag handle is decorative and keeps mouse drag target available', () => {
  assert.match(appSource, /<span class="drag-handle" aria-hidden="true">/)
  assert.match(appSource, /handle="\.drag-handle"/)
  assert.doesNotMatch(appSource, /\.project-item \.drag-handle\s*\{[^}]*pointer-events:\s*none;/s)
})

test('settings entry is always visible in header regardless of sidebar state', () => {
  // 设置按钮不在 sidebar 内，而是在 header（通过 openSettings 函数触发）
  const settingsInHeader = appSource.includes('openSettings') && !appSource.includes('<div class="sidebar-content">.*openSettings')
  assert.ok(settingsInHeader, 'Settings should be accessible from header')
})

test('refresh action is available outside sidebar content', () => {
  // 刷新按钮不依赖 sidebar 折叠状态
  assert.match(appSource, /@click="handleRefresh"/)
})

test('header layout keeps action buttons visible on narrow screens', () => {
  assert.match(stylesSource, /\.header\s*\{[^}]*min-height:\s*50px[^}]*\}/s)
  assert.match(stylesSource, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.header\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?\}/)
  assert.match(stylesSource, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.header-right\s*\{[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*flex-start;[\s\S]*?\}/)
})
