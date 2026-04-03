import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

/**
 * Task 7.2: 预览双击快捷编辑验证
 * 验证右侧预览双击字段实例可触发快捷编辑
 */

test('preview field has double-click handler for quick edit', () => {
  // 预览区字段行绑定 dblclick 事件
  assert.match(formDesignerSource, /@dblclick="openQuickEdit\(seg\.fields\[0\]\)"/)
  assert.match(formDesignerSource, /@dblclick="openQuickEdit\(ff\)"/)
})

test('quick edit method exists and handles field instance properties', () => {
  // openQuickEdit 方法存在
  assert.match(formDesignerSource, /function openQuickEdit\(|const openQuickEdit = /)
  // 快捷编辑处理字段实例级属性
  assert.match(formDesignerSource, /label_override/)
  assert.match(formDesignerSource, /bg_color/)
  assert.match(formDesignerSource, /text_color/)
  assert.match(formDesignerSource, /inline_mark/)
})

test('quick edit dialog uses existing PUT endpoint for saving', () => {
  // 使用现有 API 更新字段实例
  assert.match(formDesignerSource, /PUT.*form-fields|updateFormField|saveQuickEdit/)
  // 保存后刷新列表和预览
  assert.match(formDesignerSource, /loadFormFields|loadFields|refreshPreview/)
})

test('quick edit is limited to field instance properties only', () => {
  // 快捷编辑弹窗（quickEditDialogVisible）只显示实例级属性
  // 检查 quickEditProp 初始化只含实例级字段（不含 variable_name）
  assert.match(formDesignerSource, /quickEditProp.*label.*bg_color.*text_color.*inline_mark/)
  // 快捷编辑表单不应包含 field_definition 级别的编辑控件
  const hasVariableNameEdit = /quickEditDialogVisible.*v-model.*variable_name/s.test(formDesignerSource)
  const hasFieldTypeEditInQuickEdit = /quickEditDialogVisible[\s\S]*?<el-select[^>]*v-model="quickEditProp\.field_type"/s.test(formDesignerSource)

  assert.equal(hasVariableNameEdit, false, 'Quick edit should not allow editing variable_name')
  assert.equal(hasFieldTypeEditInQuickEdit, false, 'Quick edit should not include field_type selector')
})

test('preview renders same field order as main list', () => {
  // 预览和主列表使用相同的 order_index 排序
  assert.match(formDesignerSource, /order_index/)
  // 预览分组使用 formFields 数据源
  assert.match(formDesignerSource, /formFields|props\.fields/)
})