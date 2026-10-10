import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')

/**
 * 字段库内联编辑引用字典：入口与保存后的刷新/回绑留在 FieldsTab（宿主侧），
 * 表单状态、校验、引用确认、端点调用与缓存失效已共享到 CodelistQuickEditDialog
 * （shared-rule-convergence R3），对应行为由
 * tests/component/CodelistQuickEditDialog.spec.js 的挂载测试锁定。
 */

test('FieldsTab imports the add/edit icons for inline codelist editing', () => {
  assert.match(source, /import \{ Delete, DocumentCopy, EditPen, Plus \} from ['"]@element-plus\/icons-vue['"]/)
})

test('choice option row exposes add and edit codelist buttons with correct wiring', () => {
  // 新增字典：始终可用
  assert.match(source, /:icon="Plus"[\s\S]*?@click="openQuickAddCodelist"/)
  // 编辑字典：未选字典时禁用
  assert.match(source, /:icon="EditPen"[\s\S]*?:disabled="!editProp\.codelist_id"[\s\S]*?@click="openQuickEditCodelist"/)
})

test('quick add opens the shared dialog; created codelist is bound by the host afterChange', () => {
  // 端点与载荷断言随实现迁入弹窗（挂载测试断言 POST /codelists 载荷）；
  // 宿主保留：共享弹窗接线 + afterChange('add') 内的新字典回绑；新增成功提示经
  // add-success-message 由弹窗在关闭后发出（保持原 close→toast 顺序，挂载测试锁顺序）。
  assert.match(source, /<CodelistQuickEditDialog[\s\S]*?v-model="showQuickAddCodelist"[\s\S]*?mode="add"/)
  assert.match(source, /function openQuickAddCodelist\(\) \{/)
  assert.match(source, /editProp\.codelist_id = codelist\.id/)
  assert.match(source, /add-success-message="新增成功"/)
})

test('quick edit opens the shared dialog hydrated from the selected codelist', () => {
  // 引用确认与 snapshot 端点断言迁入弹窗（挂载测试覆盖 references GET + snapshot PUT）；
  // 宿主保留：编辑目标解析与未选字典守卫。
  assert.match(source, /function openQuickEditCodelist\(\) \{/)
  assert.match(source, /if \(!editProp\.codelist_id\) return/)
  assert.match(source, /if \(!codelists\.value\.some\(\(c\) => c\.id === editProp\.codelist_id\)\) return/)
  assert.match(source, /<CodelistQuickEditDialog[\s\S]*?v-model="showQuickEditCodelist"[\s\S]*?mode="edit"[\s\S]*?:codelist-id="quickEditCodelistId"/)
})

test('codelist writes refresh host data and bump the global refreshKey via afterChange', () => {
  // 缓存失效（codelists + field-definitions）统一前移到共享弹窗内（挂载测试断言两键）；
  // 宿主保留与历史 reloadAfterCodelistChange 相同的 load + refreshKey 联动刷新。
  assert.match(
    source,
    /async function afterCodelistDialogChange\(kind, \{ codelist \}\) \{[\s\S]*?await load\(\)[\s\S]*?refreshKey\.value\+\+/,
  )
})

test('FieldsTab load guards late responses against project switches', () => {
  // 共享弹窗 afterChange 会调用宿主 load()：项目切换后迟到的批量加载
  // 不得把旧项目数据写进新项目的列表状态（identity gate，同类于会话令牌守卫）。
  assert.match(source, /async function load\(\) \{[\s\S]{0,200}const pid = props\.projectId/)
  assert.match(source, /if \(props\.projectId !== pid\) return\n  fields\.value = nextFields/)
})

test('quick edit failure refresh flow moved to the shared dialog', () => {
  // 失败后刷新 + 关闭 + 「已刷新为最新字典数据」提示属于弹窗级流程（design §2.2），
  // 由挂载测试断言完整提示文案；FieldsTab 源内不再持有该文案。
  assert.doesNotMatch(source, /已刷新为最新字典数据/)
  assert.match(source, /<CodelistQuickEditDialog[\s\S]*?:after-change="afterCodelistDialogChange"/)
})

test('add and edit dialogs no longer render trailing-underscore toggles', () => {
  assert.match(source, /v-model="showQuickAddCodelist"/)
  assert.match(source, /v-model="showQuickEditCodelist"/)
  assert.doesNotMatch(source, /function toggleTrailingLine\(row\)/)
  assert.doesNotMatch(source, /后加下划线/)
})
