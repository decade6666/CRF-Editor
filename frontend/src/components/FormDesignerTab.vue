<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUpdate, nextTick, inject, defineExpose } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { EditPen, InfoFilled, Plus } from '@element-plus/icons-vue'
import { api, genCode, genFieldVarName, truncRefs } from '../composables/useApi'
import { useSortableTable } from '../composables/useSortableTable'
import { useColumnResize } from '../composables/useColumnResize'
import { renderCtrl as renderCtrlBase, renderCtrlHtml, toHtml, isChoiceField, isDefaultValueSupported, normalizeDefaultValue, planInlineColumnFractions, planNormalColumnFractions, planUnifiedColumnFractions } from '../composables/useCRFRenderer'
import { normalizeHexColorInput, syncFieldTypeSpecificProps } from '../composables/formDesignerPropertyEditor'
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldTextColorStyle,
} from '../composables/formFieldPresentation'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))

// 核心数据
const forms = ref([])
const searchForm = ref('')
const filteredForms = computed(() => {
  const kw = searchForm.value.trim().toLowerCase()
  const orderedForms = [...forms.value].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return (a?.id ?? 0) - (b?.id ?? 0)
  })
  if (!kw) return orderedForms
  return orderedForms.filter(item =>
    Object.values(item).some(v => String(v ?? '').toLowerCase().includes(kw))
  )
})
const selectedForm = ref(null)
const fieldDefs = ref([])
const formFields = ref([])
const codelists = ref([])
const units = ref([])
const selectedIds = ref([])
const showAddForm = ref(false)
const showEditForm = ref(false)
const showDesigner = ref(false)
const newFormName = ref('')
const newFormCode = ref('')
const editFormName = ref('')
const editFormCode = ref('')
const editFormTarget = ref(null)
const dragSrcId = ref(null)
const dragOverIdx = ref(null)
const deletingFieldIds = ref(new Set())
let formFieldsLoadSession = 0
let formSelectionSession = 0

function invalidateFormSelectionSession() {
  formSelectionSession += 1
}

// 数据加载
async function loadForms() { forms.value = await api.cachedGet(`/api/projects/${props.projectId}/forms`) }
async function reloadForms() {
  const selectedFormId = selectedForm.value?.id ?? null
  api.invalidateCache(`/api/projects/${props.projectId}/forms`)
  await loadForms()
  if (selectedFormId == null) return
  invalidateFormSelectionSession()
  selectedForm.value = forms.value.find(f => f.id === selectedFormId) || null
  if (!selectedForm.value) formFields.value = []
}
async function loadFieldDefs() { fieldDefs.value = await api.cachedGet(`/api/projects/${props.projectId}/field-definitions`) }
async function loadCodelists() { codelists.value = await api.cachedGet(`/api/projects/${props.projectId}/codelists`) }
async function loadUnits() { units.value = await api.cachedGet(`/api/projects/${props.projectId}/units`) }

function sortFormFieldsByOrder(fields) {
  return [...fields].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return (a?.id ?? 0) - (b?.id ?? 0)
  })
}

async function loadFormFields(formId = selectedForm.value?.id ?? null) {
  const sessionId = ++formFieldsLoadSession
  if (!formId) {
    formFields.value = []
    selectedIds.value = []
    return
  }
  const loadedFields = await api.cachedGet(`/api/forms/${formId}/fields`)
  if (sessionId !== formFieldsLoadSession || selectedForm.value?.id !== formId) return
  formFields.value = sortFormFieldsByOrder(loadedFields)
}
watch(selectedForm, form => {
  void loadFormFields(form?.id ?? null)
})

// 刷新信号
watch(refreshKey, () => {
  loadForms(); loadFieldDefs(); loadCodelists(); loadUnits()
  if (selectedForm.value) loadFormFields()
})

// 表单CRUD
async function addForm() {
  try {
    const created = await api.post(`/api/projects/${props.projectId}/forms`, { name: newFormName.value, code: newFormCode.value })
    showAddForm.value = false; newFormName.value = ''; newFormCode.value = ''
    await loadForms()
    invalidateFormSelectionSession()
    selectedForm.value = forms.value.find(f => f.id === created.id) || created
  } catch (e) { ElMessage.error(e.message) }
}

