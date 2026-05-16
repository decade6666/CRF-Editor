/**
 * Word 预览 A4 页面几何 + 标题视觉契约
 *
 * 锁住的契约（与 main.css 同步演进）：
 *   1. `.wp-form-title` 左对齐 + Heading-1 等效字号字重，与后端
 *      `export_service.add_heading` 的 Word Heading 1 默认左对齐对齐。
 *   2. 不允许引入 `margin: ... auto` 等让 title 整段居中的样式。
 *
 * 红灯背景：上一轮预览端 `.wp-form-title` 为 `text-align: center`，与导出
 * Word 端的 Heading-1（默认左对齐）视觉不一致；用户截图证据见
 * `.trellis/tasks/05-12-word-preview-export-parity/prd.md`。
 *
 * 注：CLAUDE.md 描述的 21cm/29.7cm A4 几何、`.word-page.landscape` 翻转、
 *     `--word-page-margin-x/y`、`@media print`、`.designer-scaled-word-page`、
 *     `table-layout: fixed` / `<colgroup>` 等扩展契约可在后续 PR 渐进补齐；
 *     当前文件先固化本任务直接相关的 wp-form-title 视觉契约。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const cssPath = path.resolve(currentDir, '../src/styles/main.css')

function readMainCss() {
  return readFileSync(cssPath, 'utf8')
}

/**
 * 按 selector 抽取规则体（单层 {} 内文本）。
 * main.css 当前使用 single-line rule 风格，selector 内不含嵌套 {}。
 */
function extractRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`)
  const m = css.match(re)
  return m ? m[1] : null
}

function extractDeclaration(body, prop) {
  if (!body) return null
  const re = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+?)\\s*(?:;|$)`, 'i')
  const m = body.match(re)
  return m ? m[1].trim() : null
}

test('wp-form-title aligns left to match Word export Heading-1 default', () => {
  const body = extractRuleBody(readMainCss(), '.word-page .wp-form-title')
  assert.ok(body, '.word-page .wp-form-title rule must exist in main.css')

  const textAlign = extractDeclaration(body, 'text-align')
  assert.equal(
    textAlign,
    'left',
    `.wp-form-title text-align must be 'left' (Word add_heading 默认左对齐), got ${JSON.stringify(textAlign)}`,
  )
})

test('wp-form-title preserves Heading-1 equivalent font weight and size', () => {
  const body = extractRuleBody(readMainCss(), '.word-page .wp-form-title')
  assert.ok(body)

  const fontWeight = extractDeclaration(body, 'font-weight')
  assert.equal(
    fontWeight,
    'bold',
    `.wp-form-title font-weight should be 'bold' (Heading-1 等效), got ${fontWeight}`,
  )

  const fontSize = extractDeclaration(body, 'font-size')
  assert.match(
    fontSize || '',
    /^(1[4-9]|[2-9]\d)pt$/,
    `.wp-form-title font-size should be ≥14pt (Heading-1 等效), got ${fontSize}`,
  )
})

test('wp-form-title does not use auto-centering margin', () => {
  const body = extractRuleBody(readMainCss(), '.word-page .wp-form-title')
  assert.ok(body)

  const marginShorthand = extractDeclaration(body, 'margin')
  if (marginShorthand) {
    assert.ok(
      !/\bauto\b/.test(marginShorthand),
      `.wp-form-title margin must not contain 'auto' (会触发块居中), got ${marginShorthand}`,
    )
  }
  for (const side of ['margin-left', 'margin-right']) {
    const val = extractDeclaration(body, side)
    if (val) {
      assert.notEqual(val, 'auto', `.wp-form-title ${side} must not be 'auto'`)
    }
  }
})

test('word preview table cells mirror Word paragraph vertical rhythm', () => {
  const body = extractRuleBody(readMainCss(), '.word-page td')
  assert.ok(body, '.word-page td rule must exist in main.css')

  const padding = extractDeclaration(body, 'padding')
  assert.equal(
    padding,
    '5.25pt 6px',
    `.word-page td vertical padding should mirror Word space_before/after=5.25pt, got ${padding}`,
  )

  const lineHeight = extractDeclaration(body, 'line-height')
  assert.equal(
    lineHeight,
    '1.0',
    `.word-page td line-height should mirror Word line_spacing=1.0, got ${lineHeight}`,
  )
})
