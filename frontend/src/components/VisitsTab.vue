<script setup>
import { ref, reactive, computed, watch, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode } from '../composables/useApi'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))

const visits = ref([])
const matrixData = ref(null)
// 所有表单列表（用于右侧面板添加表单）
const allForms = ref([])
const form = reactive({ name: '', code: '', sequence: null })
const showAdd = ref(false)
// 预览弹窗
const showPreview = ref(false)
// 右侧访视详情预览弹窗
const showVisitPreview = ref(false)
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
}
onMounted(load)
watch(() => props.projectId, () => { selectedVisit.value = null; load() })
watch(refreshKey, load)

// 当前访视已关联的表单列表（带 sequence）
const visitForms = computed(() => {
  if (!selectedVisit.value || !matrixData.value) return []
  const m = matrixData.value.matrix[selectedVisit.value.id] || {}
  // 取已关联的 form_id，结合 matrixData.forms 获取表单信息，按 sequence 排序
  return matrixData.value.forms
    .filter(f => m[f.id] != null)
    .map(f => ({ ...f, sequence: m[f.id] }))
    .sort((a, b) => a.sequence - b.sequence)
})

// 当前访视未关联的表单列表（供添加用）
const availableForms = computed(() => {
  if (!selectedVisit.value || !matrixData.value) return []
  const m = matrixData.value.matrix[selectedVisit.value.id] || {}
  return allForms.value.filter(f => m[f.id] == null)
})

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

async function updateSequence(row, newValue) {
  if (newValue === row.sequence) return
  try {
    await api.put(`/api/projects/${props.projectId}/visits/${row.id}`, { name: row.name, code: row.code, sequence: newValue })
    load()
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
    matrixData.value = await api.get(`/api/projects/${props.projectId}/visit-form-matrix`)
  } catch (e) { ElMessage.error(e.message || '添加失败') }
}

// 从访视移除表单
async function removeFormFromVisit(formId) {
  if (!selectedVisit.value) return
  try {
    await api.del(`/api/visits/${selectedVisit.value.id}/forms/${formId}`)
    matrixData.value = await api.get(`/api/projects/${props.projectId}/visit-form-matrix`)
  } catch (e) { ElMessage.error(e.message) }
}

// 更新访视中表单的 sequence
async function updateFormSequence(formId, newValue) {
  if (!selectedVisit.value || newValue == null) return
  try {
    await api.put(`/api/visits/${selectedVisit.value.id}/forms/${formId}`, { sequence: newValue })
    matrixData.value = await api.get(`/api/projects/${props.projectId}/visit-form-matrix`)
  } catch (e) { ElMessage.error(e.message) }
}

// 预览弹窗中切换关联（矩阵单元格点击）
async function toggleCell(visitId, formId) {
  const m = matrixData.value?.matrix
  if (!m) return
  const has = m[visitId] && m[visitId][formId] != null
  try {
    if (has) await api.del(`/api/visits/${visitId}/forms/${formId}`)
    else await api.post(`/api/visits/${visitId}/forms/${formId}`, {})
    matrixData.value = await api.get(`/api/projects/${props.projectId}/visit-form-matrix`)
  } catch (e) { ElMessage.error(e.message || '操作失败') }
}
</script>

