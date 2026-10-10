<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, DocumentCopy, EditPen, Plus } from '@element-plus/icons-vue'
import { api, genFieldVarName } from '../composables/useApi'
import { useSortableTable } from '../composables/useSortableTable'
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit'
import { rankFuzzyMatches } from '../composables/searchRanking'
import { isVisibleInFieldLibrary } from '../composables/fieldDefinitionVisibility'
import { syncFieldTypeSpecificProps } from '../composables/formDesignerPropertyEditor'
import { countDistinctForms, formatFieldImpactMessage } from '../composables/fieldReferenceImpact'
import { OID_ERROR, isValidRequiredOid } from '../composables/oidValidation.js'
import { isChoiceField } from '../composables/useCRFRenderer'
import { buildFieldTypeOptions, isMultiselectFieldType, allowsMultiselect } from '../composables/fieldTypeAvailability'
import { DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS } from '../composables/dateFormatOptions.js'
import CodelistQuickEditDialog from './CodelistQuickEditDialog.vue'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))
const projectDbType = inject('projectDbType', ref('其他'))

const fields = ref([])
const codelists = ref([])
const units = ref([])
const selectedFieldId = ref(null)
const isCreating = ref(false)
const editProp = reactive({
  variable_name: '', label: '', field_type: '文本',
  integer_digits: null, decimal_digits: null, date_format: null,
  checkbox_label: null, codelist_id: null, unit_id: null,
})
const fieldTypes = ['文本', '数值', '日期', '日期时间', '时间', '单选', '多选', '单选（纵向）', '多选（纵向）', '复选']
const availableFieldTypes = computed(() =>
  buildFieldTypeOptions(fieldTypes, projectDbType.value, editProp.field_type)
)

watch(() => editProp.field_type, (newType) => {
  Object.assign(editProp, syncFieldTypeSpecificProps(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS))
})

