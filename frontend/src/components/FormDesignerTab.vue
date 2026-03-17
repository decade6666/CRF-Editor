<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUpdate, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode, genFieldVarName, truncRefs } from '../composables/useApi'
import { renderCtrl as renderCtrlBase, renderCtrlHtml, toHtml } from '../composables/useCRFRenderer'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))

// 核心数据
const forms = ref([])
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
const deletingFieldIds = ref(new Set()) // 防止重复删除：记录正在删除中的字段ID

// 数据加载
async function loadForms() { forms.value = await api.cachedGet(`/api/projects/${props.projectId}/forms`) }
async function reloadForms() {
  api.invalidateCache(`/api/projects/${props.projectId}/forms`)
  await loadForms()
}
async function loadFieldDefs() { fieldDefs.value = await api.cachedGet(`/api/projects/${props.projectId}/field-definitions`) }
async function loadCodelists() { codelists.value = await api.cachedGet(`/api/projects/${props.projectId}/codelists`) }
async function loadUnits() { units.value = await api.cachedGet(`/api/projects/${props.projectId}/units`) }
async function loadFormFields() {
  if (!selectedForm.value) return
  formFields.value = await api.cachedGet(`/api/forms/${selectedForm.value.id}/fields`)
}
watch(selectedForm, loadFormFields)

// 刷新信号：清缓存后重载所有数据
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
    if (selectedForm.value?.id === f.id) { selectedForm.value = null; formFields.value = [] }
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
    selForms.value = []; selectedForm.value = null; formFields.value = []; reloadForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function copyForm(f) {
  try { await api.post(`/api/forms/${f.id}/copy`, {}); reloadForms(); ElMessage.success('复制成功') }
  catch (e) { ElMessage.error(e.message) }
}

async function updateFormOrder(row, newValue) {
  if (newValue == null || newValue === row.order_index) return
  try {
    await api.put(`/api/forms/${row.id}`, { name: row.name, code: row.code, order_index: newValue })
    reloadForms()
  } catch (e) { ElMessage.error(e.message) }
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
  // 防重复删除：该字段正在删除中则直接返回
  if (deletingFieldIds.value.has(ff.id)) return
  try {
    await confirmFormChange()
    deletingFieldIds.value = new Set([...deletingFieldIds.value, ff.id])
    await api.del(`/api/form-fields/${ff.id}`)
    // 立即从本地列表移除，避免等待缓存刷新导致字段仍显示
    formFields.value = formFields.value.filter(f => f.id !== ff.id)
    // 显式失效表单字段列表缓存，防止 loadFormFields 返回旧数据
    api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
    loadFormFields()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  } finally {
    const next = new Set(deletingFieldIds.value)
    next.delete(ff.id)
    deletingFieldIds.value = next
  }
}

