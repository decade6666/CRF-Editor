<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode, truncRefs } from '../composables/useApi'
import { buildPartialDeleteMessage, confirmReferenceAwareBatchDelete, formatFieldReference, showReferenceBlockedAlert } from '../composables/referenceDeleteGuard'
import { useSortableTable } from '../composables/useSortableTable'
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit'
import { rankFuzzyMatches } from '../composables/searchRanking'
import { Delete, Plus } from '@element-plus/icons-vue'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))

const units = ref([])
const searchUnit = ref('')
const selectedUnitId = ref(null)
const isCreatingUnit = ref(false)
const unitEditProp = reactive({ code: '', symbol: '' })

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

function resetUnitEditor(unit) {
  Object.assign(unitEditProp, {
    code: '',
    symbol: '',
  }, unit ? {
    code: unit.code || '',
    symbol: unit.symbol || '',
  } : {})
}

function clearUnitSelection() {
  selectedUnitId.value = null
  isCreatingUnit.value = false
  resetUnitEditor()
}

function selectUnit(unit) {
  if (!unit) return clearUnitSelection()
  selectedUnitId.value = unit.id
  isCreatingUnit.value = false
  resetUnitEditor(unit)
}

async function load() {
  units.value = await api.cachedGet(`/api/projects/${props.projectId}/units`)
  if (selectedUnitId.value && !units.value.some((unit) => unit.id === selectedUnitId.value)) {
    clearUnitSelection()
  }
}

async function reloadUnits() {
  api.invalidateCache(`/api/projects/${props.projectId}/units`)
  await load()
}

async function reloadAndSelectUnit(unitId) {
  await reloadUnits()
  const latest = units.value.find((unit) => unit.id === unitId)
  if (latest) selectUnit(latest)
  else clearUnitSelection()
}

onMounted(async () => { await load(); nextTick(() => initSortable()) })
watch(() => props.projectId, () => {
  clearUnitSelection()
  load()
  nextTick(() => initSortable())
})
watch(refreshKey, load)

async function saveUnit() {
  const unitId = selectedUnitId.value
  if (!isCreatingUnit.value && !unitId) return
  try {
    if (isCreatingUnit.value) {
      const created = await api.post(`/api/projects/${props.projectId}/units`, {
        symbol: unitEditProp.symbol,
        code: unitEditProp.code,
      })
      await reloadAndSelectUnit(created.id)
      return
    }

    const refs = await api.get(`/api/units/${unitId}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }
    await api.put(`/api/units/${unitId}`, {
      symbol: unitEditProp.symbol,
      code: unitEditProp.code,
    })
    await reloadAndSelectUnit(unitId)
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function del(u) {
  try {
    const refs = await api.get(`/api/units/${u.id}/references?include_unplaced=true`)
    if (refs.length) {
      const msg = truncRefs(refs.map(formatFieldReference))
      return await showReferenceBlockedAlert(ElMessageBox, `该单位被以下字段引用，需先解除相关字段的引用：\n${msg}`)
    }
    await ElMessageBox.confirm(`确认删除单位 "${u.symbol}"？`, '删除确认', { type: 'warning' })
    await api.del(`/api/units/${u.id}`)
    if (selectedUnitId.value === u.id) clearUnitSelection()
    await reloadUnits()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selUnits = ref([])
function unitsRowClassName({ row }) {
  const classNames = []
  if (row.id === selectedUnitId.value) classNames.push('current-row')
  if (selUnits.value.some((unit) => unit.id === row.id)) classNames.push('is-selected-row')
  return classNames.join(' ')
}

async function batchDelUnits() {
  try {
    const ids = selUnits.value.map(r => r.id)
    if (!ids.length) return ElMessage.warning('请先选择要删除的单位')
    const items = [...selUnits.value]
    const refsMap = await api.post(`/api/projects/${props.projectId}/units/batch-references?include_unplaced=true`, { ids })
    const toDelete = await confirmReferenceAwareBatchDelete(ElMessageBox, {
      items,
      refsMap,
      noun: '单位',
      nameOf: (u) => u.symbol,
      describeRefs: (refs) => truncRefs(refs.map(formatFieldReference), 3, '、'),
    })
    if (!toDelete.length) return
    const deleteIds = toDelete.map((x) => x.id)
    await api.post(`/api/projects/${props.projectId}/units/batch-delete`, { ids: deleteIds })
    if (deleteIds.includes(selectedUnitId.value)) clearUnitSelection()
    selUnits.value = []
    await reloadUnits()
    if (toDelete.length < items.length) ElMessage.success(buildPartialDeleteMessage('单位', toDelete.length, items.length - toDelete.length))
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

function openAdd() {
  resetUnitEditor({ code: genCode('UNIT') })
  selectedUnitId.value = null
  isCreatingUnit.value = true
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
  <div style="display:flex;gap:12px;align-items:stretch;height:calc(100vh - 160px)">
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <div class="list-toolbar">
        <el-tooltip content="新增单位" placement="top">
          <el-button type="primary" size="small" :icon="Plus" aria-label="新增单位" @click="openAdd" />
        </el-tooltip>
        <el-tooltip content="批量删除单位" placement="top">
          <el-button type="danger" size="small" :icon="Delete" aria-label="批量删除单位" :disabled="!selUnits.length" @click="batchDelUnits" />
        </el-tooltip>
        <el-input
          v-model="searchUnit"
          placeholder="搜索单位..."
          clearable
          size="small"
          style="width:180px"
        />
      </div>

      <el-table ref="unitsTableRef" :data="visibleUnits" size="small" border height="100%" row-key="id"
        :row-class-name="unitsRowClassName"
        :row-style="{ cursor: 'pointer' }"
        @row-click="selectUnit"
        @selection-change="r => selUnits = r"
      >
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
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-tooltip content="删除" placement="top">
              <el-button type="danger" size="small" link :icon="Delete" aria-label="删除" @click.stop="del(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div style="width:320px;display:flex;flex-direction:column;flex-shrink:0">
      <div class="pane-tool-slot">
        <b>{{ isCreatingUnit ? '新增单位' : (selectedUnitId ? '编辑单位' : '属性编辑') }}</b>
      </div>
      <div style="flex:1;min-height:0;border:1px solid var(--color-border);border-radius:4px;display:flex;flex-direction:column;overflow:hidden">
        <div v-if="!selectedUnitId && !isCreatingUnit" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:12px">← 点击行或新增单位</div>
        <div v-else style="flex:1;overflow-y:auto;padding:8px">
          <el-form :model="unitEditProp" label-width="70px" size="small">
            <el-form-item v-if="editMode" label="OID"><el-input v-model="unitEditProp.code" /></el-form-item>
            <el-form-item label="单位符号"><el-input v-model="unitEditProp.symbol" placeholder="如 kg" /></el-form-item>
          </el-form>
          <div style="display:flex;gap:8px;margin-top:4px">
            <el-button size="small" style="flex:1" @click="clearUnitSelection">取消</el-button>
            <el-button type="primary" size="small" style="flex:1" @click="saveUnit">保存</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
