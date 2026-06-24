import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildFinalDeleteConfirmMessage,
  buildFinalProjectDeleteConfirmMessage,
  confirmDeleteTwice,
  confirmFinalProjectDelete,
} from '../src/composables/projectDeleteConfirmation.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
const adminViewSource = readFileSync(path.resolve(currentDir, '../src/components/AdminView.vue'), 'utf8')
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')
const unitsSource = readFileSync(path.resolve(currentDir, '../src/components/UnitsTab.vue'), 'utf8')
const fieldsSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')
const designerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function getFunctionBody(source, functionName) {
  const marker = `async function ${functionName}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const nextFunction = source.indexOf('\nasync function ', start + marker.length)
  const nextSyncFunction = source.indexOf('\nfunction ', start + marker.length)
  const candidates = [nextFunction, nextSyncFunction].filter(index => index !== -1)
  const end = candidates.length ? Math.min(...candidates) : source.length
  return source.slice(start, end)
}

test('buildFinalProjectDeleteConfirmMessage describes named project delete', () => {
  assert.equal(
    buildFinalProjectDeleteConfirmMessage({ projectName: 'TEST' }),
    '请再次确认：确定要删除项目 "TEST" 吗？此操作不可恢复。'
  )
})

test('buildFinalProjectDeleteConfirmMessage describes batch project delete', () => {
  assert.equal(
    buildFinalProjectDeleteConfirmMessage({ projectCount: 3 }),
    '请再次确认：确定要删除选中的 3 个项目吗？此操作不可恢复。'
  )
})

test('buildFinalDeleteConfirmMessage describes generic delete targets', () => {
  assert.equal(
    buildFinalDeleteConfirmMessage({ targetText: '选中的 2 个字段' }),
    '请再次确认：确定要删除选中的 2 个字段吗？此操作不可恢复。'
  )
})

test('confirmDeleteTwice runs first and final confirmations in order', async () => {
  const calls = []
  await confirmDeleteTwice((...args) => {
    calls.push(args)
    return Promise.resolve()
  }, { targetText: '单位 "kg"' })

  assert.equal(calls.length, 2)
  assert.equal(calls[0][0], '确认删除单位 "kg" 吗？')
  assert.equal(calls[1][0], '请再次确认：确定要删除单位 "kg" 吗？此操作不可恢复。')
})

test('confirmFinalProjectDelete uses final warning confirmation options', async () => {
  const calls = []
  await confirmFinalProjectDelete((...args) => {
    calls.push(args)
    return Promise.resolve()
  }, { actionText: '彻底删除', projectName: '归档项目', confirmButtonText: '确认彻底删除' })

  assert.deepEqual(calls, [[
    '请再次确认：确定要彻底删除项目 "归档项目" 吗？此操作不可恢复。',
    '最终确认',
    {
      type: 'warning',
      confirmButtonText: '确认彻底删除',
      cancelButtonText: '取消',
    },
  ]])
})

test('confirmFinalProjectDelete cancellation short-circuits callers before delete side effects', async () => {
  let apiCalled = false

  async function runDeleteFlow() {
    await Promise.resolve()
    await confirmFinalProjectDelete(() => Promise.reject('cancel'), { projectName: '测试项目' })
    apiCalled = true
  }

  await assert.rejects(runDeleteFlow(), error => error === 'cancel')
  assert.equal(apiCalled, false)
})

test('normal project delete waits for final confirmation before deleting', () => {
  const body = getFunctionBody(appSource, 'deleteProject')
  assert.match(body, /ElMessageBox\.confirm\(`删除项目/)
  assert.match(body, /confirmFinalProjectDelete\(ElMessageBox\.confirm, \{ projectName: p\.name \}\)/)
  assert.match(body, /if \(e !== 'cancel'\) ElMessage\.error\('删除失败: ' \+ e\.message\)/)
  assert.ok(body.indexOf('confirmFinalProjectDelete') < body.indexOf('api.del'))
})