<template>
  <div style="display:flex;gap:16px;height:calc(100vh - 160px)">
    <!-- 左侧：访视列表 -->
    <div style="width:50%;min-width:0;display:flex;flex-direction:column">
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <el-button type="primary" size="small" @click="openAdd">新增访视</el-button>
        <el-button type="danger" size="small" :disabled="!selVisits.length" @click="batchDelVisits">批量删除({{ selVisits.length }})</el-button>
        <el-button type="info" plain size="small" @click="showPreview = true">预览</el-button>
      </div>
      <el-table :data="visits" size="small" border highlight-current-row row-key="id"
        @current-change="row => { if (row) selectedVisit = row }"
        @selection-change="r => selVisits = r" style="width:100%" height="100%">
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }">
            <div @click.stop>
              <el-input-number :model-value="row.sequence" @change="v => updateSequence(row, v)" :min="1" :max="visits.length" size="small" style="width:80px" :aria-label="'编辑访视 ' + row.name + ' 的序号'" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="Code" width="100" show-overflow-tooltip />
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
        <span style="color:#909399;font-size:12px">关联表单 {{ visitForms.length }} 个</span>
        <el-button type="info" plain size="small" @click="showVisitPreview = true" style="margin-left:auto">预览</el-button>
      </div>
      <!-- 添加表单行 -->
      <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-shrink:0">
        <el-select v-model="addFormId" filterable clearable placeholder="选择要添加的表单" size="small" style="flex:1">
          <el-option v-for="f in availableForms" :key="f.id" :label="f.name + ' (' + f.code + ')'" :value="f.id" />
        </el-select>
        <el-button type="primary" size="small" :disabled="!addFormId" @click="addFormToVisit">添加</el-button>
      </div>
      <!-- 表单列表表头 -->
      <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f5f7fa;border:1px solid #ddd;margin-bottom:4px;font-size:12px;color:#606266;font-weight:600;flex-shrink:0">
        <span style="width:80px;flex-shrink:0">序号</span>
        <span style="flex:1">表单名称</span>
        <span style="width:60px;text-align:right">操作</span>
      </div>
      <!-- 表单列表（按 sequence 顺序，只读，添加/删除） -->
      <div style="flex:1;overflow-y:auto">
        <div v-if="!visitForms.length" style="color:#909399;font-size:13px;padding:20px;text-align:center">
          暂无关联表单，请在上方选择后点击添加
        </div>
        <div v-for="f in visitForms" :key="f.id"
          style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;margin-bottom:4px;background:#fff">
          <el-input-number :model-value="f.sequence" @change="v => updateFormSequence(f.id, v)" :min="1" :max="visitForms.length" size="small" style="width:80px;flex-shrink:0" :aria-label="'编辑表单 ' + f.name + ' 的序号'" @click.stop />
          <span style="flex:1;font-size:13px">{{ f.name }}</span>
          <el-button type="danger" size="small" link @click.stop="removeFormFromVisit(f.id)">移除</el-button>
        </div>
      </div>
    </div>

    <!-- 右侧：未选中访视时的提示 -->
    <div v-else style="width:50%;min-width:0;display:flex;align-items:center;justify-content:center;color:#909399;font-size:14px;border:1px dashed #dcdfe6;border-radius:4px">
      ← 点击左侧访视行查看和编辑关联表单
    </div>

    <!-- 访视关联表单只读预览弹窗 -->
    <el-dialog v-model="showVisitPreview" :title="(selectedVisit?.name || '') + ' - 表单预览'" width="400px">
      <div v-if="visitForms.length" style="max-height:60vh;overflow-y:auto">
        <div v-for="f in visitForms" :key="f.id"
          style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #eee">
          <span style="width:40px;flex-shrink:0;color:#909399;font-size:12px;text-align:center">{{ f.sequence }}</span>
          <span style="flex:1;font-size:13px">{{ f.name }}</span>
        </div>
      </div>
      <div v-else style="color:#909399;text-align:center;padding:40px;font-size:13px">暂无关联表单</div>
    </el-dialog>

    <!-- 预览弹窗（访视-表单矩阵） -->
    <el-dialog v-model="showPreview" title="访视表单矩阵预览" width="80%" top="5vh">
      <template v-if="matrixData && matrixData.forms.length && matrixData.visits.length">
        <div style="overflow-x:auto">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>表单 \ 访视</th>
                <th v-for="v in matrixData.visits" :key="v.id">{{ v.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in matrixData.forms" :key="f.id">
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
        <p style="font-size:12px;color:#909399;margin-top:6px">点击单元格可切换关联，数字为表单在该访视中的序号</p>
      </template>
      <div v-else style="color:#909399;text-align:center;padding:40px">
        暂无数据，请先添加访视和表单
      </div>
    </el-dialog>

    <!-- 新增访视弹窗 -->
    <el-dialog v-model="showAdd" title="新增访视" width="360px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="Code"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="访视名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="序号"><el-input-number v-model="form.sequence" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="add">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑访视弹窗 -->
    <el-dialog v-model="showEdit" title="编辑访视" width="360px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="Code"><el-input v-model="editForm.code" /></el-form-item>
        <el-form-item label="访视名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="序号"><el-input-number v-model="editForm.sequence" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="update">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
