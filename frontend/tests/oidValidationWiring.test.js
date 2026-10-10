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
  assert.match(fieldsSource, /import \{ OID_ERROR, isValidRequiredOid \} from ['"]\.\.\/composables\/oidValidation\.js['"]/)
  assert.match(fieldsSource, /async function save\(\) \{[\s\S]*?isValidRequiredOid\(editProp\.variable_name\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.(post|put)/)
})

test('FieldsTab no longer charset-guards inline codelist option codes', () => {
  assert.doesNotMatch(fieldsSource, /isValidOptionalOid/)
  // 选项行「请输入标签」守卫随快捷字典弹窗迁入 CodelistQuickEditDialog（R3）
  const quickEditDialogSource = readFileSync(resolve(root, 'src/components/CodelistQuickEditDialog.vue'), 'utf8')
  assert.match(quickEditDialogSource, /function addOptRow\(\) \{[\s\S]*?ElMessage\.warning\(['"]请输入标签['"]\)/)
})

test('CodelistsTab imports shared OID helpers and guards codelist saves', () => {
  assert.match(codelistsSource, /import \{ OID_ERROR, isValidOptionalOid \} from ['"]\.\.\/composables\/oidValidation\.js['"]/)
  assert.match(codelistsSource, /async function addCl\(\) \{[\s\S]*?isValidOptionalOid\(clForm\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.post/)
  assert.match(codelistsSource, /async function updateCl\(\) \{[\s\S]*?isValidOptionalOid\(editClForm\.code\)[\s\S]*?ElMessage\.warning\(OID_ERROR\)[\s\S]*?api\.put/)
})

test('CodelistsTab keeps option code free-form but still requires non-empty', () => {
  assert.doesNotMatch(codelistsSource, /isValidOptionalOid\(optForm\.code\)/)
  assert.doesNotMatch(codelistsSource, /isValidOptionalOid\(editOptForm\.code\)/)
  assert.match(codelistsSource, /async function addOpt\(\) \{[\s\S]*?!optForm\.code\.trim\(\)[\s\S]*?请输入编码值[\s\S]*?api\.post/)
  assert.match(codelistsSource, /async function updateOpt\(\) \{[\s\S]*?!editOptForm\.code\.trim\(\)[\s\S]*?请输入编码值[\s\S]*?api\.put/)
})