async function delForm(f) {
  try {
    const refs = await api.get(`/api/forms/${f.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => r.visit_name), 5, '、')
      await ElMessageBox.confirm(`删除表单 "${f.name}" 将同时从以下访视中移除：\n${msg}\n确认删除？`, '确认', { type: 'warning' })
    } else {
      await ElMessageBox.confirm(`删除表单 "${f.name}"？`, '确认', { type: 'warning' })
    }
    await api.del(`/api/forms/${f.id}`)
    if (selectedForm.value?.id === f.id) {
      invalidateFormSelectionSession()
      selectedForm.value = null
      formFields.value = []
    }
    reloadForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selForms = ref([])
async function batchDelForms() {
  try {
    const ids = selForms.value.map(f => f.id)
    const refsMap = await api.post(`/api/projects/${props.projectId}/forms/batch-references`, { ids })
    const allRefs = []
    for (const f of selForms.value) {
      const refs = refsMap[f.id] || []
      if (refs.length) allRefs.push(`【${f.name}】：` + truncRefs(refs.map(r => r.visit_name), 3, '、'))
    }
    const msg = allRefs.length
      ? `以下表单将同时从相关访视中移除：\n${allRefs.join('\n')}\n确认删除？`
      : `确认删除选中的 ${selForms.value.length} 个表单？`
    await ElMessageBox.confirm(msg, '批量删除', { type: 'warning' })
    await api.post(`/api/projects/${props.projectId}/forms/batch-delete`, { ids })
    invalidateFormSelectionSession()
    selForms.value = []; selectedForm.value = null; formFields.value = []; reloadForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function copyForm(f) {
  try { await api.post(`/api/forms/${f.id}/copy`, {}); reloadForms(); ElMessage.success('复制成功') }
  catch (e) { ElMessage.error(e.message) }
}

function openEditForm(f) {
  editFormName.value = f.name; editFormCode.value = f.code || ''
  editFormTarget.value = f; showEditForm.value = true
}

async function updateForm() {
  try {
    const refs = await api.get(`/api/forms/${editFormTarget.value.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => r.visit_name), 5, '、')
      await ElMessageBox.confirm(`修改将影响以下访视：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }
    await api.put(`/api/forms/${editFormTarget.value.id}`, { name: editFormName.value, code: editFormCode.value })
    showEditForm.value = false; reloadForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

// 表单字段操作
async function confirmFormChange() {
  if (!selectedForm.value) return
  const refs = await api.get(`/api/forms/${selectedForm.value.id}/references`)
  if (refs.length) {
    const msg = truncRefs(refs.map(r => r.visit_name), 5, '、')
    await ElMessageBox.confirm(`当前表单被以下访视引用，修改将影响这些访视：\n${msg}\n确认继续？`, '影响提醒', { type: 'warning' })
  }
}

async function addField(fd) {
  if (!selectedForm.value) return ElMessage.warning('请先选择表单')
  try { await api.post(`/api/forms/${selectedForm.value.id}/fields`, { field_definition_id: fd.id }); loadFormFields() }
  catch (e) { ElMessage.error(e.message) }
}

async function removeField(ff) {
  if (deletingFieldIds.value.has(ff.id)) return
  try {
    await confirmFormChange()
    deletingFieldIds.value = new Set([...deletingFieldIds.value, ff.id])
    await api.del(`/api/form-fields/${ff.id}`)
    formFields.value = formFields.value.filter(f => f.id !== ff.id)
    api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
    loadFormFields()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
  finally {
    const next = new Set(deletingFieldIds.value)
    next.delete(ff.id)
    deletingFieldIds.value = next
  }
}

async function batchDelete() {
  if (!selectedIds.value.length) return
  try { await confirmFormChange(); await api.post(`/api/forms/${selectedForm.value.id}/fields/batch-delete`, { ids: selectedIds.value }); selectedIds.value = []; loadFormFields() }
  catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

// 拖拽排序
function onDragStart(ff) { dragSrcId.value = ff.id }
function onDragOver(e, idx) { e.preventDefault(); dragOverIdx.value = idx }
function onDragLeave() { dragOverIdx.value = null }
function normalizeFormFieldOrder(fields) {
  return fields.map((field, index) => ({ ...field, order_index: index + 1 }))
}

async function onDrop(e, targetIdx) {
  e.preventDefault(); dragOverIdx.value = null
  const srcIdx = formFields.value.findIndex(f => f.id === dragSrcId.value)
  if (srcIdx === -1 || srcIdx === targetIdx) return
  try {
    const arr = [...formFields.value]
    const [item] = arr.splice(srcIdx, 1)
    arr.splice(targetIdx, 0, item)
    const normalized = normalizeFormFieldOrder(arr)
    formFields.value = normalized
    await api.post(`/api/forms/${selectedForm.value.id}/fields/reorder`, { ordered_ids: normalized.map(f => f.id) })
    api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
    await loadFormFields()
  } catch (e) {
    ElMessage.warning('排序保存失败，已恢复')
    loadFormFields()
  }
}

// 键盘排序与焦点
const fieldItemRefs = ref({})
onBeforeUpdate(() => { fieldItemRefs.value = {} })

async function handleFieldKeydown(event, field, index) {
  const { key, ctrlKey } = event
  if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(key)) return
  event.preventDefault()
  if (key === 'Enter') { selectField(field); return }
  if (key === ' ') {
    const id = field.id, idx = selectedIds.value.indexOf(id)
    if (idx > -1) selectedIds.value.splice(idx, 1)
    else selectedIds.value.push(id)
    return
  }
  const move = async (from, to) => {
    if (to < 0 || to >= formFields.value.length) return
    try {
      const arr = [...formFields.value]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      const normalized = normalizeFormFieldOrder(arr)
      formFields.value = normalized
      await api.post(`/api/forms/${selectedForm.value.id}/fields/reorder`, { ordered_ids: normalized.map(f => f.id) })
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
      await loadFormFields()
      nextTick(() => fieldItemRefs.value[formFields.value[to].id]?.focus())
    } catch (e) {
      ElMessage.warning('排序保存失败，已恢复')
      loadFormFields()
    }
  }
  if (ctrlKey) {
    if (key === 'ArrowUp') await move(index, index - 1)
    else if (key === 'ArrowDown') await move(index, index + 1)
  } else {
    let nextIdx = (key === 'ArrowUp') ? index - 1 : index + 1
    if (nextIdx >= 0 && nextIdx < formFields.value.length) fieldItemRefs.value[formFields.value[nextIdx].id]?.focus()
  }
}

const usedDefIds = computed(() => new Set(formFields.value.map(f => f.field_definition_id)))

// 字段库搜索
const fieldSearch = ref('')
const filteredFieldDefs = computed(() => {
  const q = fieldSearch.value.trim().toLowerCase()
  if (!q) return fieldDefs.value
  return fieldDefs.value.filter(fd =>
    fd.label?.toLowerCase().includes(q) || fd.variable_name?.toLowerCase().includes(q)
  )
})

// 渲染逻辑
function renderCtrl(fd) {
  if (!fd) return '________________'
  const field = {
    field_type: fd.field_type, options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol, integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits, date_format: fd.date_format,
  }
  return renderCtrlBase(field)
}

function escapePreviewText(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

function getPreviewField(ff) {
  if (!ff?.field_definition) return null
  return {
    field_type: ff.field_definition.field_type,
    options: ff.field_definition.codelist?.options || [],
    unit_symbol: ff.field_definition.unit?.symbol,
    integer_digits: ff.field_definition.integer_digits,
    decimal_digits: ff.field_definition.decimal_digits,
    date_format: ff.field_definition.date_format,
  }
}

function canToggleInline(ff) {
  const type = ff?.field_definition?.field_type || ''
  return !ff?.is_log_row && type !== '标签' && type !== '日志行'
}

function getScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type
  const inlineMark = Boolean(ff?.inline_mark)
  if (!fieldType || !ff?.default_value) return ''
  if (!isDefaultValueSupported(fieldType, inlineMark)) return ''
  return normalizeDefaultValue(ff.default_value, singleLine)
}

function renderCellHtml(ff) {
  const previewField = getPreviewField(ff)
  if (!previewField) return '<span class="fill-line"></span>'
  const defaultValue = getScopedDefaultValue(ff, false)
  if (defaultValue) return toHtml(defaultValue)
  return renderCtrlHtml(previewField)
}

function getInlineRows(fields) {
  const cols = fields.map(ff => {
    const defaultValue = getScopedDefaultValue(ff)
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return { lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), repeat: false }
    }
    const ctrl = renderCtrl(ff.field_definition).replace(/_{8,}/, '______')
    return { lines: [toHtml(ctrl)], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) => cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? '')))
}


function computeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1)
  const base = Math.floor(N / M), extra = N % M
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0))
}

function computeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)))
  return { labelSpan, valueSpan: N - labelSpan }
}

const renderGroups = computed(() => buildFormDesignerRenderGroups(formFields.value))

const designerVisibleFields = computed(() => {
  return sortFormFieldsByOrder(formFields.value).map((field, index) => ({
    ...field,
    _displayOrder: index + 1,
  }))
})

function resolveCodelist(codelistId) {
  return codelists.value.find(item => item.id === codelistId) || null
}

function resolveUnit(unitId) {
  return units.value.find(item => item.id === unitId) || null
}

function normalizePreviewDefaultValue(fieldType, inlineMark, defaultValue) {
  if (!isDefaultValueSupported(fieldType, Boolean(inlineMark))) return ''
  return normalizeDefaultValue(defaultValue ?? '', !inlineMark)
}

function applyPreviewSnapshot(baseField, snapshot) {
  if (!snapshot) return baseField
  if (baseField.is_log_row) {
    return {
      ...baseField,
      label_override: snapshot.label ?? baseField.label_override,
      bg_color: Object.prototype.hasOwnProperty.call(snapshot, 'bg_color') ? snapshot.bg_color : (baseField.bg_color ?? null),
      text_color: Object.prototype.hasOwnProperty.call(snapshot, 'text_color') ? snapshot.text_color : (baseField.text_color ?? null),
    }
  }

  const fieldDefinition = baseField.field_definition || {}
  const fieldType = snapshot.field_type ?? fieldDefinition.field_type ?? '文本'
  const inlineMark = snapshot.inline_mark ?? baseField.inline_mark ?? 0
  const supportsUnit = fieldType === '文本' || fieldType === '数值'
  const supportsDateFormat = ['日期', '日期时间', '时间'].includes(fieldType)
  const codelistId = isChoiceField(fieldType) ? (snapshot.codelist_id ?? fieldDefinition.codelist_id ?? null) : null
  const unitId = supportsUnit ? (snapshot.unit_id ?? fieldDefinition.unit_id ?? null) : null

  return {
    ...baseField,
    default_value: normalizePreviewDefaultValue(fieldType, inlineMark, snapshot.default_value ?? baseField.default_value),
    inline_mark: inlineMark,
    bg_color: Object.prototype.hasOwnProperty.call(snapshot, 'bg_color') ? snapshot.bg_color : (baseField.bg_color ?? null),
    text_color: Object.prototype.hasOwnProperty.call(snapshot, 'text_color') ? snapshot.text_color : (baseField.text_color ?? null),
    field_definition: {
      ...fieldDefinition,
      label: snapshot.label ?? fieldDefinition.label,
      variable_name: snapshot.variable_name ?? fieldDefinition.variable_name,
      field_type: fieldType,
      integer_digits: fieldType === '数值' ? (snapshot.integer_digits ?? fieldDefinition.integer_digits) : null,
      decimal_digits: fieldType === '数值' ? (snapshot.decimal_digits ?? fieldDefinition.decimal_digits) : null,
      date_format: supportsDateFormat ? (snapshot.date_format ?? fieldDefinition.date_format) : null,
      codelist_id: codelistId,
      unit_id: unitId,
      codelist: codelistId ? resolveCodelist(codelistId) : null,
      unit: unitId ? resolveUnit(unitId) : null,
    },
  }
}

const pendingFieldPropSnapshotVersion = ref(0)
const pendingFieldPropSnapshotMap = computed(() => {
  pendingFieldPropSnapshotVersion.value
  return new Map(pendingFieldPropSnapshots.map(snapshot => [snapshot.fieldId, snapshot]))
})
const liveEditSnapshot = computed(() => {
  if (!selectedFieldId.value) return null
  return buildFieldPropSnapshot(selectedFieldId.value)
})
const designerPreviewFields = computed(() => {
  return designerVisibleFields.value.map(field => {
    const pendingSnapshot = pendingFieldPropSnapshotMap.value.get(field.id)
    const liveSnapshot = liveEditSnapshot.value?.fieldId === field.id ? liveEditSnapshot.value : null
    return applyPreviewSnapshot(field, liveSnapshot || pendingSnapshot)
  })
})
const designerRenderGroups = computed(() => buildFormDesignerRenderGroups(designerPreviewFields.value))

const needsLandscape = computed(() => renderGroups.value.some(g => g.type === 'unified' || (g.type === 'inline' && g.fields.length > 4)))
const forceLandscape = ref(localStorage.getItem('crf_forceLandscape') === 'true')
watch(forceLandscape, v => localStorage.setItem('crf_forceLandscape', String(v)))
const landscapeMode = computed(() => forceLandscape.value || needsLandscape.value)
const designerLandscapeMode = computed(() => forceLandscape.value || designerRenderGroups.value.some(g => g.type === 'unified' || (g.type === 'inline' && g.fields.length > 4)))

// 预览表格列宽拖拽（R5）：per-group 隔离（同一表单内多张表可独立调整）
// formIdRef / tableKindRef 以 computed 形式传入 useColumnResize，切表单时自动 rehydrate；
// defaultsSource 使用工厂闭包，基于内容驱动的 planner 计算默认比例（与 width_planning.py 对齐）。
const formIdRef = computed(() => selectedForm.value?.id)
const resizerCache = new Map()
watch(() => selectedForm.value?.id, () => { resizerCache.clear() })
function resolveGroupAt(groupIndex) {
  return renderGroups.value[groupIndex] ?? designerRenderGroups.value[groupIndex] ?? null
}
function buildResizerDefaultsFactory(kind, colCount, groupIndex) {
  if (kind === 'normal') {
    return () => {
      const group = resolveGroupAt(groupIndex)
      const fractions = planNormalColumnFractions(group?.fields || [])
      return fractions.length === 2 ? fractions : [0.5, 0.5]
    }
  }
  if (kind === 'inline') {
    return () => {
      const group = resolveGroupAt(groupIndex)
      const fractions = planInlineColumnFractions(group?.fields || [])
      return fractions.length === colCount
        ? fractions
        : Array.from({ length: colCount }, () => 1 / colCount)
    }
  }
  if (kind === 'unified') {
    return () => {
      const group = resolveGroupAt(groupIndex)
      const unifiedColCount = group?.colCount || colCount
      const segments = buildFormDesignerUnifiedSegments(group?.fields || [])
      const fractions = planUnifiedColumnFractions(segments, unifiedColCount)
      return fractions.length === unifiedColCount
        ? fractions
        : Array.from({ length: unifiedColCount }, () => 1 / unifiedColCount)
    }
  }
  return () => Array.from({ length: colCount }, () => 1 / colCount)
}
function getResizer(kind, colCount, groupIndex) {
  if (selectedForm.value?.id == null) return null
  const mapKey = `${groupIndex}-${kind}-${colCount}`
  if (!resizerCache.has(mapKey)) {
    const tableKindRef = computed(() => mapKey)
    const defaultsFactory = buildResizerDefaultsFactory(kind, colCount, groupIndex)
    resizerCache.set(mapKey, useColumnResize(formIdRef, tableKindRef, defaultsFactory))
  }
  return resizerCache.get(mapKey)
}
function cumRatio(ratios, boundaryIdx) {
  let sum = 0
  for (let i = 0; i <= boundaryIdx; i += 1) sum += ratios[i]
  return sum
}

const libraryWidth = ref(parseInt(localStorage.getItem('crf_libraryWidth')) || 240)
const isLibResizing = ref(false)
watch(libraryWidth, v => localStorage.setItem('crf_libraryWidth', v))
function startLibResize(e) {
  isLibResizing.value = true
  const startX = e.clientX, startW = libraryWidth.value
  function onMove(e) { libraryWidth.value = Math.max(140, Math.min(400, startW + e.clientX - startX)) }
  function onUp() { isLibResizing.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
}

const previewPaneWidth = 460
const propWidth = computed(() => previewPaneWidth)

const formDesignNotes = ref('')
let notesTimer = null
let isSavingDesignNotes = false
let notesPendingSave = null
let notesSavePromise = null
let notesAutoSaveErrorShown = false
const previewDesignNotesText = computed(() => String(selectedForm.value?.design_notes ?? ''))
const hasPreviewNotes = computed(() => Boolean(previewDesignNotesText.value.trim()))
const previewDesignNotesHtml = computed(() => hasPreviewNotes.value ? escapePreviewText(previewDesignNotesText.value) : '')
const designerHasPreviewNotes = computed(() => false)

watch(() => selectedForm.value?.id, (formId) => {
  clearTimeout(notesTimer)
  notesAutoSaveErrorShown = false
  const current = forms.value.find(f => f.id === formId) || selectedForm.value
  formDesignNotes.value = current?.design_notes || ''
})

function buildDesignNotesSaveSnapshot({ form = selectedForm.value, projectId = props.projectId, notes = formDesignNotes.value } = {}) {
  if (!form?.id) return null
  return { formId: form.id, projectId, notes: String(notes ?? '') }
}

async function persistDesignNotesSnapshot(snapshot) {
  await api.put(`/api/forms/${snapshot.formId}`, { design_notes: snapshot.notes })
  forms.value = forms.value.map(f => (f.id === snapshot.formId ? { ...f, design_notes: snapshot.notes } : f))
  if (selectedForm.value?.id === snapshot.formId) {
    selectedForm.value = forms.value.find(f => f.id === snapshot.formId) || selectedForm.value
  }
  api.invalidateCache(`/api/projects/${snapshot.projectId}/forms`)
  notesAutoSaveErrorShown = false
}

async function flushDesignNotesSave(snapshot = buildDesignNotesSaveSnapshot()) {
  clearTimeout(notesTimer)
  if (snapshot) notesPendingSave = snapshot
  if (!notesPendingSave && !notesSavePromise) return true
  if (notesSavePromise) return notesSavePromise
  notesSavePromise = (async () => {
    isSavingDesignNotes = true
    try {
      while (notesPendingSave) {
        const queuedSave = notesPendingSave
        notesPendingSave = null
        try {
          await persistDesignNotesSnapshot(queuedSave)
        } catch (e) {
          if (!notesAutoSaveErrorShown) {
            ElMessage.error(`设计备注保存失败：${e.message}`)
            notesAutoSaveErrorShown = true
          }
          if (!notesPendingSave) notesPendingSave = queuedSave
          break
        }
      }
      return !notesPendingSave
    } finally {
      isSavingDesignNotes = false
      notesSavePromise = null
    }
  })()
  return notesSavePromise
}

async function selectForm(nextForm) {
  const sessionId = ++formSelectionSession
  const currentForm = selectedForm.value
  if ((currentForm?.id ?? null) === (nextForm?.id ?? null)) return
  const flushSucceeded = await flushDesignNotesSave(buildDesignNotesSaveSnapshot({ form: currentForm }))
  if (sessionId !== formSelectionSession) return
  if (!flushSucceeded && currentForm?.id) {
    formsTableRef.value?.setCurrentRow(currentForm)
    return
  }
  const flushFieldPropSucceeded = await flushFieldPropSaveBeforeReset({ preserveEditor: true })
  if (sessionId !== formSelectionSession) return
  if (!flushFieldPropSucceeded) {
    formsTableRef.value?.setCurrentRow(currentForm)
    return
  }
  resetFieldPropAutoSaveState()
  formFields.value = []
  selectedIds.value = []
  selectedForm.value = nextForm || null
}

function onNotesInput() {
  notesAutoSaveErrorShown = false
  clearTimeout(notesTimer)
  notesTimer = setTimeout(() => {
    void flushDesignNotesSave()
  }, 500)
}

// 快速编辑
const showQuickEdit = ref(false)
const quickEditField = ref(null)
const quickEditProp = reactive({ label: '', field_type: '', bg_color: '', text_color: '', inline_mark: false, default_value: '' })
function openQuickEdit(ff) {
  quickEditField.value = ff
  Object.assign(quickEditProp, {
    label: getFormFieldDisplayLabel(ff) || '',
    field_type: ff.field_definition?.field_type || '',
    bg_color: ff.bg_color || '',
    text_color: ff.text_color || '',
    inline_mark: !!ff.inline_mark,
    default_value: ff.default_value || ''
  })
  showQuickEdit.value = true
}
async function saveQuickEdit() {
  if (!quickEditField.value) return
  try {
    const supportsDefaultValue = isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark))
    const normalizedDefaultValue = supportsDefaultValue ? normalizeDefaultValue(quickEditProp.default_value, !quickEditProp.inline_mark) : ''
    const payload = { label_override: quickEditProp.label, bg_color: quickEditProp.bg_color || null, text_color: quickEditProp.text_color || null, inline_mark: quickEditProp.inline_mark ? 1 : 0, default_value: normalizedDefaultValue || null }
    const updated = await api.put(`/api/form-fields/${quickEditField.value.id}`, payload)
    const currentField = {
      ...quickEditField.value,
      ...updated,
      field_definition: quickEditField.value.field_definition,
    }
    quickEditField.value = currentField
    syncSelectedField(currentField, { syncEditor: false })
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
      await loadFormFields()
    }
    ElMessage.success('已保存')
    showQuickEdit.value = false
  } catch (e) { ElMessage.error('保存失败: ' + e.message) }
}

async function toggleInline(ff) {
  if (!selectedForm.value || !canToggleInline(ff)) return
  try {
    await confirmFormChange()
    await api.patch(`/api/form-fields/${ff.id}/inline-mark`, {
      inline_mark: ff.inline_mark ? 0 : 1,
    })
    api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
    await loadFormFields()
    if (selectedFieldId.value === ff.id) {
      const refreshed = formFields.value.find(item => item.id === ff.id)
      if (refreshed) editProp.inline_mark = refreshed.inline_mark || 0
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

const selectedFieldId = ref(null)
const editProp = reactive({
  label: '', variable_name: '', field_type: '文本', integer_digits: null, decimal_digits: null,
  date_format: null, codelist_id: null, unit_id: null, default_value: '', inline_mark: 0,
  bg_color: null, text_color: null,
})
let fieldPropSaveTimer = null
let pendingFieldPropSnapshots = []
let isHydratingFieldProp = false
let isSavingFieldProp = false
let fieldPropAutoSaveErrorShown = false
let fieldPropSaveSession = 0
const fieldPropProjectId = ref(props.projectId)
let lastHydratedFieldPropDraftKey = ''
const designerFieldTypes = ['文本', '数值', '日期', '日期时间', '时间', '单选', '多选', '单选（纵向）', '多选（纵向）', '标签']
const BG_COLOR_OPTIONS = [
  { value: null, label: '默认' },
  { value: 'A6A6A6', label: '灰色' },
  { value: '0070C0', label: '蓝色' },
  { value: 'E3F2FD', label: '浅蓝' },
  { value: 'E8F5E9', label: '浅绿' },
  { value: 'FFE0B2', label: '浅橙' },
]
const TEXT_COLOR_OPTIONS = [
  { value: 'A6A6A6', label: '灰色' },
  { value: '0070C0', label: '蓝色' },
  { value: 'E3F2FD', label: '浅蓝' },
  { value: 'E8F5E9', label: '浅绿' },
  { value: 'FFE0B2', label: '浅橙' },
]
const customBgColorInput = ref(''), customTextColorInput = ref('')
const DATE_FORMAT_OPTIONS = {
  '日期': ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MMM/yyyy', 'dd-MMM-yyyy', 'yyyy/MM/dd'],
  '日期时间': ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm:ss', 'dd/MM/yyyy HH:mm:ss'],
  '时间': ['HH:mm:ss', 'HH:mm', 'hh:mm:ss AP', 'hh:mm AP'],
}
const DEFAULT_DATE_FORMATS = { '日期': 'yyyy-MM-dd', '日期时间': 'yyyy-MM-dd HH:mm', '时间': 'HH:mm' }

watch(() => editProp.field_type, (newType) => {
  Object.assign(editProp, syncFieldTypeSpecificProps(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS))
})

function applyCustomBgColor() {
  const raw = String(customBgColorInput.value ?? '').trim()
  if (!raw) {
    editProp.bg_color = null
    return
  }
  const normalized = normalizeHexColorInput(raw)
  if (!normalized) return
  customBgColorInput.value = normalized
  editProp.bg_color = normalized
}

function applyCustomTextColor() {
  const raw = String(customTextColorInput.value ?? '').trim()
  if (!raw) {
    editProp.text_color = null
    return
  }
  const normalized = normalizeHexColorInput(raw)
  if (!normalized) return
  customTextColorInput.value = normalized
  editProp.text_color = normalized
}

function syncSelectedField(updatedField, { syncEditor = true } = {}) {
  if (!updatedField) return
  formFields.value = formFields.value.map(f => (f.id === updatedField.id ? updatedField : f))
  if (syncEditor && selectedFieldId.value === updatedField.id) selectField(updatedField)
}

function buildFieldPropSnapshot(fieldId = selectedFieldId.value) {
  if (!fieldId) return null
  return {
    fieldId,
    projectId: fieldPropProjectId.value,
    label: editProp.label,
    variable_name: editProp.variable_name,
    field_type: editProp.field_type,
    integer_digits: editProp.integer_digits,
    decimal_digits: editProp.decimal_digits,
    date_format: editProp.date_format,
    codelist_id: editProp.codelist_id,
    unit_id: editProp.unit_id,
    default_value: editProp.default_value,
    inline_mark: editProp.inline_mark,
    bg_color: editProp.bg_color,
    text_color: editProp.text_color,
  }
}

function getFieldPropSnapshotKey(snapshot = buildFieldPropSnapshot()) {
  return snapshot ? JSON.stringify(snapshot) : ''
}

function upsertPendingFieldPropSnapshot(snapshot) {
  if (!snapshot?.fieldId) return
  const snapshotKey = getFieldPropSnapshotKey(snapshot)
  pendingFieldPropSnapshots = [
    ...pendingFieldPropSnapshots.filter(item => item.fieldId !== snapshot.fieldId),
    { ...snapshot, snapshotKey },
  ]
  pendingFieldPropSnapshotVersion.value += 1
}

function hasPendingFieldPropSnapshot(fieldId, snapshotKey = '') {
  return pendingFieldPropSnapshots.some(item => item.fieldId === fieldId && (!snapshotKey || item.snapshotKey !== snapshotKey))
}

function shouldRetryFieldPropSave(error) {
  const message = String(error?.message || '')
  if (!message) return true
  if (message === '自动保存上下文已变更' || message === '单选/多选字段必须选择选项字典') return false
  const status = Number(error?.status || error?.response?.status)
  if (!Number.isFinite(status) || status <= 0) return true
  return status >= 500 || status === 429 || status === 408
}

function resetFieldPropAutoSaveState({ preserveEditor = false } = {}) {
  fieldPropSaveSession += 1
  clearTimeout(fieldPropSaveTimer)
  fieldPropSaveTimer = null
  pendingFieldPropSnapshots = []
  pendingFieldPropSnapshotVersion.value += 1
  isSavingFieldProp = false
  fieldPropAutoSaveErrorShown = false
  if (!preserveEditor) {
    selectedFieldId.value = null
    Object.assign(editProp, {
      label: '', variable_name: '', field_type: '文本', integer_digits: null, decimal_digits: null,
      date_format: null, codelist_id: null, unit_id: null, default_value: '', inline_mark: 0,
      bg_color: null, text_color: null,
    })
    customBgColorInput.value = ''
    customTextColorInput.value = ''
    lastHydratedFieldPropDraftKey = ''
  }
}

async function flushFieldPropSaveBeforeReset(resetOptions = {}) {
  const sessionId = fieldPropSaveSession
  clearTimeout(fieldPropSaveTimer)
  fieldPropSaveTimer = null
  const flushResult = await flushPendingFieldPropSave(sessionId)
  if (flushResult === false) return false
  if (isSavingFieldProp) {
    const settled = await new Promise(resolve => {
      const check = () => {
        if (!isSavingFieldProp) {
          resolve(true)
          return
        }
        if (sessionId !== fieldPropSaveSession) {
          resolve(false)
          return
        }
        setTimeout(check, 20)
      }
      check()
    })
    if (!settled) return false
  }
  if (pendingFieldPropSnapshots.length) return false
  resetFieldPropAutoSaveState(resetOptions)
  return true
}

const currentFieldPropDraftKey = computed(() => getFieldPropSnapshotKey())

async function flushPendingFieldPropSave(sessionId = fieldPropSaveSession) {
  if (sessionId !== fieldPropSaveSession) return false
  if (!pendingFieldPropSnapshots.length || isSavingFieldProp) return true
  const [snapshot, ...rest] = pendingFieldPropSnapshots
  pendingFieldPropSnapshots = rest
  pendingFieldPropSnapshotVersion.value += 1
  const snapshotKey = snapshot.snapshotKey || getFieldPropSnapshotKey(snapshot)
  let saveSucceeded = false
  let flushFailed = false
  isSavingFieldProp = true
  try {
    await saveFieldProp(snapshot, sessionId)
    fieldPropAutoSaveErrorShown = false
    saveSucceeded = true
  } catch (e) {
    flushFailed = true
    const isExpiredContext = e?.message === '自动保存上下文已变更'
    const isRetryableError = !isExpiredContext && shouldRetryFieldPropSave(e)
    if (!hasPendingFieldPropSnapshot(snapshot.fieldId, snapshotKey)) upsertPendingFieldPropSnapshot(snapshot)
    if (!fieldPropAutoSaveErrorShown && !isExpiredContext) {
      ElMessage.error(e.message)
      fieldPropAutoSaveErrorShown = true
    }
    if (isRetryableError) {
      clearTimeout(fieldPropSaveTimer)
      fieldPropSaveTimer = setTimeout(() => {
        void flushPendingFieldPropSave(sessionId)
      }, 1000)
    }
  } finally {
    if (sessionId !== fieldPropSaveSession) return false
    isSavingFieldProp = false
    const isCurrentSelectedField = selectedFieldId.value === snapshot.fieldId
    const hasNewerDraft = isCurrentSelectedField && getFieldPropSnapshotKey() !== snapshotKey
    const hasQueuedDraft = hasPendingFieldPropSnapshot(snapshot.fieldId, snapshotKey)
    if (hasNewerDraft && !hasQueuedDraft) upsertPendingFieldPropSnapshot(buildFieldPropSnapshot(snapshot.fieldId))
    const shouldRefillEditor = selectedFieldId.value === snapshot.fieldId && !hasPendingFieldPropSnapshot(snapshot.fieldId)
    if (saveSucceeded && shouldRefillEditor) {
      const updated = formFields.value.find(f => f.id === snapshot.fieldId)
      if (updated) selectField(updated)
    }
    if (saveSucceeded && pendingFieldPropSnapshots.length) {
      clearTimeout(fieldPropSaveTimer)
      return flushPendingFieldPropSave(sessionId)
    }
  }
  return !flushFailed
}

watch(currentFieldPropDraftKey, (draftKey) => {
  if (!draftKey || isHydratingFieldProp || draftKey === lastHydratedFieldPropDraftKey) return
  const snapshot = buildFieldPropSnapshot()
  if (!snapshot) return
  fieldPropAutoSaveErrorShown = false
  upsertPendingFieldPropSnapshot(snapshot)
  clearTimeout(fieldPropSaveTimer)
  fieldPropSaveTimer = setTimeout(() => {
    void flushPendingFieldPropSave(fieldPropSaveSession)
  }, 400)
})

function selectField(ff) {
  if (selectedFieldId.value && selectedFieldId.value !== ff.id) void flushPendingFieldPropSave()
  isHydratingFieldProp = true
  selectedFieldId.value = ff.id
  if (ff.is_log_row) {
    Object.assign(editProp, { label: ff.label_override || '以下为log行', variable_name: '', field_type: '日志行', integer_digits: null, decimal_digits: null, date_format: null, codelist_id: null, unit_id: null, default_value: '', inline_mark: 0, bg_color: ff.bg_color || null, text_color: ff.text_color || null })
    customBgColorInput.value = (ff.bg_color && !BG_COLOR_OPTIONS.some(o => o.value === ff.bg_color)) ? ff.bg_color : ''
    customTextColorInput.value = (ff.text_color && !TEXT_COLOR_OPTIONS.some(o => o.value === ff.text_color)) ? ff.text_color : ''
    lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey(buildFieldPropSnapshot(ff.id))
    isHydratingFieldProp = false
    return
  }
  const fd = ff.field_definition
  if (!fd) {
    lastHydratedFieldPropDraftKey = ''
    isHydratingFieldProp = false
    return
  }
  Object.assign(editProp, { label: fd.label || '', variable_name: fd.variable_name || '', field_type: fd.field_type || '文本', integer_digits: fd.integer_digits, decimal_digits: fd.decimal_digits, date_format: fd.date_format, codelist_id: fd.codelist_id, unit_id: fd.unit_id ?? null, default_value: ff.default_value || '', inline_mark: ff.inline_mark || 0, bg_color: ff.bg_color || null, text_color: ff.text_color || null })
  customBgColorInput.value = (ff.bg_color && !BG_COLOR_OPTIONS.some(o => o.value === ff.bg_color)) ? ff.bg_color : ''
  customTextColorInput.value = (ff.text_color && !TEXT_COLOR_OPTIONS.some(o => o.value === ff.text_color)) ? ff.text_color : ''
  lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey(buildFieldPropSnapshot(ff.id))
  isHydratingFieldProp = false
}

async function saveFieldProp(snapshot = buildFieldPropSnapshot(), sessionId = fieldPropSaveSession) {
  if (!snapshot?.fieldId) return
  if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更')
  const ff = formFields.value.find(f => f.id === snapshot.fieldId)
  const formId = selectedForm.value?.id
  const projectId = snapshot.projectId
  if (!ff || !formId || projectId !== props.projectId) throw new Error('自动保存上下文已变更')
  if (!ff.is_log_row && isChoiceField(snapshot.field_type) && !snapshot.codelist_id) throw new Error('单选/多选字段必须选择选项字典')
  try {
    if (ff.is_log_row) {
      const updated = await api.put(`/api/form-fields/${ff.id}`, { label_override: snapshot.label })
      if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更')
      syncSelectedField(updated, { syncEditor: false })
      api.invalidateCache(`/api/forms/${formId}/fields`)
    } else {
      const supportsDefaultValue = isDefaultValueSupported(snapshot.field_type, Boolean(snapshot.inline_mark))
      const normalizedDefaultValue = supportsDefaultValue ? normalizeDefaultValue(snapshot.default_value, !snapshot.inline_mark) : ''
      const updatedDefinition = await api.put(`/api/projects/${projectId}/field-definitions/${ff.field_definition_id}`, { label: snapshot.label, variable_name: snapshot.variable_name, field_type: snapshot.field_type, integer_digits: snapshot.integer_digits, decimal_digits: snapshot.decimal_digits, date_format: snapshot.date_format, codelist_id: snapshot.codelist_id, unit_id: snapshot.unit_id ?? null })
      if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更')
      let currentField = { ...ff, field_definition: { ...ff.field_definition, ...updatedDefinition } }
      syncSelectedField(currentField, { syncEditor: false })
      api.invalidateCache(`/api/forms/${formId}/fields`)
      const updatedField = await api.put(`/api/form-fields/${ff.id}`, { default_value: normalizedDefaultValue })
      if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更')
      currentField = { ...currentField, ...updatedField, field_definition: currentField.field_definition }
      syncSelectedField(currentField, { syncEditor: false })
    }
    const baseField = formFields.value.find(f => f.id === ff.id) || ff
    const updatedColors = await api.patch(`/api/form-fields/${ff.id}/colors`, { bg_color: snapshot.bg_color, text_color: snapshot.text_color })
    if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更')
    syncSelectedField({ ...baseField, ...updatedColors, field_definition: baseField.field_definition }, { syncEditor: false })
    await loadFormFields()
  } catch (e) { throw e }
}

async function newField() {
  if (!selectedForm.value) return
  try {
    const fd = await api.post(`/api/projects/${props.projectId}/field-definitions`, { variable_name: genFieldVarName(), label: '新字段', field_type: '文本' })
    const ff = await api.post(`/api/forms/${selectedForm.value.id}/fields`, { field_definition_id: fd.id })
    await loadFormFields(); await loadFieldDefs()
    const newFf = formFields.value.find(f => f.id === ff.id)
    if (newFf) selectField(newFf)
  } catch (e) { ElMessage.error(e.message) }
}

async function addLogRow() {
  if (!selectedForm.value) return
  try { await api.post(`/api/forms/${selectedForm.value.id}/fields`, { is_log_row: 1, label_override: '以下为log行' }); await loadFormFields() }
  catch (e) { ElMessage.error(e.message) }
}

// 选项字典快速CRUD
const showQuickAddCodelist = ref(false), quickCodelistName = ref(''), quickCodelistDescription = ref(''), quickCodelistOpts = ref([]), quickOptCode = ref(''), quickOptDecode = ref(''), quickAddCodelistSaving = ref(false)
function quickAddOptRow() {
  if (!quickOptDecode.value.trim()) return ElMessage.warning('请输入标签')
  const n = quickCodelistOpts.value.length
  quickCodelistOpts.value.push({ id: null, code: quickOptCode.value.trim() || `C.${n + 1}`, decode: quickOptDecode.value.trim(), trailing_underscore: 0 })
  quickOptCode.value = `C.${n + 2}`; quickOptDecode.value = ''
}
function quickDelOptRow(idx) { quickCodelistOpts.value.splice(idx, 1) }
function closeQuickAddCodelist() { showQuickAddCodelist.value = false; quickCodelistName.value = ''; quickCodelistDescription.value = ''; quickCodelistOpts.value = []; quickOptCode.value = ''; quickOptDecode.value = ''; quickAddCodelistSaving.value = false }
function openQuickAddCodelist() { quickCodelistName.value = ''; quickCodelistDescription.value = ''; quickCodelistOpts.value = []; quickOptCode.value = 'C.1'; quickOptDecode.value = ''; quickAddCodelistSaving.value = false; showQuickAddCodelist.value = true }
async function quickAddCodelist() {
  if (quickAddCodelistSaving.value) return

  const savedName = quickCodelistName.value.trim()
  if (!savedName) return ElMessage.warning('请输入字典名称')

  const normalizedOptions = quickCodelistOpts.value.map(opt => ({
    ...opt,
    code: String(opt.code ?? '').trim(),
    decode: String(opt.decode ?? '').trim(),
    trailing_underscore: opt.trailing_underscore || 0,
  }))
  const invalidOptionIndex = normalizedOptions.findIndex(opt => !opt.code || !opt.decode)
  if (invalidOptionIndex !== -1) return ElMessage.warning(`请完整填写第 ${invalidOptionIndex + 1} 行的编码和值标签`)

  quickAddCodelistSaving.value = true
  try {
    quickCodelistName.value = savedName
    quickCodelistOpts.value = normalizedOptions
    const created = await api.post(`/api/projects/${props.projectId}/codelists`, {
      name: savedName,
      description: quickCodelistDescription.value,
      options: normalizedOptions.map((opt, index) => ({
        code: opt.code,
        decode: opt.decode,
        trailing_underscore: opt.trailing_underscore || 0,
        order_index: index + 1,
      })),
    })
    await loadCodelists(); editProp.codelist_id = created.id; closeQuickAddCodelist()
  } catch (e) { ElMessage.error(e.message) }
  finally { quickAddCodelistSaving.value = false }
}

const showQuickEditCodelist = ref(false), quickEditCodelistId = ref(null), quickEditCodelistName = ref(''), quickEditCodelistDescription = ref(''), quickEditCodelistOpts = ref([]), quickEditOptCode = ref(''), quickEditOptDecode = ref(''), quickEditCodelistSaving = ref(false)
function openQuickEditCodelist() {
  if (!editProp.codelist_id) return
  const cl = codelists.value.find(c => c.id === editProp.codelist_id)
  if (!cl) return
  quickEditCodelistId.value = cl.id; quickEditCodelistName.value = cl.name; quickEditCodelistDescription.value = cl.description || ''; quickEditCodelistOpts.value = (cl.options || []).map(o => ({ id: o.id, code: o.code, decode: o.decode, trailing_underscore: o.trailing_underscore || 0 }))
  quickEditOptCode.value = `C.${(cl.options || []).length + 1}`; quickEditOptDecode.value = ''; showQuickEditCodelist.value = true
}
function quickEditAddOptRow() {
  if (!quickEditOptDecode.value.trim()) return ElMessage.warning('请输入标签')
  const n = quickEditCodelistOpts.value.length
  quickEditCodelistOpts.value.push({ id: null, code: quickEditOptCode.value.trim() || `C.${n + 1}`, decode: quickEditOptDecode.value.trim(), trailing_underscore: 0 })
  quickEditOptCode.value = `C.${n + 2}`; quickEditOptDecode.value = ''
}
function quickEditDelOptRow(idx) { quickEditCodelistOpts.value.splice(idx, 1) }
function toggleTrailingLine(row) { row.trailing_underscore = row.trailing_underscore ? 0 : 1 }
function closeQuickEditCodelist() { showQuickEditCodelist.value = false; quickEditCodelistId.value = null; quickEditCodelistName.value = ''; quickEditCodelistDescription.value = ''; quickEditCodelistOpts.value = []; quickEditOptCode.value = ''; quickEditOptDecode.value = '' }
async function quickSaveCodelist() {
  if (quickEditCodelistSaving.value) return

  const savedName = quickEditCodelistName.value.trim()
  if (!savedName) return ElMessage.warning('请输入字典名称')

  const normalizedOptions = quickEditCodelistOpts.value.map(opt => ({
    ...opt,
    code: String(opt.code ?? '').trim(),
    decode: String(opt.decode ?? '').trim(),
    trailing_underscore: opt.trailing_underscore || 0,
  }))
  const invalidOptionIndex = normalizedOptions.findIndex(opt => !opt.code || !opt.decode)
  if (invalidOptionIndex !== -1) return ElMessage.warning(`请完整填写第 ${invalidOptionIndex + 1} 行的编码和值标签`)

  quickEditCodelistSaving.value = true
  try {
    const refs = await api.get(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }

    quickEditCodelistName.value = savedName
    quickEditCodelistOpts.value = normalizedOptions

    await api.put(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/snapshot`, {
      name: savedName,
      description: quickEditCodelistDescription.value,
      options: normalizedOptions.map(opt => ({
        id: opt.id,
        code: opt.code,
        decode: opt.decode,
        trailing_underscore: opt.trailing_underscore || 0,
      })),
    })

    api.invalidateCache(`/api/projects/${props.projectId}/codelists`); await loadCodelists()
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`); await loadFormFields()
      const updated = formFields.value.find(f => f.id === selectedFieldId.value)
      if (updated) selectField(updated)
    }
    closeQuickEditCodelist(); ElMessage.success('保存成功')
  } catch (e) {
    if (e === 'cancel') return
    api.invalidateCache(`/api/projects/${props.projectId}/codelists`)
    await loadCodelists()
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`); await loadFormFields()
      const updated = formFields.value.find(f => f.id === selectedFieldId.value)
      if (updated) selectField(updated)
    }
    closeQuickEditCodelist()
    ElMessage.error(`保存失败：${e.message}。已刷新为最新字典数据，请重新检查后再编辑。`)
  } finally {
    quickEditCodelistSaving.value = false
  }
}

