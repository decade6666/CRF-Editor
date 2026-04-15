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


test('choice codelist row exposes text actions with disable guard', () => {
  assert.match(formDesignerSource, /class="choice-codelist-row"/)
  assert.match(formDesignerSource, /class="choice-codelist-actions"/)
  assert.match(formDesignerSource, />新增字典<\/el-button>/)
  assert.match(formDesignerSource, />编辑字典<\/el-button>/)
  assert.match(formDesignerSource, /:disabled="!editProp\.codelist_id"/)
  assert.match(formDesignerSource, /@click="openQuickAddCodelist"/)
  assert.match(formDesignerSource, /@click="openQuickEditCodelist"/)
})


test('property editor restores type-specific controls', () => {
  assert.match(formDesignerSource, /v-model="editProp\.integer_digits"/)
  assert.match(formDesignerSource, /v-model="editProp\.decimal_digits"/)
  assert.match(formDesignerSource, /v-model="editProp\.date_format"/)
  assert.match(formDesignerSource, /DATE_FORMAT_OPTIONS\[editProp\.field_type\]/)
  assert.match(formDesignerSource, /v-model="editProp\.unit_id"/)
  assert.match(formDesignerSource, />新增单位<\/el-button>/)
  assert.match(formDesignerSource, /v-model="showQuickAddUnit" title="新增单位"/)
  assert.match(formDesignerSource, /@click="quickAddUnit"/)
  assert.match(formDesignerSource, /v-model="editProp\.default_value"/)
  assert.match(formDesignerSource, /label="文字颜色"/)
  assert.match(formDesignerSource, /syncFieldTypeSpecificProps\(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)/)
})


test('selectField keeps regular fields and log rows editable', () => {
  assert.match(formDesignerSource, /field_type: '日志行', integer_digits: null, decimal_digits: null, date_format: null, codelist_id: null, unit_id: null, default_value: '', inline_mark: 0, bg_color: ff\.bg_color \|\| null, text_color: ff\.text_color \|\| null/)
  assert.match(formDesignerSource, /field_type: fd\.field_type \|\| '文本', integer_digits: fd\.integer_digits, decimal_digits: fd\.decimal_digits, date_format: fd\.date_format, codelist_id: fd\.codelist_id, unit_id: fd\.unit_id, default_value: ff\.default_value \|\| '', inline_mark: ff\.inline_mark \|\| 0, bg_color: ff\.bg_color \|\| null, text_color: ff\.text_color \|\| null/)
  assert.match(formDesignerSource, /api\.patch\(`\/api\/form-fields\/\$\{ff\.id\}\/colors`, \{ bg_color: editProp\.bg_color, text_color: editProp\.text_color \}\)/)
  assert.match(formDesignerSource, /from '..\/composables\/formDesignerPropertyEditor'/)
  assert.match(formDesignerSource, /@input="applyCustomBgColor"/)
  assert.match(formDesignerSource, /@input="applyCustomTextColor"/)
})


test('field list exposes inline toggle backed by patch endpoint', () => {
  assert.match(formDesignerSource, /function canToggleInline\(ff\)/)
  assert.match(formDesignerSource, /async function toggleInline\(ff\)/)
  assert.match(formDesignerSource, /await confirmFormChange\(\)/)
  assert.match(formDesignerSource, /api\.patch\(`\/api\/form-fields\/\$\{ff\.id\}\/inline-mark`, \{\s*inline_mark: ff\.inline_mark \? 0 : 1,\s*\}\)/)
  assert.match(formDesignerSource, /api\.invalidateCache\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields`\)/)
  assert.match(formDesignerSource, /if \(selectedFieldId\.value === ff\.id\) \{[\s\S]*?if \(refreshed\) editProp\.inline_mark = refreshed\.inline_mark \|\| 0/)
  assert.match(formDesignerSource, /@click\.stop="toggleInline\(ff\)"/)
  assert.match(formDesignerSource, /content="横向表格标记"/)
  assert.match(formDesignerSource, /:aria-label="'切换 ' \+ getFormFieldDisplayLabel\(ff\) \+ ' 的横向表格标记'"/)
  assert.match(formDesignerSource, />⊞<\/el-button>/)
})


test('inline toggle is hidden for label and log-row fields', () => {
  assert.match(formDesignerSource, /return !ff\?\.is_log_row && type !== '标签' && type !== '日志行'/)
})


test('quick edit codelist dialog template is mounted', () => {
  assert.match(formDesignerSource, /<el-dialog v-model="showQuickEditCodelist" title="编辑选项字典" width="560px" :close-on-click-modal="false" :close-on-press-escape="false"/)
  assert.match(formDesignerSource, /v-model="quickEditCodelistName"/)
  assert.match(formDesignerSource, /v-model="quickEditCodelistDescription"/)
  assert.match(formDesignerSource, /v-model="quickEditOptCode"/)
  assert.match(formDesignerSource, /v-model="quickEditOptDecode"/)
  assert.match(formDesignerSource, /quickEditCodelistSaving/)
  assert.match(formDesignerSource, /:loading="quickEditCodelistSaving"/)
  assert.match(formDesignerSource, /@click="quickSaveCodelist"/)
})


test('quick edit codelist save uses single snapshot request and preserves description', () => {
  assert.match(formDesignerSource, /quickEditCodelistDescription\.value = cl\.description \|\| ''/)
  assert.match(formDesignerSource, /if \(quickEditCodelistSaving\.value\) return/)
  assert.match(formDesignerSource, /api\.get\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{quickEditCodelistId\.value\}\/references`\)/)
  assert.match(formDesignerSource, /修改将影响以下字段：[\s\S]*确认修改？/)
  assert.match(formDesignerSource, /const invalidOptionIndex = normalizedOptions\.findIndex\(opt => !opt\.code \|\| !opt\.decode\)/)
  assert.match(formDesignerSource, /await api\.put\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{quickEditCodelistId\.value\}\/snapshot`, \{/)
  assert.match(formDesignerSource, /description: quickEditCodelistDescription\.value/)
  assert.match(formDesignerSource, /options: normalizedOptions\.map\(opt => \(\{/)
  assert.doesNotMatch(formDesignerSource, /for \(const id of originalIds\) if \(!currentIds\.has\(id\)\) await api\.del/)
  assert.doesNotMatch(formDesignerSource, /await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{quickEditCodelistId\.value\}\/options/)
  assert.match(formDesignerSource, /closeQuickEditCodelist\(\)/)
  assert.match(formDesignerSource, /保存失败：\$\{e\.message\}。已刷新为最新字典数据，请重新检查后再编辑。/)
  assert.match(formDesignerSource, /quickEditCodelistSaving\.value = false/)
})