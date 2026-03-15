<script setup>
import { ref, watch, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode, truncRefs } from '../composables/useApi'
import draggable from 'vuedraggable'
import { useOrderableList } from '../composables/useOrderableList'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))

const units = ref([])
const symbol = ref('')
const unitCode = ref('')
const showAdd = ref(false)

async function load() { units.value = await api.cachedGet(`/api/projects/${props.projectId}/units`) }
onMounted(load)
watch(() => props.projectId, load)
watch(refreshKey, load)

async function add() {
  try {
    await api.post(`/api/projects/${props.projectId}/units`, { symbol: symbol.value, code: unitCode.value })
    showAdd.value = false; symbol.value = ''; unitCode.value = ''; load()
  } catch (e) { ElMessage.error(e.message) }
}

async function del(u) {
  try {
    const refs = await api.get(`/api/units/${u.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      return ElMessageBox.alert(`该单位被以下字段引用，需先删除相关字段：\n${msg}`, '无法删除', { type: 'warning' })
    }
    await api.del(`/api/units/${u.id}`); load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const showEdit = ref(false)
const editSymbol = ref('')
const editUnitCode = ref('')
const editTarget = ref(null)

function openEdit(u) {
  editSymbol.value = u.symbol; editUnitCode.value = u.code || ''
  editTarget.value = u; showEdit.value = true
}

async function update() {
  try {
    const refs = await api.get(`/api/units/${editTarget.value.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }
    await api.put(`/api/units/${editTarget.value.id}`, { symbol: editSymbol.value, code: editUnitCode.value })
    showEdit.value = false; load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function updateOrder(element, newValue) {
  if (newValue == null || newValue === element.order_index) return
  try {
    await api.put(`/api/units/${element.id}`, { symbol: element.symbol, code: element.code, order_index: newValue })
    api.invalidateCache(`/api/projects/${props.projectId}/units`)
    load()
  } catch (e) { ElMessage.error(e.message) }
}

const selUnits = ref([])
async function batchDelUnits() {
  try {
    const ids = selUnits.value.map(r => r.id)
    if (!ids.length) return ElMessage.warning('请先选择要删除的单位')
    const refsMap = await api.post(`/api/projects/${props.projectId}/units/batch-references`, { ids })
    const allRefs = []
    for (const u of selUnits.value) {
      const refs = refsMap[u.id] || []
      if (refs.length) allRefs.push(`【${u.symbol}】：` + truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`), 3, '、'))
    }
    if (allRefs.length) return ElMessageBox.alert(`以下单位被字段引用，需先删除相关字段：\n${allRefs.join('\n')}`, '无法删除', { type: 'warning' })
    await api.post(`/api/projects/${props.projectId}/units/batch-delete`, { ids }); load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

function openAdd() {
  unitCode.value = genCode('UNIT')
  showAdd.value = true
}

const { dragging, handleDragEnd } = useOrderableList(`/api/projects/${props.projectId}/units/reorder`)
</script>

<template>
  <div>
    <div style="margin-bottom:12px;display:flex;gap:8px">
      <el-button type="primary" size="small" @click="openAdd">新增单位</el-button>
      <el-button type="danger" size="small" :disabled="!selUnits.length" @click="batchDelUnits">批量删除({{ selUnits.length }})</el-button>
    </div>

    <!-- 单位列表表头 -->
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f5f7fa;border:1px solid #ddd;margin-bottom:4px;font-size:12px;color:#606266;font-weight:600">
      <span style="width:16px;flex-shrink:0"></span>
      <span style="width:22px;flex-shrink:0"></span>
      <span style="width:80px;flex-shrink:0">序号</span>
      <div style="flex:1;display:flex;gap:12px">
        <span style="width:100px;flex-shrink:0">Code</span>
        <span>单位符号</span>
      </div>
      <span style="width:80px;text-align:right">操作</span>
    </div>
    <draggable v-model="units" item-key="id" handle=".drag-handle" @start="dragging = true" @end="handleDragEnd(units, load, err => ElMessage.error(err.message))">
      <template #item="{ element }">
        <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;margin-bottom:4px;background:#fff">
          <span class="drag-handle" style="cursor:move;color:#999;flex-shrink:0" role="button" aria-label="拖拽排序" tabindex="0">☰</span>
          <el-checkbox :model-value="selUnits.some(u => u.id === element.id)" @change="v => v ? selUnits.push(element) : selUnits.splice(selUnits.findIndex(u => u.id === element.id), 1)" style="flex-shrink:0" />
          <el-input-number :model-value="element.order_index" @change="v => updateOrder(element, v)" :min="1" :max="units.length" size="small" style="width:80px;flex-shrink:0" :aria-label="'编辑单位 ' + element.symbol + ' 的序号'" />
          <div style="flex:1;display:flex;gap:12px;align-items:center">
            <span style="width:100px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#606266">{{ element.code }}</span>
            <span style="font-size:13px;color:#303133">{{ element.symbol }}</span>
          </div>
          <el-button size="small" link @click="openEdit(element)">编辑</el-button>
          <el-button type="danger" size="small" link @click="del(element)">删除</el-button>
        </div>
      </template>
    </draggable>

    <el-dialog v-model="showAdd" title="新增单位" width="360px">
      <el-form label-width="80px">
        <el-form-item label="Code"><el-input v-model="unitCode" /></el-form-item>
        <el-form-item label="单位符号"><el-input v-model="symbol" placeholder="如 kg" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="add">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEdit" title="编辑单位" width="360px">
      <el-form label-width="80px">
        <el-form-item label="Code"><el-input v-model="editUnitCode" /></el-form-item>
        <el-form-item label="单位符号"><el-input v-model="editSymbol" placeholder="如 kg" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="update">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