const showQuickAddUnit = ref(false), quickUnitSymbol = ref('')
async function quickAddUnit() {
  if (!quickUnitSymbol.value.trim()) return ElMessage.warning('请输入单位符号')
  try {
    const created = await api.post(`/api/projects/${props.projectId}/units`, { symbol: quickUnitSymbol.value.trim() })
    await loadUnits(); editProp.unit_id = created.id; showQuickAddUnit.value = false; quickUnitSymbol.value = ''
  } catch (e) { ElMessage.error(e.message) }
}

// 拖拽排序（表单）
const formsTableRef = ref(null), isFormsFiltered = computed(() => searchForm.value.trim().length > 0), formsReorderUrl = computed(() => `/api/projects/${props.projectId}/forms/reorder`)
const { initSortable: initFormsSortable } = useSortableTable(formsTableRef, forms, formsReorderUrl, { reloadFn: reloadForms, isFiltered: isFormsFiltered, renderList: filteredForms })

onMounted(async () => { await Promise.all([loadForms(), loadFieldDefs(), loadCodelists(), loadUnits()]); nextTick(() => initFormsSortable()) })
watch(() => showDesigner.value, async (visible, previousVisible) => {
  if (!visible && previousVisible) {
    const resetSucceeded = await flushFieldPropSaveBeforeReset()
    if (!resetSucceeded) showDesigner.value = true
  }
})
watch(() => props.projectId, async (newProjectId, previousProjectId) => {
  if (newProjectId === previousProjectId) return
  invalidateFormSelectionSession()
  const flushSnapshot = buildDesignNotesSaveSnapshot({ projectId: previousProjectId })
  const flushSucceeded = await flushDesignNotesSave(flushSnapshot)
  if (!flushSucceeded && selectedForm.value?.id) return
  const resetSucceeded = await flushFieldPropSaveBeforeReset({ preserveEditor: true })
  if (!resetSucceeded) {
    fieldPropProjectId.value = previousProjectId
    return
  }
  fieldPropProjectId.value = newProjectId
  selectedForm.value = null; formFields.value = []; selectedFieldId.value = null; loadForms(); loadFieldDefs(); loadCodelists(); loadUnits()
})

