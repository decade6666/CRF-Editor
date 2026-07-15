import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

/**
 * Task 7.2: 预览双击快捷编辑验证
 * 验证右侧预览双击字段实例可触发快捷编辑
 */

test('fullscreen preview field has double-click handler for quick edit', () => {
  assert.match(formDesignerSource, /class="designer-workspace-bottom"[\s\S]*class="designer-preview-pane"/)
  assert.doesNotMatch(formDesignerSource, /class="designer-side-pane"[\s\S]*class="designer-preview-pane"/)
  assert.match(formDesignerSource, /@dblclick="openQuickEdit\(seg\.fields\[0\]\)"/)
  assert.match(formDesignerSource, /@dblclick="openQuickEdit\(ff\)"/)
  assert.match(formDesignerSource, /@dblclick="openQuickEdit\(seg\.fields\[ci\]\)"|@dblclick="openQuickEdit\(g\.fields\[ci\]\)"/)
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
  assert.match(
    formDesignerSource,
    /const quickEditProp = reactive\(\{[\s\S]*label:\s*''[\s\S]*field_type:\s*''[\s\S]*bg_color:\s*''[\s\S]*text_color:\s*''[\s\S]*inline_mark:\s*false[\s\S]*default_value:\s*''[\s\S]*label_bold:\s*1[\s\S]*label_font_size:\s*'default'[\s\S]*\}\)/,
  )
  const quickEditDialog = /<el-dialog v-model="showQuickEdit"[\s\S]*?<\/el-dialog>/.exec(formDesignerSource)?.[0] ?? ''
  assert.match(
    quickEditDialog,
    /label="文字颜色"[\s\S]*class="color-option color-option-default"[\s\S]*@click="quickEditProp\.text_color = null"/,
  )
  assert.match(quickEditDialog, /v-model="quickEditProp\.label_bold" :active-value="1" :inactive-value="0"/)
  // 快捷编辑表单不应包含 field_definition 级别的编辑控件
  const hasVariableNameEdit = /v-model="quickEditProp\.variable_name"/.test(quickEditDialog)
  const hasFieldTypeEditInQuickEdit = /<el-select[^>]*v-model="quickEditProp\.field_type"/s.test(quickEditDialog)

  assert.equal(hasVariableNameEdit, false, 'Quick edit should not allow editing variable_name')
  assert.equal(hasFieldTypeEditInQuickEdit, false, 'Quick edit should not include field_type selector')
})

