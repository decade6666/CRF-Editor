<script setup>
import { ref, reactive, watch, onMounted, provide } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, toggleSelectAll } from './composables/useApi'
import ProjectInfoTab from './components/ProjectInfoTab.vue'
import VisitsTab from './components/VisitsTab.vue'
import FormDesignerTab from './components/FormDesignerTab.vue'
import FieldsTab from './components/FieldsTab.vue'
import CodelistsTab from './components/CodelistsTab.vue'
import UnitsTab from './components/UnitsTab.vue'
import DocxCompareDialog from './components/DocxCompareDialog.vue'
import TemplatePreviewDialog from './components/TemplatePreviewDialog.vue'

// 项目数据
const projects = ref([])
const selectedProject = ref(null)
const activeTab = ref('info')
const showCreateProject = ref(false)
const newProject = reactive({ name: '', version: '1.0' })

async function loadProjects() { projects.value = await api.get('/api/projects') }
onMounted(loadProjects)

// 全局刷新信号：子组件 inject 后 watch 此值来重载数据
const refreshKey = ref(0)
provide('refreshKey', refreshKey)

function handleRefresh() {
  api.clearAllCache()
  refreshKey.value++
  loadProjects()
  ElMessage.success('数据已刷新')
}

function selectProject(p) { selectedProject.value = p; activeTab.value = 'info' }

// 切换Tab时不再强制重建组件，缓存层+refreshKey机制替代
watch(activeTab, () => {
  // 子组件通过 cachedGet 自动使用缓存，无需 key++ 强制重建
})

function onProjectUpdated(p) {
  selectedProject.value = p
  const idx = projects.value.findIndex(x => x.id === p.id)
  if (idx >= 0) projects.value[idx] = p
}

async function createProject() {
  if (!newProject.name) return ElMessage.warning('请输入项目名称')
  try {
    const p = await api.post('/api/projects', { ...newProject })
    projects.value.push(p); showCreateProject.value = false; newProject.name = ''
    selectProject(p)
  } catch (e) { ElMessage.error(e.message) }
}

async function deleteProject(p) {
  await ElMessageBox.confirm(`删除项目 "${p.name}"？此操作不可恢复！`, '确认', { type: 'warning' })
  await api.del(`/api/projects/${p.id}`)
  if (selectedProject.value?.id === p.id) selectedProject.value = null
  loadProjects()
}

// 导出Word
async function exportWord() {
  try {
    const resp = await fetch(`/api/projects/${selectedProject.value.id}/export/word/prepare`, { method: 'POST' })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      return ElMessage.error('导出失败: ' + (err.detail || '未知错误'))
    }
    const { token } = await resp.json()
    const fileResp = await fetch(`/api/export/download/${token}`)
    if (!fileResp.ok) return ElMessage.error('下载失败，请重试')
    const blob = await fileResp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${selectedProject.value.name}_CRF.docx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) { ElMessage.error('导出失败: ' + e.message) }
}

// 设置弹窗
const showSettings = ref(false)
const settingsForm = reactive({
  template_path: '',
  ai_enabled: false,
  ai_api_url: '',
  ai_api_key: '',
  ai_model: '',
  ai_api_format: '',
})
const aiTestLoading = ref(false)
const aiTestResult = ref(null) // { ok, latency_ms, model, error }

async function openSettings() {
  showSettings.value = true
  aiTestResult.value = null
  try {
    const data = await api.get('/api/settings')
    settingsForm.template_path = data.template_path || ''
    settingsForm.ai_enabled = data.ai_enabled || false
    settingsForm.ai_api_url = data.ai_api_url || ''
    settingsForm.ai_api_key = data.ai_api_key || ''
    settingsForm.ai_model = data.ai_model || ''
    settingsForm.ai_api_format = data.ai_api_format || ''
  } catch (e) { ElMessage.error('加载设置失败: ' + e.message) }
}

async function saveSettings() {
  try {
    await api.put('/api/settings', {
      template_path: settingsForm.template_path,
      ai_enabled: settingsForm.ai_enabled,
      ai_api_url: settingsForm.ai_api_url,
      ai_api_key: settingsForm.ai_api_key,
      ai_model: settingsForm.ai_model,
      ai_api_format: settingsForm.ai_api_format,
    })
    ElMessage.success('设置已保存'); showSettings.value = false
  } catch (e) { ElMessage.error('保存失败: ' + e.message) }
}

