<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode, truncRefs } from '../composables/useApi'
import draggable from 'vuedraggable'
import { useOrderableList } from '../composables/useOrderableList'
import { useSortableTable } from '../composables/useSortableTable'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))

const codelists = ref([])
// 左侧：字典搜索
const searchCl = ref('')
const filteredCodelists = computed(() => {
  const kw = searchCl.value.trim().toLowerCase()
  if (!kw) return codelists.value
  return codelists.value.filter(item =>
    Object.values(item).some(v => String(v ?? '').toLowerCase().includes(kw))
  )
})

// 右侧：选项搜索（使用 v-show 保留拖拽）
const searchOpt = ref('')
const selected = ref(null)
const showAddCl = ref(false)
const showAddOpt = ref(false)
const clForm = reactive({ name: '', code: '', description: '' })
const optForm = reactive({ code: '', decode: '', trailing_underscore: 0 })

const codelistsTableRef = ref(null)
const isCodelistsFiltered = computed(() => searchCl.value.trim().length > 0)
const codelistsReorderUrl = computed(() => `/api/projects/${props.projectId}/codelists/reorder`)

async function load() {
  codelists.value = await api.cachedGet(`/api/projects/${props.projectId}/codelists`)
  if (selected.value) {
    selected.value = codelists.value.find(item => item.id === selected.value.id) || null
  }
  nextTick(() => initCodelistsSortable())
}
// 写操作后强制刷新：先失效缓存，再重新加载
async function reload() {
  api.invalidateCache(`/api/projects/${props.projectId}/codelists`)
  await load()
}
const { initSortable: initCodelistsSortable } = useSortableTable(
  codelistsTableRef,
  filteredCodelists,
  codelistsReorderUrl,
  { reloadFn: reload, isFiltered: isCodelistsFiltered }
)
onMounted(load)
watch(() => props.projectId, () => { selected.value = null; load() })
watch(refreshKey, load)

// 字典名称列宽持久化
const codelistNameColWidth = ref(parseInt(localStorage.getItem('crf_codelistNameColWidth')) || 120)
function onClTableHeaderDragend(newWidth, _, col) {
  if (col.property === 'name') localStorage.setItem('crf_codelistNameColWidth', Math.round(newWidth))
}

async function addCl() {
  try {
    await api.post(`/api/projects/${props.projectId}/codelists`, { ...clForm })
    showAddCl.value = false; clForm.name = ''; clForm.code = ''; clForm.description = ''; load()
  } catch (e) { ElMessage.error(e.message) }
}

async function delCl(c) {
  try {
    const refs = await api.get(`/api/projects/${props.projectId}/codelists/${c.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      return ElMessageBox.alert(`该字典被以下字段引用，需先删除相关字段：\n${msg}`, '无法删除', { type: 'warning' })
    }
    await api.del(`/api/projects/${props.projectId}/codelists/${c.id}`)
    if (selected.value?.id === c.id) selected.value = null
    load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selCls = ref([])
async function batchDelCl() {
  try {
    const ids = selCls.value.map(c => c.id)
    if (!ids.length) return ElMessage.warning('请先选择要删除的字典')
    const refsMap = await api.post(`/api/projects/${props.projectId}/codelists/batch-references`, { ids })
    const allRefs = []
    for (const c of selCls.value) {
      const refs = refsMap[c.id] || []
      if (refs.length) allRefs.push(`【${c.name}】：` + truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`), 3, '、'))
    }
    if (allRefs.length) return ElMessageBox.alert(`以下字典被字段引用，需先删除相关字段：\n${allRefs.join('\n')}`, '无法删除', { type: 'warning' })
    await api.post(`/api/projects/${props.projectId}/codelists/batch-delete`, { ids })
    selCls.value = []; selected.value = null; load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const selOpts = ref([])
