<script setup>
import { ref, reactive, computed, watch, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, genCode } from '../composables/useApi'
import { isDefaultValueSupported, normalizeDefaultValue, renderCtrl, renderCtrlHtml, toHtml } from '../composables/useCRFRenderer'

const props = defineProps({ projectId: { type: Number, required: true } })
const refreshKey = inject('refreshKey', ref(0))

const visits = ref([])
const searchVisit = ref('')
const filteredVisits = computed(() => {
  const kw = searchVisit.value.trim().toLowerCase()
  if (!kw) return visits.value
  return visits.value.filter(item =>
    Object.values(item).some(v => String(v ?? '').toLowerCase().includes(kw))
  )
})
const matrixData = ref(null)
// 所有表单列表（用于右侧面板添加表单）
const allForms = ref([])
const form = reactive({ name: '', code: '', sequence: null })
const showAdd = ref(false)
// 预览弹窗
const showPreview = ref(false)
// 右侧访视详情预览弹窗
const showVisitPreview = ref(false)
// 表单内容预览弹窗
const showFormPreview = ref(false)
const formPreviewTitle = ref('')
const formPreviewDesignNotes = ref('')
const formPreviewFields = ref([])
const formPreviewLoading = ref(false)
const formPreviewError = ref('')
let formPreviewRequestSeq = 0

// 计算属性：设计备注预览内容
const hasPreviewNotes = computed(() => Boolean(formPreviewDesignNotes.value.trim()))
const previewDesignNotesHtml = computed(() => (
  hasPreviewNotes.value ? escapePreviewText(formPreviewDesignNotes.value) : ''
))
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

function toRendererField(fd) {
  if (!fd) return null
  return {
    field_type: fd.field_type,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  }
}

function escapePreviewText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function getScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type
  const inlineMark = Boolean(ff?.inline_mark)
  if (!fieldType || !ff?.default_value) return ''
  if (!isDefaultValueSupported(fieldType, inlineMark)) return ''
  return normalizeDefaultValue(ff.default_value, singleLine)
}

// 复用 useCRFRenderer 的安全渲染逻辑，避免 VisitsTab 再实现一套 HTML 拼接
function renderCellHtml(ff) {
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const fd = ff.field_definition
  const ft = fd.field_type
  const field = toRendererField(fd)
  const defaultValue = getScopedDefaultValue(ff, true)
  if (defaultValue) {
    return escapePreviewText(defaultValue)
  }
  if (ft && ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(ft)) {
    return renderCtrlHtml(field)
  }
  return renderCtrlHtml(field)
}

function getInlineRows(fields) {
  const cols = fields.map(ff => {
    const defaultValue = getScopedDefaultValue(ff)
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
      }
    }
    const ctrl = renderCtrl(toRendererField(ff.field_definition)).replace(/_{8,}/, '______')
    return { lines: [toHtml(ctrl)], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? ''))
  )
}

const previewRenderGroups = computed(() => {
  const fields = formPreviewFields.value
  if (!fields.length) return []
  const groups = []; let i = 0
  while (i < fields.length) {
    const ff = fields[i]
    if (ff.inline_mark) {
      const g = []
      while (i < fields.length && fields[i].inline_mark) { g.push(fields[i]); i++ }
      groups.push({ type: 'inline', fields: g })
    } else {
      const g = []
      while (i < fields.length && !fields[i].inline_mark) { g.push(fields[i]); i++ }
      groups.push({ type: 'normal', fields: g })
    }
  }
  return groups
})

const previewNeedsLandscape = computed(() =>
  previewRenderGroups.value.some(g => g.type === 'inline' && g.fields.length > 4)
)
const previewForceLandscape = ref(localStorage.getItem('crf_previewForceLandscape') === 'true')
watch(previewForceLandscape, v => localStorage.setItem('crf_previewForceLandscape', String(v)))
const previewLandscapeMode = computed(() => previewForceLandscape.value || previewNeedsLandscape.value)

async function openFormPreview(form) {
  const seq = ++formPreviewRequestSeq
  formPreviewTitle.value = form.name || '表单预览'
  formPreviewDesignNotes.value = form.design_notes || ''
  formPreviewError.value = ''
  formPreviewFields.value = []
  formPreviewLoading.value = true
  showFormPreview.value = true
  try {
    const data = await api.cachedGet('/api/forms/' + form.id + '/fields')
    if (seq !== formPreviewRequestSeq) return
    formPreviewFields.value = data
  } catch (e) {
    if (seq !== formPreviewRequestSeq) return
    formPreviewFields.value = []
    formPreviewError.value = '加载表单字段失败：' + (e.message || '未知错误')
    ElMessage.error(formPreviewError.value)
  } finally {
    if (seq === formPreviewRequestSeq) formPreviewLoading.value = false
  }
}