async function testAiConnection() {
  aiTestLoading.value = true
  aiTestResult.value = null
  try {
    const res = await api.post('/api/settings/ai/test', {
      ai_api_url: settingsForm.ai_api_url,
      ai_api_key: settingsForm.ai_api_key,
      ai_model: settingsForm.ai_model,
    })
    aiTestResult.value = res
    // 测试成功时自动记录探测到的API格式
    if (res.ok && res.api_format) {
      settingsForm.ai_api_format = res.api_format
    }
  } catch (e) {
    aiTestResult.value = { ok: false, error: e.message }
  } finally { aiTestLoading.value = false }
}

// 导入模板
const showImport = ref(false)
const importLoading = ref(false)
const importProjects = ref([])
const importSelectedForms = ref([])  // 选中的表单 id 列表
// 树节点选中信息（用于定位 source_project_id）
const importTreeCheckedForms = ref([]) // [{projectId, formId, formName}]
// 预览对话框
const showTemplatePreview = ref(false)
const templatePreviewFormId = ref(null)
const templatePreviewFormName = ref('')

// 将后端返回的项目+表单数据转换为 el-tree 所需格式
function buildImportTreeData(projects) {
  return projects.map(p => ({
    id: `proj_${p.id}`,
    label: `${p.name}（v${p.version}，${p.forms.length} 个表单）`,
    projectId: p.id,
    isProject: true,
    children: p.forms.map(f => ({
      id: `form_${f.id}`,
      label: f.name,
      formId: f.id,
      projectId: p.id,
      isForm: true,
    }))
  }))
}
const importTreeData = ref([])

async function openImportDialog() {
  importProjects.value = []
  importTreeData.value = []
  importSelectedForms.value = []
  importTreeCheckedForms.value = []
  showImport.value = true
  importLoading.value = true
  try {
    const data = await api.post(`/api/projects/${selectedProject.value.id}/import-template`)
    importProjects.value = data.projects || []
    importTreeData.value = buildImportTreeData(importProjects.value)
  } catch (e) {
    ElMessage.error('加载模板失败: ' + e.message); showImport.value = false
  } finally { importLoading.value = false }
}

function handleImportTreeCheck(node, { checkedNodes }) {
  // 只收集叶子节点（表单）
  const forms = checkedNodes.filter(n => n.isForm)
  importSelectedForms.value = forms.map(n => n.formId)
  importTreeCheckedForms.value = forms
}

function openTemplatePreview(node) {
  if (!node.isForm) return
  templatePreviewFormId.value = node.formId
  templatePreviewFormName.value = node.label
  showTemplatePreview.value = true
}

// 从选中的表单中推断 source_project_id（取第一个选中表单所属项目）
function getSourceProjectId() {
  if (!importTreeCheckedForms.value.length) return null
  return importTreeCheckedForms.value[0].projectId
}

async function executeImport() {
  if (!importSelectedForms.value.length) return
  const sourceProjectId = getSourceProjectId()
  if (!sourceProjectId) return
  importLoading.value = true
  try {
    const data = await api.post(
      `/api/projects/${selectedProject.value.id}/import-template/execute`,
      { source_project_id: sourceProjectId, form_ids: importSelectedForms.value }
    )
    ElMessage.success(`导入成功：${data.imported_form_count}个表单`)
    showImport.value = false
    api.clearAllCache(); refreshKey.value++
  } catch (e) { ElMessage.error('导入失败: ' + e.message) }
  finally { importLoading.value = false }
}

// 导入Word
const showImportWordDialog = ref(false)
const importWordStep = ref(1)
const importWordLoading = ref(false)
const importedFormsPreview = ref([])
const selectedFormsToImport = ref([])
const tempDocxId = ref(null)
const importWordErrorMessage = ref('')
const importWordAiError = ref('')
// 预览对比对话框
const showDocxCompare = ref(false)
const compareFormData = ref(null)
// 每个表单是否采纳AI建议：{formIndex: boolean}
const aiSuggestionFlags = ref({})

function openImportWordDialog() {
  importWordStep.value = 1; importWordLoading.value = false
  importedFormsPreview.value = []; selectedFormsToImport.value = []
  tempDocxId.value = null; importWordErrorMessage.value = ''
  importWordAiError.value = ''
  showDocxCompare.value = false; compareFormData.value = null
  aiSuggestionFlags.value = {}
  showImportWordDialog.value = true
}

