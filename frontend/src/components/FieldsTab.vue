<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, EditPen } from '@element-plus/icons-vue'
import { api, genFieldVarName, truncRefs } from '../composables/useApi'
import { useSortableTable } from '../composables/useSortableTable'
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit'
import { rankFuzzyMatches } from '../composables/searchRanking'
import { isVisibleInFieldLibrary } from '../composables/fieldDefinitionVisibility'
import { confirmDelete } from '../composables/projectDeleteConfirmation'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))

const fields = ref([])
const codelists = ref([])
const units = ref([])
const selectedFieldId = ref(null)
const isCreating = ref(false)
const editProp = reactive({
  variable_name: '', label: '', field_type: '文本',
  integer_digits: null, decimal_digits: null, date_format: null,
  codelist_id: null, unit_id: null,
})
const fieldTypes = ['文本', '数值', '日期', '日期时间', '时间', '单选', '多选', '单选（纵向）', '多选（纵向）']

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

async function load() {
  [fields.value, codelists.value, units.value] = await Promise.all([
    api.cachedGet(`/api/projects/${props.projectId}/field-definitions`),
    api.cachedGet(`/api/projects/${props.projectId}/codelists`),
    api.cachedGet(`/api/projects/${props.projectId}/units`),
  ])
}
async function reloadFields() {
  api.invalidateCache(`/api/projects/${props.projectId}/field-definitions`)
  await load()
}
onMounted(async () => { await load(); nextTick(() => initSortable()) })
watch(() => props.projectId, () => { selectedFieldId.value = null; isCreating.value = false; load() })
watch(refreshKey, load)

// 字段库不展示结构性字段
const searchField = ref('')
const visibleFields = computed(() => {
  const orderedFields = [...fields.value].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return (a?.id ?? 0) - (b?.id ?? 0)
  })
  const visibleDefinitions = orderedFields.filter(isVisibleInFieldLibrary)
  return rankFuzzyMatches(visibleDefinitions, searchField.value, (field) => Object.values(field))
})

function resetProp(data) {
  Object.assign(editProp, {
    variable_name: '', label: '', field_type: '文本',
    integer_digits: null, decimal_digits: null, date_format: null,
    codelist_id: null, unit_id: null,
  }, data || {})
}

function openAdd() { resetProp({ variable_name: genFieldVarName() }); selectedFieldId.value = null; isCreating.value = true }
function openEdit(f) { resetProp({ ...f }); selectedFieldId.value = f.id; isCreating.value = false }
function clearSelection() { resetProp(); selectedFieldId.value = null; isCreating.value = false }

