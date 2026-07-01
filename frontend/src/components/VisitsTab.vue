<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode } from '../composables/useApi'
import { useSortableTable } from '../composables/useSortableTable'
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit'
import { rankFuzzyMatches } from '../composables/searchRanking'
import {
  ANNOTATION_FORM_KEY,
  ANNOTATION_KIND_FIELD,
  ANNOTATION_KIND_FORM,
  ANNOTATION_KIND_INLINE_HEADER,
  buildAnnotationStyle,
  hasAnnotationOverride,
  normalizeAnnotationPositions,
  readAnnotationDelta01Cm,
} from '../composables/acrfAnnotationGeometry'
import { useAcrfAnnotationDrag } from '../composables/useAcrfAnnotationDrag'
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldLabelPreviewStyle,
} from '../composables/formFieldPresentation'
import {
  buildTableInstanceId,
  useRowResize,
  getNormalRowKey,
  getInlineHeaderRowKey,
  getInlineDataRowKey,
  getUnifiedRegularRowKey,
  getUnifiedFullRowKey,
  getUnifiedInlineHeaderRowKey,
  getUnifiedInlineDataRowKey,
} from '../composables/useRowResize'
import {
  isDefaultValueSupported,
  normalizeDefaultValue,
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
  renderCtrl,
  renderCtrlHtml,
  toHtml,
  computeFillLineCharCount,
} from '../composables/useCRFRenderer'
import { shouldUseLandscapePreview, resolveNormalTableAvailableCm, resolveInlineTableAvailableCm } from '../composables/visitPreviewLandscape'
import { buildPreviewGroupViewModels } from '../composables/formDesignerPreviewModel'
import { confirmDelete } from '../composables/projectDeleteConfirmation'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))
const VIEW_MODE_STORAGE_KEY = 'crf_view_mode'

function normalizeStoredViewMode(value) {
  return value === 'aCRF' ? 'aCRF' : 'eCRF'
}

function readStoredViewMode() {
  if (typeof window === 'undefined' || !window.localStorage) return 'eCRF'
  try {
    return normalizeStoredViewMode(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY))
  } catch {
    return 'eCRF'
  }
}

function writeStoredViewMode(mode) {
  const normalizedMode = normalizeStoredViewMode(mode)
  if (typeof window === 'undefined' || !window.localStorage) return normalizedMode
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, normalizedMode)
  } catch {
    /* ignore localStorage errors */
  }
  return normalizedMode
}

function resolveInitialViewMode(isEditModeEnabled, storedValue) {
  if (!isEditModeEnabled) return 'eCRF'
  return normalizeStoredViewMode(storedValue)
}

function getFieldOidAnnotationText(formField) {
  const value = String(formField?.field_definition?.variable_name ?? '').trim()
  return value || ''
}

function getFormDomainAnnotationText(formState) {
  const value = String(formState?.domain ?? '').trim()
  return value || ''
}

const visits = ref([])
const searchVisit = ref('')
const filteredVisits = computed(() =>
  rankFuzzyMatches(visits.value, searchVisit.value, (item) => Object.values(item))
)
const matrixData = ref(null)
// 所有表单列表（用于右侧面板添加表单）
const allForms = ref([])
const form = reactive({ name: '', code: '', sequence: null })
const showAdd = ref(false)
// 预览弹窗
const showPreview = ref(false)
// 表单内容预览弹窗
const showFormPreview = ref(false)
const viewMode = ref(resolveInitialViewMode(editMode.value, readStoredViewMode()))
const formPreviewTitle = ref('')
const formPreviewDesignNotes = ref('')
const formPreviewFields = ref([])
const formPreviewPaperOrientation = ref('auto')
const formPreviewFormId = ref(null)
const formPreviewForm = ref(null)
const formPreviewLoading = ref(false)
const formPreviewError = ref('')
let formPreviewRequestSeq = 0
const previewRowResizerCache = new Map()

writeStoredViewMode(viewMode.value)

// 计算属性：设计备注预览内容
const hasPreviewNotes = computed(() => Boolean(formPreviewDesignNotes.value.trim()))
const previewDesignNotesHtml = computed(() => (
  hasPreviewNotes.value ? escapePreviewText(formPreviewDesignNotes.value) : ''
))
// 当前选中的访视（右侧面板）
const selectedVisit = ref(null)

async function load() {
  visits.value = await api.cachedGet(`/api/projects/${props.projectId}/visits`)
  matrixData.value = await api.cachedGet(`/api/projects/${props.projectId}/visit-form-matrix`)
  allForms.value = await api.cachedGet(`/api/projects/${props.projectId}/forms`)
  // 刷新后按 id 重建选中引用，避免旧对象引用失配
  if (selectedVisit.value) {
    selectedVisit.value = visits.value.find(v => v.id === selectedVisit.value.id) || null
  }
  if (formPreviewForm.value?.id != null) {
    const refreshedPreviewForm = allForms.value.find(item => item.id === formPreviewForm.value.id)
    if (refreshedPreviewForm) {
      formPreviewForm.value = { ...formPreviewForm.value, ...refreshedPreviewForm }
      formPreviewTitle.value = refreshedPreviewForm.name || formPreviewTitle.value
      formPreviewDesignNotes.value = refreshedPreviewForm.design_notes || ''
      formPreviewPaperOrientation.value = refreshedPreviewForm.paper_orientation || 'auto'
    }
  }
  syncVisitForms()
}
onMounted(async () => { await load(); nextTick(() => initVisitsSortable()) })
onBeforeUnmount(() => {
  void annotationDrag.dispose()
})
watch(
  () => props.projectId,
  async (newProjectId, previousProjectId) => {
    if (newProjectId === previousProjectId) return
    selectedVisit.value = null
    await flushAnnotationPositionSave({ cancelActiveDrag: true })
    showFormPreview.value = false
    resetFormPreviewState({ skipAnnotationCleanup: true })
    await load()
  },
)
watch(refreshKey, load)
watch(selectedVisit, syncVisitForms)
watch(viewMode, (nextMode) => {
  const normalizedMode = resolveInitialViewMode(editMode.value, nextMode)
  if (normalizedMode !== nextMode) {
    viewMode.value = normalizedMode
    return
  }
  writeStoredViewMode(normalizedMode)
})
watch(editMode, (enabled) => {
  const normalizedMode = resolveInitialViewMode(enabled, viewMode.value)
  if (normalizedMode !== viewMode.value) {
    viewMode.value = normalizedMode
    return
  }
  writeStoredViewMode(normalizedMode)
})

