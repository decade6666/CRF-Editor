<script setup>
import { ref, computed, watch, onMounted, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode, truncRefs } from '../composables/useApi'
import { useSortableTable } from '../composables/useSortableTable'
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit'
import { rankFuzzyMatches } from '../composables/searchRanking'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))

const units = ref([])
const searchUnit = ref('')
const symbol = ref('')
const unitCode = ref('')
const showAdd = ref(false)

function unitSearchTexts(unit) {
  return [unit.code, unit.symbol, `${unit.code ?? ''}${unit.symbol ?? ''}`]
}

const visibleUnits = computed(() => {
  const orderedUnits = [...units.value].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return (a?.id ?? 0) - (b?.id ?? 0)
  })
  return rankFuzzyMatches(orderedUnits, searchUnit.value, unitSearchTexts)
})

async function load() { units.value = await api.cachedGet(`/api/projects/${props.projectId}/units`) }
async function reloadUnits() {
  api.invalidateCache(`/api/projects/${props.projectId}/units`)
  await load()
}
onMounted(async () => { await load(); nextTick(() => initSortable()) })
watch(() => props.projectId, () => { load(); nextTick(() => initSortable()) })
watch(refreshKey, load)

async function add() {
  try {
    await api.post(`/api/projects/${props.projectId}/units`, { symbol: symbol.value, code: unitCode.value })
    showAdd.value = false; symbol.value = ''; unitCode.value = ''; reloadUnits()
  } catch (e) { ElMessage.error(e.message) }
}

async function del(u) {
  try {
    const refs = await api.get(`/api/units/${u.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      return ElMessageBox.alert(`该单位被以下字段引用，需先删除相关字段：\n${msg}`, '无法删除', { type: 'warning' })
    }
    await ElMessageBox.confirm(`确认删除单位 "${u.symbol}"？`, '删除确认', { type: 'warning' })
    await api.del(`/api/units/${u.id}`); reloadUnits()
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
    showEdit.value = false; reloadUnits()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
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
    await ElMessageBox.confirm(`确认删除选中的 ${ids.length} 个单位？`, '批量删除', { type: 'warning' })
    await api.post(`/api/projects/${props.projectId}/units/batch-delete`, { ids }); selUnits.value = []; reloadUnits()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

function openAdd() {
  unitCode.value = genCode('UNIT')
  showAdd.value = true
}

const unitsTableRef = ref(null)
const isFiltered = computed(() => searchUnit.value.trim().length > 0)
const reorderUrl = computed(() => `/api/projects/${props.projectId}/units/reorder`)
const { initSortable } = useSortableTable(unitsTableRef, units, reorderUrl, {
  reloadFn: reloadUnits,
  isFiltered,
  renderList: visibleUnits,
})
function applyUnits(nextUnits) {
  units.value = nextUnits
}
const {
  editingId: editingUnitId,
  editingValue: editingUnitOrdinal,
  inputRef: unitOrdinalInputRef,
  startEdit: startUnitOrdinalEdit,
  commitEdit: commitUnitOrdinalEdit,
  cancelEdit: cancelUnitOrdinalEdit,
} = useOrdinalQuickEdit(units, reorderUrl, {
  applyList: applyUnits,
  isFiltered,
  reloadFn: reloadUnits,
  renderList: visibleUnits,
})
</script>

<template>
  <div style="height:calc(100vh - 160px);display:flex;flex-direction:column">
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
      <el-button type="primary" size="small" @click="openAdd">新增单位</el-button>
      <el-button type="danger" size="small" :disabled="!selUnits.length" @click="batchDelUnits">批量删除({{ selUnits.length }})</el-button>
      <el-input
        v-model="searchUnit"
        placeholder="搜索单位..."
        clearable
        size="small"
        style="width:180px"
      />
    </div>

    <el-table ref="unitsTableRef" :data="visibleUnits" size="small" border height="100%" row-key="id"
      @selection-change="r => selUnits = r">
      <el-table-column width="32" v-if="!isFiltered">
        <template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template>
      </el-table-column>
      <el-table-column type="selection" width="40" />
      <el-table-column label="序号" width="100">
        <template #default="{ row }">
          <el-input-number
            v-if="editingUnitId === row.id"
            ref="unitOrdinalInputRef"
            v-model="editingUnitOrdinal"
            :min="1"
            :max="visibleUnits.length"
            :controls="false"
            size="small"
            style="width:80px"
            @click.stop
            @keyup.enter.stop="commitUnitOrdinalEdit"
            @keydown.esc.stop.prevent="cancelUnitOrdinalEdit"
            @blur="cancelUnitOrdinalEdit"
          />
          <button
            v-else
            type="button"
            style="border:none;background:transparent;padding:0;cursor:pointer"
            @click.stop
            @dblclick.stop="startUnitOrdinalEdit(row)"
          >
            <span class="ordinal-cell">{{ row.order_index }}</span>
          </button>
        </template>
      </el-table-column>
      <el-table-column v-if="editMode" prop="code" label="OID" min-width="110" show-overflow-tooltip />
      <el-table-column prop="symbol" label="单位符号" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" link @click.stop="openEdit(row)">编辑</el-button>
          <el-button type="danger" size="small" link @click.stop="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showAdd" title="新增单位" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item v-if="editMode" label="OID"><el-input v-model="unitCode" /></el-form-item>
        <el-form-item label="单位符号"><el-input v-model="symbol" placeholder="如 kg" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="add">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEdit" title="编辑单位" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item v-if="editMode" label="OID"><el-input v-model="editUnitCode" /></el-form-item>
        <el-form-item label="单位符号"><el-input v-model="editSymbol" placeholder="如 kg" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="update">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
