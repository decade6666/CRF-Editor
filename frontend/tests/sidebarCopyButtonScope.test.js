import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

/**
 * Task 1.2: 验证侧边栏复制按钮 CSS 作用域限定
 * 确保修复仅作用于 .project-item .project-actions 中的复制按钮，
 * 不影响删除按钮和其他 link 按钮
 */

test('copy button CSS is scoped to project-item and project-actions', () => {
  // 默认态规则存在且作用域正确
  assert.match(
    appSource,
    /\.project-item .project-actions .project-action-btn:not\(\[type="danger"\]\)\s*\{/,
    'Default state CSS should target .project-item .project-actions excluding danger type'
  )
})

test('copy button CSS covers hover state on project-item', () => {
  // hover 态规则存在且基于 .project-item:hover
  assert.match(
    appSource,
    /\.project-item:hover .project-actions .project-action-btn:not\(\[type="danger"\]\)\s*\{/,
    'Hover state CSS should target .project-item:hover .project-actions excluding danger type'
  )
})

test('copy button CSS covers active state on project-item', () => {
  // active 态规则存在且基于 .project-item.active
  assert.match(
    appSource,
    /\.project-item\.active .project-actions .project-action-btn:not\(\[type="danger"\]\)\s*\{/,
    'Active state CSS should target .project-item.active .project-actions excluding danger type'
  )
})

test('copy button CSS excludes delete button via not selector', () => {
  // 所有三态规则都使用 :not([type="danger"]) 排除删除按钮
  const notDangerCount = (appSource.match(/:not\(\[type="danger"\]\)/g) || []).length
  assert.ok(notDangerCount >= 3, 'All three state rules should use :not([type="danger"])')
})

test('copy button CSS does not use global link button selector', () => {
  // 不应出现全局 link 按钮选择器（如 .el-button--link 或 .el-button.is-link）
  // 确保修复不影响其他 link 按钮
  const scopedOnly = appSource.includes('.project-item .project-actions .project-action-btn:not([type="danger"])')
  const noGlobalLink = !appSource.includes('.el-button--link') && !appSource.includes('.el-button.is-link')
  assert.ok(scopedOnly && noGlobalLink, 'CSS should not use global link button selectors')
})

test('Vue template copy button has correct class without type', () => {
  // 复制按钮使用 project-action-btn 且无 type 属性
  const copyButtonPattern = /<el-button class="project-action-btn" link @click\.stop="copyProject\(p\)"[^>]*title="复制项目">/
  assert.match(appSource, copyButtonPattern, 'Copy button should have project-action-btn class without type attribute')
})

test('Vue template delete button has type danger', () => {
  // 删除按钮使用 type="danger"
  const deleteButtonPattern = /<el-button class="project-action-btn" link type="danger" @click\.stop="deleteProject\(p\)"[^>]*title="删除项目">/
  assert.match(appSource, deleteButtonPattern, 'Delete button should have type="danger"')
})