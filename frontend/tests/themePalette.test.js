import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const cssSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8')

test('theme palette uses softened blue primary tokens', () => {
  assert.match(cssSource, /--indigo-700:\s+#2f6fd6;/)
  assert.match(cssSource, /--indigo-800:\s+#245fc3;/)
  assert.match(cssSource, /--indigo-900:\s+#234972;/)
  assert.match(cssSource, /--color-primary-rgb:\s+47, 111, 214;/)
})

test('dark theme keeps a readable but lighter primary tone', () => {
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--indigo-700:\s+#5b93f5;/)
  assert.match(cssSource, /html\[data-theme="dark"\][\s\S]*--indigo-900:\s+#18365a;/)
})