// 拖拽排序
const visitsTableRef = ref(null)
const isFiltered = computed(() => searchVisit.value.trim().length > 0)
const reorderUrl = computed(() => `/api/projects/${props.projectId}/visits/reorder`)
async function reloadVisits() {
  api.invalidateCache(`/api/projects/${props.projectId}/visits`)
  await load()
}
const { initSortable: initVisitsSortable } = useSortableTable(visitsTableRef, visits, reorderUrl, {
  reloadFn: reloadVisits,
  isFiltered,
})
function applyVisits(nextVisits) {
  const selectedVisitId = selectedVisit.value?.id ?? null
  visits.value = nextVisits
  if (selectedVisitId != null) {
    selectedVisit.value = nextVisits.find((item) => item.id === selectedVisitId) || null
  }
}
const {
  editingId: editingVisitId,
  editingValue: editingVisitOrdinal,
  inputRef: visitOrdinalInputRef,
  startEdit: startVisitOrdinalEdit,
  commitEdit: commitVisitOrdinalEdit,
  cancelEdit: cancelVisitOrdinalEdit,
} = useOrdinalQuickEdit(visits, reorderUrl, {
  applyList: applyVisits,
  isFiltered,
  orderKey: 'sequence',
  reloadFn: reloadVisits,
  renderList: filteredVisits,
})

// 当前访视已关联的表单列表（带 sequence）
const visitForms = ref([])
const visitFormsTableRef = ref(null)

function syncVisitForms() {
  if (!selectedVisit.value || !matrixData.value) {
    visitForms.value = []
    return
  }
  const m = matrixData.value.matrix[selectedVisit.value.id] || {}
  visitForms.value = matrixData.value.forms
    .filter(f => m[f.id] != null)
    .map(f => ({ ...f, sequence: m[f.id] }))
    .sort((a, b) => a.sequence - b.sequence)
}

// 当前访视未关联的表单列表（供添加用）
const availableForms = computed(() => {
  if (!selectedVisit.value || !matrixData.value) return []
  const m = matrixData.value.matrix[selectedVisit.value.id] || {}
  return allForms.value.filter(f => m[f.id] == null)
})

async function reloadVisitForms() {
  matrixData.value = await api.get(`/api/projects/${props.projectId}/visit-form-matrix`)
  syncVisitForms()
}

async function add() {
  try {
    await api.post(`/api/projects/${props.projectId}/visits`, { ...form })
    showAdd.value = false; form.name = ''; form.code = ''; load()
  } catch (e) { ElMessage.error(e.message) }
}

