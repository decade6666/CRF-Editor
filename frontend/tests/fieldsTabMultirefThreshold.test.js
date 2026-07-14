import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')

function getFunctionBody(name) {
  const start = source.indexOf(`async function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const next = source.indexOf('\nasync function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('FieldsTab imports the shared field reference impact helper', () => {
  assert.match(source, /from ['"]\.\.\/composables\/fieldReferenceImpact['"]/)
  assert.match(source, /countDistinctForms/)
  assert.match(source, /formatFieldImpactMessage/)
})

test('save only shows the field impact warning for multiple distinct forms', () => {
  const body = getFunctionBody('save')
  assert.match(body, /const refs = await api\.get\(`\/api\/field-definitions\/\$\{selectedFieldId\.value\}\/references`\)/)
  assert.match(body, /if \(countDistinctForms\(refs\) > 1\)/)
  assert.match(body, /formatFieldImpactMessage\(refs, \{ max: 5, sep: '、' \}\)/)
  assert.doesNotMatch(body, /if \(refs\.length\)/)
})

test('single delete keeps normal confirmation unless a field impacts multiple distinct forms', () => {
  const body = getFunctionBody('del')
  assert.match(body, /if \(countDistinctForms\(refs\) > 1\)/)
  assert.match(body, /formatFieldImpactMessage\(refs, \{ max: 5, sep: '、' \}\)/)
  assert.match(body, /删除字段 "\$\{f\.label\}"\？/)
  assert.doesNotMatch(body, /if \(refs\.length\)/)
})

test('batch delete impact warning only lists fields referenced by multiple distinct forms', () => {
  const body = getFunctionBody('batchDelFields')
  assert.match(body, /const refs = refsMap\[f\.id\] \|\| \[\]/)
  assert.match(body, /if \(countDistinctForms\(refs\) > 1\)/)
  assert.match(body, /formatFieldImpactMessage\(refs, \{ max: 3, sep: '、' \}\)/)
  assert.match(body, /确认删除选中的 \$\{selFields\.value\.length\} 个字段\？/)
  assert.doesNotMatch(body, /if \(refs\.length\) allRefs\.push/)
})
