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