async function save() {
  if (!isCreating.value && !selectedFieldId.value) return
  if (['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(editProp.field_type) && !editProp.codelist_id)
    return ElMessage.warning('单选/多选字段必须选择选项字典')
  try {
    if (isCreating.value) {
      const created = await api.post(`/api/projects/${props.projectId}/field-definitions`, { ...editProp })
      isCreating.value = false; selectedFieldId.value = created.id
      await load()
      const latest = fields.value.find(f => f.id === created.id)
      if (latest) resetProp({ ...latest })
      ElMessage.success('新增成功')
    } else {
      const refs = await api.get(`/api/field-definitions/${selectedFieldId.value}/references`)
      if (refs.length) {
        const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})`), 5, '、')
        await ElMessageBox.confirm(`修改将影响以下表单：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
      }
      await api.put(`/api/projects/${props.projectId}/field-definitions/${selectedFieldId.value}`, { ...editProp })
      await load()
      const latest = fields.value.find(f => f.id === selectedFieldId.value)
      if (latest) resetProp({ ...latest })
      ElMessage.success('保存成功')
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function del(f) {
  try {
    const refs = await api.get(`/api/field-definitions/${f.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})`), 5, '、')
      await ElMessageBox.confirm(`删除字段 "${f.label}" 将同时删除以下表单中的该字段：\n${msg}\n确认删除？`, '确认', { type: 'warning' })
    } else {
      await ElMessageBox.confirm(`删除字段 "${f.label}"？`, '确认', { type: 'warning' })
    }
    await api.del(`/api/field-definitions/${f.id}`)
    if (selectedFieldId.value === f.id) clearSelection()
    reloadFields()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selFields = ref([])
async function batchDelFields() {
  try {
    const ids = selFields.value.map(f => f.id)
    if (!ids.length) return ElMessage.warning('请先选择要删除的字段')
    const refsMap = await api.post(`/api/projects/${props.projectId}/field-definitions/batch-references`, { ids })
    const allRefs = []
    for (const f of selFields.value) {
      const refs = refsMap[f.id] || []
      if (refs.length) allRefs.push(`【${f.label}】：` + truncRefs(refs.map(r => `${r.form_name}(${r.form_code})`), 3, '、'))
    }
    const msg = allRefs.length
      ? `以下字段将同时从相关表单中删除：\n${allRefs.join('\n')}\n确认删除？`
      : `确认删除选中的 ${selFields.value.length} 个字段？`
    await ElMessageBox.confirm(msg, '批量删除', { type: 'warning' })
    await api.post(`/api/projects/${props.projectId}/field-definitions/batch-delete`, { ids })
    selFields.value = []; clearSelection(); reloadFields()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function copyField(f) {
  try { await api.post(`/api/field-definitions/${f.id}/copy`, {}); reloadFields(); ElMessage.success('复制成功') }
  catch (e) { ElMessage.error(e.message) }
}

// 拖拽排序
const fieldsTableRef = ref(null)
const isFiltered = computed(() => searchField.value.trim().length > 0)
const reorderUrl = computed(() => `/api/projects/${props.projectId}/field-definitions/reorder`)
const { initSortable } = useSortableTable(fieldsTableRef, fields, reorderUrl, {
  reloadFn: reloadFields,
  isFiltered,
  renderList: visibleFields,
})
function applyFields(nextFields) {
  fields.value = nextFields
}
const {
  editingId: editingFieldId,
  editingValue: editingFieldOrdinal,
  inputRef: fieldOrdinalInputRef,
  startEdit: startFieldOrdinalEdit,
  commitEdit: commitFieldOrdinalEdit,
  cancelEdit: cancelFieldOrdinalEdit,
} = useOrdinalQuickEdit(fields, reorderUrl, {
  applyList: applyFields,
  isFiltered,
  reloadFn: reloadFields,
  renderList: visibleFields,
})

// 选项字典内联快速增/改：字典写操作后失效字典与字段定义缓存并联动刷新
async function reloadAfterCodelistChange() {
  api.invalidateCache(`/api/projects/${props.projectId}/codelists`)
  api.invalidateCache(`/api/projects/${props.projectId}/field-definitions`)
  await load()
  refreshKey.value++
}

function normalizeQuickOptions(rows) {
  return rows.map((opt) => ({
    ...opt,
    code: String(opt.code ?? '').trim(),
    decode: String(opt.decode ?? '').trim(),
    trailing_underscore: opt.trailing_underscore || 0,
  }))
}

function toggleTrailingLine(row) {
  row.trailing_underscore = row.trailing_underscore ? 0 : 1
}

// 新增字典
const showQuickAddCodelist = ref(false)
const quickCodelistName = ref('')
const quickCodelistDescription = ref('')
const quickCodelistOpts = ref([])
const quickOptCode = ref('')
const quickOptDecode = ref('')
const quickAddCodelistSaving = ref(false)

function openQuickAddCodelist() {
  quickCodelistName.value = ''
  quickCodelistDescription.value = ''
  quickCodelistOpts.value = []
  quickOptCode.value = 'C.1'
  quickOptDecode.value = ''
  quickAddCodelistSaving.value = false
  showQuickAddCodelist.value = true
}
function quickAddOptRow() {
  if (!quickOptDecode.value.trim()) return ElMessage.warning('请输入标签')
  const n = quickCodelistOpts.value.length
  quickCodelistOpts.value.push({
    id: null,
    code: quickOptCode.value.trim() || `C.${n + 1}`,
    decode: quickOptDecode.value.trim(),
    trailing_underscore: 0,
  })
  quickOptCode.value = `C.${n + 2}`
  quickOptDecode.value = ''
}
async function quickDelOptRow(idx) {
  try {
    await confirmDelete(ElMessageBox.confirm, { targetText: `选项 "${quickCodelistOpts.value[idx]?.decode || idx + 1}"` })
    quickCodelistOpts.value.splice(idx, 1)
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}
function closeQuickAddCodelist() {
  showQuickAddCodelist.value = false
  quickCodelistName.value = ''
  quickCodelistDescription.value = ''
  quickCodelistOpts.value = []
  quickOptCode.value = ''
  quickOptDecode.value = ''
  quickAddCodelistSaving.value = false
}
async function quickAddCodelist() {
  if (quickAddCodelistSaving.value) return
  const savedName = quickCodelistName.value.trim()
  if (!savedName) return ElMessage.warning('请输入字典名称')
  const normalizedOptions = normalizeQuickOptions(quickCodelistOpts.value)
  const invalidIdx = normalizedOptions.findIndex((opt) => !opt.code || !opt.decode)
  if (invalidIdx !== -1) return ElMessage.warning(`请完整填写第 ${invalidIdx + 1} 行的编码和值标签`)

  quickAddCodelistSaving.value = true
  try {
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
    await reloadAfterCodelistChange()
    editProp.codelist_id = created.id
    closeQuickAddCodelist()
    ElMessage.success('新增成功')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    quickAddCodelistSaving.value = false
  }
}

// 编辑已引用字典
const showQuickEditCodelist = ref(false)
const quickEditCodelistId = ref(null)
const quickEditCodelistName = ref('')
const quickEditCodelistDescription = ref('')
const quickEditCodelistOpts = ref([])
const quickEditOptCode = ref('')
const quickEditOptDecode = ref('')
const quickEditCodelistSaving = ref(false)

function openQuickEditCodelist() {
  if (!editProp.codelist_id) return
  const cl = codelists.value.find((c) => c.id === editProp.codelist_id)
  if (!cl) return
  quickEditCodelistId.value = cl.id
  quickEditCodelistName.value = cl.name
  quickEditCodelistDescription.value = cl.description || ''
  quickEditCodelistOpts.value = (cl.options || []).map((o) => ({
    id: o.id,
    code: o.code,
    decode: o.decode,
    trailing_underscore: o.trailing_underscore || 0,
  }))
  quickEditOptCode.value = `C.${(cl.options || []).length + 1}`
  quickEditOptDecode.value = ''
  showQuickEditCodelist.value = true
}
function quickEditAddOptRow() {
  if (!quickEditOptDecode.value.trim()) return ElMessage.warning('请输入标签')
  const n = quickEditCodelistOpts.value.length
  quickEditCodelistOpts.value.push({
    id: null,
    code: quickEditOptCode.value.trim() || `C.${n + 1}`,
    decode: quickEditOptDecode.value.trim(),
    trailing_underscore: 0,
  })
  quickEditOptCode.value = `C.${n + 2}`
  quickEditOptDecode.value = ''
}
async function quickEditDelOptRow(idx) {
  try {
    await confirmDelete(ElMessageBox.confirm, { targetText: `选项 "${quickEditCodelistOpts.value[idx]?.decode || idx + 1}"` })
    quickEditCodelistOpts.value.splice(idx, 1)
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}
function closeQuickEditCodelist() {
  showQuickEditCodelist.value = false
  quickEditCodelistId.value = null
  quickEditCodelistName.value = ''
  quickEditCodelistDescription.value = ''
  quickEditCodelistOpts.value = []
  quickEditOptCode.value = ''
  quickEditOptDecode.value = ''
}
async function quickSaveCodelist() {
  if (quickEditCodelistSaving.value) return
  const savedName = quickEditCodelistName.value.trim()
  if (!savedName) return ElMessage.warning('请输入字典名称')
  const normalizedOptions = normalizeQuickOptions(quickEditCodelistOpts.value)
  const invalidIdx = normalizedOptions.findIndex((opt) => !opt.code || !opt.decode)
  if (invalidIdx !== -1) return ElMessage.warning(`请完整填写第 ${invalidIdx + 1} 行的编码和值标签`)

  quickEditCodelistSaving.value = true
  try {
    const refs = await api.get(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map((r) => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }
    await api.put(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/snapshot`, {
      name: savedName,
      description: quickEditCodelistDescription.value,
      options: normalizedOptions.map((opt) => ({
        id: opt.id,
        code: opt.code,
        decode: opt.decode,
        trailing_underscore: opt.trailing_underscore || 0,
      })),
    })
    await reloadAfterCodelistChange()
    closeQuickEditCodelist()
    ElMessage.success('保存成功')
  } catch (e) {
    if (e === 'cancel') return
    await reloadAfterCodelistChange()
    closeQuickEditCodelist()
    ElMessage.error(`保存失败：${e.message}。已刷新为最新字典数据，请重新检查后再编辑。`)
  } finally {
    quickEditCodelistSaving.value = false
  }
}
</script>

<template>
  <div style="display:flex;gap:12px;align-items:stretch;height:calc(100vh - 160px)">
    <!-- 左侧：字段列表 -->
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <el-button type="primary" size="small" @click="openAdd">新增字段</el-button>
        <el-button type="danger" size="small" :disabled="!selFields.length" @click="batchDelFields">批量删除({{ selFields.length }})</el-button>
        <el-input
          v-model="searchField"
          placeholder="搜索字段..."
          clearable
          size="small"
          style="width:180px"
        />
      </div>
      <el-table ref="fieldsTableRef" :data="visibleFields" size="small" border height="100%" row-key="id"
        :row-class-name="({ row }) => row.id === selectedFieldId ? 'current-row' : ''"
        :row-style="{ cursor: 'pointer' }"
        @row-click="openEdit" @selection-change="r => selFields = r">
        <el-table-column width="32" v-if="!isFiltered">
          <template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template>
        </el-table-column>
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }">
            <el-input-number
              v-if="editingFieldId === row.id"
              ref="fieldOrdinalInputRef"
              v-model="editingFieldOrdinal"
              :min="1"
              :max="visibleFields.length"
              size="small"
              style="width:80px"
              @click.stop
              @keyup.enter.stop="commitFieldOrdinalEdit"
              @keydown.esc.stop.prevent="cancelFieldOrdinalEdit"
              @blur="cancelFieldOrdinalEdit"
            />
            <button
              v-else
              type="button"
              style="border:none;background:transparent;padding:0;cursor:pointer"
              @click.stop
              @dblclick.stop="startFieldOrdinalEdit(row)"
            >
              <span class="ordinal-cell">{{ row.order_index }}</span>
            </button>
          </template>
        </el-table-column>
        <el-table-column v-if="editMode" prop="variable_name" label="OID" min-width="100" />
        <el-table-column prop="label" label="标签" min-width="80" />
        <el-table-column prop="field_type" label="类型" width="100" />
        <el-table-column label="单位/选项" width="120">
          <template #default="{ row }">
            <span v-if="row.unit" style="color:var(--color-text-secondary)">{{ row.unit.symbol }}</span>
            <span v-else-if="row.codelist" style="color:var(--color-text-secondary)">{{ row.codelist.name }}</span>
            <span v-else style="color:var(--color-text-muted)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button size="small" link @click.stop="copyField(row)">复制</el-button>
            <el-button type="danger" size="small" link @click.stop="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 右侧：属性编辑面板 -->
    <div style="width:320px;border:1px solid var(--color-border);border-radius:4px;display:flex;flex-direction:column;flex-shrink:0">
      <div style="padding:8px 12px;background:var(--color-bg-hover);border-bottom:1px solid var(--color-border);font-size:13px;font-weight:bold">
        {{ isCreating ? '新增字段' : (selectedFieldId ? '编辑字段' : '属性编辑') }}
      </div>
      <div v-if="!selectedFieldId && !isCreating" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:12px">← 点击行或新增字段</div>
      <div v-else style="flex:1;overflow-y:auto;padding:8px">
        <el-form :model="editProp" label-width="70px" size="small">
          <el-form-item v-if="editMode && !['标签'].includes(editProp.field_type)" label="OID"><el-input v-model="editProp.variable_name" /></el-form-item>
          <el-form-item label="标签"><el-input v-model="editProp.label" /></el-form-item>
          <el-form-item label="字段类型">
            <el-select v-model="editProp.field_type" style="width:100%">
              <el-option v-for="t in fieldTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <template v-if="editProp.field_type === '数值'">
            <el-form-item label="整数位数"><el-input-number v-model="editProp.integer_digits" :min="1" :max="20" style="width:100%" /></el-form-item>
            <el-form-item label="小数位数"><el-input-number v-model="editProp.decimal_digits" :min="0" :max="15" style="width:100%" /></el-form-item>
          </template>
          <el-form-item v-if="['日期','日期时间','时间'].includes(editProp.field_type)" label="日期格式">
            <el-select v-model="editProp.date_format" clearable style="width:100%">
              <el-option v-for="f in (DATE_FORMAT_OPTIONS[editProp.field_type] || [])" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="['单选','多选','单选（纵向）','多选（纵向）'].includes(editProp.field_type)" label="选项">
            <div style="display:flex;align-items:center;gap:4px;width:100%">
              <el-select v-model="editProp.codelist_id" clearable filterable style="flex:1;min-width:0" placeholder="请选择">
                <el-option v-for="c in codelists" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
              <el-button size="small" circle type="primary" plain :icon="Plus" aria-label="新增字典" title="新增字典" @click="openQuickAddCodelist" />
              <el-button size="small" circle type="warning" plain :icon="EditPen" aria-label="编辑字典" title="编辑字典" :disabled="!editProp.codelist_id" @click="openQuickEditCodelist" />
            </div>
          </el-form-item>
          <el-form-item v-if="['文本','数值'].includes(editProp.field_type)" label="单位">
            <el-select v-model="editProp.unit_id" clearable filterable style="width:100%" placeholder="请选择">
              <el-option v-for="u in units" :key="u.id" :label="u.symbol" :value="u.id" />
            </el-select>
          </el-form-item>
        </el-form>
        <div style="display:flex;gap:8px;margin-top:4px">
          <el-button size="small" style="flex:1" @click="clearSelection">取消</el-button>
          <el-button type="primary" size="small" style="flex:1" @click="save">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 新增字典弹窗 -->
    <el-dialog v-model="showQuickAddCodelist" title="新增选项字典" width="560px" :close-on-click-modal="false" :close-on-press-escape="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="quickCodelistName" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="quickCodelistDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" /></el-form-item>
      </el-form>
      <el-table :data="quickCodelistOpts" size="small" border>
        <el-table-column v-if="editMode" prop="code" label="编码" width="120">
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
        <el-input v-if="editMode" v-model="quickOptCode" size="small" style="width:100px" placeholder="编码" />
        <el-input v-model="quickOptDecode" size="small" style="flex:1" placeholder="标签" />
        <el-button size="small" @click="quickAddOptRow">添加</el-button>
      </div>
      <template #footer>
        <el-button :disabled="quickAddCodelistSaving" @click="closeQuickAddCodelist">取消</el-button>
        <el-button type="primary" :loading="quickAddCodelistSaving" :disabled="quickAddCodelistSaving" @click="quickAddCodelist">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑字典弹窗 -->
    <el-dialog v-model="showQuickEditCodelist" title="编辑选项字典" width="560px" :close-on-click-modal="false" :close-on-press-escape="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="quickEditCodelistName" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="quickEditCodelistDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" /></el-form-item>
      </el-form>
      <el-table :data="quickEditCodelistOpts" size="small" border>
        <el-table-column v-if="editMode" prop="code" label="编码" width="120">
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
        <el-input v-if="editMode" v-model="quickEditOptCode" size="small" style="width:100px" placeholder="编码" />
        <el-input v-model="quickEditOptDecode" size="small" style="flex:1" placeholder="标签" />
        <el-button size="small" @click="quickEditAddOptRow">添加</el-button>
      </div>
      <template #footer>
        <el-button :disabled="quickEditCodelistSaving" @click="closeQuickEditCodelist">取消</el-button>
        <el-button type="primary" :loading="quickEditCodelistSaving" :disabled="quickEditCodelistSaving" @click="quickSaveCodelist">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