async function load() {
  // 项目身份门：共享弹窗 afterChange / 项目切换都会触发本函数，
  // 迟到的批量加载不得把旧项目数据写进已切换项目的列表状态。
  const pid = props.projectId
  const [nextFields, nextCodelists, nextUnits] = await Promise.all([
    api.cachedGet(`/api/projects/${pid}/field-definitions`),
    api.cachedGet(`/api/projects/${pid}/codelists`),
    api.cachedGet(`/api/projects/${pid}/units`),
  ])
  if (props.projectId !== pid) return
  fields.value = nextFields
  codelists.value = nextCodelists
  units.value = nextUnits
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

// 字段编辑表单仅维护这些属性；order_index / id 等由排序端点独立管理，
// 不得随属性保存回传，否则会把已改动的序号回退到打开编辑时的旧值。
const EDITABLE_PROP_KEYS = [
  'variable_name', 'label', 'field_type',
  'integer_digits', 'decimal_digits', 'date_format',
  'checkbox_label', 'codelist_id', 'unit_id',
]
function pickEditableProps(source) {
  const src = source || {}
  return EDITABLE_PROP_KEYS.reduce((acc, key) => {
    if (key in src) acc[key] = src[key]
    return acc
  }, {})
}

function resetProp(data) {
  Object.assign(editProp, {
    variable_name: '', label: '', field_type: '文本',
    integer_digits: null, decimal_digits: null, date_format: null,
    checkbox_label: null, codelist_id: null, unit_id: null,
  }, data || {})
}

function openAdd() { resetProp({ variable_name: genFieldVarName() }); selectedFieldId.value = null; isCreating.value = true }
function openEdit(f) { resetProp(pickEditableProps(f)); selectedFieldId.value = f.id; isCreating.value = false }
function clearSelection() { resetProp(); selectedFieldId.value = null; isCreating.value = false }

async function save() {
  if (!isCreating.value && !selectedFieldId.value) return
  if (!['标签', '日志行'].includes(editProp.field_type) && !isValidRequiredOid(editProp.variable_name)) {
    return ElMessage.warning(OID_ERROR)
  }
  if (isChoiceField(editProp.field_type) && !editProp.codelist_id)
    return ElMessage.warning('单选/多选字段必须选择选项字典')
  if (isMultiselectFieldType(editProp.field_type) && !allowsMultiselect(projectDbType.value))
    return ElMessage.warning('当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型')
  try {
    if (isCreating.value) {
      const created = await api.post(`/api/projects/${props.projectId}/field-definitions`, { ...editProp })
      isCreating.value = false; selectedFieldId.value = created.id
      await load()
      const latest = fields.value.find(f => f.id === created.id)
      if (latest) resetProp(pickEditableProps(latest))
      ElMessage.success('新增成功')
    } else {
      const refs = await api.get(`/api/field-definitions/${selectedFieldId.value}/references`)
      if (countDistinctForms(refs) > 1) {
        const msg = formatFieldImpactMessage(refs, { max: 5, sep: '、' })
        await ElMessageBox.confirm(`修改将影响以下表单：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
      }
      await api.put(`/api/projects/${props.projectId}/field-definitions/${selectedFieldId.value}`, { ...editProp })
      await load()
      const latest = fields.value.find(f => f.id === selectedFieldId.value)
      if (latest) resetProp(pickEditableProps(latest))
      ElMessage.success('保存成功')
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function del(f) {
  try {
    const refs = await api.get(`/api/field-definitions/${f.id}/references`)
    if (countDistinctForms(refs) > 1) {
      const msg = formatFieldImpactMessage(refs, { max: 5, sep: '、' })
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
      if (countDistinctForms(refs) > 1) allRefs.push(`【${f.label}】：` + formatFieldImpactMessage(refs, { max: 3, sep: '、' }))
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

// 选项字典快捷增/改：共享弹窗 CodelistQuickEditDialog 承载表单状态、校验、引用确认与
// 缓存失效（codelists + field-definitions）；宿主只保留开关、编辑目标与保存后的
// 刷新/绑定（afterChange）。
const showQuickAddCodelist = ref(false)
const showQuickEditCodelist = ref(false)
const quickEditCodelistId = ref(null)

function openQuickAddCodelist() {
  showQuickAddCodelist.value = true
}

function openQuickEditCodelist() {
  if (!editProp.codelist_id) return
  if (!codelists.value.some((c) => c.id === editProp.codelist_id)) return
  quickEditCodelistId.value = editProp.codelist_id
  showQuickEditCodelist.value = true
}

// 保存成功/失败后宿主刷新：与历史 reloadAfterCodelistChange 相同的 load + refreshKey 序列
// （缓存失效已前移到弹窗内）；add 另回绑新建字典，新增成功提示由弹窗经
// add-success-message 在关闭后发出（保持原 close→toast 顺序），编辑成功由弹窗提示。
async function afterCodelistDialogChange(kind, { codelist }) {
  await load()
  refreshKey.value++
  if (kind === 'add') {
    editProp.codelist_id = codelist.id
  }
}
</script>

<template>
  <div style="display:flex;gap:12px;align-items:stretch;height:calc(100vh - 160px)">
    <!-- 左侧：字段列表 -->
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <div class="list-toolbar">
        <el-tooltip content="新增字段" placement="top">
          <el-button type="primary" size="small" :icon="Plus" aria-label="新增字段" @click="openAdd" />
        </el-tooltip>
        <el-tooltip content="批量删除字段" placement="top">
          <el-button type="danger" size="small" :icon="Delete" aria-label="批量删除字段" :disabled="!selFields.length" @click="batchDelFields" />
        </el-tooltip>
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
          <template #default="{ row, $index }">
            <el-input-number
              v-if="editingFieldId === row.id"
              ref="fieldOrdinalInputRef"
              v-model="editingFieldOrdinal"
              :min="1"
              :max="visibleFields.length"
              :controls="false"
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
              <span class="ordinal-cell">{{ $index + 1 }}</span>
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
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-tooltip content="复制" placement="top">
              <el-button size="small" link :icon="DocumentCopy" aria-label="复制" @click.stop="copyField(row)" />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button type="danger" size="small" link :icon="Delete" aria-label="删除" @click.stop="del(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 右侧：属性编辑面板（标题行在卡片外，卡片顶边与左侧表格顶边对齐） -->
    <div style="width:320px;display:flex;flex-direction:column;flex-shrink:0">
      <div class="pane-tool-slot">
        <b>{{ isCreating ? '新增字段' : (selectedFieldId ? '编辑字段' : '属性编辑') }}</b>
      </div>
      <div style="flex:1;min-height:0;border:1px solid var(--color-border);border-radius:4px;display:flex;flex-direction:column;overflow:hidden">
        <div v-if="!selectedFieldId && !isCreating" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:12px">← 点击行或新增字段</div>
        <div v-else style="flex:1;overflow-y:auto;padding:8px">
        <el-form :model="editProp" label-width="70px" size="small">
          <el-form-item v-if="editMode && !['标签'].includes(editProp.field_type)" label="OID"><el-input v-model="editProp.variable_name" /></el-form-item>
          <el-form-item label="标签"><el-input v-model="editProp.label" /></el-form-item>
          <el-form-item label="字段类型">
            <el-select v-model="editProp.field_type" style="width:100%">
              <el-option v-for="t in availableFieldTypes" :key="t.value" :label="t.label" :value="t.value" :disabled="t.disabled" />
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
          <el-form-item v-if="editProp.field_type === '复选'" label="复选文本"><el-input v-model="editProp.checkbox_label" placeholder="✔" /></el-form-item>
          <el-form-item v-if="isChoiceField(editProp.field_type)" label="选项">
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
    </div>

    <!-- 字典快捷增/改共享弹窗（新增 + 编辑两个实例，模式互斥） -->
    <CodelistQuickEditDialog
      v-model="showQuickAddCodelist"
      mode="add"
      :project-id="projectId"
      :codelists="codelists"
      :show-code-column="editMode"
      add-success-message="新增成功"
      :after-change="afterCodelistDialogChange"
    />
    <CodelistQuickEditDialog
      v-model="showQuickEditCodelist"
      mode="edit"
      :codelist-id="quickEditCodelistId"
      :project-id="projectId"
      :codelists="codelists"
      :show-code-column="editMode"
      :after-change="afterCodelistDialogChange"
    />
  </div>
</template>