async function del(v) {
  try {
    await ElMessageBox.confirm(`删除访视 "${v.name}"？`, '确认', { type: 'warning' })
    await api.del(`/api/visits/${v.id}`)
    api.invalidateCache(`/api/projects/${props.projectId}`)
    if (selectedVisit.value?.id === v.id) selectedVisit.value = null
    load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selVisits = ref([])
async function batchDelVisits() {
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${selVisits.value.length} 个访视？`, '批量删除', { type: 'warning' })
    const delIds = new Set(selVisits.value.map(v => v.id))
    await api.post(`/api/projects/${props.projectId}/visits/batch-delete`, { ids: [...delIds] })
    if (selectedVisit.value && delIds.has(selectedVisit.value.id)) selectedVisit.value = null
    selVisits.value = []; load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function copyVisit(v) {
  try {
    await api.post(`/api/visits/${v.id}/copy`, {})
    api.invalidateCache(`/api/projects/${props.projectId}`)
    load(); ElMessage.success('复制成功')
  }
  catch (e) { ElMessage.error(e.message) }
}

const showEdit = ref(false)
const editForm = reactive({ name: '', code: '', sequence: 1 })
const editTarget = ref(null)

function openEdit(v) {
  Object.assign(editForm, { name: v.name, code: v.code || '', sequence: v.sequence })
  editTarget.value = v; showEdit.value = true
}

async function update() {
  try {
    await api.put(`/api/projects/${props.projectId}/visits/${editTarget.value.id}`, { ...editForm })
    showEdit.value = false; load()
  } catch (e) { ElMessage.error(e.message) }
}

function openAdd() {
  form.code = genCode('VISIT')
  showAdd.value = true
}

// 添加表单到访视
const addFormId = ref(null)
async function addFormToVisit() {
  if (!addFormId.value || !selectedVisit.value) return
  try {
    await api.post(`/api/visits/${selectedVisit.value.id}/forms/${addFormId.value}`, {})
    addFormId.value = null
    await reloadVisitForms()
  } catch (e) { ElMessage.error(e.message || '添加失败') }
}

// 从访视移除表单
async function removeFormFromVisit(formId) {
  if (!selectedVisit.value) return
  const form = visitForms.value.find(item => item.id === formId)
  try {
    await confirmDelete(ElMessageBox.confirm, { targetText: `访视中的表单 "${form?.name || formId}"` })
    await api.del(`/api/visits/${selectedVisit.value.id}/forms/${formId}`)
    await reloadVisitForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

function toRendererField(fd) {
  if (!fd) return null
  return {
    field_type: fd.field_type,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  }
}

function escapePreviewText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function getScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type
  const inlineMark = Boolean(ff?.inline_mark)
  if (!fieldType || !ff?.default_value) return ''
  if (!isDefaultValueSupported(fieldType, inlineMark)) return ''
  return normalizeDefaultValue(ff.default_value, singleLine)
}

// 复用 useCRFRenderer 的安全渲染逻辑，避免 VisitsTab 再实现一套 HTML 拼接
function renderCellHtml(ff, fillLineChars = null, columnCm = null) {
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const fd = ff.field_definition
  const field = toRendererField(fd)
  const defaultValue = getScopedDefaultValue(ff, true)
  if (defaultValue) {
    return escapePreviewText(defaultValue)
  }
  return renderCtrlHtml(field, fillLineChars, columnCm)
}

function getInlineRows(fields, fillCharsByCol = null, columnCmsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null
    const columnCm = columnCmsByCol ? (columnCmsByCol[i] ?? null) : null
    const defaultValue = getScopedDefaultValue(ff)
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: toHtml(renderCtrl(toRendererField(ff.field_definition), fillChars, columnCm)),
      }
    }
    // 选项类用结构化渲染（renderCtrlHtml→renderChoiceHtml 产出 .choice-atom），纵向尾线按 flex 填满剩余宽、不溢出；
    // 非选项类等价于 toHtml(renderCtrl(...))。与 TemplatePreviewDialog 保持一致。
    const ctrl = renderCtrlHtml(toRendererField(ff.field_definition), fillChars, columnCm)
    return { lines: [ctrl], repeat: true, fallback: ctrl }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))
  )
}

// inline 整格文本填写线：每列按规划宽度自适应根数，与后端 _add_inline_table 共享公式。
function getInlineColumnCms(fields) {
  const fractions = planInlineColumnFractions(fields)
  const availableCm = resolveInlineTableAvailableCm(
    previewRenderGroups.value,
    { type: 'inline', fields },
    formPreviewPaperOrientation.value,
  )
  return fractions.map(f => f * availableCm)
}

function getInlineFillChars(fields) {
  return getInlineColumnCms(fields).map(columnCm => computeFillLineCharCount(columnCm))
}

function readPersistedColRatios(kind, fields) {
  const formId = formPreviewFormId.value
  if (!formId || !fields.length) return null
  const fieldIds = fields.map(f => f.id).filter(id => id != null).join(',')
  if (!fieldIds) return null
  const key = `crf:designer:col-widths:${formId}:${kind}:fieldIds=${fieldIds}`
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    if (!parsed.every(r => Number.isFinite(r) && r > 0 && r < 1)) return null
    const sum = parsed.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 1) > 0.02) return null
    return parsed
  } catch {
    return null
  }
}

// inline 表：优先读设计器持久化的列宽；缺失则用 planInlineColumnFractions 出与导出一致的内容驱动默认；
// planner 异常时回退到等宽。返回值始终是一个长度等于 fields.length 的数组，模板可以直接迭代。
function resolveInlineColRatios(fields) {
  if (!fields || !fields.length) return []
  const persisted = readPersistedColRatios('inline', fields)
  if (persisted && persisted.length === fields.length) return persisted
  const planned = planInlineColumnFractions(fields)
  if (planned.length === fields.length) return planned
  return Array.from({ length: fields.length }, () => 1 / fields.length)
}

// normal 表：固定两列（label / control），同样优先持久化、缺失走 planNormalColumnFractions、兜底 50/50。
function resolveNormalColRatios(fields) {
  if (!fields || !fields.length) return [0.5, 0.5]
  const persisted = readPersistedColRatios('normal', fields)
  if (persisted && persisted.length === 2) return persisted
  const planned = planNormalColumnFractions(fields)
  if (planned.length === 2) return planned
  return [0.5, 0.5]
}

function mergeFormIntoState(updatedForm) {
  if (!updatedForm?.id) return null
  const currentForm =
    allForms.value.find(item => item.id === updatedForm.id) ||
    visitForms.value.find(item => item.id === updatedForm.id) ||
    matrixData.value?.forms?.find(item => item.id === updatedForm.id) ||
    (formPreviewForm.value?.id === updatedForm.id ? formPreviewForm.value : null) ||
    {}
  const nextForm = { ...currentForm, ...updatedForm }
  if (allForms.value.some(item => item.id === updatedForm.id)) {
    allForms.value = allForms.value.map(item => item.id === updatedForm.id ? { ...item, ...updatedForm } : item)
  } else {
    allForms.value = [...allForms.value, nextForm]
  }
  if (visitForms.value.some(item => item.id === updatedForm.id)) {
    // visitForms 携带 visit_form 关系字段（如 sequence），必须以自身对象为 base 合并，
    // 不能用 allForms 派生的 nextForm 覆盖，否则右侧访视表单列表序号会丢失。
    visitForms.value = visitForms.value.map(item => item.id === updatedForm.id ? { ...item, ...updatedForm } : item)
  }
  if (matrixData.value?.forms?.some(item => item.id === updatedForm.id)) {
    matrixData.value = {
      ...matrixData.value,
      forms: matrixData.value.forms.map(item => item.id === updatedForm.id ? { ...item, ...updatedForm } : item),
    }
  }
  if (formPreviewForm.value?.id === updatedForm.id) {
    formPreviewForm.value = nextForm
  }
  return nextForm
}

function getFormStateById(formId = formPreviewFormId.value ?? null) {
  if (formId == null) return null
  if (formPreviewForm.value?.id === formId) return formPreviewForm.value
  return (
    allForms.value.find(item => item.id === formId) ||
    visitForms.value.find(item => item.id === formId) ||
    matrixData.value?.forms?.find(item => item.id === formId) ||
    null
  )
}

function getFormAnnotationPositions(formId = formPreviewFormId.value ?? null) {
  return normalizeAnnotationPositions(getFormStateById(formId)?.annotation_positions)
}

function applyFormAnnotationPositions(formId, annotationPositions) {
  if (formId == null) return
  const normalized = normalizeAnnotationPositions(annotationPositions)
  mergeFormIntoState({
    id: formId,
    annotation_positions: Object.keys(normalized).length > 0 ? normalized : null,
  })
}

const showAcrfAnnotations = computed(() => editMode.value && viewMode.value === 'aCRF')

const annotationDrag = useAcrfAnnotationDrag({
  apiClient: api,
  getCurrentPositions: (formId) => getFormAnnotationPositions(formId),
  applyOptimisticPositions: (formId, annotationPositions) => applyFormAnnotationPositions(formId, annotationPositions),
  onPersisted: (updatedForm) => {
    mergeFormIntoState(updatedForm)
  },
  onError: (error, snapshot) => {
    ElMessage.error(`aCRF 标注位置保存失败：${error.message}`)
    if (snapshot?.projectId != null) {
      api.invalidateCache(`/api/projects/${snapshot.projectId}/forms`)
    }
    if (snapshot?.formId != null) {
      api.invalidateCache(`/api/forms/${snapshot.formId}/fields`)
    }
    void load()
  },
})

function getFieldAnnotationTarget(formField) {
  const key = getFieldOidAnnotationText(formField)
  if (!key || formPreviewFormId.value == null) return null
  return {
    formId: formPreviewFormId.value,
    projectId: props.projectId,
    key,
  }
}

function getFormAnnotationTarget(formState) {
  const text = getFormDomainAnnotationText(formState)
  if (!text || formState?.id == null) return null
  return {
    formId: formState.id,
    projectId: props.projectId,
    key: ANNOTATION_FORM_KEY,
  }
}

function isAnnotationDraggable(target) {
  return Boolean(showAcrfAnnotations.value && target?.formId != null && target?.key)
}

function hasAnnotationOverrideForTarget(target) {
  return Boolean(target?.key && hasAnnotationOverride(getFormAnnotationPositions(target.formId), target.key))
}

function getAnnotationStyle(text, kind, target) {
  return buildAnnotationStyle({
    text,
    kind,
    deltaY01cm: readAnnotationDelta01Cm(getFormAnnotationPositions(target?.formId), target?.key),
  })
}

function onAnnotationPointerDown(target, event) {
  if (!isAnnotationDraggable(target)) return
  annotationDrag.onAnnotationPointerDown(target, event)
}

function resetAnnotationPosition(target) {
  if (!target) return
  annotationDrag.resetAnnotationPosition(target)
}

async function flushAnnotationPositionSave(options = {}) {
  return annotationDrag.flushPending(options)
}

function computeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1)
  const base = Math.floor(N / M)
  const extra = N % M
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0))
}

function computeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)))
  return { labelSpan, valueSpan: N - labelSpan }
}

function getPreviewColumnFractions(group) {
  if (group.type === 'unified') {
    const colCount = group.colCount
    const shared = readPersistedColRatios('unified', group.fields)
    if (shared && shared.length === colCount) return shared
    const plannerFractions = planUnifiedColumnFractions(group.segments, colCount)
    return plannerFractions.length === colCount
      ? plannerFractions
      : Array.from({ length: colCount }, () => 1 / colCount)
  }
  if (group.type === 'normal') {
    return resolveNormalColRatios(group.fields)
  }
  const colCount = group.fields.length
  const inlineRatios = resolveInlineColRatios(group.fields)
  return inlineRatios.length === colCount
    ? inlineRatios
    : Array.from({ length: colCount }, () => 1 / colCount)
}

// normal 表 control 列宽（cm）：按整张表单 render groups + 纸张方向解析
// （显式 landscape 或 mixed_landscape → 23.36），与后端导出共享宽度选择。
function normalColumnCm(group, groupIndex) {
  if (group?.type !== 'normal') return null
  const controlFrac = getPreviewColumnFractions(group, groupIndex)?.[1]
  if (controlFrac == null) return null
  const availableCm = resolveNormalTableAvailableCm(
    previewRenderGroups.value,
    formPreviewPaperOrientation.value,
  )
  return controlFrac * availableCm
}

function normalFillChars(group, groupIndex) {
  const columnCm = normalColumnCm(group, groupIndex)
  return columnCm == null ? null : computeFillLineCharCount(columnCm)
}

function getPreviewRowResizer(group) {
  if (!formPreviewFormId.value || !group?.fields?.length) return null
  const tableInstanceId = buildTableInstanceId(group.type, group.fields)
  if (!previewRowResizerCache.has(tableInstanceId)) {
    previewRowResizerCache.set(
      tableInstanceId,
      useRowResize(formPreviewFormId, computed(() => tableInstanceId)),
    )
  }
  return previewRowResizerCache.get(tableInstanceId)
}

function getPreviewRowHeightStyle(group, rowKey) {
  return getPreviewRowResizer(group)?.getRowHeightStyle(rowKey) || null
}

const previewRenderGroups = computed(() => buildFormDesignerRenderGroups(formPreviewFields.value))

// 预览视图模型：把模板内按单元格反复调用的纯函数提前算好（segments / inlineRows /
// mergeSpans / labelValueSpans），模板只读属性，消除 inline 表 colspan 的 O(M²) 重建。
// 复用本组件内同名纯函数，保证渲染输出与原模板逐元素相等。
const previewModelHelpers = {
  buildSegments: buildFormDesignerUnifiedSegments,
  getInlineRows,
  getInlineFillChars,
  getInlineColumnCms,
  computeMergeSpans,
  computeLabelValueSpans,
}
const previewGroupsView = computed(() =>
  buildPreviewGroupViewModels(previewRenderGroups.value, previewModelHelpers),
)

const previewNeedsLandscape = computed(() =>
  shouldUseLandscapePreview(previewRenderGroups.value)
)
function resolvePreviewLandscape(orientation, autoFlag) {
  if (orientation === 'landscape') return true
  if (orientation === 'portrait') return false
  return autoFlag
}
const previewLandscapeMode = computed(() =>
  resolvePreviewLandscape(formPreviewPaperOrientation.value, previewNeedsLandscape.value),
)

async function openFormPreview(form) {
  const seq = ++formPreviewRequestSeq
  formPreviewTitle.value = form.name || '表单预览'
  formPreviewDesignNotes.value = form.design_notes || ''
  formPreviewPaperOrientation.value = form.paper_orientation || 'auto'
  formPreviewFormId.value = form.id
  formPreviewForm.value = { ...form }
  formPreviewError.value = ''
  formPreviewFields.value = []
  formPreviewLoading.value = true
  showFormPreview.value = true
  try {
    const data = await api.cachedGet('/api/forms/' + form.id + '/fields')
    if (seq !== formPreviewRequestSeq) return
    formPreviewFields.value = data
  } catch (e) {
    if (seq !== formPreviewRequestSeq) return
    formPreviewFields.value = []
    formPreviewError.value = '加载表单字段失败：' + (e.message || '未知错误')
    ElMessage.error(formPreviewError.value)
  } finally {
    if (seq === formPreviewRequestSeq) formPreviewLoading.value = false
  }
}

function resetFormPreviewState({ skipAnnotationCleanup = false } = {}) {
  if (!skipAnnotationCleanup) {
    annotationDrag.cancelActiveDrag()
    void flushAnnotationPositionSave()
  }
  formPreviewRequestSeq++
  formPreviewTitle.value = ''
  formPreviewDesignNotes.value = ''
  formPreviewLoading.value = false
  formPreviewError.value = ''
  formPreviewFields.value = []
  formPreviewPaperOrientation.value = 'auto'
  formPreviewFormId.value = null
  formPreviewForm.value = null
  previewRowResizerCache.clear()
}

// 更新访视中表单的 sequence
const visitFormReorderUrl = computed(() => selectedVisit.value ? `/api/visits/${selectedVisit.value.id}/forms/reorder` : '')
const { initSortable: initVisitFormsSortable } = useSortableTable(visitFormsTableRef, visitForms, visitFormReorderUrl, {
  reloadFn: reloadVisitForms,
})
function applyVisitForms(nextVisitForms) {
  visitForms.value = nextVisitForms
}
const {
  editingId: editingVisitFormId,
  editingValue: editingVisitFormOrdinal,
  inputRef: visitFormOrdinalInputRef,
  startEdit: startVisitFormOrdinalEdit,
  commitEdit: commitVisitFormOrdinalEdit,
  cancelEdit: cancelVisitFormOrdinalEdit,
} = useOrdinalQuickEdit(visitForms, visitFormReorderUrl, {
  applyList: applyVisitForms,
  orderKey: 'sequence',
  reloadFn: reloadVisitForms,
})
watch([selectedVisit, visitForms], () => {
  nextTick(() => initVisitFormsSortable())
})

// 预览弹窗中切换关联（矩阵单元格点击）
async function toggleCell(visitId, formId) {
  const m = matrixData.value?.matrix
  if (!m) return
  const has = m[visitId] && m[visitId][formId] != null
  try {
    if (has) {
      const visit = visits.value.find(item => item.id === visitId)
      const form = allForms.value.find(item => item.id === formId)
      await confirmDelete(ElMessageBox.confirm, { targetText: `访视 "${visit?.name || visitId}" 中的表单 "${form?.name || formId}"` })
      await api.del(`/api/visits/${visitId}/forms/${formId}`)
    } else await api.post(`/api/visits/${visitId}/forms/${formId}`, {})
    await reloadVisitForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}
</script>

<template>
  <div style="display:flex;gap:16px;height:calc(100vh - 160px)">
    <!-- 左侧：访视列表 -->
    <div style="width:50%;min-width:0;display:flex;flex-direction:column">
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <el-button type="primary" size="small" @click="openAdd">新增访视</el-button>
        <el-button type="danger" size="small" :disabled="!selVisits.length" @click="batchDelVisits">批量删除({{ selVisits.length }})</el-button>
        <el-button type="info" plain size="small" @click="showPreview = true">批量编辑</el-button>
        <el-input
          v-model="searchVisit"
          placeholder="搜索访视..."
          clearable
          size="small"
          style="width:180px"
        />
      </div>
      <el-table ref="visitsTableRef" :data="filteredVisits" size="small" border highlight-current-row row-key="id"
        @current-change="row => { if (row) selectedVisit = row }"
        @selection-change="r => selVisits = r" style="width:100%" height="100%">
        <el-table-column width="32" v-if="!isFiltered">
          <template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template>
        </el-table-column>
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }">
            <el-input-number
              v-if="editingVisitId === row.id"
              ref="visitOrdinalInputRef"
              v-model="editingVisitOrdinal"
              :min="1"
              :max="filteredVisits.length"
              :controls="false"
              size="small"
              style="width:80px"
              @click.stop
              @keyup.enter.stop="commitVisitOrdinalEdit"
              @keydown.esc.stop.prevent="cancelVisitOrdinalEdit"
              @blur="cancelVisitOrdinalEdit"
            />
            <button
              v-else
              type="button"
              style="border:none;background:transparent;padding:0;cursor:pointer"
              @click.stop
              @dblclick.stop="startVisitOrdinalEdit(row)"
            >
              <span class="ordinal-cell">{{ row.sequence }}</span>
            </button>
          </template>
        </el-table-column>
        <el-table-column v-if="editMode" prop="code" label="OID" min-width="110" show-overflow-tooltip />
        <el-table-column prop="name" label="访视名称" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click.stop="copyVisit(row)">复制</el-button>
            <el-button size="small" link @click.stop="openEdit(row)">编辑</el-button>
            <el-button type="danger" size="small" link @click.stop="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 右侧：访视表单列表 -->
    <div style="width:50%;min-width:0;display:flex;flex-direction:column" v-if="selectedVisit">
      <div style="margin-bottom:8px;flex-shrink:0;display:flex;align-items:center;gap:8px">
        <b>{{ selectedVisit.name }}</b>
        <span style="color:var(--color-text-muted);font-size:12px">关联表单 {{ visitForms.length }} 个</span>
      </div>
      <!-- 添加表单行 -->
      <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-shrink:0">
        <el-select v-model="addFormId" filterable clearable placeholder="选择要添加的表单" size="small" style="flex:1">
          <el-option v-for="f in availableForms" :key="f.id" :label="f.name + ' (' + f.code + ')'" :value="f.id" />
        </el-select>
        <el-button type="primary" size="small" :disabled="!addFormId" @click="addFormToVisit">添加</el-button>
      </div>
      <!-- 表单列表 -->
      <div style="flex:1;min-height:0">
        <el-table
          ref="visitFormsTableRef"
          :data="visitForms"
          size="small"
          border
          highlight-current-row
          row-key="id"
          style="width:100%"
          height="100%"
        >
          <el-table-column width="32">
            <template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template>
          </el-table-column>
          <el-table-column label="序号" width="100">
            <template #default="{ row }">
              <el-input-number
                v-if="editingVisitFormId === row.id"
                ref="visitFormOrdinalInputRef"
                v-model="editingVisitFormOrdinal"
                :min="1"
                :max="visitForms.length"
                :controls="false"
                size="small"
                style="width:80px"
                @click.stop
                @keyup.enter.stop="commitVisitFormOrdinalEdit"
                @keydown.esc.stop.prevent="cancelVisitFormOrdinalEdit"
                @blur="cancelVisitFormOrdinalEdit"
              />
              <button
                v-else
                type="button"
                style="border:none;background:transparent;padding:0;cursor:pointer"
                @click.stop
                @dblclick.stop="startVisitFormOrdinalEdit(row)"
              >
                <span class="ordinal-cell">{{ row.sequence }}</span>
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="表单名称" show-overflow-tooltip />
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" link @click.stop="openFormPreview(row)">预览</el-button>
              <el-button type="danger" size="small" link @click.stop="removeFormFromVisit(row.id)">移除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div style="color:var(--color-text-muted);font-size:13px;padding:20px;text-align:center">
              暂无关联表单，请在上方选择后点击添加
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <!-- 右侧：未选中访视时的提示 -->
    <div v-else style="width:50%;min-width:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:14px;border:1px dashed var(--color-border);border-radius:4px">
      ← 点击左侧访视行查看和编辑关联表单
    </div>

    <!-- 批量编辑弹窗（访视-表单矩阵） -->
    <el-dialog v-model="showPreview" width="92%" top="3vh" class="matrix-preview-dialog" :close-on-click-modal="false">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-right:32px">
          <span style="font-size:18px;font-weight:600;color:var(--el-text-color-primary)">访视表单矩阵</span>
          <span style="margin-left:auto;font-size:12px;color:var(--color-text-muted);line-height:1.5;text-align:right">
            点击单元格可切换关联，数字为表单在该访视中的序号
          </span>
        </div>
      </template>
      <template v-if="matrixData && matrixData.forms.length && matrixData.visits.length">
        <div style="overflow:auto;height:100%">
          <table class="matrix-table">
            <thead>
              <tr>
                <th style="min-width:40px">#</th>
                <th>表单 \ 访视</th>
                <th v-for="v in matrixData.visits" :key="v.id">{{ v.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, fIndex) in matrixData.forms" :key="f.id">
                <td style="text-align:center;color:var(--color-text-muted);font-size:11px">{{ fIndex + 1 }}</td>
                <td>{{ f.name }}</td>
                <td v-for="v in matrixData.visits" :key="v.id"
                  class="matrix-cell"
                  :class="{ checked: matrixData.matrix[v.id] && matrixData.matrix[v.id][f.id] != null }"
                  @click="toggleCell(v.id, f.id)">
                  {{ matrixData.matrix[v.id] && matrixData.matrix[v.id][f.id] != null ? matrixData.matrix[v.id][f.id] : '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else style="color:var(--color-text-muted);text-align:center;padding:40px">
        暂无数据，请先添加访视和表单
      </div>
    </el-dialog>

    <!-- 新增访视弹窗 -->
    <el-dialog v-model="showAdd" title="新增访视" width="360px" :close-on-click-modal="false">
      <el-form :model="form" label-width="80px">
        <el-form-item v-if="editMode" label="OID"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="访视名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="序号"><el-input-number v-model="form.sequence" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="add">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑访视弹窗 -->
    <el-dialog v-model="showEdit" title="编辑访视" width="360px" :close-on-click-modal="false">
      <el-form :model="editForm" label-width="80px">
        <el-form-item v-if="editMode" label="OID"><el-input v-model="editForm.code" /></el-form-item>
        <el-form-item label="访视名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="序号"><el-input-number v-model="editForm.sequence" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="update">确定</el-button>
      </template>
    </el-dialog>
  </div>
  <!-- 表单内容预览弹窗 -->
  <el-dialog v-model="showFormPreview" width="90%" style="max-width:1200px" top="5vh" :close-on-click-modal="false" @closed="resetFormPreviewState">
    <template #header>
      <div style="display:flex;align-items:center;gap:12px;padding-right:32px">
        <span style="font-size:16px;font-weight:bold">{{ formPreviewTitle }}</span>
        <el-switch
          v-if="editMode"
          v-model="viewMode"
          inline-prompt
          active-text="aCRF"
          inactive-text="eCRF"
          :active-value="'aCRF'"
          :inactive-value="'eCRF'"
        />
      </div>
    </template>
    <div v-if="formPreviewLoading" style="text-align:center;padding:40px">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中...
    </div>
    <el-alert v-else-if="formPreviewError" :title="formPreviewError" type="error" :closable="false" style="margin:12px 0" />
    <div v-else-if="!formPreviewFields.length" style="text-align:center;color:#999;padding:40px">
      暂无字段
    </div>
    <div v-else class="word-preview">
      <div :class="['word-page', { landscape: previewLandscapeMode, 'word-page--with-notes': hasPreviewNotes }]">
        <div class="wp-form-title-row">
          <div class="wp-form-title">{{ formPreviewTitle }}</div>
          <span
            v-if="showAcrfAnnotations && getFormDomainAnnotationText(formPreviewForm)"
            :class="[
              'wp-acrf-annotation',
              'wp-acrf-annotation--form',
              { 'wp-acrf-annotation--interactive': isAnnotationDraggable(getFormAnnotationTarget(formPreviewForm)) },
            ]"
            :style="
              getAnnotationStyle(
                getFormDomainAnnotationText(formPreviewForm),
                ANNOTATION_KIND_FORM,
                getFormAnnotationTarget(formPreviewForm),
              )
            "
            @pointerdown="(event) => onAnnotationPointerDown(getFormAnnotationTarget(formPreviewForm), event)"
          >
            <span class="wp-acrf-annotation__text">{{ getFormDomainAnnotationText(formPreviewForm) }}</span>
            <button
              type="button"
              class="wp-acrf-annotation-reset"
              :disabled="!hasAnnotationOverrideForTarget(getFormAnnotationTarget(formPreviewForm))"
              aria-label="重置表单标注位置"
              @pointerdown.stop
              @click.stop="resetAnnotationPosition(getFormAnnotationTarget(formPreviewForm))"
            >
              R
            </button>
          </span>
        </div>
        <div :class="['wp-body', { 'wp-body--with-notes': hasPreviewNotes }]">
          <div class="wp-main">
            <template v-for="(gv, gi) in previewGroupsView" :key="gi">
              <table v-if="gv.type === 'unified'" class="unified-table" style="width:100%;border-collapse:collapse">
                <colgroup>
                  <col v-for="(ratio, ci) in getPreviewColumnFractions(gv, gi)" :key="ci" :style="{ width: (ratio * 100) + '%' }">
                </colgroup>
                <template v-for="seg in gv.segments" :key="seg.fields[0]?.id">
                  <tr
                    v-if="seg.type === 'regular_field'"
                    :style="getPreviewRowHeightStyle(gv, getUnifiedRegularRowKey(seg.fields[0]))"
                  >
                    <td class="unified-label row-resize-anchor" :colspan="gv.labelValueSpans.labelSpan" :style="getFormFieldLabelPreviewStyle(seg.fields[0])">
                      {{ getFormFieldDisplayLabel(seg.fields[0]) }}
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedRegularRowKey(seg.fields[0]), e)"
                      ></span>
                    </td>
                    <td class="unified-value row-resize-anchor" :colspan="gv.labelValueSpans.valueSpan" :style="getFormFieldPreviewStyle(seg.fields[0])">
                      <span v-html="renderCellHtml(seg.fields[0])"></span>
                      <span
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                        :class="[
                          'wp-acrf-annotation',
                          'wp-acrf-annotation--field',
                          {
                            'wp-acrf-annotation--interactive': isAnnotationDraggable(
                              getFieldAnnotationTarget(seg.fields[0]),
                            ),
                          },
                        ]"
                        :style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(seg.fields[0]),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(seg.fields[0]),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)"
                      >
                        <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(seg.fields[0]) }}</span>
                        <button
                          type="button"
                          class="wp-acrf-annotation-reset"
                          :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                          aria-label="重置字段标注位置"
                          @pointerdown.stop
                          @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                        >
                          R
                        </button>
                      </span>
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedRegularRowKey(seg.fields[0]), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else-if="seg.type === 'full_row'"
                    :style="getPreviewRowHeightStyle(gv, getUnifiedFullRowKey(seg.fields[0]))"
                  >
                    <td
                      :class="{
                        'wp-structure-label--multiline': seg.fields[0].field_definition?.field_type === '标签',
                        'row-resize-anchor': true,
                      }"
                      :colspan="gv.colCount"
                      :style="getFormFieldLabelPreviewStyle(seg.fields[0], { structure: true })"
                    >
                      {{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}
                      <span
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                        :class="[
                          'wp-acrf-annotation',
                          'wp-acrf-annotation--field',
                          {
                            'wp-acrf-annotation--interactive': isAnnotationDraggable(
                              getFieldAnnotationTarget(seg.fields[0]),
                            ),
                          },
                        ]"
                        :style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(seg.fields[0]),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(seg.fields[0]),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)"
                      >
                        <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(seg.fields[0]) }}</span>
                        <button
                          type="button"
                          class="wp-acrf-annotation-reset"
                          :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                          aria-label="重置字段标注位置"
                          @pointerdown.stop
                          @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                        >
                          R
                        </button>
                      </span>
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedFullRowKey(seg.fields[0]), e)"
                      ></span>
                    </td>
                  </tr>
                  <template v-else-if="seg.type === 'inline_block'">
                    <tr :style="getPreviewRowHeightStyle(gv, getUnifiedInlineHeaderRowKey(seg.fields))">
                      <td
                        v-for="(ff, idx) in seg.fields"
                        :key="ff.id"
                        class="wp-inline-header row-resize-anchor"
                        :colspan="seg.mergeSpans[idx]"
                        :style="getFormFieldLabelPreviewStyle(ff)"
                      >
                        {{ getFormFieldDisplayLabel(ff) }}
                        <span
                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                          :class="[
                            'wp-acrf-annotation',
                            'wp-acrf-annotation--field',
                            'wp-acrf-annotation--inline-header',
                            {
                              'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                getFieldAnnotationTarget(ff),
                              ),
                            },
                          ]"
                          :style="
                            getAnnotationStyle(
                              getFieldOidAnnotationText(ff),
                              ANNOTATION_KIND_INLINE_HEADER,
                              getFieldAnnotationTarget(ff),
                            )
                          "
                          @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        >
                          <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                          <button
                            type="button"
                            class="wp-acrf-annotation-reset"
                            :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                            aria-label="重置字段标注位置"
                            @pointerdown.stop
                            @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                          >
                            R
                          </button>
                        </span>
                        <span
                          class="row-resizer-handle"
                          @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedInlineHeaderRowKey(seg.fields), e)"
                        ></span>
                      </td>
                    </tr>
                    <tr
                      v-for="(row, ri) in seg.inlineRows"
                      :key="ri"
                      :style="getPreviewRowHeightStyle(gv, getUnifiedInlineDataRowKey(seg.fields, ri))"
                    >
                      <td
                        v-for="(cell, ci) in row"
                        :key="ci"
                        class="wp-ctrl row-resize-anchor"
                        :colspan="seg.mergeSpans[ci]"
                        :style="getFormFieldPreviewStyle(seg.fields[ci])"
                      >
                        <span v-html="cell"></span>
                        <span
                          class="row-resizer-handle"
                          @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedInlineDataRowKey(seg.fields, ri), e)"
                        ></span>
                      </td>
                    </tr>
                  </template>
                </template>
              </table>
              <table v-else-if="gv.type === 'normal'" style="width:100%;border-collapse:collapse">
                <colgroup>
                  <col v-for="(ratio, ci) in getPreviewColumnFractions(gv, gi)" :key="ci" :style="{ width: (ratio * 100) + '%' }">
                </colgroup>
                <template v-for="ff in gv.fields" :key="ff.id">
                  <tr
                    v-if="ff.field_definition?.field_type === '标签'"
                    :style="getPreviewRowHeightStyle(gv, getNormalRowKey(ff))"
                  >
                    <td class="wp-structure-label--multiline row-resize-anchor" colspan="2" :style="getFormFieldLabelPreviewStyle(ff, { structure: true })">
                      {{ getFormFieldDisplayLabel(ff) }}
                      <span
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        :class="[
                          'wp-acrf-annotation',
                          'wp-acrf-annotation--field',
                          {
                            'wp-acrf-annotation--interactive': isAnnotationDraggable(
                              getFieldAnnotationTarget(ff),
                            ),
                          },
                        ]"
                        :style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                      >
                        <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                        <button
                          type="button"
                          class="wp-acrf-annotation-reset"
                          :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                          aria-label="重置字段标注位置"
                          @pointerdown.stop
                          @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                        >
                          R
                        </button>
                      </span>
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"
                    :style="getPreviewRowHeightStyle(gv, getNormalRowKey(ff))"
                  >
                    <td colspan="2" class="row-resize-anchor" :style="getFormFieldLabelPreviewStyle(ff, { structure: true })">
                      {{ getFormFieldDisplayLabel(ff) || '以下为log行' }}
                      <span
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        :class="[
                          'wp-acrf-annotation',
                          'wp-acrf-annotation--field',
                          {
                            'wp-acrf-annotation--interactive': isAnnotationDraggable(
                              getFieldAnnotationTarget(ff),
                            ),
                          },
                        ]"
                        :style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                      >
                        <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                        <button
                          type="button"
                          class="wp-acrf-annotation-reset"
                          :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                          aria-label="重置字段标注位置"
                          @pointerdown.stop
                          @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                        >
                          R
                        </button>
                      </span>
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr v-else :style="getPreviewRowHeightStyle(gv, getNormalRowKey(ff))">
                    <td class="wp-label row-resize-anchor" :style="getFormFieldLabelPreviewStyle(ff)">
                      {{ getFormFieldDisplayLabel(ff) }}
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                    <td class="wp-ctrl row-resize-anchor" :style="getFormFieldPreviewStyle(ff)">
                      <span v-html="renderCellHtml(ff, normalFillChars(gv, gi), normalColumnCm(gv, gi))"></span>
                      <span
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        :class="[
                          'wp-acrf-annotation',
                          'wp-acrf-annotation--field',
                          {
                            'wp-acrf-annotation--interactive': isAnnotationDraggable(
                              getFieldAnnotationTarget(ff),
                            ),
                          },
                        ]"
                        :style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                      >
                        <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                        <button
                          type="button"
                          class="wp-acrf-annotation-reset"
                          :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                          aria-label="重置字段标注位置"
                          @pointerdown.stop
                          @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                        >
                          R
                        </button>
                      </span>
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                </template>
              </table>
              <table v-else class="inline-table" style="width:100%;border-collapse:collapse">
                <colgroup>
                  <col
                    v-for="(ratio, ci) in getPreviewColumnFractions(gv, gi)"
                    :key="ci"
                    :style="{ width: (ratio * 100) + '%' }"
                  >
                </colgroup>
                <tr :style="getPreviewRowHeightStyle(gv, getInlineHeaderRowKey(gv.fields))">
                  <td
                    v-for="ff in gv.fields"
                    :key="ff.id"
                    class="wp-inline-header row-resize-anchor"
                    :style="getFormFieldLabelPreviewStyle(ff)"
                  >
                    {{ getFormFieldDisplayLabel(ff) }}
                    <span
                      v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                      :class="[
                        'wp-acrf-annotation',
                        'wp-acrf-annotation--field',
                        'wp-acrf-annotation--inline-header',
                        {
                          'wp-acrf-annotation--interactive': isAnnotationDraggable(
                            getFieldAnnotationTarget(ff),
                          ),
                        },
                      ]"
                      :style="
                        getAnnotationStyle(
                          getFieldOidAnnotationText(ff),
                          ANNOTATION_KIND_INLINE_HEADER,
                          getFieldAnnotationTarget(ff),
                        )
                      "
                      @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                    >
                      <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                      <button
                        type="button"
                        class="wp-acrf-annotation-reset"
                        :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        aria-label="重置字段标注位置"
                        @pointerdown.stop
                        @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      >
                        R
                      </button>
                    </span>
                    <span
                      class="row-resizer-handle"
                      @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getInlineHeaderRowKey(gv.fields), e)"
                    ></span>
                  </td>
                </tr>
                <tr
                  v-for="(row, ri) in gv.inlineRows"
                  :key="ri"
                  :style="getPreviewRowHeightStyle(gv, getInlineDataRowKey(gv.fields, ri))"
                >
                  <td
                    v-for="(cell, ci) in row"
                    :key="ci"
                    class="wp-ctrl row-resize-anchor"
                    :style="getFormFieldPreviewStyle(gv.fields[ci])"
                  >
                    <span v-html="cell"></span>
                    <span
                      class="row-resizer-handle"
                      @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getInlineDataRowKey(gv.fields, ri), e)"
                    ></span>
                  </td>
                </tr>
              </table>
            </template>
          </div>
          <aside v-if="hasPreviewNotes" class="wp-notes" aria-label="设计备注">
            <div class="wp-notes-title">设计备注</div>
            <div class="wp-notes-content" v-html="previewDesignNotesHtml"></div>
          </aside>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.wp-form-title-row {
  position: relative;
  padding-right: 4.8cm;
}

.wp-acrf-annotation {
  position: absolute;
  top: var(--acrf-annotation-top);
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--acrf-annotation-width);
  height: var(--acrf-annotation-height);
  max-width: min(var(--acrf-annotation-max-width), 100%);
  padding: var(--acrf-annotation-padding-y) var(--acrf-annotation-padding-x);
  box-sizing: border-box;
  border: var(--acrf-annotation-border-width) solid #c00000;
  border-radius: 2px;
  background: #fff2f2;
  color: #c00000;
  font-family: 'SimSun', serif;
  font-size: var(--acrf-annotation-font-size);
  white-space: nowrap;
  overflow: visible;
  user-select: none;
  touch-action: none;
  z-index: 3;
}

.wp-acrf-annotation__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wp-acrf-annotation--interactive {
  cursor: ns-resize;
}

.wp-acrf-annotation-reset {
  position: absolute;
  top: -8px;
  right: -8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #c00000;
  border-radius: 999px;
  background: #fff;
  color: #c00000;
  font-size: 10px;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset {
  opacity: 1;
}

.wp-acrf-annotation-reset:hover:not(:disabled),
.wp-acrf-annotation-reset:focus-visible:not(:disabled) {
  background: #c00000;
  color: #fff;
  outline: none;
}

.wp-acrf-annotation-reset:disabled {
  cursor: not-allowed;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled {
  opacity: 0.45;
}

.wp-acrf-annotation--inline-header {
  z-index: 4;
}
</style>