async function batchDelOpt() {
  try {
    if (!selOpts.value.length) return ElMessage.warning('请先选择要删除的选项')
    await ElMessageBox.confirm(`确认删除选中的 ${selOpts.value.length} 个选项？`, '批量删除', { type: 'warning' })
    await api.post(`/api/projects/${props.projectId}/codelists/${selected.value.id}/options/batch-delete`, { ids: selOpts.value.map(o => o.id) })
    selOpts.value = []
    const id = selected.value.id; await reload(); selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const addOptTrailingLine = computed({
  get: () => optForm.trailing_underscore === 1,
  set: (val) => { optForm.trailing_underscore = val ? 1 : 0 },
})

function openAddOpt() {
  const n = selected.value?.options?.length || 0
  optForm.code = `C.${n + 1}`; optForm.decode = ''; optForm.trailing_underscore = 0
  showAddOpt.value = true
}

async function addOpt() {
  if (!optForm.code.trim()) return ElMessage.warning('请输入编码值')
  if (!optForm.decode.trim()) return ElMessage.warning('请输入标签')
  try {
    await api.post(`/api/projects/${props.projectId}/codelists/${selected.value.id}/options`, { ...optForm })
    showAddOpt.value = false; optForm.code = ''; optForm.decode = ''; optForm.trailing_underscore = 0
    const id = selected.value.id; await reload(); selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { ElMessage.error(e.message) }
}

async function delOpt(o) {
  try {
    const id = selected.value.id
    await api.del(`/api/projects/${props.projectId}/codelists/${selected.value.id}/options/${o.id}`)
    await reload(); selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { ElMessage.error(e.message) }
}

const showEditCl = ref(false)
const editClForm = reactive({ name: '', code: '', description: '' })
const editClTarget = ref(null)

function openEditCl(c) {
  Object.assign(editClForm, { name: c.name, code: c.code || '', description: c.description || '' })
  editClTarget.value = c; showEditCl.value = true
}

async function updateCl() {
  try {
    const refs = await api.get(`/api/projects/${props.projectId}/codelists/${editClTarget.value.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }
    await api.put(`/api/projects/${props.projectId}/codelists/${editClTarget.value.id}`, { ...editClForm })
    showEditCl.value = false
    const id = selected.value?.id; await reload(); if (id) selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

const showEditOpt = ref(false)
const editOptForm = reactive({ code: '', decode: '', trailing_underscore: 0 })
const editOptTarget = ref(null)
const editOptTrailingLine = computed({
  get: () => editOptForm.trailing_underscore === 1,
  set: (val) => { editOptForm.trailing_underscore = val ? 1 : 0 },
})

function openEditOpt(o) {
  Object.assign(editOptForm, { code: o.code || '', decode: o.decode || '', trailing_underscore: o.trailing_underscore || 0 })
  editOptTarget.value = o; showEditOpt.value = true
}

async function updateOpt() {
  if (!editOptForm.code.trim()) return ElMessage.warning('请输入编码值')
  if (!editOptForm.decode.trim()) return ElMessage.warning('请输入标签')
  try {
    const refs = await api.get(`/api/projects/${props.projectId}/codelists/${selected.value.id}/references`)
    if (refs.length) {
      const msg = truncRefs(refs.map(r => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`))
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' })
    }
    await api.put(`/api/projects/${props.projectId}/codelists/${selected.value.id}/options/${editOptTarget.value.id}`, { ...editOptForm })
    showEditOpt.value = false
    const id = selected.value.id; await reload(); selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

function openAddCl() {
  clForm.code = genCode('CL')
  showAddCl.value = true
}

const { dragging: draggingOpt, handleDragEnd: handleOptDragEnd } = useOrderableList(
  computed(() => selected.value ? `/api/projects/${props.projectId}/codelists/${selected.value.id}/options/reorder` : '')
)

async function onOptDragEnd() {
  if (!selected.value) return
  await handleOptDragEnd(
    selected.value.options,
    async () => {
      const id = selected.value.id
      await reload()
      selected.value = codelists.value.find(c => c.id === id) || null
    },
    (err) => ElMessage.error(err.message)
  )
}

async function updateOptOrder(element, newValue, fallbackIndex = null) {
  // null 合并：存量脏数据 order_index 可能为 null，直接使用模板索引作为兜底，避免 indexOf 的 O(N) 查找
  const currentOrder = element.order_index ?? fallbackIndex
  if (currentOrder == null || newValue == null || newValue === currentOrder) return
  try {
    await api.put(`/api/projects/${props.projectId}/codelists/${selected.value.id}/options/${element.id}`, { code: element.code, decode: element.decode, trailing_underscore: element.trailing_underscore, order_index: newValue })
    const id = selected.value.id
    await reload()
    selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { ElMessage.error(e.message) }
}

async function updateClOrder(element, newValue, fallbackIndex = null) {
  // null 合并：存量脏数据 order_index 可能为 null，直接使用模板索引作为兜底，避免 indexOf 的 O(N) 查找
  const currentOrder = element.order_index ?? fallbackIndex
  if (currentOrder == null || newValue == null || newValue === currentOrder) return
  try {
    await api.put(`/api/projects/${props.projectId}/codelists/${element.id}`, {
      name: element.name,
      code: element.code,
      description: element.description,
      order_index: newValue
    })
    await reload()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
</script>

<template>
  <div style="display:flex;gap:16px;height:calc(100vh - 160px)">
    <!-- 左侧：字典列表 -->
    <div style="width:50%;min-width:0;display:flex;flex-direction:column">
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <el-button type="primary" size="small" @click="openAddCl">新增字典</el-button>
        <el-button type="danger" size="small" :disabled="!selCls.length" @click="batchDelCl">批量删除({{ selCls.length }})</el-button>
        <el-input
          v-model="searchCl"
          placeholder="搜索选项..."
          clearable
          size="small"
          style="width:180px"
        />
      </div>
      <el-table ref="codelistsTableRef" :data="filteredCodelists" size="small" border highlight-current-row
        @current-change="r => selected = r" @header-dragend="onClTableHeaderDragend"
        @selection-change="r => selCls = r" style="width:100%" height="100%" row-key="id">
        <el-table-column width="32" v-if="!isCodelistsFiltered">
          <template #default><span class="drag-handle" style="cursor:move;color:var(--color-text-muted)">☰</span></template>
        </el-table-column>
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row, $index }">
            <el-input-number
              :model-value="row.order_index ?? ($index + 1)"
              @change="v => updateClOrder(row, v, $index + 1)"
              :min="1"
              :max="codelists.length"
              size="small"
              style="width:80px"
              :aria-label="'编辑字典 ' + row.name + ' 的序号'"
            />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="字典名称" :width="codelistNameColWidth" resizable />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" link @click.stop="openEditCl(row)">编辑</el-button>
            <el-button type="danger" size="small" link @click.stop="delCl(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 右侧：选项列表 -->
    <div style="width:50%;min-width:0;display:flex;flex-direction:column" v-if="selected">
      <div style="margin-bottom:8px;flex-shrink:0;display:flex;align-items:center;gap:8px">
        <el-button type="primary" size="small" @click="openAddOpt">新增选项</el-button>
        <el-button type="danger" size="small" :disabled="!selOpts.length" @click="batchDelOpt">批量删除({{ selOpts.length }})</el-button>
        <el-input
          v-model="searchOpt"
          placeholder="搜索选项..."
          clearable
          size="small"
          style="width:180px"
        />
        <b>{{ selected.name }}</b>
      </div>
      <!-- 选项列表表头 -->
      <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--color-bg-hover);border:1px solid var(--color-border);margin-bottom:4px;font-size:12px;color:var(--color-text-secondary);font-weight:600">
        <span style="width:16px;flex-shrink:0"></span>
        <span style="width:80px;flex-shrink:0">序号</span>
        <span style="width:22px;flex-shrink:0"></span>
        <div style="flex:1;display:flex;gap:12px;align-items:center">
          <span style="width:100px;flex-shrink:0;display:none">编码值</span>
          <span style="flex:1">标签</span>
          <span style="width:60px;text-align:center">后加下划线</span>
        </div>
        <span style="width:80px;text-align:right">操作</span>
      </div>
      <draggable v-model="selected.options" item-key="id" handle=".drag-handle" :disabled="Boolean(searchOpt.trim())" @start="draggingOpt = true" @end="onOptDragEnd">
        <template #item="{ element, index }">
          <div
            v-show="!searchOpt.trim() || (String(element.code ?? '') + String(element.decode ?? '')).toLowerCase().includes(searchOpt.trim().toLowerCase())"
            style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--color-border);margin-bottom:4px;background:var(--color-bg-card)"
          >
            <span class="drag-handle" style="cursor:move;color:var(--color-text-muted);flex-shrink:0" role="button" aria-label="拖拽排序" tabindex="0">☰</span>
            <el-checkbox :model-value="selOpts.some(o => o.id === element.id)" @change="v => v ? selOpts.push(element) : selOpts.splice(selOpts.findIndex(o => o.id === element.id), 1)" style="flex-shrink:0" />
            <el-input-number :model-value="element.order_index ?? (index + 1)" @change="v => updateOptOrder(element, v, index + 1)" :min="1" :max="selected.options.length" size="small" style="width:80px;flex-shrink:0" :aria-label="'编辑选项 ' + element.decode + ' 的序号'" />
            <div style="flex:1;display:flex;gap:12px;align-items:center">
              <span style="color:var(--color-text-secondary);font-size:13px;width:100px;flex-shrink:0;display:none">{{ element.code }}</span>
              <span style="flex:1;font-size:13px">{{ element.decode }}</span>
              <el-checkbox :model-value="element.trailing_underscore === 1" disabled style="width:60px;justify-content:center" />
            </div>
            <el-button size="small" link @click="openEditOpt(element)">编辑</el-button>
            <el-button type="danger" size="small" link @click="delOpt(element)">删除</el-button>
          </div>
        </template>
      </draggable>
    </div>

    <!-- 新增字典弹窗 -->
    <el-dialog v-model="showAddCl" title="新增字典" width="360px" :close-on-click-modal="false">
      <el-form :model="clForm" label-width="80px">
        <el-form-item label="Code" v-show="false"><el-input v-model="clForm.code" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="clForm.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="clForm.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddCl = false">取消</el-button>
        <el-button type="primary" @click="addCl">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增选项弹窗 -->
    <el-dialog v-model="showAddOpt" title="新增选项" width="480px" :close-on-click-modal="false">
      <el-form :model="optForm" label-width="100px">
        <el-form-item label="编码值" v-show="false"><el-input v-model="optForm.code" /></el-form-item>
        <el-form-item label="标签"><el-input v-model="optForm.decode" /></el-form-item>
        <el-form-item label="后加下划线"><el-checkbox v-model="addOptTrailingLine" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddOpt = false">取消</el-button>
        <el-button type="primary" @click="addOpt">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑字典弹窗 -->
    <el-dialog v-model="showEditCl" title="编辑字典" width="360px" :close-on-click-modal="false">
      <el-form :model="editClForm" label-width="80px">
        <el-form-item label="Code" v-show="false"><el-input v-model="editClForm.code" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="editClForm.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="editClForm.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditCl = false">取消</el-button>
        <el-button type="primary" @click="updateCl">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑选项弹窗 -->
    <el-dialog v-model="showEditOpt" title="编辑选项" width="480px" :close-on-click-modal="false">
      <el-form :model="editOptForm" label-width="100px">
        <el-form-item label="编码值" v-show="false"><el-input v-model="editOptForm.code" /></el-form-item>
        <el-form-item label="标签"><el-input v-model="editOptForm.decode" /></el-form-item>
        <el-form-item label="后加下划线"><el-checkbox v-model="editOptTrailingLine" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditOpt = false">取消</el-button>
        <el-button type="primary" @click="updateOpt">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
