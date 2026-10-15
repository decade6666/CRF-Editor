<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode } from '../composables/useApi'
import { useSortableTable } from '../composables/useSortableTable'
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit'
import { rankFuzzyMatches } from '../composables/searchRanking'
import { CircleClose, Delete, DocumentCopy, Plus, View } from '@element-plus/icons-vue'
import VisitFormPreviewDialog from './VisitFormPreviewDialog.vue'

// workspace：'list'（访视页默认）| 'flow'（访视流程标签页）；由 App.vue 顶级标签指定，实例内不切换
const props = defineProps({
  projectId: { type: Number, required: true },
  workspace: { type: String, default: 'list' },
})
const refreshKey = inject('refreshKey', ref(0))
const editMode = inject('editMode', ref(false))

const visits = ref([])
const searchVisit = ref('')
const filteredVisits = computed(() =>
  rankFuzzyMatches(visits.value, searchVisit.value, (item) => Object.values(item))
)
const matrixData = ref(null)
// 所有表单列表（用于右侧面板添加表单）
const allForms = ref([])
// 访视流程工作区：list（默认全宽列表）| flow（页面内矩阵 / 单访视）
const workspaceMode = ref(props.workspace)
const flowView = ref('matrix')
// 表单内容预览弹窗：只保留开关与被预览表单 id，预览数据由 VisitFormPreviewDialog 自持
const showFormPreview = ref(false)
const formPreviewFormId = ref(null)

// 当前选中的访视（右侧面板）
const selectedVisit = ref(null)
const isCreatingVisit = ref(false)
const visitEditProp = reactive({ name: '', code: '' })
// 删除当前选中访视后，表格重新渲染会触发一次 current-change 自动落到其他行；
// 该标志抑制这次被动重选，避免属性卡被自动切换到其他访视。
let suppressVisitRowSelect = false

function resetVisitEditor(visit) {
  Object.assign(visitEditProp, {
    name: '',
    code: '',
  }, visit ? {
    name: visit.name || '',
    code: visit.code || '',
  } : {})
}

function clearVisitSelection() {
  selectedVisit.value = null
  isCreatingVisit.value = false
  resetVisitEditor()
  visitsTableRef.value?.setCurrentRow(null)
}

function selectListVisit(visit) {
  if (suppressVisitRowSelect) return
  if (!visit) return clearVisitSelection()
  selectedVisit.value = visit
  isCreatingVisit.value = false
  resetVisitEditor(visit)
  visitsTableRef.value?.setCurrentRow(visit)
}

// 用户主动点击行不受删除抑制窗口影响：取消抑制并立即选中
function onVisitRowClick(visit) {
  suppressVisitRowSelect = false
  selectListVisit(visit)
}

async function suppressNextVisitRowSelect() {
  suppressVisitRowSelect = true
  try {
    await reloadVisits()
    await nextTick()
    await nextTick()
  } finally {
    // reload 失败也必须释放标志，否则后续行点击/current-change 被永久吞掉
    suppressVisitRowSelect = false
  }
}

function selectFlowVisit(visit) {
  if (visit) selectedVisit.value = visit
}

async function load() {
  visits.value = await api.cachedGet(`/api/projects/${props.projectId}/visits`)
  matrixData.value = await api.cachedGet(`/api/projects/${props.projectId}/visit-form-matrix`)
  allForms.value = await api.cachedGet(`/api/projects/${props.projectId}/forms`)
  // 刷新后按 id 重建选中引用，避免旧对象引用失配
  if (selectedVisit.value) {
    const refreshedSelectedVisit = visits.value.find(v => v.id === selectedVisit.value.id)
    if (refreshedSelectedVisit) selectedVisit.value = refreshedSelectedVisit
    else clearVisitSelection()
  }
  syncVisitForms()
}
onMounted(async () => { await load(); nextTick(() => initVisitsSortable()) })
watch(
  () => props.projectId,
  async (newProjectId, previousProjectId) => {
    if (newProjectId === previousProjectId) return
    workspaceMode.value = props.workspace
    flowView.value = 'matrix'
    clearVisitSelection()
    showFormPreview.value = false
    formPreviewFormId.value = null
    await load()
  },
)
watch(refreshKey, load)
watch(selectedVisit, syncVisitForms)

// 拖拽排序
const visitsTableRef = ref(null)
const isFiltered = computed(() => searchVisit.value.trim().length > 0)
const reorderUrl = computed(() => `/api/projects/${props.projectId}/visits/reorder`)
async function reloadVisits() {
  api.invalidateCache(`/api/projects/${props.projectId}/visits`)
  await load()
  // 写操作完成权威本地重载后广播刷新信号：另一个保留实例（访视列表 / 访视流程）监听
  // 同一 refreshKey 并重载，修改访视信息后无需重进页面即可看到最新值（契约见
  // .trellis/spec/frontend/state-management.md「refreshKey Global Bump」）。读路径不广播。
  refreshKey.value++
}