test('admin batch project delete waits for final confirmation before API call', () => {
  const body = getFunctionBody(adminViewSource, 'executeBatchDelete')
  assert.match(body, /confirmFinalProjectDelete\(ElMessageBox\.confirm, \{[\s\S]*projectCount: selectedProjectIds\.value\.length/)
  assert.match(body, /if \(e !== 'cancel'\) ElMessage\.error\('删除失败: ' \+ e\.message\)/)
  assert.ok(body.indexOf('confirmFinalProjectDelete') < body.indexOf('api.post'))
})

test('hard project delete keeps irreversible warning and waits for final confirmation', () => {
  const body = getFunctionBody(adminViewSource, 'hardDeleteProject')
  assert.match(body, /ElMessageBox\.confirm\(`确定彻底删除项目/)
  assert.match(body, /confirmFinalProjectDelete\(ElMessageBox\.confirm, \{[\s\S]*actionText: '彻底删除'/)
  assert.match(body, /if \(e !== 'cancel'\) ElMessage\.error\('删除失败: ' \+ e\.message\)/)
  assert.ok(body.indexOf('ElMessageBox.confirm') < body.indexOf('confirmFinalProjectDelete'))
  assert.ok(body.indexOf('confirmFinalProjectDelete') < body.indexOf('api.del'))
})

test('management delete handlers require final confirmation before delete API calls', () => {
  const cases = [
    [codelistsSource, 'batchDelCl', 'api.post', 'batch-delete'],
    [codelistsSource, 'batchDelOpt', 'ElMessageBox.confirm', 'options/batch-delete'],
    [unitsSource, 'del', 'api.get', 'api.del'],
    [unitsSource, 'batchDelUnits', 'api.post', 'batch-delete'],
    [fieldsSource, 'del', 'ElMessageBox.confirm', 'api.del'],
    [fieldsSource, 'batchDelFields', 'ElMessageBox.confirm', 'batch-delete'],
    [visitsSource, 'del', 'ElMessageBox.confirm', 'api.del'],
    [visitsSource, 'batchDelVisits', 'ElMessageBox.confirm', 'batch-delete'],
    [visitsSource, 'removeFormFromVisit', 'confirmDeleteTwice', 'api.del'],
    [visitsSource, 'toggleCell', 'confirmDeleteTwice', 'api.del'],
    [designerSource, 'delForm', 'ElMessageBox.confirm', 'api.del'],
    [designerSource, 'batchDelForms', 'ElMessageBox.confirm', 'forms/batch-delete'],
    [designerSource, 'removeField', 'confirmDeleteTwice', 'api.del'],
    [designerSource, 'batchDelete', 'confirmFormChange', 'fields/batch-delete'],
    [adminViewSource, 'deleteUser', 'ElMessageBox.confirm', 'api.del'],
  ]

  for (const [source, functionName, confirmationCall, deleteCall] of cases) {
    const body = getFunctionBody(source, functionName)
    assert.match(body, new RegExp(`${confirmationCall}\\(`), `${functionName} should call ${confirmationCall}`)
    assert.ok(
      body.indexOf(confirmationCall) < body.indexOf(deleteCall),
      `${functionName} should confirm before ${deleteCall}`
    )
  }

  for (const [source, functionName] of [
    [codelistsSource, 'delCl'],
    [codelistsSource, 'delOpt'],
    [unitsSource, 'del'],
    [unitsSource, 'batchDelUnits'],
  ]) {
    const body = getFunctionBody(source, functionName)
    assert.doesNotMatch(body, /confirmDeleteTwice\(ElMessageBox\.confirm/)
    assert.doesNotMatch(body, /confirmFinalDelete\(ElMessageBox\.confirm/)
  }
})

test('quick codelist option row deletes require double confirmation before local removal', () => {
  for (const [source, functionName] of [
    [fieldsSource, 'quickDelOptRow'],
    [fieldsSource, 'quickEditDelOptRow'],
    [designerSource, 'quickDelOptRow'],
    [designerSource, 'quickEditDelOptRow'],
  ]) {
    const body = getFunctionBody(source, functionName)
    assert.match(body, /confirmDeleteTwice\(ElMessageBox\.confirm/)
    assert.ok(body.indexOf('confirmDeleteTwice') < body.indexOf('.splice('))
  }
})
