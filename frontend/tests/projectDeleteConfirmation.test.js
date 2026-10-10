import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildFinalDeleteConfirmMessage,
  buildFinalProjectDeleteConfirmMessage,
  confirmDelete,
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

test('buildFinalProjectDeleteConfirmMessage describes recoverable named project delete', () => {
  assert.equal(
    buildFinalProjectDeleteConfirmMessage({ projectName: 'TEST', recoverable: true }),
    '请再次确认：确定要删除项目 "TEST" 吗？删除后如需恢复，请联系管理员。'
  )
})

test('buildFinalProjectDeleteConfirmMessage describes recoverable batch project delete', () => {
  assert.equal(
    buildFinalProjectDeleteConfirmMessage({ projectCount: 3, recoverable: true }),
    '请再次确认：确定要删除选中的 3 个项目吗？删除后如需恢复，请联系管理员。'
  )
})

test('buildFinalDeleteConfirmMessage describes generic delete targets', () => {
  assert.equal(
    buildFinalDeleteConfirmMessage({ targetText: '选中的 2 个字段' }),
    '请再次确认：确定要删除选中的 2 个字段吗？此操作不可恢复。'
  )
})

test('confirmDelete runs a single confirmation with the expected message', async () => {
  const calls = []
  await confirmDelete((...args) => {
    calls.push(args)
    return Promise.resolve()
  }, { targetText: '单位 "kg"' })

  assert.deepEqual(calls, [[
    '确认删除单位 "kg" 吗？',
    '确认',
    {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    },
  ]])
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
  assert.match(body, /ElMessageBox\.confirm\(`删除项目 "\$\{p\.name\}"？删除后如需恢复，请联系管理员。`/)
  assert.match(body, /confirmFinalProjectDelete\(ElMessageBox\.confirm, \{ projectName: p\.name, recoverable: true \}\)/)
  assert.match(body, /if \(e !== 'cancel'\) ElMessage\.error\('删除失败: ' \+ e\.message\)/)
  assert.ok(body.indexOf('confirmFinalProjectDelete') < body.indexOf('api.del'))
})

test('admin batch project delete waits for final confirmation before API call', () => {
  const body = getFunctionBody(adminViewSource, 'executeBatchDelete')
  assert.match(body, /confirmFinalProjectDelete\(ElMessageBox\.confirm, \{[\s\S]*projectCount: selectedProjectIds\.value\.length,[\s\S]*recoverable: true/)
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

test('standard management delete handlers require confirmation before delete API calls', () => {
  const cases = [
    [codelistsSource, 'delCl', 'ElMessageBox.confirm', 'api.del'],
    [codelistsSource, 'batchDelCl', 'ElMessageBox.confirm', 'batch-delete'],
    [codelistsSource, 'delOpt', 'ElMessageBox.confirm', 'api.del'],
    [codelistsSource, 'batchDelOpt', 'ElMessageBox.confirm', 'options/batch-delete'],
    [unitsSource, 'del', 'ElMessageBox.confirm', 'api.del'],
    [unitsSource, 'batchDelUnits', 'ElMessageBox.confirm', 'batch-delete'],
    [fieldsSource, 'del', 'ElMessageBox.confirm', 'api.del'],
    [fieldsSource, 'batchDelFields', 'ElMessageBox.confirm', 'batch-delete'],
    [visitsSource, 'del', 'ElMessageBox.confirm', 'api.del'],
    [visitsSource, 'batchDelVisits', 'ElMessageBox.confirm', 'batch-delete'],
    [designerSource, 'delForm', 'ElMessageBox.confirm', 'api.del'],
    [designerSource, 'batchDelForms', 'ElMessageBox.confirm', 'forms/batch-delete'],
    [designerSource, 'removeField', 'confirmFormChange', 'api.del'],
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

  // 2.5：访视流程页内移除访视表单不二次确认，直接 DELETE
  const removeBody = getFunctionBody(visitsSource, 'removeFormFromVisit')
  assert.doesNotMatch(removeBody, /confirmDelete|ElMessageBox\.confirm/)
  assert.ok(removeBody.indexOf('api.del') >= 0)
  assert.match(removeBody, /catch \(e\) \{ if \(e !== 'cancel'\) ElMessage\.error\(e\.message\) \}/)

  // All handlers should NOT use double-confirm helpers
  for (const [source, functionName] of [
    [codelistsSource, 'delCl'],
    [codelistsSource, 'delOpt'],
    [codelistsSource, 'batchDelCl'],
    [unitsSource, 'del'],
    [unitsSource, 'batchDelUnits'],
    [fieldsSource, 'del'],
    [fieldsSource, 'batchDelFields'],
    [visitsSource, 'del'],
    [visitsSource, 'batchDelVisits'],
    [designerSource, 'delForm'],
    [designerSource, 'batchDelForms'],
    [adminViewSource, 'deleteUser'],
  ]) {
    const body = getFunctionBody(source, functionName)
    assert.doesNotMatch(body, /confirmDeleteTwice\(ElMessageBox\.confirm/)
    assert.doesNotMatch(body, /confirmFinalDelete\(ElMessageBox\.confirm/)
  }
})

test('visit flow matrix removes an unchecked association directly without confirmation', () => {
  const body = getFunctionBody(visitsSource, 'toggleCell')

  assert.match(body, /if \(has\) \{\s*await api\.del\(`\/api\/visits\/\$\{visitId\}\/forms\/\$\{formId\}`\)/)
  assert.doesNotMatch(body, /confirmDelete|ElMessageBox\.confirm/)
  assert.match(body, /await reloadVisitForms\(\)/)
  assert.match(body, /catch \(e\) \{ if \(e !== 'cancel'\) ElMessage\.error\(e\.message \|\| '操作失败'\) \}/)
  assert.doesNotMatch(visitsSource, /import \{ confirmDelete \} from '\.\.\/composables\/projectDeleteConfirmation'/)
})

test('quick codelist option row deletes require a single confirmation before local removal', () => {
  // 字典快捷增/改已共享为 CodelistQuickEditDialog（shared-rule-convergence R3）：
  // 两宿主共用的选项行删除函数 delOptRow 迁入弹窗，确认→本地移除的顺序断言随迁
  // （本地移除已改为不可变 filter 替换）。
  const quickEditDialogSource = readFileSync(
    path.resolve(currentDir, '../src/components/CodelistQuickEditDialog.vue'),
    'utf8',
  )
  for (const [source, functionName] of [
    [quickEditDialogSource, 'delOptRow'],
  ]) {
    const body = getFunctionBody(source, functionName)
    assert.match(body, /confirmDelete\(ElMessageBox\.confirm/)
    assert.doesNotMatch(body, /confirmDeleteTwice\(ElMessageBox\.confirm/)
    assert.ok(body.indexOf('confirmDelete') < body.indexOf('.filter('))
  }
})
