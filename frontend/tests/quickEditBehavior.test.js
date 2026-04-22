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
  assert.match(formDesignerSource, /quickEditProp.*label.*bg_color.*text_color.*inline_mark/)
  const quickEditDialog = /<el-dialog v-model="showQuickEdit"[\s\S]*?<\/el-dialog>/.exec(formDesignerSource)?.[0] ?? ''
  assert.match(quickEditDialog, /label="文字颜色"[\s\S]*class="color-option color-option-default"[\s\S]*quickEditProp\.text_color = null/)
  // 快捷编辑表单不应包含 field_definition 级别的编辑控件
  const hasVariableNameEdit = /v-model="quickEditProp\.variable_name"/.test(quickEditDialog)
  const hasFieldTypeEditInQuickEdit = /<el-select[^>]*v-model="quickEditProp\.field_type"/s.test(quickEditDialog)

  assert.equal(hasVariableNameEdit, false, 'Quick edit should not allow editing variable_name')
  assert.equal(hasFieldTypeEditInQuickEdit, false, 'Quick edit should not include field_type selector')
})

test('preview uses derived visible and preview field models', () => {
  assert.match(formDesignerSource, /const designerVisibleFields = computed\(\(\) => \{/)
  assert.match(formDesignerSource, /_displayOrder: index \+ 1/)
  assert.match(formDesignerSource, /const designerPreviewFields = computed\(\(\) => \{/)
  assert.match(formDesignerSource, /pendingFieldPropSnapshotMap\.value\.get\(field\.id\)/)
  assert.match(formDesignerSource, /liveEditSnapshot\.value\?\.fieldId === field\.id/)
  assert.match(formDesignerSource, /const designerRenderGroups = computed\(\(\) => buildFormDesignerRenderGroups\(designerPreviewFields\.value\)\)/)
  assert.match(formDesignerSource, /ElMessage\.error\(`设计备注保存失败：\$\{e\.message\}`\)/)
  assert.match(formDesignerSource, /async function selectForm\(nextForm\)/)
  assert.match(formDesignerSource, /formsTableRef\.value\?\.setCurrentRow\(currentForm\)/)
  assert.match(formDesignerSource, /@current-change="selectForm"/)
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
  assert.match(formDesignerSource, /<el-form-item label="变量标签"><el-input v-model="editProp\.label" :type="editProp\.field_type === '标签' \? 'textarea' : 'text'"/)
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
  assert.match(formDesignerSource, /v-model="showQuickAddUnit" title="新增单位"/)
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
  assert.match(formDesignerSource, /v-else-if="editProp\.field_type === '日志行'"[\s\S]*label="底纹颜色"[\s\S]*class="color-option color-option-default"[\s\S]*editProp\.bg_color = null; customBgColorInput = ''/)
  assert.match(formDesignerSource, /v-else class="designer-editor-scroll"[\s\S]*label="底纹颜色"[\s\S]*class="color-option color-option-default"[\s\S]*editProp\.bg_color = null; customBgColorInput = ''/)
  assert.match(formDesignerSource, /label="底纹颜色"[\s\S]*v-for="opt in BG_COLOR_OPTIONS\.slice\(1\)"/)
  assert.match(formDesignerSource, /<el-form-item label="底纹颜色">[\s\S]*class="color-option color-option-default"[\s\S]*quickEditProp\.bg_color = null/)
  assert.match(formDesignerSource, /label="文字颜色"[\s\S]*class="color-option color-option-default"[\s\S]*editProp\.text_color = null; customTextColorInput = ''/)
  assert.match(formDesignerSource, /<el-form-item label="文字颜色">[\s\S]*class="color-option color-option-default"[\s\S]*quickEditProp\.text_color = null/)
  assert.match(formDesignerSource, /v-for="opt in TEXT_COLOR_OPTIONS"/)
  assert.doesNotMatch(formDesignerSource, /<el-form-item label="底纹">/)
})


test('selectField keeps regular fields and log rows editable', () => {
  assert.match(formDesignerSource, /field_type: '日志行', integer_digits: null, decimal_digits: null, date_format: null, codelist_id: null, unit_id: null, default_value: '', inline_mark: 0, bg_color: ff\.bg_color \|\| null, text_color: ff\.text_color \|\| null/)
  assert.match(formDesignerSource, /field_type: fd\.field_type \|\| '文本', integer_digits: fd\.integer_digits, decimal_digits: fd\.decimal_digits, date_format: fd\.date_format, codelist_id: fd\.codelist_id, unit_id: fd\.unit_id \?\? null, default_value: ff\.default_value \|\| '', inline_mark: ff\.inline_mark \|\| 0, bg_color: ff\.bg_color \|\| null, text_color: ff\.text_color \|\| null/)
  assert.match(formDesignerSource, /api\.put\(`\/api\/projects\/\$\{projectId\}\/field-definitions\/\$\{ff\.field_definition_id\}`, \{ label: snapshot\.label, variable_name: snapshot\.variable_name, field_type: snapshot\.field_type, integer_digits: snapshot\.integer_digits, decimal_digits: snapshot\.decimal_digits, date_format: snapshot\.date_format, codelist_id: snapshot\.codelist_id, unit_id: snapshot\.unit_id \?\? null \}\)/)
  assert.match(formDesignerSource, /api\.patch\(`\/api\/form-fields\/\$\{ff\.id\}\/colors`, \{ bg_color: snapshot\.bg_color, text_color: snapshot\.text_color \}\)/)
  assert.match(formDesignerSource, /api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\)/)
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


test('quick add codelist dialog template aligns with edit dialog', () => {
  assert.match(formDesignerSource, /<el-dialog v-model="showQuickAddCodelist" title="新增选项" width="560px" :close-on-click-modal="false" :close-on-press-escape="false"/)
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
  assert.match(formDesignerSource, /quickCodelistOpts\.value\.push\(\{ id: null, code: quickOptCode\.value\.trim\(\) \|\| `C\.\$\{n \+ 1\}`, decode: quickOptDecode\.value\.trim\(\), trailing_underscore: 0 \}\)/)
  assert.match(formDesignerSource, /quickAddCodelistSaving\.value = false/)
  assert.match(formDesignerSource, /quickCodelistDescription\.value = ''/)
  assert.match(formDesignerSource, /if \(quickAddCodelistSaving\.value\) return/)
  assert.match(formDesignerSource, /const invalidOptionIndex = normalizedOptions\.findIndex\(opt => !opt\.code \|\| !opt\.decode\)/)
  assert.match(formDesignerSource, /await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists`, \{/)
  assert.match(formDesignerSource, /description: quickCodelistDescription\.value/)
  assert.match(formDesignerSource, /options: normalizedOptions\.map\(\(opt, index\) => \(\{/)
  assert.doesNotMatch(formDesignerSource, /for \(const opt of normalizedOptions\) await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{created\.id\}\/options/)
  assert.match(formDesignerSource, /editProp\.codelist_id = created\.id/)
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


test('property editor auto saves without manual save buttons', () => {
  assert.match(formDesignerSource, /let pendingFieldPropSnapshots = \[\]/)
  assert.match(formDesignerSource, /let fieldPropAutoSaveErrorShown = false/)
  assert.match(formDesignerSource, /let fieldPropSaveSession = 0/)
  assert.match(formDesignerSource, /const fieldPropProjectId = ref\(props\.projectId\)/)
  assert.match(formDesignerSource, /function upsertPendingFieldPropSnapshot\(snapshot\) \{[\s\S]*pendingFieldPropSnapshots = \[/)
  assert.match(formDesignerSource, /function hasPendingFieldPropSnapshot\(fieldId, snapshotKey = ''\) \{[\s\S]*pendingFieldPropSnapshots\.some/)
  assert.match(formDesignerSource, /function resetFieldPropAutoSaveState\(\{ preserveEditor = false \} = \{\}\) \{[\s\S]*fieldPropSaveSession \+= 1[\s\S]*pendingFieldPropSnapshots = \[\]/)
  assert.match(formDesignerSource, /if \(!preserveEditor\) \{[\s\S]*selectedFieldId\.value = null[\s\S]*lastHydratedFieldPropDraftKey = ''/)
  assert.match(formDesignerSource, /const currentFieldPropDraftKey = computed\(\(\) => getFieldPropSnapshotKey\(\)\)/)
  assert.match(formDesignerSource, /watch\(currentFieldPropDraftKey, \(draftKey\) => \{[\s\S]*fieldPropAutoSaveErrorShown = false[\s\S]*upsertPendingFieldPropSnapshot\(snapshot\)/)
  assert.match(formDesignerSource, /fieldPropSaveTimer = setTimeout\(\(\) => \{[\s\S]*void flushPendingFieldPropSave\(fieldPropSaveSession\)[\s\S]*\}, 400\)/)
  assert.doesNotMatch(formDesignerSource, /@click="saveFieldProp">保存<\/el-button>/)
})


test('property editor hydration flushes pending autosave before switching fields', () => {
  assert.match(formDesignerSource, /let isHydratingFieldProp = false/)
  assert.match(formDesignerSource, /let lastHydratedFieldPropDraftKey = ''/)
  assert.match(formDesignerSource, /if \(selectedFieldId\.value && selectedFieldId\.value !== ff\.id\) void flushPendingFieldPropSave\(\)/)
  assert.match(formDesignerSource, /projectId: fieldPropProjectId\.value/)
  assert.match(formDesignerSource, /lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey\(buildFieldPropSnapshot\(ff\.id\)\)/)
  assert.match(formDesignerSource, /const hasNewerDraft = isCurrentSelectedField && getFieldPropSnapshotKey\(\) !== snapshotKey/)
  assert.match(formDesignerSource, /const shouldRefillEditor = selectedFieldId\.value === snapshot\.fieldId && !hasPendingFieldPropSnapshot\(snapshot\.fieldId\)/)
})


test('property editor retries only retryable autosave errors', () => {
  assert.match(formDesignerSource, /async function flushPendingFieldPropSave\(sessionId = fieldPropSaveSession\) \{/)
  assert.match(formDesignerSource, /if \(sessionId !== fieldPropSaveSession\) return false/)
  assert.match(formDesignerSource, /if \(!pendingFieldPropSnapshots\.length \|\| isSavingFieldProp\) return true/)
  assert.match(formDesignerSource, /await saveFieldProp\(snapshot, sessionId\)[\s\S]*fieldPropAutoSaveErrorShown = false[\s\S]*saveSucceeded = true/)
  assert.match(formDesignerSource, /const isExpiredContext = e\?\.message === '自动保存上下文已变更'/)
  assert.match(formDesignerSource, /const isRetryableError = !isExpiredContext && shouldRetryFieldPropSave\(e\)/)
  assert.match(formDesignerSource, /if \(!hasPendingFieldPropSnapshot\(snapshot\.fieldId, snapshotKey\)\) upsertPendingFieldPropSnapshot\(snapshot\)/)
  assert.match(formDesignerSource, /if \(!fieldPropAutoSaveErrorShown && !isExpiredContext\) \{[\s\S]*ElMessage\.error\(e\.message\)[\s\S]*fieldPropAutoSaveErrorShown = true/)
  assert.match(formDesignerSource, /if \(isRetryableError\) \{[\s\S]*fieldPropSaveTimer = setTimeout\(\(\) => \{[\s\S]*void flushPendingFieldPropSave\(sessionId\)[\s\S]*\}, 1000\)/)
  assert.match(formDesignerSource, /function shouldRetryFieldPropSave\(error\) \{[\s\S]*return status >= 500 \|\| status === 429 \|\| status === 408/)
  assert.match(formDesignerSource, /const hasQueuedDraft = hasPendingFieldPropSnapshot\(snapshot\.fieldId, snapshotKey\)/)
  assert.match(formDesignerSource, /if \(hasNewerDraft && !hasQueuedDraft\) upsertPendingFieldPropSnapshot\(buildFieldPropSnapshot\(snapshot\.fieldId\)\)/)
  assert.match(formDesignerSource, /if \(saveSucceeded && shouldRefillEditor\) \{[\s\S]*if \(updated\) selectField\(updated\)/)
  assert.match(formDesignerSource, /return !flushFailed/)
  assert.match(formDesignerSource, /if \(sessionId !== fieldPropSaveSession\) throw new Error\('自动保存上下文已变更'\)/)
  assert.match(formDesignerSource, /if \(!ff\.is_log_row && isChoiceField\(snapshot\.field_type\) && !snapshot\.codelist_id\) throw new Error\('单选\/多选字段必须选择选项字典'\)/)
  assert.doesNotMatch(formDesignerSource, /editProp\.default_value = normalizedDefaultValue/)
})


test('api helpers preserve HTTP status on thrown errors', () => {
  const apiSource = readFileSync(path.resolve(currentDir, '../src/composables/useApi.js'), 'utf8')
  assert.match(apiSource, /function _createHttpError\(message, status\) \{[\s\S]*error\.status = status/)
  assert.match(apiSource, /throw _createHttpError\('登录已过期，请重新登录', r\.status\)/)
  assert.match(apiSource, /if \(r\.status === 429\) \{[\s\S]*throw _createHttpError\(detail \|\| '操作过于频繁，请稍后重试', r\.status\)/)
  assert.match(apiSource, /if \(!r\.ok\) throw _createHttpError\(await _parseError\(r\), r\.status\)/)
})


test('property editor blocks reset when flush fails on dialog close and project switch', () => {
  assert.match(formDesignerSource, /async function flushFieldPropSaveBeforeReset\(resetOptions = \{\}\) \{[\s\S]*const flushResult = await flushPendingFieldPropSave\(sessionId\)/)
  assert.match(formDesignerSource, /if \(flushResult === false\) return false/)
  assert.match(formDesignerSource, /if \(isSavingFieldProp\) \{[\s\S]*setTimeout\(check, 20\)/)
  assert.match(formDesignerSource, /if \(pendingFieldPropSnapshots\.length\) return false/)
  assert.match(formDesignerSource, /watch\(\(\) => showDesigner\.value, async \(visible, previousVisible\) => \{[\s\S]*const resetSucceeded = await flushFieldPropSaveBeforeReset\(\)[\s\S]*if \(!resetSucceeded\) showDesigner\.value = true/)
  assert.match(formDesignerSource, /watch\(\(\) => props\.projectId, async \(newProjectId, previousProjectId\) => \{[\s\S]*const resetSucceeded = await flushFieldPropSaveBeforeReset\(\{ preserveEditor: true \}\)[\s\S]*if \(!resetSucceeded\) \{[\s\S]*fieldPropProjectId\.value = previousProjectId/)
  assert.match(formDesignerSource, /if \(!preserveEditor\) \{[\s\S]*selectedFieldId\.value = null/)
})


test('app blocks project switch until form designer can leave', () => {
  assert.match(formDesignerSource, /async function canLeaveProject\(\) \{[\s\S]*return flushFieldPropSaveBeforeReset\(\{ preserveEditor: true \}\)/)
  assert.match(formDesignerSource, /defineExpose\(\{ canLeaveProject \}\)/)
  assert.match(appSource, /const formDesignerTabRef = ref\(null\)/)
  assert.match(appSource, /async function selectProject\(p\) \{[\s\S]*if \(activeTab\.value === 'designer' && formDesignerTabRef\.value\?\.canLeaveProject\) \{[\s\S]*const canLeave = await formDesignerTabRef\.value\.canLeaveProject\(\)[\s\S]*if \(!canLeave\) return/)
  assert.match(appSource, /<FormDesignerTab ref="formDesignerTabRef" :project-id="selectedProject\.id" \/>/)
})


test('form switch only lets latest field load commit', () => {
  assert.match(formDesignerSource, /let formFieldsLoadSession = 0/)
  assert.match(formDesignerSource, /async function loadFormFields\(formId = selectedForm\.value\?\.id \?\? null\) \{[\s\S]*const sessionId = \+\+formFieldsLoadSession/)
  assert.match(formDesignerSource, /if \(!formId\) \{[\s\S]*formFields\.value = \[\][\s\S]*selectedIds\.value = \[\][\s\S]*return/)
  assert.match(formDesignerSource, /const loadedFields = await api\.cachedGet\(`\/api\/forms\/\$\{formId\}\/fields`\)/)
  assert.match(formDesignerSource, /if \(sessionId !== formFieldsLoadSession \|\| selectedForm\.value\?\.id !== formId\) return/)
  assert.match(formDesignerSource, /watch\(selectedForm, form => \{[\s\S]*void loadFormFields\(form\?\.id \?\? null\)[\s\S]*\}\)/)
})


test('form switch flushes field autosave and clears stale field state before selecting next form', () => {
  assert.match(formDesignerSource, /function invalidateFormSelectionSession\(\) \{[\s\S]*formSelectionSession \+= 1[\s\S]*\}/)
  assert.match(formDesignerSource, /let formSelectionSession = 0/)
  assert.match(formDesignerSource, /async function selectForm\(nextForm\) \{[\s\S]*const sessionId = \+\+formSelectionSession/)
  assert.match(formDesignerSource, /const flushSucceeded = await flushDesignNotesSave\(buildDesignNotesSaveSnapshot\(\{ form: currentForm \}\)\)/)
  assert.match(formDesignerSource, /if \(sessionId !== formSelectionSession\) return/)
  assert.match(formDesignerSource, /const flushFieldPropSucceeded = await flushFieldPropSaveBeforeReset\(\{ preserveEditor: true \}\)/)
  assert.match(formDesignerSource, /if \(!flushFieldPropSucceeded\) \{[\s\S]*formsTableRef\.value\?\.setCurrentRow\(currentForm\)[\s\S]*return/)
  assert.match(formDesignerSource, /async function selectForm\(nextForm\) \{[\s\S]*resetFieldPropAutoSaveState\(\)[\s\S]*formFields\.value = \[\][\s\S]*selectedIds\.value = \[\][\s\S]*selectedForm\.value = nextForm \|\| null/)
})


test('project switch invalidates pending form selection sessions', () => {
  assert.match(formDesignerSource, /watch\(\(\) => props\.projectId, async \(newProjectId, previousProjectId\) => \{[\s\S]*invalidateFormSelectionSession\(\)/)
})