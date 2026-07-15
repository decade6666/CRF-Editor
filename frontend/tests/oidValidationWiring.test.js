import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isValidOptionalOid, isValidRequiredOid } from '../src/composables/oidValidation.js'

const root = resolve(import.meta.dirname, '..')
const fieldsSource = readFileSync(resolve(root, 'src/components/FieldsTab.vue'), 'utf8')
const codelistsSource = readFileSync(resolve(root, 'src/components/CodelistsTab.vue'), 'utf8')

test('OID validation helper accepts and rejects the expected values', () => {
  assert.equal(isValidOptionalOid('AE01'), true)
  assert.equal(isValidOptionalOid('a.b-c_d'), true)
  assert.equal(isValidOptionalOid('中文'), false)
  assert.equal(isValidOptionalOid('a/b'), false)
  assert.equal(isValidOptionalOid('a b'), false)
  assert.equal(isValidOptionalOid(''), true)
  assert.equal(isValidOptionalOid('   '), true)

  assert.equal(isValidRequiredOid('AE01'), true)
  assert.equal(isValidRequiredOid('a.b-c_d'), true)
  assert.equal(isValidRequiredOid('中文'), false)
  assert.equal(isValidRequiredOid('a/b'), false)
  assert.equal(isValidRequiredOid('a b'), false)
  assert.equal(isValidRequiredOid(''), false)
  assert.equal(isValidRequiredOid('   '), false)
})

test('FieldsTab imports shared OID helpers and guards field save', () => {
  assert.match(fieldsSource, /import \{ OID_ERROR, isValidOptionalOid, isValidRequiredOid \} from ['"]\.\.\/composables\/oidValidation\.js['"]/)
  assert.match(fieldsSource, /async function save\(\) \{[\s\S]*?isValidRequiredOid\(editProp\.variable_name\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.(post|put)/)
})

test('FieldsTab guards inline codelist option codes with optional OID validation', () => {
  assert.match(fieldsSource, /function quickAddOptRow\(\) \{[\s\S]*?isValidOptionalOid\(quickOptCode\.value\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)/)
  assert.match(fieldsSource, /function quickEditAddOptRow\(\) \{[\s\S]*?isValidOptionalOid\(quickEditOptCode\.value\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)/)
  assert.match(fieldsSource, /async function quickAddCodelist\(\) \{[\s\S]*?isValidOptionalOid\(opt\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.post/)
  assert.match(fieldsSource, /async function quickSaveCodelist\(\) \{[\s\S]*?isValidOptionalOid\(opt\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.put/)
})

test('CodelistsTab imports shared OID helpers and guards codelist saves', () => {
  assert.match(codelistsSource, /import \{ OID_ERROR, isValidOptionalOid \} from ['"]\.\.\/composables\/oidValidation\.js['"]/)
  assert.match(codelistsSource, /async function addCl\(\) \{[\s\S]*?isValidOptionalOid\(clForm\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.post/)
  assert.match(codelistsSource, /async function updateCl\(\) \{[\s\S]*?isValidOptionalOid\(editClForm\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.put/)
})

test('CodelistsTab guards option saves with optional OID validation', () => {
  assert.match(codelistsSource, /async function addOpt\(\) \{[\s\S]*?isValidOptionalOid\(optForm\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.post/)
  assert.match(codelistsSource, /async function updateOpt\(\) \{[\s\S]*?isValidOptionalOid\(editOptForm\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.put/)
})