function goBackToImportWordStep1() {
  importWordStep.value = 1; importedFormsPreview.value = []
  selectedFormsToImport.value = []; tempDocxId.value = null
  importWordErrorMessage.value = ''
}

function beforeDocxUpload(file) {
  if (file.size > 10 * 1024 * 1024) { ElMessage.error('文件大小不能超过 10MB'); return false }
  importWordErrorMessage.value = ''; importWordLoading.value = true
  return true
}

function handleDocxUploadSuccess(response) {
  importWordLoading.value = false
  if (response?.forms && response?.temp_id) {
    importedFormsPreview.value = response.forms
    selectedFormsToImport.value = []; tempDocxId.value = response.temp_id
    importWordErrorMessage.value = ''
    importWordAiError.value = response.ai_error || ''
    importWordStep.value = 2
  } else {
    importWordErrorMessage.value = '文件解析失败或响应格式不正确。'
    ElMessage.error(importWordErrorMessage.value)
  }
}

function handleDocxUploadError(error) {
  importWordLoading.value = false
  importWordErrorMessage.value = '文件上传失败。'
  if (error?.message) {
    try { importWordErrorMessage.value += ` 错误: ${JSON.parse(error.message).detail || error.message}` }
    catch { importWordErrorMessage.value += ` 错误: ${error.message}` }
  }
  ElMessage.error(importWordErrorMessage.value)
}

function toggleSelectAllImportWordForms() {
  toggleSelectAll(importedFormsPreview, selectedFormsToImport, f => f.index)
}

async function executeImportWord() {
  if (!selectedFormsToImport.value.length || !tempDocxId.value) {
    importWordErrorMessage.value = '请选择要导入的表单。'
    return ElMessage.warning(importWordErrorMessage.value)
  }
  importWordLoading.value = true; importWordErrorMessage.value = ''
  try {
    // 构建 AI 覆盖参数：只包含开启了AI建议的表单
    const aiOverrides = []
    for (const formIdx of selectedFormsToImport.value) {
      if (aiSuggestionFlags.value[formIdx]) {
        const form = importedFormsPreview.value.find(f => f.index === formIdx)
        if (form?.ai_suggestions?.length) {
          aiOverrides.push({
            form_index: formIdx,
            overrides: form.ai_suggestions.map(s => ({
              index: s.index,
              field_type: s.suggested_type,
            })),
          })
        }
      }
    }

    const payload = {
      temp_id: tempDocxId.value,
      form_indices: selectedFormsToImport.value,
    }
    if (aiOverrides.length) payload.ai_overrides = aiOverrides

    const data = await api.post(
      `/api/projects/${selectedProject.value.id}/import-docx/execute`,
      payload,
    )
    ElMessage.success(`导入成功：${data.imported_form_count}个表单`)
    showImportWordDialog.value = false
    api.clearAllCache(); refreshKey.value++
  } catch (e) {
    importWordErrorMessage.value = '导入失败: ' + e.message
    ElMessage.error(importWordErrorMessage.value)
  } finally { importWordLoading.value = false }
}

// AI建议：根据字段索引获取字段标签
function getFieldLabel(form, fieldIndex) {
  const field = form.fields?.find(f => f.index === fieldIndex)
  return field?.label || `字段${fieldIndex}`
}

// 打开预览对比对话框
function openDocxCompare(form) {
  compareFormData.value = form
  showDocxCompare.value = true
}

// 更新某个表单的AI建议开关
function updateAiFlag(formIndex, val) {
  aiSuggestionFlags.value[formIndex] = val
}

// 暗色模式（持久化）
const isDark = ref(localStorage.getItem('crf_theme') === 'dark')

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDark.value)
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

function toggleTheme() {
  isDark.value = !isDark.value
  localStorage.setItem('crf_theme', isDark.value ? 'dark' : 'light')
  applyTheme()
}

onMounted(() => { applyTheme() })

// 侧边栏宽度拖拽（持久化）
const sidebarWidth = ref(parseInt(localStorage.getItem('crf_sidebarWidth')) || 220)
const isResizing = ref(false)
watch(sidebarWidth, v => localStorage.setItem('crf_sidebarWidth', v))