async function toggleInline(ff) {
  try { await confirmFormChange(); await api.patch(`/api/form-fields/${ff.id}/inline-mark`, { inline_mark: ff.inline_mark ? 0 : 1 }); loadFormFields() }
  catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
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
async function onDrop(e, targetIdx) {
  e.preventDefault(); dragOverIdx.value = null
  const srcIdx = formFields.value.findIndex(f => f.id === dragSrcId.value)
  if (srcIdx === -1 || srcIdx === targetIdx) return
  const arr = [...formFields.value]
  const [item] = arr.splice(srcIdx, 1)
  arr.splice(targetIdx, 0, item)
  formFields.value = arr
  await api.post(`/api/forms/${selectedForm.value.id}/fields/reorder`, { ordered_ids: arr.map(f => f.id) })
}

// 键盘排序
const fieldItemRefs = ref({})
onBeforeUpdate(() => { fieldItemRefs.value = {} })

async function handleFieldKeydown(event, field, index) {
  const { key, ctrlKey } = event
  if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(key)) return

  event.preventDefault()

  if (key === 'Enter') {
    selectField(field)  // Primary action: select for property editing
    return
  }
  if (key === ' ') {
    // Secondary action: toggle checkbox for batch operations
    const id = field.id
    const idx = selectedIds.value.indexOf(id)
    if (idx > -1) {
      selectedIds.value.splice(idx, 1)
    } else {
      selectedIds.value.push(id)
    }
    return
  }

  const move = async (from, to) => {
    if (to < 0 || to >= formFields.value.length) return
    const arr = [...formFields.value]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    formFields.value = arr
    
    await api.post(`/api/forms/${selectedForm.value.id}/fields/reorder`, { ordered_ids: arr.map(f => f.id) })

    const nextId = formFields.value[to].id
    nextTick(() => {
        fieldItemRefs.value[nextId]?.focus()
    })
  }

  if (ctrlKey) { // Move item
    if (key === 'ArrowUp') {
      await move(index, index - 1)
    } else if (key === 'ArrowDown') {
      await move(index, index + 1)
    }
  } else { // Move focus
    let nextIndex = -1
    if (key === 'ArrowUp') {
      nextIndex = index - 1
    } else if (key === 'ArrowDown') {
      nextIndex = index + 1
    }

    if (nextIndex >= 0 && nextIndex < formFields.value.length) {
      const nextId = formFields.value[nextIndex].id
      fieldItemRefs.value[nextId]?.focus()
    }
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

// 适配函数：将 field_definition 转换为统一格式
function renderCtrl(fd) {
  if (!fd) return '________________'
  // 转换为统一格式
  const field = {
    field_type: fd.field_type,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  }
  return renderCtrlBase(field)
}

function renderCell(ff) {
  // 对于选项类字段，即使有default_value也要渲染完整选项列表
  const ft = ff.field_definition?.field_type
  if (ft && ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(ft)) {
    return renderCtrl(ff.field_definition)
  }
  if (ff.default_value) return ff.default_value
  return renderCtrl(ff.field_definition)
}

// HTML 渲染版本：用 border-bottom span 替代 _ 字符，消除字形间距导致的断续
function renderCellHtml(ff) {
  const ft = ff.field_definition?.field_type
  if (ft && ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(ft)) {
    return renderCtrlHtml({ ...ff.field_definition, options: ff.field_definition?.codelist?.options || [] })
  }
  if (ff.default_value) {
    // default_value 是纯文本，直接转义后返回（无需替换下划线）
    return ff.default_value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const field = {
    field_type: ff.field_definition.field_type,
    options: ff.field_definition.codelist?.options || [],
    unit_symbol: ff.field_definition.unit?.symbol,
    integer_digits: ff.field_definition.integer_digits,
    decimal_digits: ff.field_definition.decimal_digits,
    date_format: ff.field_definition.date_format,
  }
  return renderCtrlHtml(field)
}

function getInlineRows(fields) {
  const cols = fields.map(ff => {
    if (ff.default_value) {
      const lines = ff.default_value.split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      // default_value 转义为安全 HTML，但不替换下划线（保留用户输入原样）
      return { lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), repeat: false }
    }
    const ctrl = renderCtrl(ff.field_definition).replace(/_{8,}/, '______')
    return { lines: [toHtml(ctrl)], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? ''))
  )
}

const fieldIndexMap = computed(() => {
  const map = new Map()
  formFields.value.forEach((ff, index) => {
    map.set(ff.id, index + 1)
  })
  return map
})

const renderGroups = computed(() => {
  const groups = []; let i = 0
  while (i < formFields.value.length) {
    const ff = formFields.value[i]
    if (ff.inline_mark) {
      const g = []
      while (i < formFields.value.length && formFields.value[i].inline_mark) { g.push(formFields.value[i]); i++ }
      groups.push({ type: 'inline', fields: g })
    } else {
      const g = []
      while (i < formFields.value.length && !formFields.value[i].inline_mark) { g.push(formFields.value[i]); i++ }
      groups.push({ type: 'normal', fields: g })
    }
  }
  return groups
})

const needsLandscape = computed(() => renderGroups.value.some(g => g.type === 'inline' && g.fields.length > 4))

// 设计弹窗内字段库宽度拖拽（持久化）
const libraryWidth = ref(parseInt(localStorage.getItem('crf_libraryWidth')) || 240)
const isLibResizing = ref(false)
watch(libraryWidth, v => localStorage.setItem('crf_libraryWidth', v))
function startLibResize(e) {
  isLibResizing.value = true
  const startX = e.clientX, startW = libraryWidth.value
  function onMove(e) { libraryWidth.value = Math.max(140, Math.min(400, startW + e.clientX - startX)) }
  function onUp() { isLibResizing.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// 设计弹窗内属性面板宽度拖拽（持久化）
const propWidth = ref(parseInt(localStorage.getItem('crf_propWidth')) || 320)
const isPropResizing = ref(false)
watch(propWidth, v => localStorage.setItem('crf_propWidth', v))
function startPropResize(e) {
  isPropResizing.value = true
  const startX = e.clientX, startW = propWidth.value
  function onMove(e) { propWidth.value = Math.max(240, Math.min(500, startW - (e.clientX - startX))) }
  function onUp() { isPropResizing.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ───────────────── 表单设计备注 ─────────────────
const notesHeight = ref(parseInt(localStorage.getItem('crf_notesHeight')) || 120)
watch(notesHeight, v => localStorage.setItem('crf_notesHeight', v))

const formDesignNotes = ref('')
let notesTimer = null

// 切换表单时加载备注，并清除未发出的 debounce
watch(selectedForm, (form) => {
  clearTimeout(notesTimer)
  formDesignNotes.value = form?.design_notes || ''
})

async function saveDesignNotes() {
  if (!selectedForm.value) return
  try {
    await api.put(`/api/forms/${selectedForm.value.id}`, { design_notes: formDesignNotes.value })
    api.invalidateCache(`/api/projects/${props.projectId}/forms`)
  } catch (e) {
    console.error('备注保存失败', e)
  }
}

function onNotesInput() {
  clearTimeout(notesTimer)
  notesTimer = setTimeout(saveDesignNotes, 500)
}

function onNotesResize(evt) {
  const textarea = evt.target?.closest('.design-notes-wrap')?.querySelector('textarea')
  if (textarea) {
    notesHeight.value = textarea.offsetHeight
  }
}
// ──────────────────────────────────────────────

// 字段属性编辑
const selectedFieldId = ref(null)
const editProp = reactive({
  label: '', variable_name: '', field_type: '文本',
  integer_digits: null, decimal_digits: null, date_format: null,
  codelist_id: null, unit_id: null, default_value: '', inline_mark: 0,
})
const designerFieldTypes = ['文本', '数值', '日期', '日期时间', '时间', '单选', '多选', '单选（纵向）', '多选（纵向）', '标签']

const DATE_FORMAT_OPTIONS = {
  '日期': ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MMM/yyyy', 'dd-MMM-yyyy', 'yyyy/MM/dd'],
  '日期时间': ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm:ss', 'dd/MM/yyyy HH:mm:ss'],
  '时间': ['HH:mm:ss', 'HH:mm', 'hh:mm:ss AP', 'hh:mm AP'],
}
const DEFAULT_DATE_FORMATS = { '日期': 'yyyy-MM-dd', '日期时间': 'yyyy-MM-dd HH:mm', '时间': 'HH:mm' }

watch(() => editProp.field_type, (newType) => {
  if (['日期', '日期时间', '时间'].includes(newType)) {
    const opts = DATE_FORMAT_OPTIONS[newType] || []
    if (!opts.includes(editProp.date_format)) editProp.date_format = DEFAULT_DATE_FORMATS[newType]
  } else {
    editProp.date_format = null
  }
})

function selectField(ff) {
  selectedFieldId.value = ff.id
  if (ff.is_log_row) {
    Object.assign(editProp, {
      label: ff.label_override || '以下为log行', variable_name: '', field_type: '日志行',
      integer_digits: null, decimal_digits: null, date_format: null,
      codelist_id: null, unit_id: null, default_value: '', inline_mark: 0,
    })
    return
  }
  const fd = ff.field_definition
  if (!fd) return
  Object.assign(editProp, {
    label: fd.label || '', variable_name: fd.variable_name || '', field_type: fd.field_type || '文本',
    integer_digits: fd.integer_digits, decimal_digits: fd.decimal_digits, date_format: fd.date_format,
    codelist_id: fd.codelist_id, unit_id: fd.unit_id, default_value: ff.default_value || '', inline_mark: ff.inline_mark || 0,
  })
}

async function saveFieldProp() {
  const ff = formFields.value.find(f => f.id === selectedFieldId.value)
  if (!ff) return
  if (!ff.is_log_row && ['单选', '多选', '单选（纵向）'].includes(editProp.field_type) && !editProp.codelist_id)
    return ElMessage.warning('单选/多选字段必须选择选项字典')
  try {
    if (ff.is_log_row) {
      await api.put(`/api/form-fields/${ff.id}`, { label_override: editProp.label })
    } else {
      await api.put(`/api/projects/${props.projectId}/field-definitions/${ff.field_definition_id}`, {
        label: editProp.label, variable_name: editProp.variable_name, field_type: editProp.field_type,
        integer_digits: editProp.integer_digits, decimal_digits: editProp.decimal_digits,
        date_format: editProp.date_format, codelist_id: editProp.codelist_id, unit_id: editProp.unit_id,
      })
      // 显式失效表单字段列表缓存，防止 loadFormFields 返回旧数据导致界面回滚
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
      if (editProp.inline_mark) await api.put(`/api/form-fields/${ff.id}`, { default_value: editProp.default_value })
    }
    await loadFormFields()
    const updated = formFields.value.find(f => f.id === selectedFieldId.value)
    if (updated) selectField(updated)
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error(e.message) }
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
  try {
    await api.post(`/api/forms/${selectedForm.value.id}/fields`, { is_log_row: 1, label_override: '以下为log行' })
    await loadFormFields()
  } catch (e) { ElMessage.error(e.message) }
}

// 快速新增编码字典
const showQuickAddCodelist = ref(false)
const quickCodelistName = ref('')
const quickCodelistOpts = ref([])
const quickOptCode = ref('')
const quickOptDecode = ref('')

function quickAddOptRow() {
  if (!quickOptDecode.value.trim()) return ElMessage.warning('请输入标签')
  const n = quickCodelistOpts.value.length
  quickCodelistOpts.value.push({ code: quickOptCode.value.trim() || `C.${n + 1}`, decode: quickOptDecode.value.trim() })
  quickOptCode.value = `C.${n + 2}`
  quickOptDecode.value = ''
}
function quickDelOptRow(idx) { quickCodelistOpts.value.splice(idx, 1) }
function closeQuickAddCodelist() {
  showQuickAddCodelist.value = false
  quickCodelistName.value = ''; quickCodelistOpts.value = []
  quickOptCode.value = ''; quickOptDecode.value = ''
}
function openQuickAddCodelist() {
  quickCodelistName.value = ''; quickCodelistOpts.value = []
  quickOptCode.value = 'C.1'; quickOptDecode.value = ''
  showQuickAddCodelist.value = true
}
async function quickAddCodelist() {
  if (!quickCodelistName.value.trim()) return ElMessage.warning('请输入字典名称')
  try {
    const created = await api.post(`/api/projects/${props.projectId}/codelists`, { name: quickCodelistName.value.trim(), description: '' })
    for (const opt of quickCodelistOpts.value) {
      await api.post(`/api/projects/${props.projectId}/codelists/${created.id}/options`, { code: opt.code, decode: opt.decode })
    }
    await loadCodelists()
    editProp.codelist_id = created.id
    closeQuickAddCodelist()
  } catch (e) { ElMessage.error(e.message) }
}

// 快速编辑编码字典
const showQuickEditCodelist = ref(false)
const quickEditCodelistId = ref(null)
const quickEditCodelistName = ref('')
const quickEditCodelistOpts = ref([])
const quickEditOptCode = ref('')
const quickEditOptDecode = ref('')

function openQuickEditCodelist() {
  if (!editProp.codelist_id) return
  const cl = codelists.value.find(c => c.id === editProp.codelist_id)
  if (!cl) return
  quickEditCodelistId.value = cl.id
  quickEditCodelistName.value = cl.name
  quickEditCodelistOpts.value = (cl.options || []).map(o => ({ id: o.id, code: o.code, decode: o.decode, trailing_underscore: o.trailing_underscore || 0 }))
  quickEditOptCode.value = `C.${(cl.options || []).length + 1}`
  quickEditOptDecode.value = ''
  showQuickEditCodelist.value = true
}
function quickEditAddOptRow() {
  if (!quickEditOptDecode.value.trim()) return ElMessage.warning('请输入标签')
  const n = quickEditCodelistOpts.value.length
  quickEditCodelistOpts.value.push({ id: null, code: quickEditOptCode.value.trim() || `C.${n + 1}`, decode: quickEditOptDecode.value.trim(), trailing_underscore: 0 })
  quickEditOptCode.value = `C.${n + 2}`; quickEditOptDecode.value = ''
}
function quickEditDelOptRow(idx) { quickEditCodelistOpts.value.splice(idx, 1) }
function toggleTrailingLine(row) {
  row.trailing_underscore = row.trailing_underscore ? 0 : 1
}
function closeQuickEditCodelist() {
  showQuickEditCodelist.value = false; quickEditCodelistId.value = null
  quickEditCodelistName.value = ''; quickEditCodelistOpts.value = []
  quickEditOptCode.value = ''; quickEditOptDecode.value = ''
}

async function quickSaveCodelist() {
  if (!quickEditCodelistName.value.trim()) return ElMessage.warning('请输入字典名称')
  try {
    await api.put(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}`, { name: quickEditCodelistName.value.trim(), description: '' })
    const cl = codelists.value.find(c => c.id === quickEditCodelistId.value)
    const originalIds = new Set((cl?.options || []).map(o => o.id))
    const currentIds = new Set(quickEditCodelistOpts.value.filter(o => o.id).map(o => o.id))
    for (const id of originalIds) {
      if (!currentIds.has(id)) await api.del(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/options/${id}`)
    }
    for (const opt of quickEditCodelistOpts.value) {
      if (opt.id) await api.put(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/options/${opt.id}`, { code: opt.code, decode: opt.decode, trailing_underscore: opt.trailing_underscore || 0 })
      else await api.post(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/options`, { code: opt.code, decode: opt.decode, trailing_underscore: opt.trailing_underscore || 0 })
    }
    api.invalidateCache(`/api/projects/${props.projectId}/codelists`)
    await loadCodelists()
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
      await loadFormFields()
    }
    closeQuickEditCodelist()
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error(e.message) }
}

// 快速新增单位
const showQuickAddUnit = ref(false)
const quickUnitSymbol = ref('')
async function quickAddUnit() {
  if (!quickUnitSymbol.value.trim()) return ElMessage.warning('请输入单位符号')
  try {
    const created = await api.post(`/api/projects/${props.projectId}/units`, { symbol: quickUnitSymbol.value.trim() })
    await loadUnits()
    editProp.unit_id = created.id
    showQuickAddUnit.value = false; quickUnitSymbol.value = ''
  } catch (e) { ElMessage.error(e.message) }
}

// 生命周期
onMounted(() => { loadForms(); loadFieldDefs(); loadCodelists(); loadUnits() })
watch(() => props.projectId, () => {
  selectedForm.value = null; formFields.value = []; selectedFieldId.value = null
  loadForms(); loadFieldDefs(); loadCodelists(); loadUnits()
})

function openAddForm() {
  newFormCode.value = genCode('FORM')
  showAddForm.value = true
}
</script>

<template>
  <div class="form-designer">
    <!-- 左侧：表单列表 -->
    <div class="fd-formlist">
      <div style="margin-bottom:12px;align-self:flex-start;display:flex;gap:8px">
        <el-button type="primary" size="small" @click="openAddForm">新建表单</el-button>
        <el-button type="danger" size="small" :disabled="!selForms.length" @click="batchDelForms">批量删除({{ selForms.length }})</el-button>
      </div>
      <el-table :data="forms" size="small" border highlight-current-row
        @current-change="r => selectedForm = r" @selection-change="r => selForms = r" style="width:100%" height="100%">
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }">
            <div @click.stop>
              <el-input-number :model-value="row.order_index" @change="v => updateFormOrder(row, v)" :min="1" :max="forms.length" size="small" style="width:80px" :aria-label="'编辑表单 ' + row.name + ' 的序号'" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="表单名称" show-overflow-tooltip />
        <el-table-column prop="code" label="Code" width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click.stop="copyForm(row)">复制</el-button>
            <el-button size="small" link @click.stop="openEditForm(row)">编辑</el-button>
            <el-button type="danger" size="small" link @click.stop="delForm(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 右侧：Word预览 -->
    <div class="fd-right">
      <div class="fd-canvas" style="flex:1">
        <div class="fd-canvas-header">
          <el-button v-if="selectedForm" size="small" type="primary" @click="showDesigner = true">设计表单</el-button>
          <span>{{ selectedForm?.name || '未选择表单' }}</span>
          <span style="color:var(--color-text-muted);font-size:12px;flex:1">共 {{ formFields.length }} 个字段</span>
        </div>
        <div class="word-preview">
          <div :class="['word-page', { landscape: needsLandscape }]">
            <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
            <template v-else>
              <div class="wp-form-title">{{ selectedForm.name }}</div>
              <div v-if="!formFields.length" class="wp-empty">暂无字段</div>
              <template v-for="(g, gi) in renderGroups" :key="gi">
                <table v-if="g.type === 'normal'">
                  <template v-for="ff in g.fields" :key="ff.id">
                    <tr v-if="ff.field_definition?.field_type === '标签'">
                      <td colspan="2" style="font-weight:bold">{{ ff.label_override || ff.field_definition?.label }}</td>
                    </tr>
                    <tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'">
                      <td colspan="2" style="background:#d9d9d9">{{ ff.label_override || ff.field_definition?.label || '以下为log行' }}</td>
                    </tr>
                    <tr v-else>
                      <td class="wp-label">{{ ff.label_override || ff.field_definition?.label }}</td>
                      <td class="wp-ctrl" v-html="renderCellHtml(ff)"></td>
                    </tr>
                  </template>
                </table>
                <table v-else class="inline-table">
                  <tr>
                    <td v-for="ff in g.fields" :key="ff.id" class="wp-inline-header">{{ ff.label_override || ff.field_definition?.label }}</td>
                  </tr>
                  <tr v-for="(row, ri) in getInlineRows(g.fields)" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" v-html="cell"></td>
                  </tr>
                </table>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建表单弹窗 -->
    <el-dialog v-model="showAddForm" title="新建表单" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="Code"><el-input v-model="newFormCode" /></el-form-item>
        <el-form-item label="表单名称"><el-input v-model="newFormName" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddForm = false">取消</el-button>
        <el-button type="primary" @click="addForm">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑表单弹窗 -->
    <el-dialog v-model="showEditForm" title="编辑表单" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="Code"><el-input v-model="editFormCode" /></el-form-item>
        <el-form-item label="表单名称"><el-input v-model="editFormName" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditForm = false">取消</el-button>
        <el-button type="primary" @click="updateForm">确定</el-button>
      </template>
    </el-dialog>

    <!-- 设计表单弹窗 -->
    <el-dialog v-model="showDesigner" :title="'设计表单：' + (selectedForm?.name || '')" width="80vw" top="5vh" :close-on-click-modal="false">
      <div style="display:flex;height:80vh">
        <!-- 字段库 -->
        <div class="fd-library" :style="{ width: libraryWidth + 'px' }">
          <div class="fd-library-header">字段库（点击添加）</div>
          <div style="padding:4px 6px;border-bottom:1px solid var(--color-border)">
            <el-input v-model="fieldSearch" placeholder="搜索变量名/标签" size="small" clearable />
          </div>
          <div class="fd-library-list">
            <div v-for="fd in filteredFieldDefs" :key="fd.id" class="fd-item"
              :style="usedDefIds.has(fd.id) ? 'opacity:0.4' : ''" @click="addField(fd)">
              <span>{{ fd.label }}</span>
              <span style="color:var(--color-text-muted);font-size:11px">{{ fd.field_type }}</span>
            </div>
          </div>
        </div>
        <div class="fd-panel-resizer" :class="{ dragging: isLibResizing }" @mousedown="startLibResize"></div>
        <!-- 画布区域 -->
        <div class="fd-canvas" style="flex:1">
          <div class="fd-canvas-header">
            <el-button size="small" type="primary" @click="newField">新建字段</el-button>
            <el-button size="small" @click="addLogRow">添加log行</el-button>
            <span style="color:var(--color-text-muted);font-size:12px;flex:1">共 {{ formFields.length }} 个字段</span>
            <el-button v-if="selectedIds.length" type="danger" size="small" @click="batchDelete">批量删除({{ selectedIds.length }})</el-button>
          </div>
          <div class="fd-canvas-list" role="listbox" aria-label="表单字段列表">
            <div v-for="(ff, idx) in formFields" :key="ff.id"
              :ref="el => fieldItemRefs[ff.id] = el"
              class="ff-item" :class="{ inline: ff.inline_mark, 'ff-selected': selectedFieldId === ff.id }"
              draggable="true" @click="selectField(ff)"
              @dragstart="onDragStart(ff)" @dragover="onDragOver($event, idx)"
              @dragleave="onDragLeave" @drop="onDrop($event, idx)"
              :style="dragOverIdx === idx ? 'border-top:2px solid var(--color-primary)' : ''"
              role="option" :aria-selected="selectedFieldId === ff.id" tabindex="0"
              @keydown="handleFieldKeydown($event, ff, idx)">
              <el-checkbox v-model="selectedIds" :label="ff.id" size="small" @click.stop>{{ idx + 1 }}.</el-checkbox>
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="ff-label">
                {{ ff.label_override || ff.field_definition?.label }}
                <span v-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'" style="color:#9b59b6;margin-left:4px">以下为log行</span>
              </span>
              <span v-if="!ff.is_log_row && ff.field_definition?.field_type !== '日志行'" class="ff-type">{{ ff.field_definition?.field_type }}</span>
              <el-tooltip v-if="!ff.is_log_row && ff.field_definition?.field_type !== '日志行'" content="横向表格标记">
                <el-button size="small" link :type="ff.inline_mark ? 'warning' : ''" @click.stop="toggleInline(ff)">⊞</el-button>
              </el-tooltip>
              <el-button type="danger" size="small" link :disabled="deletingFieldIds.has(ff.id)" @click.stop="removeField(ff)">删除</el-button>
            </div>
          </div>
        </div>
        <div class="fd-panel-resizer" :class="{ dragging: isPropResizing }" @mousedown="startPropResize"></div>
        <!-- 属性编辑面板 -->
        <div :style="{ width: propWidth + 'px', border: '1px solid var(--color-border)', borderRadius: '4px', display: 'flex', flexDirection: 'column', flexShrink: 0 }">
          <div style="padding:8px 12px;background:var(--color-bg-hover);border-bottom:1px solid var(--color-border);font-size:13px;font-weight:bold">属性编辑</div>
          <div v-if="!selectedFieldId" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:12px">← 选择字段</div>
          <!-- 日志行属性 -->
          <div v-else-if="editProp.field_type === '日志行'" style="flex:1;overflow-y:auto;padding:8px">
            <el-form :model="editProp" label-width="70px" size="small">
              <el-form-item label="标签"><el-input v-model="editProp.label" /></el-form-item>
            </el-form>
            <el-button type="primary" size="small" style="width:100%" @click="saveFieldProp">保存</el-button>
          </div>
          <!-- 普通字段属性 -->
          <div v-else style="flex:1;overflow-y:auto;padding:8px">
            <el-form :model="editProp" label-width="70px" size="small">
              <el-form-item label="变量标签"><el-input v-model="editProp.label" /></el-form-item>
              <el-form-item v-if="!['标签', '日志行'].includes(editProp.field_type)" label="变量名"><el-input v-model="editProp.variable_name" /></el-form-item>
              <el-form-item label="字段类型">
                <el-select v-model="editProp.field_type" style="width:100%">
                  <el-option v-for="t in designerFieldTypes" :key="t" :label="t" :value="t" />
                </el-select>
              </el-form-item>
              <template v-if="editProp.field_type === '数值'">
                <el-form-item label="整数位"><el-input-number v-model="editProp.integer_digits" :min="1" :max="20" style="width:100%" /></el-form-item>
                <el-form-item label="小数位"><el-input-number v-model="editProp.decimal_digits" :min="0" :max="15" style="width:100%" /></el-form-item>
              </template>
              <el-form-item v-if="['日期', '日期时间', '时间'].includes(editProp.field_type)" label="日期格式">
                <el-select v-model="editProp.date_format" clearable style="width:100%">
                  <el-option v-for="f in (DATE_FORMAT_OPTIONS[editProp.field_type] || [])" :key="f" :label="f" :value="f" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(editProp.field_type)" label="选项">
                <div style="display:flex;gap:4px">
                  <el-select v-model="editProp.codelist_id" clearable filterable style="flex:1" placeholder="请选择">
                    <el-option v-for="c in codelists" :key="c.id" :label="c.name" :value="c.id" />
                  </el-select>
                  <el-button size="small" type="primary" plain @click="openQuickAddCodelist">新增</el-button>
                  <el-button size="small" type="warning" plain @click="openQuickEditCodelist" :disabled="!editProp.codelist_id">编辑</el-button>
                </div>
              </el-form-item>
              <el-form-item v-if="['文本', '数值'].includes(editProp.field_type)" label="单位">
                <div style="display:flex;gap:4px">
                  <el-select v-model="editProp.unit_id" clearable filterable style="flex:1" placeholder="请选择">
                    <el-option v-for="u in units" :key="u.id" :label="u.symbol" :value="u.id" />
                  </el-select>
                  <el-button size="small" type="primary" plain @click="showQuickAddUnit = true">+</el-button>
                </div>
              </el-form-item>
              <el-form-item v-if="editProp.inline_mark" label="默认值">
                <el-input v-model="editProp.default_value" type="textarea" :rows="2" />
              </el-form-item>
            </el-form>
            <el-button type="primary" size="small" style="width:100%;margin-top:4px" @click="saveFieldProp">保存</el-button>
          </div>
          <!-- 表单设计备注 -->
          <div class="design-notes-wrap" style="padding: 8px; border-top: 1px solid var(--color-border); flex-shrink: 0;" @mouseup="onNotesResize">
            <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px;">表单设计备注</div>
            <el-input
              v-model="formDesignNotes"
              type="textarea"
              :autosize="false"
              :style="{ height: notesHeight + 'px', resize: 'vertical' }"
              placeholder="在此记录表单设计说明、注意事项…"
              @input="onNotesInput"
            />
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 快速新增选项字典 -->
    <el-dialog v-model="showQuickAddCodelist" title="新增选项" width="500px" :close-on-click-modal="false" @close="closeQuickAddCodelist">
      <el-form label-width="80px" size="small">
        <el-form-item label="字典名称"><el-input v-model="quickCodelistName" placeholder="请输入字典名称" /></el-form-item>
      </el-form>
      <div style="margin-top:8px">
        <div style="font-size:12px;font-weight:bold;color:var(--color-text-secondary);margin-bottom:6px">选项列表</div>
        <el-table :data="quickCodelistOpts" size="small" border style="margin-bottom:8px">
          <el-table-column prop="code" label="编码值" width="120" />
          <el-table-column prop="decode" label="标签" />
          <el-table-column label="" width="60">
            <template #default="{ $index }">
              <el-button type="danger" size="small" link @click="quickDelOptRow($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div style="display:flex;gap:6px;align-items:center">
          <el-input v-model="quickOptCode" placeholder="编码值（必填）" size="small" style="width:130px" />
          <el-input v-model="quickOptDecode" placeholder="标签（必填）" size="small" style="flex:1" @keyup.enter="quickAddOptRow" />
          <el-button size="small" type="primary" plain @click="quickAddOptRow">添加</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="closeQuickAddCodelist">取消</el-button>
        <el-button type="primary" @click="quickAddCodelist">确定</el-button>
      </template>
    </el-dialog>

    <!-- 快速编辑选项字典 -->
    <el-dialog v-model="showQuickEditCodelist" title="编辑选项" width="500px" :close-on-click-modal="false" @close="closeQuickEditCodelist">
      <el-form label-width="80px" size="small">
        <el-form-item label="字典名称"><el-input v-model="quickEditCodelistName" placeholder="请输入字典名称" /></el-form-item>
      </el-form>
      <div style="margin-top:8px">
        <div style="font-size:12px;font-weight:bold;color:var(--color-text-secondary);margin-bottom:6px">选项列表</div>
        <el-table :data="quickEditCodelistOpts" size="small" border style="margin-bottom:8px">
          <el-table-column prop="code" label="编码值" width="140">
            <template #default="{ row }">
              <el-input v-model="row.code" size="small" />
            </template>
          </el-table-column>
          <el-table-column prop="decode" label="标签">
            <template #default="{ row }">
              <el-input v-model="row.decode" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="后加下划线" width="90">
            <template #default="{ row }">
              <el-checkbox :model-value="!!row.trailing_underscore" @change="toggleTrailingLine(row)" />
            </template>
          </el-table-column>
          <el-table-column label="" width="60">
            <template #default="{ $index }">
              <el-button type="danger" size="small" link @click="quickEditDelOptRow($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div style="display:flex;gap:6px;align-items:center">
          <el-input v-model="quickEditOptCode" placeholder="编码值（可选）" size="small" style="width:130px" />
          <el-input v-model="quickEditOptDecode" placeholder="标签（必填）" size="small" style="flex:1" @keyup.enter="quickEditAddOptRow" />
          <el-button size="small" type="primary" plain @click="quickEditAddOptRow">添加</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="closeQuickEditCodelist">取消</el-button>
        <el-button type="primary" @click="quickSaveCodelist">保存</el-button>
      </template>
    </el-dialog>

    <!-- 快速新增单位 -->
    <el-dialog v-model="showQuickAddUnit" title="新增单位" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="符号"><el-input v-model="quickUnitSymbol" placeholder="单位符号，如 kg" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showQuickAddUnit = false">取消</el-button>
        <el-button type="primary" @click="quickAddUnit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
