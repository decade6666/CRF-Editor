// 赛美斯手工 OID 长度限制 · 纯策略回归（任务 10-16-saimosi-oid-limit）
//
// 契约：仅当项目数据库类型为「赛美斯」且保存值相对基线发生人工修改时，
// 字段 OID ≤ 8 位、表单 OID ≤ 10 位；未改动的系统自动值/历史值/复制默认值豁免；
// 「看起来像系统前缀」不构成豁免，唯一判据是与基线的值比较。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  editedOidLengthError,
  oidMaxLength,
  FIELD_OID_LENGTH_ERROR,
  FORM_OID_LENGTH_ERROR,
} from '../src/composables/oidValidation.js'

const SAIMEISI = '赛美斯'
const OTHER = '其他'
// 与 useApi.genFieldVarName / genCode 同形态的系统自动值（27/26 位）
const GENERATED_FIELD_OID = 'FIELD_20261016093000_ABC123'
const GENERATED_FORM_OID = 'FORM_20261016093000_ABC12'

const fieldError = (candidate, baseline, dbType = SAIMEISI) =>
  editedOidLengthError({ dbType, kind: 'field', candidate, baseline })
const formError = (candidate, baseline, dbType = SAIMEISI) =>
  editedOidLengthError({ dbType, kind: 'form', candidate, baseline })

test('赛美斯项目下改动后的字段 OID 允许 8 位、拒绝 9 位', () => {
  assert.equal(fieldError('ABCDEFGH', 'OLD01'), null)
  assert.equal(fieldError('ABCDEFGHI', 'OLD01'), FIELD_OID_LENGTH_ERROR)
})

test('赛美斯项目下改动后的表单 OID 允许 10 位、拒绝 11 位', () => {
  assert.equal(formError('ABCDEFGHIJ', 'OLD'), null)
  assert.equal(formError('ABCDEFGHIJK', 'OLD'), FORM_OID_LENGTH_ERROR)
})

test('未改动的系统自动值与复制默认值保持豁免（即使超长）', () => {
  assert.equal(fieldError(GENERATED_FIELD_OID, GENERATED_FIELD_OID), null)
  assert.equal(formError(GENERATED_FORM_OID, GENERATED_FORM_OID), null)
  assert.equal(fieldError('EDC01_copy', 'EDC01_copy'), null)
})

test('改动生成值再超长会被拒绝，自动前缀形态不构成豁免', () => {
  assert.equal(fieldError('FIELD_XY99999', GENERATED_FIELD_OID), FIELD_OID_LENGTH_ERROR)
  assert.equal(formError('FORM_ABCDEFGHIJ', GENERATED_FORM_OID), FORM_OID_LENGTH_ERROR)
})

test('其他或缺失数据库类型不启用长度限制', () => {
  assert.equal(fieldError('ABCDEFGHI', 'OLD01', OTHER), null)
  assert.equal(formError('ABCDEFGHIJK', 'OLD', OTHER), null)
  assert.equal(fieldError('ABCDEFGHI', 'OLD01', ''), null)
  assert.equal(fieldError('ABCDEFGHI', 'OLD01', null), null)
  // 注意绕过测试辅助函数的默认参数：undefined 须直接验证策略本身
  assert.equal(
    editedOidLengthError({ dbType: undefined, kind: 'field', candidate: 'ABCDEFGHI', baseline: 'OLD01' }),
    null,
  )
})

test('恢复基线值或仅空白差异视为未修改', () => {
  assert.equal(fieldError('  ABCDEFGH  ', 'ABCDEFGH'), null)
  assert.equal(fieldError('ABCDEFGH', '  ABCDEFGH  '), null)
  assert.equal(formError(' ABC ', 'ABC'), null)
})

test('基线缺失时任何候选都按人工修改对待', () => {
  assert.equal(fieldError('ABCDEFGHI', null), FIELD_OID_LENGTH_ERROR)
  assert.equal(fieldError('ABCDEFGH', null), null)
})

test('空候选按长度 0 放行（表单清空 OID 仍走可选语义）', () => {
  assert.equal(formError('', GENERATED_FORM_OID), null)
  assert.equal(formError('   ', GENERATED_FORM_OID), null)
  assert.equal(formError(null, GENERATED_FORM_OID), null)
})

test('未知实体类别不启用限制', () => {
  assert.equal(
    editedOidLengthError({ dbType: SAIMEISI, kind: 'visit', candidate: 'ABCDEFGHIJK', baseline: '' }),
    null,
  )
})

test('oidMaxLength 仅赛美斯返回录入层上限，供输入框 maxlength 绑定', () => {
  assert.equal(oidMaxLength(SAIMEISI, 'field'), 8)
  assert.equal(oidMaxLength(SAIMEISI, 'form'), 10)
  assert.equal(oidMaxLength(OTHER, 'field'), undefined)
  assert.equal(oidMaxLength(OTHER, 'form'), undefined)
  assert.equal(oidMaxLength('', 'field'), undefined)
  assert.equal(oidMaxLength(null, 'form'), undefined)
  assert.equal(oidMaxLength(SAIMEISI, 'visit'), undefined)
  assert.equal(oidMaxLength(undefined, 'field'), undefined)
})
