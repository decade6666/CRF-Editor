import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const cssSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8')

test('theme palette uses muted clinical blue primary tokens', () => {
  assert.match(cssSource, /--indigo-700:\s+#355f78;/)
  assert.match(cssSource, /--indigo-800:\s+#294b61;/)
  assert.match(cssSource, /--indigo-900:\s+#1f394b;/)
  assert.match(cssSource, /--color-primary-rgb:\s+53, 95, 120;/)
})

test('dark theme uses darker low-saturation shell tokens', () => {
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--indigo-700:\s+#5f879b;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--indigo-900:\s+#111f2a;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--color-header-bg:\s+#122531;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--color-sidebar-bg:\s+#0d1821;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--color-bg-body:\s+#0b1117;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--color-bg-card:\s+#121c24;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--color-border:\s+#253845;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--color-primary-subtle:\s+#14232e;/)
})

test('selected-row tokens derive from primary via color-mix and dark mode re-declares EP primary vars', () => {
  // 选中行 token 必须与表头变量 --color-primary-subtle 解耦（表头契约不变），
  // 且用 color-mix 引用主题变量自动适配明暗。
  assert.match(cssSource, /--color-selected-bg:\s+color-mix\(in srgb, var\(--color-primary\) 14%, var\(--color-bg-card\)\);/)
  assert.match(cssSource, /--color-selected-border:\s+color-mix\(in srgb, var\(--color-primary\) 35%, var\(--color-border\)\);/)
  // 暗色下 EP 自带 html.dark 同名变量会顶掉 :root 的映射，必须在 data-theme 块内重声明
  assert.match(
    cssSource,
    /html\[data-theme="dark"\][\s\S]*--el-color-primary:\s+var\(--color-primary\);[\s\S]*--el-color-primary-light-9:\s+var\(--color-selected-bg\);/,
  )
  // 选中行规则须覆盖 hover 态，否则悬停会抹掉选中色
  assert.match(
    cssSource,
    /\.el-table--enable-row-hover \.el-table__body tr\.current-row:hover > td\.el-table__cell/,
  )
  assert.match(cssSource, /\.el-table__body tr\.is-selected-row > td\.el-table__cell/)
})