function resetFormPreviewState() {
  formPreviewRequestSeq++
  formPreviewLoading.value = false
  formPreviewError.value = ''
  formPreviewFields.value = []
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
        <el-button type="info" plain size="small" @click="showPreview = true">批量编辑</el-button>
        <el-input
          v-model="searchVisit"
          placeholder="搜索访视..."
          clearable
          size="small"
          style="width:180px"
        />
      </div>
      <el-table :data="filteredVisits" size="small" border highlight-current-row row-key="id"
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
        <span style="color:var(--color-text-muted);font-size:12px">关联表单 {{ visitForms.length }} 个</span>
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
      <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--color-bg-hover);border:1px solid var(--color-border);margin-bottom:4px;font-size:12px;color:var(--color-text-secondary);font-weight:600;flex-shrink:0">
        <span style="width:80px;flex-shrink:0">序号</span>
        <span style="flex:1">表单名称</span>
        <span style="width:110px;text-align:right">操作</span>
      </div>
      <!-- 表单列表（按 sequence 顺序，只读，添加/删除） -->
      <div style="flex:1;overflow-y:auto">
        <div v-if="!visitForms.length" style="color:var(--color-text-muted);font-size:13px;padding:20px;text-align:center">
          暂无关联表单，请在上方选择后点击添加
        </div>
        <div v-for="f in visitForms" :key="f.id"
          style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--color-border);margin-bottom:4px;background:var(--color-bg-card)">
          <el-input-number :model-value="f.sequence" @change="v => updateFormSequence(f.id, v)" :min="1" :max="visitForms.length" size="small" style="width:80px;flex-shrink:0" :aria-label="'编辑表单 ' + f.name + ' 的序号'" @click.stop />
          <span style="flex:1;font-size:13px">{{ f.name }}</span>
          <el-button type="primary" size="small" link @click.stop="openFormPreview(f)">预览</el-button>
          <el-button type="danger" size="small" link @click.stop="removeFormFromVisit(f.id)">移除</el-button>
        </div>
      </div>
    </div>

    <!-- 右侧：未选中访视时的提示 -->
    <div v-else style="width:50%;min-width:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:14px;border:1px dashed var(--color-border);border-radius:4px">
      ← 点击左侧访视行查看和编辑关联表单
    </div>

    <!-- 访视关联表单只读预览弹窗 -->
    <el-dialog v-model="showVisitPreview" :title="(selectedVisit?.name || '') + ' - 表单预览'" width="400px" :close-on-click-modal="false">
      <div v-if="visitForms.length" style="max-height:60vh;overflow-y:auto">
        <div v-for="f in visitForms" :key="f.id"
          style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--color-border)">
          <span style="width:40px;flex-shrink:0;color:var(--color-text-muted);font-size:12px;text-align:center">{{ f.sequence }}</span>
          <span style="flex:1;font-size:13px">{{ f.name }}</span>
        </div>
      </div>
      <div v-else style="color:var(--color-text-muted);text-align:center;padding:40px;font-size:13px">暂无关联表单</div>
    </el-dialog>

    <!-- 批量编辑弹窗（访视-表单矩阵） -->
    <el-dialog v-model="showPreview" width="92%" top="3vh" class="matrix-preview-dialog" :close-on-click-modal="false">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-right:32px">
          <span style="font-size:18px;font-weight:600;color:var(--el-text-color-primary)">访视表单矩阵</span>
          <span style="margin-left:auto;font-size:12px;color:var(--color-text-muted);line-height:1.5;text-align:right">
            点击单元格可切换关联，数字为表单在该访视中的序号
          </span>
        </div>
      </template>
      <template v-if="matrixData && matrixData.forms.length && matrixData.visits.length">
        <div style="overflow:auto;height:100%">
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
        </div>
      </template>
      <div v-else style="color:var(--color-text-muted);text-align:center;padding:40px">
        暂无数据，请先添加访视和表单
      </div>
    </el-dialog>

    <!-- 新增访视弹窗 -->
    <el-dialog v-model="showAdd" title="新增访视" width="360px" :close-on-click-modal="false">
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
    <el-dialog v-model="showEdit" title="编辑访视" width="360px" :close-on-click-modal="false">
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
  <!-- 表单内容预览弹窗 -->
  <el-dialog v-model="showFormPreview" width="90%" style="max-width:1200px" top="5vh" :close-on-click-modal="false" @closed="resetFormPreviewState">
    <template #header>
      <div style="display:flex;align-items:center;gap:12px;padding-right:32px">
        <span style="font-size:16px;font-weight:bold">{{ formPreviewTitle }}</span>
        <el-button
          v-if="!formPreviewLoading && !formPreviewError && formPreviewFields.length"
          size="small"
          :type="previewForceLandscape ? 'primary' : ''"
          :plain="!previewForceLandscape"
          @click="previewForceLandscape = !previewForceLandscape"
          title="强制横向显示预览"
        >
          横向
        </el-button>
      </div>
    </template>
    <div v-if="formPreviewLoading" style="text-align:center;padding:40px">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中...
    </div>
    <el-alert v-else-if="formPreviewError" :title="formPreviewError" type="error" :closable="false" style="margin:12px 0" />
    <div v-else-if="!formPreviewFields.length" style="text-align:center;color:#999;padding:40px">
      暂无字段
    </div>
    <div v-else class="word-preview">
      <div :class="['word-page', { landscape: previewLandscapeMode, 'word-page--with-notes': hasPreviewNotes }]">
        <div class="wp-form-title">{{ formPreviewTitle }}</div>
        <div :class="['wp-body', { 'wp-body--with-notes': hasPreviewNotes }]">
          <div class="wp-main">
            <template v-for="(group, gi) in previewRenderGroups" :key="gi">
              <table v-if="group.type === 'normal'" style="width:100%;border-collapse:collapse">
                <template v-for="ff in group.fields" :key="ff.id">
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
              <table v-else class="inline-table" style="width:100%;border-collapse:collapse">
                <tr>
                  <td v-for="ff in group.fields" :key="ff.id" class="wp-inline-header">
                    {{ ff.label_override || ff.field_definition?.label }}
                  </td>
                </tr>
                <tr v-for="(row, ri) in getInlineRows(group.fields)" :key="ri">
                  <td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" v-html="cell"></td>
                </tr>
              </table>
            </template>
          </div>
          <aside v-if="hasPreviewNotes" class="wp-notes" aria-label="设计备注">
            <div class="wp-notes-title">设计备注</div>
            <div class="wp-notes-content" v-html="previewDesignNotesHtml"></div>
          </aside>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