test('property editor previews live edits and design notes use independent autosave', () => {
  assert.match(formDesignerSource, /const designerPreviewFields = computed\(\(\) => \{[\s\S]*const liveSnapshot = liveEditSnapshot\.value\?\.fieldId === field\.id \? liveEditSnapshot\.value : null;[\s\S]*return applyPreviewSnapshot\(field, liveSnapshot\)/)
  assert.match(formDesignerSource, /ElMessage\.error\(`设计备注保存失败：\$\{e\.message\}`\)/)
  assert.match(formDesignerSource, /async function selectForm\(nextForm\)/)
  assert.match(formDesignerSource, /formsTableRef\.value\?\.setCurrentRow\(currentForm\)/)
  assert.match(formDesignerSource, /@current-change="selectForm"/)
})

test('fullscreen designer preview rehydrates latest width and height overrides when opened', () => {
  assert.match(formDesignerSource, /showDesigner\.value = true;[\s\S]*refreshDesignerPreviewOverrides\(\);/)
  assert.match(formDesignerSource, /function refreshPreviewOverrideState\(groups, scope = 'main'\) \{[\s\S]*const resizer = getResizer\(group\.type, colCount, groupIndex, group, scope\);[\s\S]*resizer\?\.rehydrate\?\.\(\);[\s\S]*const rowResizer = getRowResizer\(group\.type, group\);[\s\S]*rowResizer\?\.rehydrate\?\.\(\);/)
  assert.match(formDesignerSource, /function refreshDesignerPreviewOverrides\(\) \{[\s\S]*refreshPreviewOverrideState\(renderGroupsView\.value, 'main'\);[\s\S]*refreshPreviewOverrideState\(designerRenderGroupsView\.value, 'designer'\);/)
})

test('closing fullscreen designer rehydrates main preview overrides before returning', () => {
  assert.match(formDesignerSource, /async function handleDesignerBeforeClose\(done\) \{[\s\S]*const canClose = await resolveFieldPropLeave\(\{ actionText: '关闭设计窗口' \}\);[\s\S]*if \(canClose\) \{[\s\S]*refreshPreviewOverrideState\(renderGroupsView\.value, 'main'\);[\s\S]*done\(\);[\s\S]*\}/)
})


test('choice codelist row exposes icon actions with disable guard', () => {
  assert.match(formDesignerSource, /class="choice-codelist-row"/)
  assert.match(formDesignerSource, /class="choice-codelist-select"/)
  assert.match(formDesignerSource, /class="choice-codelist-actions"/)
  assert.match(formDesignerSource, /aria-label="新增字典"/)
  assert.match(formDesignerSource, /aria-label="编辑字典"/)
  assert.match(formDesignerSource, /title="新增字典"/)
  assert.match(formDesignerSource, /title="编辑字典"/)
  assert.match(formDesignerSource, /:icon="Plus"/)
  assert.match(formDesignerSource, /:icon="EditPen"/)
  assert.match(formDesignerSource, /:disabled="!editProp\.codelist_id"/)
  assert.match(formDesignerSource, /@click="openQuickAddCodelist"/)
  assert.match(formDesignerSource, /@click="openQuickEditCodelist"/)
})


test('property editor restores type-specific controls', () => {
  assert.match(
    formDesignerSource,
    /data-test="designer-field-property-form"[\s\S]*?:disabled="designerHistory\.busy\.value"[\s\S]*<el-form-item label="字段标签"[\s\S]*<el-input[\s\S]*v-model="editProp\.label"[\s\S]*:type="editProp\.field_type === '标签' \? 'textarea' : 'text'"/,
  )
  assert.match(formDesignerSource, /<el-form-item v-if="isChoiceField\(editProp\.field_type\)" label="字段选项">/)
  assert.match(formDesignerSource, /:autosize="editProp\.field_type === '标签' \? \{ minRows: 2, maxRows: 4 \} : undefined"/)
  assert.match(formDesignerSource, /v-model="editProp\.integer_digits"/)
  assert.match(formDesignerSource, /v-model="editProp\.decimal_digits"/)
  assert.match(formDesignerSource, /v-model="editProp\.date_format"/)
  assert.match(formDesignerSource, /DATE_FORMAT_OPTIONS\[editProp\.field_type\]/)
  assert.match(formDesignerSource, /v-model="editProp\.unit_id"/)
  assert.match(formDesignerSource, /:value-on-clear="null"/)
  assert.match(formDesignerSource, /aria-label="新增单位"/)
  assert.match(formDesignerSource, /title="新增单位"/)
  assert.match(formDesignerSource, /:icon="Plus"/)
  assert.match(formDesignerSource, /<el-dialog v-model="showQuickAddUnit" title="新增单位"/)
  assert.match(formDesignerSource, /@click="quickAddUnit"/)
  assert.match(formDesignerSource, /v-model="editProp\.default_value"/)
  assert.match(formDesignerSource, /label="文字颜色"/)
  assert.match(formDesignerSource, /syncFieldTypeSpecificProps\(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)/)
})


test('normalizeHexColorInput expands 3-digit hex to 6-digit hex', () => {
  const propertyEditorSource = readFileSync(path.resolve(currentDir, '../src/composables/formDesignerPropertyEditor.js'), 'utf8')
  assert.match(propertyEditorSource, /if \(\/\^\[0-9A-F\]\{3\}\$\/\.test\(normalized\)\) \{[\s\S]*split\(''\)\.map\(char => char \+ char\)\.join\(''\)/)
  assert.match(propertyEditorSource, /return \/\^\[0-9A-F\]\{6\}\$\/\.test\(normalized\) \? normalized : null/)
})


test('preview style helpers whitelist only 6-digit hex colors', () => {
  const presentationSource = readFileSync(path.resolve(currentDir, '../src/composables/formFieldPresentation.js'), 'utf8')
  assert.match(presentationSource, /function normalizePreviewHexColor\(value\) \{[\s\S]*return \/\^\[0-9A-F\]\{6\}\$\/i\.test\(normalized\) \? normalized : null/)
  assert.match(presentationSource, /const normalized = normalizePreviewHexColor\(formField\?\.text_color\)/)
  assert.match(presentationSource, /const normalizedBg = normalizePreviewHexColor\(formField\?\.bg_color\)/)
  assert.match(presentationSource, /const normalizedText = normalizePreviewHexColor\(formField\?\.text_color\)/)
})


test('template preview selection style reuses shared color normalization', () => {
  const templatePreviewSource = readFileSync(path.resolve(currentDir, '../src/components/TemplatePreviewDialog.vue'), 'utf8')
  assert.match(templatePreviewSource, /import \{[\s\S]*normalizePreviewHexColor[\s\S]*\} from '..\/composables\/formFieldPresentation'/)
  assert.match(templatePreviewSource, /function getItemStyle\(field\) \{[\s\S]*const bgColor = normalizePreviewHexColor\(field\?\.bg_color\)[\s\S]*const textColor = normalizePreviewHexColor\(field\?\.text_color\)/)
  assert.match(templatePreviewSource, /const bg = bgColor \? `background-color:#\$\{bgColor\}20;` : ''/)
  assert.match(templatePreviewSource, /const text = textColor \? `color:#\$\{textColor\};` : ''/)
  assert.doesNotMatch(templatePreviewSource, /\/\^\[0-9A-F\]\{6\}\$\/i\.test\(String\(field\?\.bg_color \?\? ''\)\)/)
  assert.doesNotMatch(templatePreviewSource, /\/\^\[0-9A-F\]\{6\}\$\/i\.test\(String\(field\?\.text_color \?\? ''\)\)/)
})


test('property editor aligns bg default swatch with text default swatch and removes text black preset', () => {
  assert.match(formDesignerSource, /const BG_COLOR_OPTIONS = \[\s*\{ value: null, label: '默认' \}/)
  assert.doesNotMatch(formDesignerSource, /const TEXT_COLOR_OPTIONS = \[[\s\S]*\{ value: '000000', label: '黑色' \}/)
  assert.match(
    formDesignerSource,
    /v-else-if="editProp\.field_type === '日志行'"[\s\S]*label="底纹颜色"[\s\S]*class="color-option color-option-default"[\s\S]*editProp\.bg_color = null[\s\S]*customBgColorInput = ''/,
  )
  assert.match(
    formDesignerSource,
    /v-else class="designer-editor-scroll"[\s\S]*label="底纹颜色"[\s\S]*class="color-option color-option-default"[\s\S]*editProp\.bg_color = null[\s\S]*customBgColorInput = ''/,
  )
  assert.match(formDesignerSource, /label="底纹颜色"[\s\S]*v-for="opt in BG_COLOR_OPTIONS\.slice\(1\)"/)
  assert.match(formDesignerSource, /<el-form-item label="底纹颜色">[\s\S]*class="color-option color-option-default"[\s\S]*quickEditProp\.bg_color = null/)
  assert.match(
    formDesignerSource,
    /label="文字颜色"[\s\S]*class="color-option color-option-default"[\s\S]*editProp\.text_color = null[\s\S]*customTextColorInput = ''/,
  )
  assert.match(formDesignerSource, /<el-form-item label="文字颜色">[\s\S]*class="color-option color-option-default"[\s\S]*quickEditProp\.text_color = null/)
  assert.match(formDesignerSource, /v-for="opt in TEXT_COLOR_OPTIONS"/)
  assert.doesNotMatch(formDesignerSource, /<el-form-item label="底纹">/)
})


test('selectField keeps regular fields and log rows editable', () => {
  assert.match(
    formDesignerSource,
    /field_type: '日志行',[\s\S]*integer_digits: null,[\s\S]*decimal_digits: null,[\s\S]*date_format: null,[\s\S]*codelist_id: null,[\s\S]*unit_id: null,[\s\S]*default_value: '',[\s\S]*inline_mark: 0,[\s\S]*bg_color: ff\.bg_color \|\| null,[\s\S]*text_color: ff\.text_color \|\| null/,
  )
  assert.match(
    formDesignerSource,
    /field_type: fd\.field_type \|\| '文本',[\s\S]*integer_digits: fd\.integer_digits,[\s\S]*decimal_digits: fd\.decimal_digits,[\s\S]*date_format: fd\.date_format,[\s\S]*codelist_id: fd\.codelist_id,[\s\S]*unit_id: fd\.unit_id \?\? null,[\s\S]*default_value: ff\.default_value \|\| '',[\s\S]*inline_mark: ff\.inline_mark \|\| 0,[\s\S]*bg_color: ff\.bg_color \|\| null,[\s\S]*text_color: ff\.text_color \|\| null/,
  )
  assert.match(
    formDesignerSource,
    /api\.put\(`\/api\/projects\/\$\{projectId\}\/field-definitions\/\$\{ff\.field_definition_id\}`,[\s\S]*label: snapshot\.label,[\s\S]*variable_name: snapshot\.variable_name,[\s\S]*field_type: snapshot\.field_type,[\s\S]*integer_digits: snapshot\.integer_digits,[\s\S]*decimal_digits: snapshot\.decimal_digits,[\s\S]*date_format: snapshot\.date_format,[\s\S]*codelist_id: snapshot\.codelist_id,[\s\S]*unit_id: snapshot\.unit_id \?\? null[\s\S]*\}\)/,
  )
  assert.match(
    formDesignerSource,
    /api\.patch\(`\/api\/form-fields\/\$\{ff\.id\}\/colors`,[\s\S]*bg_color: snapshot\.bg_color,[\s\S]*text_color: snapshot\.text_color[\s\S]*\}\)/,
  )
  assert.match(formDesignerSource, /api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\)/)
  assert.match(formDesignerSource, /from '..\/composables\/formDesignerPropertyEditor'/)
  assert.match(formDesignerSource, /@input="applyCustomBgColor"/)
  assert.match(formDesignerSource, /@input="applyCustomTextColor"/)
})


test('field list exposes inline toggle backed by patch endpoint', () => {
  assert.match(formDesignerSource, /function canToggleInline\(ff\)/)
  assert.match(formDesignerSource, /async function toggleInline\(ff\)/)
  assert.match(formDesignerSource, /await confirmFormChange\(\)/)
  assert.match(
    formDesignerSource,
    /api\.patch\(`\/api\/form-fields\/\$\{ff\.id\}\/inline-mark`,[\s\S]*inline_mark: nextInlineMark[\s\S]*\}\)/,
  )
  assert.match(formDesignerSource, /api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\)/)
  assert.match(formDesignerSource, /if \(selectedFieldId\.value === ff\.id && !isFieldPropDirty\.value\) \{[\s\S]*if \(refreshed\) selectField\(refreshed\)/)
  assert.match(formDesignerSource, /@click\.stop="toggleInline\(ff\)"/)
  assert.match(formDesignerSource, /content="横向表格标记"/)
  assert.match(formDesignerSource, /:aria-label="'切换 ' \+ getFormFieldDisplayLabel\(ff\) \+ ' 的横向表格标记'"/)
  assert.match(formDesignerSource, /@click\.stop="toggleInline\(ff\)"[\s\S]*>⊞<\/el-button\s*>/)
})


test('inline toggle is hidden for label and log-row fields', () => {
  assert.match(formDesignerSource, /return !ff\?\.is_log_row && type !== '标签' && type !== '日志行'/)
})


test('quick add codelist dialog template aligns with edit dialog', () => {
  assert.match(
    formDesignerSource,
    /<el-dialog[\s\S]*v-model="showQuickAddCodelist"[\s\S]*title="新增选项"[\s\S]*width="560px"[\s\S]*:close-on-click-modal="false"[\s\S]*:close-on-press-escape="false"/,
  )
  assert.match(formDesignerSource, /v-model="quickCodelistName"/)
  assert.match(formDesignerSource, /v-model="quickCodelistDescription"/)
  assert.match(formDesignerSource, /v-model="row.code"/)
  assert.match(formDesignerSource, /v-model="row.decode"/)
  assert.match(formDesignerSource, /row.trailing_underscore === 1/)
  assert.match(formDesignerSource, /@click="quickDelOptRow\(\$index\)"/)
  assert.match(formDesignerSource, /quickAddCodelistSaving/)
  assert.match(formDesignerSource, /:loading="quickAddCodelistSaving"/)
  assert.match(formDesignerSource, /@click="quickAddCodelist"/)
})


test('quick add codelist saves description and options in a single request', () => {
  assert.match(formDesignerSource, /quickCodelistDescription = ref\(''\)/)
  assert.match(formDesignerSource, /quickAddCodelistSaving = ref\(false\)/)
  assert.match(
    formDesignerSource,
    /quickCodelistOpts\.value\.push\(\{[\s\S]*id: null,[\s\S]*code: quickOptCode\.value\.trim\(\) \|\| `C\.\$\{n \+ 1\}`[\s\S]*decode: quickOptDecode\.value\.trim\(\)[\s\S]*trailing_underscore: 0[\s\S]*\}\)/,
  )
  assert.match(formDesignerSource, /quickAddCodelistSaving\.value = false/)
  assert.match(formDesignerSource, /quickCodelistDescription\.value = ''/)
  assert.match(formDesignerSource, /if \(quickAddCodelistSaving\.value\) return/)
  assert.match(formDesignerSource, /const invalidOptionIndex = normalizedOptions\.findIndex\([\s\S]*!opt\.code \|\| !opt\.decode\)/)
  assert.match(formDesignerSource, /await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists`, \{/)
  assert.match(formDesignerSource, /description: quickCodelistDescription\.value/)
  assert.match(formDesignerSource, /options: normalizedOptions\.map\(\(opt, index\) => \(\{/)
  assert.doesNotMatch(formDesignerSource, /for \(const opt of normalizedOptions\) await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{created\.id\}\/options/)
  assert.match(formDesignerSource, /editProp\.codelist_id = created\.id/)
})


test('quick edit codelist dialog template is mounted', () => {
  assert.match(
    formDesignerSource,
    /<el-dialog[\s\S]*v-model="showQuickEditCodelist"[\s\S]*title="编辑选项字典"[\s\S]*width="560px"[\s\S]*:close-on-click-modal="false"[\s\S]*:close-on-press-escape="false"/,
  )
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
  assert.match(formDesignerSource, /const invalidOptionIndex = normalizedOptions\.findIndex\([\s\S]*!opt\.code \|\| !opt\.decode\)/)
  assert.match(formDesignerSource, /await api\.put\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{quickEditCodelistId\.value\}\/snapshot`, \{/)
  assert.match(formDesignerSource, /description: quickEditCodelistDescription\.value/)
  assert.match(formDesignerSource, /options: normalizedOptions\.map\([\s\S]*opt[\s\S]*=>[\s\S]*\(\{/)
  assert.doesNotMatch(formDesignerSource, /for \(const id of originalIds\) if \(!currentIds\.has\(id\)\) await api\.del/)
  assert.doesNotMatch(formDesignerSource, /await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{quickEditCodelistId\.value\}\/options/)
  assert.match(formDesignerSource, /const updated = formFields\.value\.find\(\(f\) => f\.id === selectedFieldId\.value\);[\s\S]*if \(updated && !isFieldPropDirty\.value\) selectField\(updated\)/)
  assert.match(formDesignerSource, /closeQuickEditCodelist\(\)/)
  assert.match(formDesignerSource, /保存失败：\$\{e\.message\}。已刷新为最新字典数据，请重新检查后再编辑。/)
  assert.match(formDesignerSource, /quickEditCodelistSaving\.value = false/)
})


test('property editor uses explicit save and cancel buttons instead of persistent autosave', () => {
  assert.match(formDesignerSource, /const fieldPropBaseline = ref\(null\)/)
  assert.match(formDesignerSource, /const isSavingFieldProp = ref\(false\)/)
  assert.match(formDesignerSource, /const fieldPropProjectId = ref\(props\.projectId\)/)
  assert.match(formDesignerSource, /const isFieldPropDirty = computed\(\(\) => \{[\s\S]*selectedFieldId\.value === DRAFT_FIELD_ID[\s\S]*!sameFieldPropState\(fieldPropBaseline\.value, currentState\)/)
  assert.match(formDesignerSource, /function resetFieldPropAutoSaveState\(\{ preserveEditor = false \} = \{\}\) \{[\s\S]*fieldPropSaveSession \+= 1[\s\S]*fieldPropBaseline\.value = null/)
  assert.match(formDesignerSource, /function syncFieldPropBaselineFromEditor\(\) \{[\s\S]*currentEditorPropState\(\)/)
  assert.match(formDesignerSource, /watch\(currentFieldPropDraftKey,[\s\S]*selectedFieldId\.value === DRAFT_FIELD_ID[\s\S]*applyEditorToDraft\(\)/)
  assert.doesNotMatch(formDesignerSource, /let pendingFieldPropSnapshots = \[\]/)
  assert.doesNotMatch(formDesignerSource, /flushPendingFieldPropSave/)
  assert.doesNotMatch(formDesignerSource, /fieldPropSaveTimer = setTimeout/)
  assert.match(formDesignerSource, /data-test="designer-property-actions"/)
  assert.match(formDesignerSource, /data-test="designer-property-cancel"[\s\S]*:disabled="!isFieldPropDirty \|\| designerHistory\.busy\.value \|\| isSavingFieldProp"[\s\S]*@click="cancelSelectedFieldProp"/)
  assert.match(formDesignerSource, /data-test="designer-property-save"[\s\S]*:loading="isSavingFieldProp"[\s\S]*:disabled="!isFieldPropDirty \|\| designerHistory\.busy\.value"[\s\S]*@click="saveSelectedFieldProp"/)
})


test('property editor hydrates baseline before switching fields', () => {
  assert.match(formDesignerSource, /let isHydratingFieldProp = false/)
  assert.match(formDesignerSource, /let lastHydratedFieldPropDraftKey = ''/)
  assert.doesNotMatch(formDesignerSource, /if \(selectedFieldId\.value && selectedFieldId\.value !== ff\.id\) void flushPendingFieldPropSave\(\)/)
  assert.match(formDesignerSource, /projectId: fieldPropProjectId\.value/)
  assert.match(formDesignerSource, /lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey\(buildFieldPropSnapshot\(ff\.id\)\)/)
  assert.match(formDesignerSource, /syncFieldPropBaselineFromEditor\(\)/)
})


test('property editor save uses shared multi-form impact warning and context guards', () => {
  assert.match(formDesignerSource, /async function saveSelectedFieldProp\(\) \{/)
  assert.match(formDesignerSource, /isSavingFieldProp\.value = true/)
  assert.match(formDesignerSource, /await confirmFieldReferenceImpact\(ff\)/)
  assert.match(formDesignerSource, /await saveFieldProp\(snapshot, sessionId\)/)
  assert.match(formDesignerSource, /if \(selectedFieldId\.value === snapshot\.fieldId\) syncFieldPropBaselineFromEditor\(\)/)
  assert.match(formDesignerSource, /const refs = await api\.get\(`\/api\/field-definitions\/\$\{ff\.field_definition_id\}\/references`\)/)
  assert.match(formDesignerSource, /if \(countDistinctForms\(refs\) <= 1\) return true/)
  assert.match(formDesignerSource, /formatFieldImpactMessage\(refs, \{ max: 5, sep: '、' \}\)/)
  assert.match(formDesignerSource, /if \(sessionId !== fieldPropSaveSession\) throw new Error\('字段属性保存上下文已变更'\)/)
  assert.match(
    formDesignerSource,
    /if \(!ff\.is_log_row && isChoiceField\(snapshot\.field_type\) && !snapshot\.codelist_id\)[\s\S]*throw new Error\('单选\/多选字段必须选择选项字典'\)/,
  )
  assert.match(formDesignerSource, /if \(sessionId == null \|\| sessionId === fieldPropSaveSession\) isSavingFieldProp\.value = false/)
  assert.doesNotMatch(formDesignerSource, /editProp\.default_value = normalizedDefaultValue/)
})


test('api helpers preserve HTTP status on thrown errors', () => {
  const apiSource = readFileSync(path.resolve(currentDir, '../src/composables/useApi.js'), 'utf8')
  assert.match(apiSource, /function _createHttpError\(message, status\) \{[\s\S]*error\.status = status/)
  assert.match(apiSource, /throw _createHttpError\('登录已过期，请重新登录', r\.status\)/)
  assert.match(apiSource, /if \(r\.status === 429\) \{[\s\S]*throw _createHttpError\(detail \|\| '操作过于频繁，请稍后重试', r\.status\)/)
  assert.match(apiSource, /if \(!r\.ok\) throw _createHttpError\(await _parseError\(r\), r\.status\)/)
})


test('property editor dirty leave guard uses save, discard, and close states', () => {
  assert.match(formDesignerSource, /async function resolveFieldPropLeave\(\{ resetOptions = \{\}, actionText = '关闭' \} = \{\}\) \{[\s\S]*if \(!isFieldPropDirty\.value\) return true/)
  assert.match(formDesignerSource, /confirmButtonText: '保存'/)
  assert.match(formDesignerSource, /cancelButtonText: '取消'/)
  assert.match(formDesignerSource, /distinguishCancelAndClose: true/)
  assert.match(formDesignerSource, /return await saveSelectedFieldProp\(\)/)
  assert.match(formDesignerSource, /if \(e === 'cancel'\) \{[\s\S]*resetFieldPropAutoSaveState\(resetOptions\);[\s\S]*return true/)
  assert.doesNotMatch(formDesignerSource, /if \(e === 'cancel'\) \{[\s\S]*cancelSelectedFieldProp\(\)/)
  assert.match(formDesignerSource, /return false/)
  assert.match(formDesignerSource, /async function handleDesignerBeforeClose\(done\) \{[\s\S]*resolveFieldPropLeave\(\{ actionText: '关闭设计窗口' \}\)/)
  assert.match(formDesignerSource, /watch\([\s\S]*\(\) => props\.projectId,[\s\S]*const canLeave = await resolveFieldPropLeave\(\{ resetOptions: \{ preserveEditor: true \}, actionText: '切换项目' \}\)[\s\S]*fieldPropProjectId\.value = previousProjectId/)
  assert.doesNotMatch(formDesignerSource, /if \(!resetSucceeded\) showDesigner\.value = true/)
})


test('missing codelist validation blocks explicit property save', () => {
  assert.match(formDesignerSource, /if \(!ff\.is_log_row && isChoiceField\(snapshot\.field_type\) && !snapshot\.codelist_id\) \{[\s\S]*ElMessage\.warning\('单选\/多选字段必须选择选项字典'\)[\s\S]*return false/)
})


test('app blocks project switch until form designer can leave', () => {
  assert.match(
    formDesignerSource,
    /async function resolveDesignerLeave\(\{ actionText \}\) \{[\s\S]*if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| savingDraft\.value\) return false;[\s\S]*formSelectionAttempt \+= 1;[\s\S]*if \(hasDraft\.value\) \{[\s\S]*confirmDiscardDraft\(\)[\s\S]*return resolveFieldPropLeave\(\{ resetOptions: \{ preserveEditor: true \}, actionText \}\)/,
  )
  assert.match(
    formDesignerSource,
    /async function canLeaveProject\(\) \{[\s\S]*return resolveDesignerLeave\(\{ actionText: '切换项目' \}\)/,
  )
  assert.match(
    formDesignerSource,
    /async function canLeaveTab\(\) \{[\s\S]*const ok = await resolveDesignerLeave\(\{ actionText: '切换标签页' \}\);[\s\S]*if \([\s\S]*ok &&[\s\S]*selectedFieldId\.value &&[\s\S]*selectedFieldId\.value !== DRAFT_FIELD_ID &&[\s\S]*!fieldPropBaseline\.value[\s\S]*\) \{[\s\S]*const ff = getSelectedFormField\(\);[\s\S]*if \(ff\) selectField\(ff\);[\s\S]*else resetFieldPropAutoSaveState\(\);[\s\S]*\}[\s\S]*return ok/,
  )
  assert.match(formDesignerSource, /defineExpose\(\{[\s\S]*canLeaveProject,[\s\S]*canLeaveTab,[\s\S]*getForms: \(\) => forms\.value,/)
  assert.match(appSource, /const formDesignerTabRef = ref\(null\)/)
  assert.match(appSource, /async function selectProject\(p\) \{[\s\S]*if \(isTabActivated\('designer'\) && formDesignerTabRef\.value\?\.canLeaveProject\) \{[\s\S]*const canLeave = await formDesignerTabRef\.value\.canLeaveProject\(\)[\s\S]*if \(!canLeave\) return/)
  assert.match(appSource, /<FormDesignerTab ref="formDesignerTabRef" :project-id="selectedProject\.id" \/>/)
})

test('app blocks main tab leave from designer until form designer can leave', () => {
  assert.match(appSource, /:before-leave="onMainTabBeforeLeave"/)
  assert.match(
    appSource,
    /async function onMainTabBeforeLeave\(activeName, oldActiveName\) \{[\s\S]*if \([\s\S]*oldActiveName === 'designer' &&[\s\S]*isTabActivated\('designer'\) &&[\s\S]*formDesignerTabRef\.value\?\.canLeaveTab[\s\S]*\) \{[\s\S]*return await formDesignerTabRef\.value\.canLeaveTab\(\)[\s\S]*\}[\s\S]*return true/,
  )
})

test('form switch uses attempt supersession and only commits selection session after leave guards', () => {
  assert.match(formDesignerSource, /let formSelectionAttempt = 0/)
  assert.match(formDesignerSource, /async function selectForm\(nextForm\) \{[\s\S]*const selectionAttempt = \+\+formSelectionAttempt/)
  assert.match(formDesignerSource, /if \(!isFormSelectionAttemptCurrent\(selectionAttempt, selectionSession, projectId\)\) return/)
  assert.match(
    formDesignerSource,
    /const canLeaveFieldProp = await resolveFieldPropLeave\(\{[\s\S]*resetOptions: \{ preserveEditor: true \},[\s\S]*actionText: '切换表单',?[\s\S]*\}\)/,
  )
  assert.match(
    formDesignerSource,
    /async function selectForm\(nextForm\) \{[\s\S]*resetFieldPropAutoSaveState\(\)[\s\S]*invalidateFormSelectionSession\(\)[\s\S]*formFields\.value = \[\][\s\S]*selectedIds\.value = \[\][\s\S]*selectedForm\.value = nextForm \|\| null/,
  )
})


test('field switch goes through property dirty leave guard before selecting another field', () => {
  assert.match(
    formDesignerSource,
    /async function onSelectFieldClick\(ff\) \{[\s\S]*const canLeaveFieldProp = await resolveFieldPropLeave\(\{ actionText: '切换字段' \}\)[\s\S]*if \(!canLeaveFieldProp\) return;[\s\S]*if \(hasDraft\.value\) \{[\s\S]*confirmDiscardDraft\(\)[\s\S]*selectField\(fresh\)/,
  )
})


test('dirty property edits are guarded before reselecting or refreshing editor state', () => {
  assert.match(formDesignerSource, /async function newField\(\) \{[\s\S]*const canLeaveFieldProp = await resolveFieldPropLeave\(\{ actionText: '新建字段' \}\)[\s\S]*if \(!canLeaveFieldProp\) return;[\s\S]*selectField\(draft\)/)
  assert.match(formDesignerSource, /async function addField\(fd\) \{[\s\S]*const canLeaveFieldProp = await resolveFieldPropLeave\(\{ actionText: '添加字段' \}\)[\s\S]*if \(!canLeaveFieldProp\) return;[\s\S]*api\.post\(`\/api\/forms\/\$\{formId\}\/fields`/)
  assert.match(formDesignerSource, /async function copyFormField\(ff\) \{[\s\S]*const canLeaveFieldProp = await resolveFieldPropLeave\(\{ actionText: '复制字段' \}\)[\s\S]*if \(!canLeaveFieldProp\) return;[\s\S]*if \(created\) selectField\(created\)/)
  assert.match(formDesignerSource, /if \(refreshed && selectedFieldId\.value === refreshed\.id && !isFieldPropDirty\.value\) selectField\(refreshed\)/)
  assert.match(formDesignerSource, /if \(selectedFieldId\.value === ff\.id && !isFieldPropDirty\.value\) \{[\s\S]*if \(refreshed\) selectField\(refreshed\)/)
  assert.match(formDesignerSource, /if \(key === 'Enter'\) \{[\s\S]*await onSelectFieldClick\(field\);[\s\S]*return;[\s\S]*\}/)
  assert.match(formDesignerSource, /const updated = formFields\.value\.find\(\(f\) => f\.id === selectedFieldId\.value\);[\s\S]*if \(updated && !isFieldPropDirty\.value\) selectField\(updated\)/)
})


test('project watcher fallback saves against the previous property project context', () => {
  assert.match(formDesignerSource, /const fieldPropProjectId = ref\(props\.projectId\)/)
  assert.match(formDesignerSource, /projectId: fieldPropProjectId\.value/)
  assert.match(formDesignerSource, /if \(!ff \|\| !formId \|\| projectId !== fieldPropProjectId\.value\) throw new Error\('字段属性保存上下文已变更'\)/)
  assert.match(formDesignerSource, /watch\([\s\S]*\(\) => props\.projectId,[\s\S]*const canLeave = await resolveFieldPropLeave\(\{ resetOptions: \{ preserveEditor: true \}, actionText: '切换项目' \}\)[\s\S]*fieldPropProjectId\.value = newProjectId/)
})


test('deleting the selected field clears the property editor state', () => {
  assert.match(formDesignerSource, /const shouldResetSelectedField = selectedFieldId\.value === ff\.id;[\s\S]*if \(shouldResetSelectedField\) resetFieldPropAutoSaveState\(\);/)
  assert.match(formDesignerSource, /const shouldResetSelectedField = selectedFieldId\.value != null && ids\.includes\(selectedFieldId\.value\);[\s\S]*if \(shouldResetSelectedField\) resetFieldPropAutoSaveState\(\);/)
})


test('form switch only lets latest field load commit', () => {
  assert.match(formDesignerSource, /let formFieldsLoadSession = 0/)
  assert.match(formDesignerSource, /async function loadFormFields\(formId = selectedForm\.value\?\.id \?\? null\) \{[\s\S]*const sessionId = \+\+formFieldsLoadSession/)
  assert.match(formDesignerSource, /if \(!formId\) \{[\s\S]*formFields\.value = \[\][\s\S]*selectedIds\.value = \[\][\s\S]*return/)
  assert.match(formDesignerSource, /const loadedFields = await api\.cachedGet\(`\/api\/forms\/\$\{formId\}\/fields`\)/)
  assert.match(formDesignerSource, /if \(sessionId !== formFieldsLoadSession \|\| selectedForm\.value\?\.id !== formId\) return/)
  assert.match(formDesignerSource, /watch\(selectedForm,[\s\S]*form[\s\S]*=> \{[\s\S]*void loadFormFields\(form\?\.id \?\? null\)[\s\S]*\}\)/)
})


test('form switch flushes field autosave and clears stale field state before selecting next form', () => {
  assert.match(formDesignerSource, /function invalidateFormSelectionSession\(\) \{[\s\S]*formSelectionSession \+= 1[\s\S]*formSelectionAttempt \+= 1/)
  assert.match(formDesignerSource, /let formSelectionSession = 0/)
  assert.match(formDesignerSource, /let formSelectionAttempt = 0/)
  assert.match(formDesignerSource, /async function selectForm\(nextForm\) \{[\s\S]*const selectionAttempt = \+\+formSelectionAttempt/)
  assert.match(formDesignerSource, /const flushSucceeded = await flushDesignNotesSave\(buildDesignNotesSaveSnapshot\(\{ form: currentForm \}\)\)/)
  assert.match(formDesignerSource, /if \(!isFormSelectionAttemptCurrent\(selectionAttempt, selectionSession, projectId\)\) return/)
  assert.match(
    formDesignerSource,
    /const canLeaveFieldProp = await resolveFieldPropLeave\(\{[\s\S]*resetOptions: \{ preserveEditor: true \},[\s\S]*actionText: '切换表单',?[\s\S]*\}\)/,
  )
  assert.match(formDesignerSource, /if \(!canLeaveFieldProp\) \{[\s\S]*formsTableRef\.value\?\.setCurrentRow\(currentForm\)[\s\S]*return/)
  assert.match(
    formDesignerSource,
    /async function selectForm\(nextForm\) \{[\s\S]*resetFieldPropAutoSaveState\(\)[\s\S]*invalidateFormSelectionSession\(\)[\s\S]*formFields\.value = \[\][\s\S]*selectedIds\.value = \[\][\s\S]*selectedForm\.value = nextForm \|\| null/,
  )
})


test('project switch invalidates pending form selection sessions', () => {
  assert.match(formDesignerSource, /watch\([\s\S]*\(\) => props\.projectId,[\s\S]*async \(newProjectId, previousProjectId\) => \{[\s\S]*invalidateFormSelectionSession\(\)/)
})
