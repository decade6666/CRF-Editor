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

test('single delete blocks on any reference instead of the multi-form impact prompt', () => {
  const body = getFunctionBody('del')
  assert.match(body, /const refs = await api\.get\(`\/api\/field-definitions\/\$\{f\.id\}\/references`\)/)
  assert.match(body, /if \(refs\.length\)/)
  assert.match(body, /showReferenceBlockedAlert\(ElMessageBox/)
  assert.match(body, /删除字段 "\$\{f\.label\}"\？/)
  assert.doesNotMatch(body, /将同时删除/)
})

test('batch delete partitions by references through the shared guard helper', () => {
  const body = getFunctionBody('batchDelFields')
  assert.match(body, /confirmReferenceAwareBatchDelete\(ElMessageBox/)
  assert.match(body, /formatFieldImpactMessage\(refs, \{ max: 3, sep: '、' \}\)/)
  assert.match(body, /ids: deleteIds/)
  assert.doesNotMatch(body, /countDistinctForms\(refs\) > 1/)
})
