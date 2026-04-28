import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
const stylesSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8')

/**
 * Task 1.2: 验证侧边栏复制按钮 CSS 作用域限定
 * 确保修复仅作用于 .project-item .project-actions 中的复制按钮，
 * 不影响删除按钮和其他 link 按钮
 */

test('copy button CSS is scoped to explicit copy action class', () => {
  assert.match(
    appSource,
    /\.project-item \.project-actions \.project-action-btn--copy\s*\{/,
    'Default state CSS should target the explicit copy action class'
  )
})

test('copy button CSS covers hover state on project-item', () => {
  assert.match(
    appSource,
    /\.project-item:hover \.project-actions \.project-action-btn--copy\s*\{/,
    'Hover state CSS should target project-item copy action only'
  )
})

test('copy button CSS covers active state on project-item', () => {
  assert.match(
    appSource,
    /\.project-item\.active \.project-actions \.project-action-btn--copy\s*\{/,
    'Active state CSS should target project-item copy action only'
  )
})

test('copy button CSS does not rely on Element Plus type prop selector', () => {
  assert.doesNotMatch(appSource, /\.project-action-btn:not\(\[type=['"]danger['"]\]\)/)
})

test('copy button CSS does not use global link button selector', () => {
  const scopedOnly = /\.project-item \.project-actions \.project-action-btn--copy/.test(appSource)
  const noGlobalLink = !appSource.includes('.el-button--link') && !appSource.includes('.el-button.is-link')
  assert.ok(scopedOnly && noGlobalLink, 'CSS should not use global link button selectors')
})

test('Vue template copy button has correct class without type', () => {
  // 复制按钮使用 project-action-btn 且无 type 属性
  const copyButtonPattern = /<el-button(?=[^>]*class="project-action-btn project-action-btn--copy")(?=[^>]*\blink\b)(?=[^>]*aria-label="复制项目")(?=[^>]*@click\.stop="copyProject\(p\)")(?=[^>]*title="复制项目")[^>]*>/
  assert.match(appSource, copyButtonPattern, 'Copy button should have project-action-btn class without type attribute')
})

test('Vue template delete button has type danger', () => {
  // 删除按钮使用 type="danger"
  const deleteButtonPattern = /<el-button(?=[^>]*class="project-action-btn project-action-btn--delete")(?=[^>]*\blink\b)(?=[^>]*type="danger")(?=[^>]*aria-label="删除项目")(?=[^>]*@click\.stop="deleteProject\(p\)")(?=[^>]*title="删除项目")[^>]*>/
  assert.match(appSource, deleteButtonPattern, 'Delete button should have type="danger"')
})

test('project action area does not shrink beside long names', () => {
  assert.match(
    appSource,
    /\.project-actions\s*\{[^}]*flex-shrink:\s*0;/s,
    'Project actions should keep copy/delete controls visible beside truncated names'
  )
})

test('project name uses explicit ellipsis classes', () => {
  assert.match(appSource, /<span class="project-item-main">/)
  assert.match(appSource, /<span class="project-item-name">\{\{ p\.name \}\}<\/span>/)
  assert.match(appSource, /\.project-item-main\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s)
  assert.match(appSource, /\.project-item-name\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s)
})

test('project row hover does not change horizontal padding', () => {
  assert.doesNotMatch(stylesSource, /\.project-item:hover\s*\{[^}]*padding-left:/s)
  assert.doesNotMatch(stylesSource, /\.project-item\s*\{[^}]*cursor:\s*pointer;/s)
})