async function reloadAndSelectVisit(visitId) {
  await reloadVisits()
  const latest = visits.value.find((visit) => visit.id === visitId)
  if (latest) selectListVisit(latest)
  else clearVisitSelection()
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

async function saveVisit() {
  const visitId = selectedVisit.value?.id
  if (!isCreatingVisit.value && !visitId) return
  try {
    if (isCreatingVisit.value) {
      const created = await api.post(`/api/projects/${props.projectId}/visits`, { name: visitEditProp.name, code: visitEditProp.code })
      await reloadAndSelectVisit(created.id)
      return
    }
    await api.put(`/api/projects/${props.projectId}/visits/${visitId}`, { name: visitEditProp.name, code: visitEditProp.code })
    await reloadAndSelectVisit(visitId)
  } catch (e) { ElMessage.error(e.message) }
}

async function del(v) {
  try {
    await ElMessageBox.confirm(`删除访视 "${v.name}"？`, '确认', { type: 'warning' })
    await api.del(`/api/visits/${v.id}`)
    api.invalidateCache(`/api/projects/${props.projectId}`)
    if (selectedVisit.value?.id === v.id) {
      suppressVisitRowSelect = true
      clearVisitSelection()
      await suppressNextVisitRowSelect()
    } else {
      await reloadVisits()
    }
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selVisits = ref([])
async function batchDelVisits() {
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${selVisits.value.length} 个访视？`, '批量删除', { type: 'warning' })
    const delIds = new Set(selVisits.value.map(v => v.id))
    await api.post(`/api/projects/${props.projectId}/visits/batch-delete`, { ids: [...delIds] })
    if (selectedVisit.value && delIds.has(selectedVisit.value.id)) {
      suppressVisitRowSelect = true
      clearVisitSelection()
      await suppressNextVisitRowSelect()
    } else {
      await reloadVisits()
    }
    selVisits.value = []
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function copyVisit(v) {
  try {
    await api.post(`/api/visits/${v.id}/copy`, {})
    api.invalidateCache(`/api/projects/${props.projectId}`)
    await reloadVisits(); ElMessage.success('复制成功')
  }
  catch (e) { ElMessage.error(e.message) }
}

function openAdd() {
  resetVisitEditor({ code: genCode('VISIT') })
  selectedVisit.value = null
  isCreatingVisit.value = true
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

// 从访视移除表单（访视流程页内移除不二次确认，2.5）
async function removeFormFromVisit(formId) {
  if (!selectedVisit.value) return
  try {
    await api.del(`/api/visits/${selectedVisit.value.id}/forms/${formId}`)
    await reloadVisitForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

// 打开表单预览：先备好表单 id 上下文，再打开弹窗（弹窗打开时按 id 重新解析权威数据）
function openFormPreview(form) {
  formPreviewFormId.value = form.id
  showFormPreview.value = true
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
watch([selectedVisit, visitForms, flowView, workspaceMode], () => {
  nextTick(() => initVisitFormsSortable())
})

watch(flowView, (view) => {
  if (view === 'single') {
    nextTick(() => {
      initVisitFormsSortable()
      visitsTableRef.value?.setCurrentRow(selectedVisit.value)
    })
  }
})

// 预览弹窗中切换关联（矩阵单元格点击）
async function toggleCell(visitId, formId) {
  const m = matrixData.value?.matrix
  if (!m) return
  const has = m[visitId] && m[visitId][formId] != null
  try {
    if (has) {
      await api.del(`/api/visits/${visitId}/forms/${formId}`)
    } else await api.post(`/api/visits/${visitId}/forms/${formId}`, {})
    await reloadVisitForms()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}
</script>

<template>
  <div style="display:flex;flex-direction:column;height:calc(100vh - 160px)">
    <template v-if="workspaceMode === 'list'">
      <div style="display:flex;gap:12px;align-items:stretch;flex:1;min-height:0">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column">
          <!-- 访视列表工具栏（「访视流程」为顶级标签页，不再在页内提供入口） -->
          <div class="list-toolbar">
            <el-tooltip content="新增访视" placement="top">
              <el-button type="primary" size="small" :icon="Plus" aria-label="新增访视" @click="openAdd" />
            </el-tooltip>
            <el-tooltip content="批量删除访视" placement="top">
              <el-button type="danger" size="small" :icon="Delete" aria-label="批量删除访视" :disabled="!selVisits.length" @click="batchDelVisits" />
            </el-tooltip>
            <el-input
              v-model="searchVisit"
              placeholder="搜索访视..."
              clearable
              size="small"
              style="width:180px"
            />
          </div>
          <el-table ref="visitsTableRef" :data="filteredVisits" size="small" border highlight-current-row row-key="id"
            :row-style="{ cursor: 'pointer' }"
            @row-click="onVisitRowClick"
            @current-change="selectListVisit"
            @selection-change="r => selVisits = r" style="width:100%" height="100%">
            <el-table-column width="32" v-if="!isFiltered">
              <template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template>
            </el-table-column>
            <el-table-column type="selection" width="40" />
            <el-table-column label="序号" width="100">
              <template #default="{ row }">
                <el-input-number
                  v-if="workspaceMode === 'list' && editingVisitId === row.id"
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
                  v-else-if="workspaceMode === 'list'"
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
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-tooltip content="复制" placement="top">
                  <el-button size="small" link :icon="DocumentCopy" aria-label="复制" @click.stop="copyVisit(row)" />
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-button type="danger" size="small" link :icon="Delete" aria-label="删除" @click.stop="del(row)" />
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div style="width:320px;display:flex;flex-direction:column;flex-shrink:0">
          <div class="pane-tool-slot">
            <b>{{ isCreatingVisit ? '新增访视' : (selectedVisit ? '编辑访视' : '属性编辑') }}</b>
          </div>
          <div style="flex:1;min-height:0;border:1px solid var(--color-border);border-radius:4px;display:flex;flex-direction:column;overflow:hidden">
            <div v-if="!selectedVisit && !isCreatingVisit" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:12px">← 点击行或新增访视</div>
            <div v-else style="flex:1;overflow-y:auto;padding:8px">
              <el-form :model="visitEditProp" label-width="70px" size="small">
                <el-form-item v-if="editMode" label="OID"><el-input v-model="visitEditProp.code" /></el-form-item>
                <el-form-item label="访视名称"><el-input v-model="visitEditProp.name" /></el-form-item>
              </el-form>
              <div style="display:flex;gap:8px;margin-top:4px">
                <el-button size="small" style="flex:1" @click="clearVisitSelection">取消</el-button>
                <el-button type="primary" size="small" style="flex:1" @click="saveVisit">保存</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- 访视流程工作区 -->
      <div class="pane-tool-slot visit-flow-header">
        <b>访视流程</b>
        <span v-if="flowView === 'matrix'" style="color:var(--color-text-muted);font-size:12px">点击单元格可切换关联，数字为表单在该访视中的序号</span>
        <div style="margin-left:auto" />
        <el-switch
          v-model="flowView"
          size="small"
          inline-prompt
          inactive-text="矩阵"
          active-text="列表"
          :active-value="'single'"
          :inactive-value="'matrix'"
        />
      </div>

      <div v-if="flowView === 'matrix'" style="flex:1;min-height:0;overflow:auto">
        <template v-if="matrixData && matrixData.forms.length && matrixData.visits.length">
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
        </template>
        <div v-else style="color:var(--color-text-muted);text-align:center;padding:40px">
          暂无数据，请先添加访视和表单
        </div>
      </div>

      <div v-if="flowView === 'single'" style="flex:1;min-height:0;display:flex;gap:16px">
        <!-- 单访视：左列表只读选择 -->
        <div style="width:50%;min-width:0;display:flex;flex-direction:column">
          <el-table ref="visitsTableRef" :data="filteredVisits" size="small" border highlight-current-row row-key="id"
            @current-change="selectFlowVisit" style="width:100%" height="100%">
            <el-table-column label="序号" width="100">
              <template #default="{ row }"><span class="ordinal-cell">{{ row.sequence }}</span></template>
            </el-table-column>
            <el-table-column v-if="editMode" prop="code" label="OID" min-width="110" show-overflow-tooltip />
            <el-table-column prop="name" label="访视名称" show-overflow-tooltip />
          </el-table>
        </div>
        <!-- 单访视：右侧表单关系维护 -->
        <div v-if="selectedVisit" style="width:50%;min-width:0;display:flex;flex-direction:column">
          <div class="pane-tool-slot">
            <b>{{ selectedVisit.name }}</b>
            <span style="color:var(--color-text-muted);font-size:12px">关联表单 {{ visitForms.length }} 个</span>
          </div>
          <div class="list-toolbar">
            <el-select v-model="addFormId" filterable clearable placeholder="选择要添加的表单" size="small" style="flex:1">
              <el-option v-for="f in availableForms" :key="f.id" :label="f.name + ' (' + f.code + ')'" :value="f.id" />
            </el-select>
            <el-button type="primary" size="small" :disabled="!addFormId" @click="addFormToVisit">添加</el-button>
          </div>
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
              <el-table-column label="操作" width="90" fixed="right">
                <template #default="{ row }">
                  <el-tooltip content="预览" placement="top">
                    <el-button type="primary" size="small" link :icon="View" aria-label="预览" @click.stop="openFormPreview(row)" />
                  </el-tooltip>
                  <el-tooltip content="移除" placement="top">
                    <el-button type="danger" size="small" link :icon="CircleClose" aria-label="移除" @click.stop="removeFormFromVisit(row.id)" />
                  </el-tooltip>
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
        <div v-else style="width:50%;min-width:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:14px;border:1px dashed var(--color-border);border-radius:4px">
          ← 点击左侧访视行查看和编辑关联表单
        </div>
      </div>
    </template>
  </div>
  <VisitFormPreviewDialog v-model="showFormPreview" :project-id="projectId" :form-id="formPreviewFormId" />
</template>