async function canLeaveProject() {
  const flushSucceeded = await flushDesignNotesSave(buildDesignNotesSaveSnapshot())
  if (!flushSucceeded && selectedForm.value?.id) return false
  return flushFieldPropSaveBeforeReset({ preserveEditor: true })
}

defineExpose({ canLeaveProject })

function openAddForm() { newFormCode.value = genCode('FORM'); showAddForm.value = true }
</script>

<template>
  <div class="form-designer">
    <div class="fd-formlist">
      <div style="margin-bottom:12px;display:flex;gap:8px">
        <el-button type="primary" size="small" @click="openAddForm">新建表单</el-button>
        <el-button type="danger" size="small" :disabled="!selForms.length" @click="batchDelForms">批量删除({{ selForms.length }})</el-button>
        <el-input v-model="searchForm" placeholder="搜索表单..." clearable size="small" style="width:180px" />
      </div>
      <el-table ref="formsTableRef" :data="filteredForms" size="small" border highlight-current-row row-key="id" @current-change="selectForm" @selection-change="r => selForms = r" style="width:100%" height="100%">
        <el-table-column width="32" v-if="!isFormsFiltered"><template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template></el-table-column>
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }"><div @click.stop><span class="ordinal-cell">{{ row.order_index }}</span></div></template>
        </el-table-column>
        <el-table-column prop="name" label="表单名称" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }"><el-button size="small" link @click.stop="copyForm(row)">复制</el-button><el-button size="small" link @click.stop="openEditForm(row)">编辑</el-button><el-button type="danger" size="small" link @click.stop="delForm(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </div>

    <div class="fd-right">
      <div class="fd-canvas" style="flex:1">
        <div class="fd-canvas-header">
          <el-button v-if="selectedForm" size="small" type="primary" @click="showDesigner = true">设计表单</el-button>
          <span>{{ selectedForm?.name || '未选择表单' }}</span>
          <span style="color:var(--color-text-muted);font-size:12px;margin-left:auto">共 {{ formFields.length }} 个字段</span>
        </div>
        <div class="word-preview">
          <div :class="['word-page', { landscape: landscapeMode, 'word-page--with-notes': hasPreviewNotes }]">
            <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
            <template v-else>
              <div class="wp-form-title">{{ selectedForm.name }}</div>
              <div v-if="!formFields.length" class="wp-empty">暂无字段</div>
              <div :class="['wp-body', { 'wp-body--with-notes': hasPreviewNotes }]">
                <div class="wp-main">
                  <template v-for="(g, gi) in renderGroups" :key="gi">
                    <div v-if="g.type === 'unified'" class="col-resize-host unified-host">
                      <table class="unified-table">
                        <colgroup v-if="getResizer('unified', g.colCount, gi)"><col v-for="(r, ci) in getResizer('unified', g.colCount, gi).colRatios" :key="ci" :style="{ width: (r * 100) + '%' }" /></colgroup>
                        <template v-for="seg in buildFormDesignerUnifiedSegments(g.fields)" :key="seg.fields[0]?.id">
                          <tr v-if="seg.type === 'regular_field'" @dblclick="openQuickEdit(seg.fields[0])">
                            <td class="unified-label" :colspan="computeLabelValueSpans(g.colCount).labelSpan" :style="getFormFieldPreviewStyle(seg.fields[0])">{{ getFormFieldDisplayLabel(seg.fields[0]) }}</td>
                            <td class="unified-value" :colspan="computeLabelValueSpans(g.colCount).valueSpan" :style="getFormFieldPreviewStyle(seg.fields[0])" v-html="renderCellHtml(seg.fields[0])"></td>
                          </tr>
                          <tr v-else-if="seg.type === 'full_row'" @dblclick="openQuickEdit(seg.fields[0])">
                            <td :class="{ 'wp-structure-label--multiline': seg.fields[0].field_definition?.field_type === '标签' }" :colspan="g.colCount" :style="'font-weight:bold;' + getFormFieldPreviewStyle(seg.fields[0], 'background:var(--preview-structure-bg);')">{{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}</td>
                          </tr>
                          <template v-else-if="seg.type === 'inline_block'">
                            <tr><td v-for="(ff, idx) in seg.fields" :key="ff.id" class="wp-inline-header" :colspan="computeMergeSpans(g.colCount, seg.fields.length)[idx]" :style="getFormFieldPreviewStyle(ff)" @dblclick="openQuickEdit(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                            <tr v-for="(row, ri) in getInlineRows(seg.fields)" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :colspan="computeMergeSpans(g.colCount, seg.fields.length)[ci]" :style="getFormFieldPreviewStyle(seg.fields[ci])" v-html="cell" @dblclick="openQuickEdit(seg.fields[ci])"></td></tr>
                          </template>
                        </template>
                      </table>
                      <template v-if="getResizer('unified', g.colCount, gi)"><div v-for="bi in getResizer('unified', g.colCount, gi).colRatios.length - 1" :key="bi" class="resizer-handle" :style="{ left: cumRatio(getResizer('unified', g.colCount, gi).colRatios, bi - 1) * 100 + '%' }" @pointerdown="e => getResizer('unified', g.colCount, gi).onResizeStart(bi - 1, e)"></div><div v-if="getResizer('unified', g.colCount, gi).snapGuideX !== null" class="snap-guide" :style="{ left: getResizer('unified', g.colCount, gi).snapGuideX + 'px' }"></div></template>
                    </div>
                    <div v-else-if="g.type === 'normal'" class="col-resize-host">
                      <table>
                        <colgroup v-if="getResizer('normal', 2, gi)"><col v-for="(r, ci) in getResizer('normal', 2, gi).colRatios" :key="ci" :style="{ width: (r * 100) + '%' }" /></colgroup>
                        <template v-for="ff in g.fields" :key="ff.id">
                          <tr v-if="ff.field_definition?.field_type === '标签'" @dblclick="openQuickEdit(ff)"><td class="wp-structure-label--multiline" colspan="2" :style="'font-weight:bold;' + getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                          <tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'" @dblclick="openQuickEdit(ff)"><td colspan="2" :style="'font-weight:bold;' + getFormFieldPreviewStyle(ff, 'background:var(--preview-structure-bg);')">{{ getFormFieldDisplayLabel(ff) || '以下为log行' }}</td></tr>
                          <tr v-else @dblclick="openQuickEdit(ff)"><td class="wp-label" :style="getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td><td class="wp-ctrl" :style="getFormFieldPreviewStyle(ff)" v-html="renderCellHtml(ff)"></td></tr>
                        </template>
                      </table>
                      <template v-if="getResizer('normal', 2, gi)"><div v-for="bi in getResizer('normal', 2, gi).colRatios.length - 1" :key="bi" class="resizer-handle" :style="{ left: cumRatio(getResizer('normal', 2, gi).colRatios, bi - 1) * 100 + '%' }" @pointerdown="e => getResizer('normal', 2, gi).onResizeStart(bi - 1, e)"></div><div v-if="getResizer('normal', 2, gi).snapGuideX !== null" class="snap-guide" :style="{ left: getResizer('normal', 2, gi).snapGuideX + 'px' }"></div></template>
                    </div>
                    <div v-else class="col-resize-host inline-host">
                      <table class="inline-table">
                        <colgroup v-if="getResizer('inline', g.fields.length, gi)"><col v-for="(r, ci) in getResizer('inline', g.fields.length, gi).colRatios" :key="ci" :style="{ width: (r * 100) + '%' }" /></colgroup>
                        <tr><td v-for="ff in g.fields" :key="ff.id" class="wp-inline-header" :style="getFormFieldPreviewStyle(ff)" @dblclick="openQuickEdit(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                        <tr v-for="(row, ri) in getInlineRows(g.fields)" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :style="(getFormFieldPreviewStyle(g.fields[ci]))" v-html="cell" @dblclick="openQuickEdit(g.fields[ci])"></td></tr>
                      </table>
                      <template v-if="getResizer('inline', g.fields.length, gi)"><div v-for="bi in getResizer('inline', g.fields.length, gi).colRatios.length - 1" :key="bi" class="resizer-handle" :style="{ left: cumRatio(getResizer('inline', g.fields.length, gi).colRatios, bi - 1) * 100 + '%' }" @pointerdown="e => getResizer('inline', g.fields.length, gi).onResizeStart(bi - 1, e)"></div><div v-if="getResizer('inline', g.fields.length, gi).snapGuideX !== null" class="snap-guide" :style="{ left: getResizer('inline', g.fields.length, gi).snapGuideX + 'px' }"></div></template>
                    </div>
                  </template>
                </div>
                <aside v-if="hasPreviewNotes" class="wp-notes"><div class="wp-notes-title">设计备注</div><div class="wp-notes-content" v-html="previewDesignNotesHtml"></div></aside>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="showDesigner" :title="'设计：' + (selectedForm?.name || '')" fullscreen class="designer-dialog">
      <div class="designer-shell">
        <div class="fd-library designer-library-pane" :style="{ width: libraryWidth + 'px' }">
          <div class="fd-library-header">字段库</div>
          <div class="designer-pane-toolbar"><el-input v-model="fieldSearch" placeholder="搜索..." size="small" clearable /></div>
          <div class="fd-library-list"><div v-for="fd in filteredFieldDefs" :key="fd.id" class="fd-item" :style="usedDefIds.has(fd.id) ? 'opacity:0.4' : ''" @click="addField(fd)"><span>{{ fd.label }}</span><span style="color:var(--color-text-muted);font-size:11px">{{ fd.field_type }}</span></div></div>
        </div>
        <div class="fd-panel-resizer" @mousedown="startLibResize"></div>
        <div class="designer-workspace">
          <div class="designer-workspace-top">
            <div class="fd-canvas designer-fields-panel">
              <div class="fd-canvas-header"><el-button size="small" type="primary" @click="newField">新建字段</el-button><el-button size="small" @click="addLogRow">添加log行</el-button><el-button v-if="selectedIds.length" type="danger" size="small" @click="batchDelete">批量删除({{selectedIds.length}})</el-button><span style="color:var(--color-text-muted);font-size:12px;margin-left:auto">共 {{ designerVisibleFields.length }} 个字段</span></div>
              <div class="fd-canvas-list designer-field-list">
                <div v-for="(ff, idx) in designerVisibleFields" :key="ff.id" :ref="el => fieldItemRefs[ff.id] = el" class="ff-item" :class="{ inline: ff.inline_mark, 'ff-selected': selectedFieldId === ff.id }" :draggable="true" @click="selectField(ff)" @dragstart="onDragStart(ff)" @dragover="onDragOver($event, idx)" @dragleave="onDragLeave" @drop="onDrop($event, idx)" :style="(dragOverIdx === idx ? 'border-top:2px solid var(--color-primary);' : '') + (ff.bg_color ? 'border-left:4px solid #' + ff.bg_color + ';' : '')" tabindex="0" @keydown="handleFieldKeydown($event, ff, idx)">
                  <el-checkbox v-model="selectedIds" :label="ff.id" size="small" @click.stop></el-checkbox><span class="ordinal-cell" style="width:56px;margin-left:2px">{{ ff._displayOrder }}</span><span class="drag-handle">⠿</span><span class="ff-label" :style="getFormFieldTextColorStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</span><el-tooltip v-if="canToggleInline(ff)" content="横向表格标记"><el-button size="small" link :type="ff.inline_mark ? 'warning' : ''" :aria-label="'切换 ' + getFormFieldDisplayLabel(ff) + ' 的横向表格标记'" @click.stop="toggleInline(ff)">⊞</el-button></el-tooltip><el-button type="danger" size="small" link @click.stop="removeField(ff)">删除</el-button>
                </div>
              </div>
            </div>
          </div>
          <div class="designer-workspace-bottom">
            <div class="designer-preview-pane">
              <div class="designer-section-title">实时预览</div>
              <div class="designer-preview-viewport">
                <div class="designer-preview-stage">
                  <div class="designer-preview-page">
                    <div :class="['word-page', 'form-designer-word-page', 'designer-scaled-word-page', { landscape: designerLandscapeMode, 'word-page--with-notes': designerHasPreviewNotes }]">
                      <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
                      <template v-else>
                        <div v-if="!designerPreviewFields.length" class="wp-empty">暂无字段</div>
                        <div :class="['wp-body', { 'wp-body--with-notes': designerHasPreviewNotes }]">
                          <div class="wp-main">
                            <template v-for="(g, gi) in designerRenderGroups" :key="gi">
                              <div v-if="g.type === 'unified'" class="col-resize-host unified-host">
                                <table class="unified-table">
                                  <colgroup v-if="getResizer('unified', g.colCount, gi)"><col v-for="(r, ci) in getResizer('unified', g.colCount, gi).colRatios" :key="ci" :style="{ width: (r * 100) + '%' }" /></colgroup>
                                  <template v-for="seg in buildFormDesignerUnifiedSegments(g.fields)" :key="seg.fields[0]?.id">
                                    <tr v-if="seg.type === 'regular_field'" @dblclick="openQuickEdit(seg.fields[0])"><td class="unified-label" :colspan="computeLabelValueSpans(g.colCount).labelSpan" :style="getFormFieldPreviewStyle(seg.fields[0])">{{ getFormFieldDisplayLabel(seg.fields[0]) }}</td><td class="unified-value" :colspan="computeLabelValueSpans(g.colCount).valueSpan" :style="getFormFieldPreviewStyle(seg.fields[0])" v-html="renderCellHtml(seg.fields[0])"></td></tr>
                                    <tr v-else-if="seg.type === 'full_row'" @dblclick="openQuickEdit(seg.fields[0])"><td :class="{ 'wp-structure-label--multiline': seg.fields[0].field_definition?.field_type === '标签' }" :colspan="g.colCount" :style="'font-weight:bold;' + getFormFieldPreviewStyle(seg.fields[0], 'background:var(--preview-structure-bg);')">{{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}</td></tr>
                                    <template v-else-if="seg.type === 'inline_block'"><tr><td v-for="(ff, idx) in seg.fields" :key="ff.id" class="wp-inline-header" :colspan="computeMergeSpans(g.colCount, seg.fields.length)[idx]" :style="getFormFieldPreviewStyle(ff)" @dblclick="openQuickEdit(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr><tr v-for="(row, ri) in getInlineRows(seg.fields)" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :colspan="computeMergeSpans(g.colCount, seg.fields.length)[ci]" :style="getFormFieldPreviewStyle(seg.fields[ci])" v-html="cell" @dblclick="openQuickEdit(seg.fields[ci])"></td></tr></template>
                                  </template>
                                </table>
                                <template v-if="getResizer('unified', g.colCount, gi)"><div v-for="bi in getResizer('unified', g.colCount, gi).colRatios.length - 1" :key="bi" class="resizer-handle" :style="{ left: cumRatio(getResizer('unified', g.colCount, gi).colRatios, bi - 1) * 100 + '%' }" @pointerdown="e => getResizer('unified', g.colCount, gi).onResizeStart(bi - 1, e)"></div><div v-if="getResizer('unified', g.colCount, gi).snapGuideX !== null" class="snap-guide" :style="{ left: getResizer('unified', g.colCount, gi).snapGuideX + 'px' }"></div></template>
                              </div>
                              <div v-else-if="g.type === 'normal'" class="col-resize-host">
                                <table>
                                  <colgroup v-if="getResizer('normal', 2, gi)"><col v-for="(r, ci) in getResizer('normal', 2, gi).colRatios" :key="ci" :style="{ width: (r * 100) + '%' }" /></colgroup>
                                  <template v-for="ff in g.fields" :key="ff.id"><tr v-if="ff.field_definition?.field_type === '标签'" @dblclick="openQuickEdit(ff)"><td class="wp-structure-label--multiline" colspan="2" :style="'font-weight:bold;' + getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr><tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'" @dblclick="openQuickEdit(ff)"><td colspan="2" :style="'font-weight:bold;' + getFormFieldPreviewStyle(ff, 'background:var(--preview-structure-bg);')">{{ getFormFieldDisplayLabel(ff) || '以下为log行' }}</td></tr><tr v-else @dblclick="openQuickEdit(ff)"><td class="wp-label" :style="getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td><td class="wp-ctrl" :style="getFormFieldPreviewStyle(ff)" v-html="renderCellHtml(ff)"></td></tr></template>
                                </table>
                                <template v-if="getResizer('normal', 2, gi)"><div v-for="bi in getResizer('normal', 2, gi).colRatios.length - 1" :key="bi" class="resizer-handle" :style="{ left: cumRatio(getResizer('normal', 2, gi).colRatios, bi - 1) * 100 + '%' }" @pointerdown="e => getResizer('normal', 2, gi).onResizeStart(bi - 1, e)"></div><div v-if="getResizer('normal', 2, gi).snapGuideX !== null" class="snap-guide" :style="{ left: getResizer('normal', 2, gi).snapGuideX + 'px' }"></div></template>
                              </div>
                              <div v-else class="col-resize-host inline-host">
                                <table class="inline-table">
                                  <colgroup v-if="getResizer('inline', g.fields.length, gi)"><col v-for="(r, ci) in getResizer('inline', g.fields.length, gi).colRatios" :key="ci" :style="{ width: (r * 100) + '%' }" /></colgroup>
                                  <tr><td v-for="ff in g.fields" :key="ff.id" class="wp-inline-header" :style="getFormFieldPreviewStyle(ff)" @dblclick="openQuickEdit(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                                  <tr v-for="(row, ri) in getInlineRows(g.fields)" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :style="getFormFieldPreviewStyle(g.fields[ci])" v-html="cell" @dblclick="openQuickEdit(g.fields[ci])"></td></tr>
                                </table>
                                <template v-if="getResizer('inline', g.fields.length, gi)"><div v-for="bi in getResizer('inline', g.fields.length, gi).colRatios.length - 1" :key="bi" class="resizer-handle" :style="{ left: cumRatio(getResizer('inline', g.fields.length, gi).colRatios, bi - 1) * 100 + '%' }" @pointerdown="e => getResizer('inline', g.fields.length, gi).onResizeStart(bi - 1, e)"></div><div v-if="getResizer('inline', g.fields.length, gi).snapGuideX !== null" class="snap-guide" :style="{ left: getResizer('inline', g.fields.length, gi).snapGuideX + 'px' }"></div></template>
                              </div>
                            </template>
                          </div>
                          <aside v-if="designerHasPreviewNotes" class="wp-notes"><div class="wp-notes-title">设计备注</div><div class="wp-notes-content" v-html="previewDesignNotesHtml"></div></aside>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="designer-side-pane" :style="{ width: propWidth + 'px' }">
          <div class="designer-editor-card">
            <div class="designer-section-title">属性编辑</div>
            <div v-if="!selectedFieldId" class="designer-empty-state">← 选择字段</div>
            <div v-else-if="editProp.field_type === '日志行'" class="designer-editor-scroll">
              <el-form :model="editProp" label-width="70px" size="small">
                <el-form-item label="标签"><el-input v-model="editProp.label" /></el-form-item>
                <el-form-item label="底纹颜色">
                  <div class="color-picker">
                    <div class="color-option color-option-default" :class="{'color-selected': !editProp.bg_color && !customBgColorInput}" @click="editProp.bg_color = null; customBgColorInput = ''">默认</div>
                    <div v-for="opt in BG_COLOR_OPTIONS.slice(1)" :key="opt.value" class="color-option" :class="{'color-selected': editProp.bg_color===opt.value && !customBgColorInput}" :style="{ background: '#' + opt.value }" @click="editProp.bg_color=opt.value; customBgColorInput = ''"></div>
                    <el-input v-model="customBgColorInput" placeholder="自定义HEX" size="small" style="width:90px;margin-left:4px" @input="applyCustomBgColor">
                      <template #prefix><span :style="customBgColorInput ? 'color:#' + customBgColorInput : ''">■</span></template>
                    </el-input>
                  </div>
                </el-form-item>
                <el-form-item label="文字颜色">
                  <div class="color-picker">
                    <div class="color-option color-option-default" :class="{'color-selected': !editProp.text_color && !customTextColorInput}" @click="editProp.text_color = null; customTextColorInput = ''">默认</div>
                    <div v-for="opt in TEXT_COLOR_OPTIONS" :key="opt.value" class="color-option" :class="{'color-selected': editProp.text_color===opt.value && !customTextColorInput}" :style="{ background: '#' + opt.value }" @click="editProp.text_color=opt.value; customTextColorInput = ''"></div>
                    <el-input v-model="customTextColorInput" placeholder="自定义HEX" size="small" style="width:90px;margin-left:4px" @input="applyCustomTextColor">
                      <template #prefix><span :style="customTextColorInput ? 'color:#' + customTextColorInput : ''">■</span></template>
                    </el-input>
                  </div>
                </el-form-item>
              </el-form>
            </div>
            <div v-else class="designer-editor-scroll">
              <el-form :model="editProp" label-width="70px" size="small">
                <el-form-item label="变量标签"><el-input v-model="editProp.label" :type="editProp.field_type === '标签' ? 'textarea' : 'text'" :autosize="editProp.field_type === '标签' ? { minRows: 2, maxRows: 4 } : undefined" /></el-form-item>
                <el-form-item v-if="!['标签', '日志行'].includes(editProp.field_type)" v-show="false" label="变量名"><el-input v-model="editProp.variable_name" /></el-form-item>
                <el-form-item label="字段类型">
                  <el-select v-model="editProp.field_type" style="width:100%">
                    <el-option v-for="t in designerFieldTypes" :key="t" :label="t" :value="t" />
                  </el-select>
                </el-form-item>
                <template v-if="editProp.field_type === '数值'">
                  <el-form-item label="整数位数"><el-input-number v-model="editProp.integer_digits" :min="1" :max="20" style="width:100%" /></el-form-item>
                  <el-form-item label="小数位数"><el-input-number v-model="editProp.decimal_digits" :min="0" :max="15" style="width:100%" /></el-form-item>
                </template>
                <el-form-item v-if="['日期', '日期时间', '时间'].includes(editProp.field_type)" label="日期格式">
                  <el-select v-model="editProp.date_format" clearable style="width:100%">
                    <el-option v-for="f in (DATE_FORMAT_OPTIONS[editProp.field_type] || [])" :key="f" :label="f" :value="f" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="isChoiceField(editProp.field_type)" label="选项">
                  <div class="choice-codelist-row">
                    <el-select v-model="editProp.codelist_id" class="choice-codelist-select" clearable filterable placeholder="请选择">
                      <el-option v-for="c in codelists" :key="c.id" :label="c.name" :value="c.id" />
                    </el-select>
                    <div class="choice-codelist-actions">
                      <el-button class="choice-codelist-icon-btn" size="small" circle type="primary" plain :icon="Plus" aria-label="新增字典" title="新增字典" @click="openQuickAddCodelist" />
                      <el-button class="choice-codelist-icon-btn" size="small" circle type="warning" plain :icon="EditPen" aria-label="编辑字典" title="编辑字典" :disabled="!editProp.codelist_id" @click="openQuickEditCodelist" />
                    </div>
                  </div>
                </el-form-item>
                <el-form-item v-if="['文本', '数值'].includes(editProp.field_type)" label="单位">
                  <div style="display:flex;gap:4px">
                    <el-select v-model="editProp.unit_id" clearable filterable style="flex:1" placeholder="请选择" :value-on-clear="null">
                      <el-option v-for="u in units" :key="u.id" :label="u.symbol" :value="u.id" />
                    </el-select>
                    <el-button class="choice-codelist-icon-btn" size="small" circle type="primary" plain :icon="Plus" aria-label="新增单位" title="新增单位" @click="showQuickAddUnit = true" />
                  </div>
                </el-form-item>
                <el-form-item v-if="isDefaultValueSupported(editProp.field_type, Boolean(editProp.inline_mark))" label="默认值/覆盖">
                  <template #label>
                    <el-tooltip :content="editProp.inline_mark ? '横向表格字段支持多行默认值。' : '仅支持非表格普通字段的单行覆盖值。'">
                      <span>默认值 <el-icon><InfoFilled /></el-icon></span>
                    </el-tooltip>
                  </template>
                  <el-input v-model="editProp.default_value" :type="editProp.inline_mark ? 'textarea' : 'text'" :rows="editProp.inline_mark ? 2 : undefined" :placeholder="editProp.inline_mark ? '请输入多行默认值' : '请输入单行覆盖值'" />
                </el-form-item>
                <el-form-item label="底纹颜色">
                  <div class="color-picker">
                    <div class="color-option color-option-default" :class="{'color-selected': !editProp.bg_color && !customBgColorInput}" @click="editProp.bg_color = null; customBgColorInput = ''">默认</div>
                    <div v-for="opt in BG_COLOR_OPTIONS.slice(1)" :key="opt.value" class="color-option" :class="{'color-selected': editProp.bg_color===opt.value && !customBgColorInput}" :style="{ background: '#' + opt.value }" @click="editProp.bg_color=opt.value; customBgColorInput = ''"></div>
                    <el-input v-model="customBgColorInput" placeholder="自定义HEX" size="small" style="width:90px;margin-left:4px" @input="applyCustomBgColor">
                      <template #prefix><span :style="customBgColorInput ? 'color:#' + customBgColorInput : ''">■</span></template>
                    </el-input>
                  </div>
                </el-form-item>
                <el-form-item label="文字颜色">
                  <div class="color-picker">
                    <div class="color-option color-option-default" :class="{'color-selected': !editProp.text_color && !customTextColorInput}" @click="editProp.text_color = null; customTextColorInput = ''">默认</div>
                    <div v-for="opt in TEXT_COLOR_OPTIONS" :key="opt.value" class="color-option" :class="{'color-selected': editProp.text_color===opt.value && !customTextColorInput}" :style="{ background: '#' + opt.value }" @click="editProp.text_color=opt.value; customTextColorInput = ''"></div>
                    <el-input v-model="customTextColorInput" placeholder="自定义HEX" size="small" style="width:90px;margin-left:4px" @input="applyCustomTextColor">
                      <template #prefix><span :style="customTextColorInput ? 'color:#' + customTextColorInput : ''">■</span></template>
                    </el-input>
                  </div>
                </el-form-item>
              </el-form>
            </div>
          </div>
          <div class="designer-notes-card">
            <div class="designer-section-title">设计备注</div>
            <div class="designer-notes-editor"><el-input v-model="formDesignNotes" type="textarea" :autosize="false" class="designer-notes-input" @input="onNotesInput" /></div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 各类弹窗 -->
    <el-dialog v-model="showAddForm" title="新建表单" width="360px"><el-form label-width="80px"><el-form-item label="Code"><el-input v-model="newFormCode" /></el-form-item><el-form-item label="名称"><el-input v-model="newFormName" /></el-form-item></el-form><template #footer><el-button @click="showAddForm=false">取消</el-button><el-button type="primary" @click="addForm">确定</el-button></template></el-dialog>
    <el-dialog v-model="showEditForm" title="编辑表单" width="360px"><el-form label-width="80px"><el-form-item label="Code"><el-input v-model="editFormCode" /></el-form-item><el-form-item label="名称"><el-input v-model="editFormName" /></el-form-item></el-form><template #footer><el-button @click="showEditForm=false">取消</el-button><el-button type="primary" @click="updateForm">确定</el-button></template></el-dialog>

    <el-dialog v-model="showQuickEdit" title="快速编辑字段" width="480px" append-to-body>
      <el-form :model="quickEditProp" label-width="80px" size="small">
        <el-form-item label="变量标签"><el-input v-model="quickEditProp.label" :type="quickEditProp.field_type === '标签' ? 'textarea' : 'text'" :autosize="quickEditProp.field_type === '标签' ? { minRows: 2, maxRows: 4 } : undefined" /></el-form-item>
        <el-form-item v-if="quickEditField?.field_definition" label="字段类型"><el-input :model-value="quickEditField.field_definition.field_type" disabled /></el-form-item>
        <template v-if="quickEditField?.field_definition?.field_type === '数值'">
          <el-form-item label="整数位数"><el-input :model-value="quickEditField.field_definition.integer_digits" disabled /></el-form-item>
          <el-form-item label="小数位数"><el-input :model-value="quickEditField.field_definition.decimal_digits" disabled /></el-form-item>
        </template>
        <el-form-item v-if="['日期','日期时间','时间'].includes(quickEditField?.field_definition?.field_type)" label="日期格式"><el-input :model-value="quickEditField.field_definition.date_format" disabled /></el-form-item>
        <el-form-item v-if="quickEditField?.field_definition?.codelist" label="选项字典"><el-input :model-value="quickEditField.field_definition.codelist.name" disabled /></el-form-item>
        <el-form-item v-if="quickEditField?.field_definition?.unit" label="单位"><el-input :model-value="quickEditField.field_definition.unit.symbol" disabled /></el-form-item>
        <el-form-item v-if="isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark))" label="默认值"><el-input v-model="quickEditProp.default_value" :type="quickEditProp.inline_mark ? 'textarea' : 'text'" :autosize="quickEditProp.inline_mark ? { minRows: 1, maxRows: 3 } : undefined" /></el-form-item>
        <el-form-item label="底纹颜色"><div class="color-picker"><div class="color-option color-option-default" :class="{'color-selected': !quickEditProp.bg_color}" @click="quickEditProp.bg_color = null">默认</div><div v-for="opt in BG_COLOR_OPTIONS.slice(1)" :key="opt.value" class="color-option" :class="{'color-selected': quickEditProp.bg_color === opt.value}" :style="{ background: '#' + opt.value }" @click="quickEditProp.bg_color = opt.value"></div></div></el-form-item>
        <el-form-item label="文字颜色"><div class="color-picker"><div class="color-option color-option-default" :class="{'color-selected': !quickEditProp.text_color}" @click="quickEditProp.text_color = null">默认</div><div v-for="opt in TEXT_COLOR_OPTIONS" :key="opt.value" class="color-option" :class="{'color-selected': quickEditProp.text_color === opt.value}" :style="{ background: '#' + opt.value }" @click="quickEditProp.text_color = opt.value"></div></div></el-form-item>
        <el-form-item label="布局" v-if="quickEditProp.field_type !== '标签' && quickEditProp.field_type !== '日志行'"><el-checkbox v-model="quickEditProp.inline_mark">横向显示</el-checkbox></el-form-item>
      </el-form>
      <template #footer><el-button @click="showQuickEdit = false">取消</el-button><el-button type="primary" @click="saveQuickEdit">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="showQuickAddCodelist" title="新增选项" width="560px" :close-on-click-modal="false" :close-on-press-escape="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="quickCodelistName" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="quickCodelistDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" /></el-form-item>
      </el-form>
      <el-table :data="quickCodelistOpts" size="small" border>
        <el-table-column prop="code" label="编码" width="120">
          <template #default="{ row }"><el-input v-model="row.code" size="small" /></template>
        </el-table-column>
        <el-table-column prop="decode" label="标签">
          <template #default="{ row }"><el-input v-model="row.decode" size="small" /></template>
        </el-table-column>
        <el-table-column label="后加下划线" width="110" align="center">
          <template #default="{ row }"><el-checkbox :model-value="row.trailing_underscore === 1" @change="() => toggleTrailingLine(row)" /></template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }"><el-button type="danger" size="small" link @click="quickDelOptRow($index)">删除</el-button></template>
        </el-table-column>
      </el-table>
      <div style="margin-top:8px;display:flex;gap:6px">
        <el-input v-model="quickOptCode" size="small" style="width:100px" />
        <el-input v-model="quickOptDecode" size="small" style="flex:1" />
        <el-button size="small" @click="quickAddOptRow">添加</el-button>
      </div>
      <template #footer><el-button :disabled="quickAddCodelistSaving" @click="closeQuickAddCodelist">取消</el-button><el-button type="primary" :loading="quickAddCodelistSaving" :disabled="quickAddCodelistSaving" @click="quickAddCodelist">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="showQuickEditCodelist" title="编辑选项字典" width="560px" :close-on-click-modal="false" :close-on-press-escape="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="quickEditCodelistName" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="quickEditCodelistDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" /></el-form-item>
      </el-form>
      <el-table :data="quickEditCodelistOpts" size="small" border>
        <el-table-column prop="code" label="编码" width="120">
          <template #default="{ row }"><el-input v-model="row.code" size="small" /></template>
        </el-table-column>
        <el-table-column prop="decode" label="标签">
          <template #default="{ row }"><el-input v-model="row.decode" size="small" /></template>
        </el-table-column>
        <el-table-column label="后加下划线" width="110" align="center">
          <template #default="{ row }"><el-checkbox :model-value="row.trailing_underscore === 1" @change="() => toggleTrailingLine(row)" /></template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }"><el-button type="danger" size="small" link @click="quickEditDelOptRow($index)">删除</el-button></template>
        </el-table-column>
      </el-table>
      <div style="margin-top:8px;display:flex;gap:6px">
        <el-input v-model="quickEditOptCode" size="small" style="width:100px" />
        <el-input v-model="quickEditOptDecode" size="small" style="flex:1" />
        <el-button size="small" @click="quickEditAddOptRow">添加</el-button>
      </div>
      <template #footer><el-button :disabled="quickEditCodelistSaving" @click="closeQuickEditCodelist">取消</el-button><el-button type="primary" :loading="quickEditCodelistSaving" :disabled="quickEditCodelistSaving" @click="quickSaveCodelist">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="showQuickAddUnit" title="新增单位" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="符号"><el-input v-model="quickUnitSymbol" placeholder="单位符号，如 kg" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showQuickAddUnit = false">取消</el-button><el-button type="primary" @click="quickAddUnit">确定</el-button></template>
    </el-dialog>
  </div>
</template>

<style>
.designer-dialog .el-dialog__body {
  padding: 0;
  height: calc(100vh - 54px);
  overflow: hidden;
}
</style>

<style scoped>
.form-designer { display: flex; gap: 16px; height: 100%; }
.fd-formlist { flex: 1 1 0; width: auto; min-width: 0; display: flex; flex-direction: column; }
.fd-right { flex: 2 1 0; width: auto; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.fd-canvas { display: flex; flex-direction: column; overflow: hidden; }
.fd-canvas-header { padding: 8px 12px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 8px; }
.fd-canvas-list { flex: 1; overflow-y: auto; padding: 8px; }
.ff-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var(--color-border); margin-bottom: 2px; background: var(--color-bg-card); cursor: pointer; }
.ff-item.ff-selected { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.drag-handle { cursor: move; color: #ccc; }
.ff-label { flex: 1; font-size: 13px; }
.fd-library { border: 1px solid var(--color-border); display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
.fd-library-header { padding: 8px; background: var(--color-bg-hover); font-weight: bold; font-size: 13px; }
.fd-library-list { flex: 1; min-height: 0; overflow-y: auto; }
.fd-item { padding: 6px 10px; border-bottom: 1px solid var(--color-border); cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.fd-item:hover { background: var(--color-bg-hover); }
.fd-panel-resizer { width: 4px; cursor: col-resize; background: transparent; transition: background 0.2s; }
.fd-panel-resizer:hover { background: var(--color-primary-subtle); }
.choice-codelist-row { display: flex; align-items: center; gap: 4px; width: 100%; }
.choice-codelist-select { flex: 1; min-width: 0; }
.choice-codelist-actions { display: flex; gap: 2px; flex-shrink: 0; }
.choice-codelist-actions :deep(.el-button + .el-button) { margin-left: 0; }
.choice-codelist-actions :deep(.choice-codelist-icon-btn) { width: 28px; height: 28px; padding: 0; }
.color-picker { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.color-option { width: 20px; height: 20px; border-radius: 2px; cursor: pointer; border: 1px solid #eee; }
.color-option-default { width: auto; min-width: 36px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--color-text-secondary); background: var(--color-bg-card); border-style: dashed; }
.color-option.color-selected { border: 2px solid var(--color-primary); }

.designer-shell {
  display: grid;
  grid-template-columns: auto 4px minmax(320px, 1fr) 460px;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-body);
}

.designer-library-pane {
  min-width: 220px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: none;
  border-right: 1px solid var(--color-border);
  border-radius: 0;
}

.designer-pane-toolbar {
  padding: 4px 6px;
  border-bottom: 1px solid var(--color-border);
}

.designer-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 8px;
  padding: 8px;
}

.designer-workspace-top,
.designer-workspace-bottom {
  min-height: 0;
}

.designer-workspace-bottom {
  display: flex;
  overflow: hidden;
}

.designer-workspace-top {
  padding: 0;
}

.designer-fields-panel {
  height: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
}

.designer-field-list {
  padding: 4px;
}

.designer-side-pane {
  min-width: 460px;
  max-width: 460px;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(180px, 1fr);
  gap: 8px;
  padding: 8px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-hover);
}

.designer-editor-card,
.designer-notes-card,
.designer-preview-pane,
.designer-preview-viewport {
  min-height: 0;
}

.designer-editor-card,
.designer-notes-card {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.designer-section-title {
  padding: 8px 12px;
  background: var(--color-bg-hover);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: bold;
}

.designer-empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.designer-editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.designer-notes-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 6px;
}

.designer-notes-input {
  flex: 1;
}

.designer-notes-input :deep(.el-textarea),
.designer-notes-input :deep(.el-textarea__inner) {
  height: 100%;
}

.designer-notes-input :deep(.el-textarea__inner) {
  resize: none;
}

.designer-preview-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.designer-preview-viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0;
}

.designer-preview-stage {
  width: 100%;
  min-height: 100%;
}

.designer-preview-page {
  position: static;
  width: 100%;
  min-height: 100%;
  transform: none;
}

.designer-scaled-word-page {
  width: 100%;
  max-width: none;
  min-height: 100%;
  margin: 0;
  box-sizing: border-box;
}

.designer-scaled-word-page.landscape {
  width: 100%;
}

/* 预览表格列宽拖拽（R5） */
.col-resize-host {
  position: relative;
  margin-bottom: 4px;
}
/* 必须用 !important 压过 main.css 的 .word-page .inline-table { table-layout: auto } */
.col-resize-host > table,
.col-resize-host > table.inline-table {
  width: 100% !important;
  table-layout: fixed !important;
  margin: 0;
}
.resizer-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  transform: translateX(-5px);
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}
.resizer-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  background: color-mix(in srgb, var(--color-text-secondary) 28%, transparent);
  pointer-events: none;
  transition: background 0.15s;
}
.resizer-handle:hover::after,
.resizer-handle:active::after {
  background: var(--color-primary);
}
.snap-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-primary);
  pointer-events: none;
  z-index: 1;
}
.unified-table-host { cursor: default; }
</style>
