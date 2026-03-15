<script setup>
import { ref, reactive, computed, watch, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genFieldVarName, truncRefs } from '../composables/useApi'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))

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
const fieldTypes = ['文本', '数值', '日期', '日期时间', '时间', '单选', '多选', '单选（纵向）', '多选（纵向）', '标签']

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
onMounted(load)
watch(() => props.projectId, () => { selectedFieldId.value = null; isCreating.value = false; load() })
watch(refreshKey, load)

// 字段库不展示日志行
const visibleFields = computed(() => fields.value.filter(f => f.field_type !== '日志行'))

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

async function updateOrder(row, newValue) {
  if (newValue == null || newValue === row.order_index) return
  try {
    await api.put(`/api/projects/${props.projectId}/field-definitions/${row.id}`, {
      variable_name: row.variable_name, label: row.label, field_type: row.field_type,
      integer_digits: row.integer_digits, decimal_digits: row.decimal_digits,
      date_format: row.date_format, codelist_id: row.codelist_id, unit_id: row.unit_id,
      order_index: newValue
    })
    reloadFields()
  } catch (e) { ElMessage.error(e.message) }
}
</script>

<template>
  <div style="display:flex;gap:12px;align-items:stretch;height:calc(100vh - 160px)">
    <!-- 左侧：字段列表 -->
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <el-button type="primary" size="small" @click="openAdd">新增字段</el-button>
        <el-button type="danger" size="small" :disabled="!selFields.length" @click="batchDelFields">批量删除({{ selFields.length }})</el-button>
      </div>
      <el-table :data="visibleFields" size="small" border height="100%"
        :row-class-name="({ row }) => row.id === selectedFieldId ? 'current-row' : ''"
        :row-style="{ cursor: 'pointer' }"
        @row-click="openEdit" @selection-change="r => selFields = r">
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }">
            <div @click.stop>
              <el-input-number :model-value="row.order_index" @change="v => updateOrder(row, v)" :min="1" :max="visibleFields.length" size="small" style="width:80px" :aria-label="'编辑字段 ' + row.label + ' 的序号'" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="variable_name" label="Code（变量名）" width="200" show-overflow-tooltip />
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
          <el-form-item v-if="!['标签'].includes(editProp.field_type)" label="变量名"><el-input v-model="editProp.variable_name" /></el-form-item>
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
            <el-select v-model="editProp.codelist_id" clearable filterable style="width:100%" placeholder="请选择">
              <el-option v-for="c in codelists" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="['文本','数值'].includes(editProp.field_type)" label="单位">
            <el-select v-model="editProp.unit_id" clearable filterable style="width:100%" placeholder="请选择">
              <el-option v-for="u in units" :key="u.id" :label="u.symbol" :value="u.id" />
            </el-select>
          </el-form-item>
        </el-form>
        <div style="display:flex;gap:8px;margin-top:4px">
          <el-button size="small" @click="clearSelection">取消</el-button>
          <el-button type="primary" size="small" style="flex:1" @click="save">保存</el-button>
        </div>
      </div>
    </div>
  </div>
</template>