function startResize(e) {
  isResizing.value = true
  const startX = e.clientX, startW = sidebarWidth.value
  function onMove(e) { sidebarWidth.value = Math.max(120, Math.min(400, startW + e.clientX - startX)) }
  function onUp() { isResizing.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<template>
  <!-- 头部 -->
  <div class="header">
    <div class="header-left">
      <h1>CRF编辑器</h1>
      <el-button class="header-icon-btn" text circle aria-label="刷新数据" @click="handleRefresh" title="刷新数据"><el-icon aria-hidden="true"><RefreshRight /></el-icon></el-button>
      <el-button class="header-icon-btn" text circle aria-label="打开设置" @click="openSettings" title="设置"><el-icon aria-hidden="true"><Setting /></el-icon></el-button>
      <el-button class="header-icon-btn" text circle @click="toggleTheme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'" :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'">
        <el-icon aria-hidden="true"><Moon v-if="!isDark" /><Sunny v-else /></el-icon>
      </el-button>
    </div>
    <div class="header-right">
      <el-button v-if="selectedProject" type="primary" size="small" @click="openImportWordDialog">导入Word</el-button>
      <el-button v-if="selectedProject" type="primary" size="small" @click="openImportDialog">导入模板</el-button>
      <el-button v-if="selectedProject" type="warning" size="small" @click="exportWord">导出Word</el-button>
    </div>
  </div>

  <!-- 主体布局 -->
  <div class="main">
    <!-- 侧边栏 -->
    <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="sidebar-header">
        <span>项目列表</span>
        <el-button type="primary" size="small" @click="showCreateProject = true">新建</el-button>
      </div>
      <div class="project-list">
        <div v-for="p in projects" :key="p.id"
          class="project-item" :class="{ active: selectedProject?.id === p.id }"
          @click="selectProject(p)">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</span>
          <span class="del-btn" @click.stop="deleteProject(p)">✕</span>
        </div>
      </div>
    </div>
    <div class="sidebar-resizer" :class="{ dragging: isResizing }" @mousedown="startResize"></div>

    <!-- 内容区 -->
    <div class="content">
      <div v-if="!selectedProject" class="empty-tip">← 请选择或新建项目</div>
      <template v-else>
        <el-tabs v-model="activeTab" style="height:100%;display:flex;flex-direction:column">
          <el-tab-pane label="项目信息" name="info">
            <div class="content-inner"><ProjectInfoTab :project="selectedProject" @updated="onProjectUpdated" /></div>
          </el-tab-pane>
          <el-tab-pane label="选项" name="codelists">
            <div class="content-inner"><CodelistsTab :project-id="selectedProject.id" /></div>
          </el-tab-pane>
          <el-tab-pane label="单位" name="units">
            <div class="content-inner"><UnitsTab :project-id="selectedProject.id" /></div>
          </el-tab-pane>
          <el-tab-pane label="字段" name="fields">
            <div class="content-inner"><FieldsTab :project-id="selectedProject.id" /></div>
          </el-tab-pane>
          <el-tab-pane label="表单" name="designer">
            <div class="content-inner"><FormDesignerTab :project-id="selectedProject.id" /></div>
          </el-tab-pane>
          <el-tab-pane label="访视" name="visits">
            <div class="content-inner"><VisitsTab :project-id="selectedProject.id" /></div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
  </div>

  <!-- 新建项目弹窗 -->
  <el-dialog v-model="showCreateProject" title="新建项目" width="400px" :close-on-click-modal="false">
    <el-form :model="newProject" label-width="80px">
      <el-form-item label="项目名称"><el-input v-model="newProject.name" /></el-form-item>
      <el-form-item label="版本号"><el-input v-model="newProject.version" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showCreateProject = false">取消</el-button>
      <el-button type="primary" @click="createProject">确定</el-button>
    </template>
  </el-dialog>

  <!-- 设置弹窗 -->
  <el-dialog v-model="showSettings" title="设置" width="480px" :close-on-click-modal="false">
    <el-form label-width="100px">
      <!-- 暂时隐藏，保留代码 -->
      <el-form-item v-if="false" label="模板路径">
        <el-input v-model="settingsForm.template_path" placeholder="请输入模板 .db 文件的绝对路径" clearable />
      </el-form-item>
      <!-- 暂时隐藏，保留代码 -->
      <template v-if="false">
      <el-divider>AI 复核配置</el-divider>
      <el-form-item label="启用AI复核">
        <el-switch v-model="settingsForm.ai_enabled" />
      </el-form-item>
      <el-form-item label="API URL">
        <el-input v-model="settingsForm.ai_api_url" placeholder="如：https://api.openai.com/v1"
          :disabled="!settingsForm.ai_enabled" clearable />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="settingsForm.ai_api_key" type="password" show-password
          :disabled="!settingsForm.ai_enabled" clearable />
      </el-form-item>
      <el-form-item label="模型">
        <el-input v-model="settingsForm.ai_model" placeholder="如：gpt-4o, deepseek-chat"
          :disabled="!settingsForm.ai_enabled" clearable />
      </el-form-item>
      <el-form-item v-if="settingsForm.ai_enabled">
        <el-button :loading="aiTestLoading" @click="testAiConnection"
          :disabled="!settingsForm.ai_api_url || !settingsForm.ai_api_key || !settingsForm.ai_model">
          测试连接
        </el-button>
        <span v-if="aiTestResult" style="margin-left:10px;font-size:13px">
          <span v-if="aiTestResult.ok" style="color:var(--color-success)">
            连接成功 ({{ aiTestResult.latency_ms }}ms, {{ aiTestResult.api_format === 'anthropic' ? 'Anthropic' : 'OpenAI' }}格式)
          </span>
          <span v-else style="color:var(--color-danger)">
            连接失败: {{ aiTestResult.error }}
          </span>
        </span>
      </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="showSettings = false">取消</el-button>
      <el-button type="primary" @click="saveSettings">保存</el-button>
    </template>
  </el-dialog>

  <!-- 导入模板弹窗 -->
  <el-dialog v-model="showImport" title="导入模板" width="560px" :close-on-click-modal="false">
    <div v-if="importLoading" style="text-align:center;padding:30px 0">
      <el-icon class="is-loading" size="24px"><Loading /></el-icon> 加载中...
    </div>
    <template v-else>
      <p style="margin-bottom:12px;color:var(--color-text-secondary)">请选择需要导入的表单：</p>
      <el-tree
        :data="importTreeData"
        show-checkbox
        node-key="id"
        :props="{ label: 'label', children: 'children' }"
        @check="handleImportTreeCheck"
        style="max-height:400px;overflow-y:auto;border:1px solid var(--color-border);border-radius:4px;padding:8px"
      >
        <template #default="{ node, data }">
          <span style="flex:1">{{ node.label }}</span>
          <el-button
            v-if="data.isForm"
            size="small"
            text
            type="primary"
            @click.stop="openTemplatePreview(data)"
          >预览</el-button>
        </template>
      </el-tree>
      <div v-if="importTreeData.length === 0" style="color:var(--color-text-muted);text-align:center;padding:20px 0">模板库中没有项目</div>
    </template>
    <template #footer>
      <el-button @click="showImport = false">取消</el-button>
      <el-button type="primary" :disabled="importSelectedForms.length === 0" @click="executeImport">确认导入</el-button>
    </template>
  </el-dialog>

  <!-- 模板预览对话框 -->
  <TemplatePreviewDialog
    v-model="showTemplatePreview"
    :project-id="selectedProject?.id"
    :form-id="templatePreviewFormId"
    :form-name="templatePreviewFormName"
  />

  <!-- 导入Word弹窗 -->
  <el-dialog v-model="showImportWordDialog" title="导入Word" width="620px" :close-on-click-modal="false">
    <div v-if="importWordLoading" style="text-align:center;padding:30px 0">
      <el-icon class="is-loading" size="24px"><Loading /></el-icon> 加载中...
    </div>
    <template v-else>
      <div v-if="importWordStep === 1">
        <el-upload
          drag
          :action="'/api/projects/' + selectedProject.id + '/import-docx/preview'"
          :show-file-list="false"
          accept=".docx"
          :on-success="handleDocxUploadSuccess"
          :on-error="handleDocxUploadError"
          :before-upload="beforeDocxUpload"
          style="text-align:center;padding:20px 0;">
          <el-icon class="el-icon--upload" size="67px"><UploadFilled /></el-icon>
          <div class="el-upload__text">将文件拖拽至此区域 或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">只支持 .docx 文件</div>
          </template>
        </el-upload>
        <el-alert v-if="importWordErrorMessage" :title="importWordErrorMessage" type="error" show-icon style="margin-top:10px;" />
      </div>
      <div v-if="importWordStep === 2">
        <el-alert v-if="importWordAiError" :title="importWordAiError" type="warning" show-icon style="margin-bottom:12px;" closable />
        <div class="form-select-header">
          <p class="form-select-prompt">请勾选要导入的表单：</p>
          <el-button size="small" @click="toggleSelectAllImportWordForms"
            :disabled="importedFormsPreview.length === 0" aria-controls="import-word-forms-list">
            {{ selectedFormsToImport.length === importedFormsPreview.length && importedFormsPreview.length > 0 ? '取消全选' : '全选' }}
          </el-button>
        </div>
        <el-checkbox-group id="import-word-forms-list" v-model="selectedFormsToImport"
          style="display:flex;flex-direction:column;gap:8px">
          <el-checkbox v-for="f in importedFormsPreview" :key="f.index" :value="f.index" border class="docx-form-checkbox">
            <div class="docx-form-item">
              <el-tooltip :content="f.name + ' (' + f.field_count + '个字段)'" placement="top" :disabled="f.name.length <= 20">
                <span class="docx-form-name">{{ f.name }} ({{ f.field_count }}个字段)</span>
              </el-tooltip>
              <span class="docx-form-actions" @click.stop>
                <el-popover v-if="f.ai_suggestions?.length" trigger="hover" width="360" placement="right">
                  <template #reference>
                    <el-tag size="small" type="warning" style="cursor:help">AI建议 {{ f.ai_suggestions.length }}</el-tag>
                  </template>
                  <div style="font-size:12px">
                    <div v-for="s in f.ai_suggestions" :key="s.index" style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #eee">
                      <div><b>字段#{{ s.index }}</b>：{{ getFieldLabel(f, s.index) }}</div>
                      <div>建议类型：<el-tag size="small" type="danger">{{ s.suggested_type }}</el-tag></div>
                      <div style="color:var(--color-text-muted)">{{ s.reason }}</div>
                    </div>
                  </div>
                </el-popover>
                <el-switch
                  v-if="f.ai_suggestions?.length"
                  :model-value="aiSuggestionFlags[f.index] || false"
                  @update:model-value="updateAiFlag(f.index, $event)"
                  size="small"
                  active-text="AI"
                  style="margin-left:8px"
                />
                <el-button size="small" link type="primary" @click="openDocxCompare(f)">预览对比</el-button>
              </span>
            </div>
          </el-checkbox>
        </el-checkbox-group>
        <div v-if="importedFormsPreview.length === 0" style="color:var(--color-text-muted);text-align:center;padding:20px 0">Word文档中没有发现表单</div>
        <el-alert v-if="importWordErrorMessage" :title="importWordErrorMessage" type="error" show-icon style="margin-top:10px;" />
      </div>
    </template>
    <template #footer>
      <el-button @click="showImportWordDialog = false" :disabled="importWordLoading">取消</el-button>
      <el-button v-if="importWordStep === 2" @click="goBackToImportWordStep1" :disabled="importWordLoading">上一步</el-button>
      <el-button v-if="importWordStep === 2" type="primary"
        :disabled="selectedFormsToImport.length === 0 || importWordLoading"
        :loading="importWordLoading" @click="executeImportWord">确认导入</el-button>
    </template>
  </el-dialog>

  <!-- Word导入预览对比对话框 -->
  <DocxCompareDialog
    v-model="showDocxCompare"
    :form-data="compareFormData"
    :apply-ai="compareFormData ? (aiSuggestionFlags[compareFormData.index] || false) : false"
    :temp-id="tempDocxId || ''"
    :project-id="selectedProject?.id || 0"
    :all-form-names="importedFormsPreview.map(f => f.name)"
    :all-forms-data="importedFormsPreview"
    @update:apply-ai="(v) => compareFormData && updateAiFlag(compareFormData.index, v)"
  />
</template>

<style scoped>
/* 导入Word弹窗 - 表单项布局 */
:deep(.docx-form-checkbox.el-checkbox.is-bordered) {
  width: 100% !important;
  height: auto !important;
  padding: 8px 12px !important;
}

:deep(.docx-form-checkbox .el-checkbox__label) {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  padding-left: 8px !important;
}

.docx-form-item {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  gap: 12px !important;
}

.docx-form-name {
  flex: 1 1 auto !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  min-width: 0 !important;
}

.docx-form-actions {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  margin-left: auto !important;
}

/* 弹窗圆角与头部渐变主题 */
:deep(.el-dialog) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

:deep(.el-dialog__header) {
  background: linear-gradient(
    135deg,
    var(--color-primary-subtle) 0%,
    var(--color-bg-card) 100%
  );
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}
</style>
