<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  provide,
  defineAsyncComponent,
  nextTick,
} from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Delete,
  DocumentCopy,
  Expand,
  Files,
  Loading,
  Monitor,
  Moon,
  Plus,
  Rank,
  RefreshRight,
  Search,
  Setting,
  Sunny,
} from '@element-plus/icons-vue';
import draggable from 'vuedraggable';
import { api, getAuthHeaders, apiUrl } from './composables/useApi';
import { getDownloadFilename } from './composables/exportDownloadState';
import { createLazyTabState } from './composables/useLazyTabs';
import { useDesignerFormSelection } from './composables/useDesignerFormSelection';
import { collectColumnWidthOverrides } from './composables/useColumnResize';
import ProjectInfoTab from './components/ProjectInfoTab.vue';
import LoginView from './components/LoginView.vue';
import AdminView from './components/AdminView.vue';
import OrganizationManagementView from './components/OrganizationManagementView.vue';
import SessionTimer from './components/SessionTimer.vue';
import WordImportDialog from './components/WordImportDialog.vue';
import { useOrderableList } from './composables/useOrderableList';
import { confirmFinalProjectDelete } from './composables/projectDeleteConfirmation';

const VisitsTab = defineAsyncComponent(() => import('./components/VisitsTab.vue'));
const FormDesignerTab = defineAsyncComponent(() => import('./components/FormDesignerTab.vue'));
const FieldsTab = defineAsyncComponent(() => import('./components/FieldsTab.vue'));
const CodelistsTab = defineAsyncComponent(() => import('./components/CodelistsTab.vue'));
const UnitsTab = defineAsyncComponent(() => import('./components/UnitsTab.vue'));
const TemplatePreviewDialog = defineAsyncComponent(() => import('./components/TemplatePreviewDialog.vue'));
const TemplateFieldSearchDialog = defineAsyncComponent(() => import('./components/TemplateFieldSearchDialog.vue'));

// 登录状态
const isCheckingAuth = ref(!!localStorage.getItem('crf_token'));
const isLoggedIn = ref(false);

function getEmptyUser() {
  return { username: '', is_admin: false };
}

function rememberUsername(username = currentUser.value.username) {
  const normalized = String(username || '').trim();
  if (normalized) localStorage.setItem('crf_last_username', normalized);
}

function resetSessionState() {
  api.clearAllCache();
  localStorage.removeItem('crf_token');
  isLoggedIn.value = false;
  isCheckingAuth.value = false;
  closeSelfPasswordDialog();
  showSettings.value = false;
  showImportWordDialog.value = false;
  projects.value = [];
  selectedProject.value = null;
  resetLazyTabs('info');
  currentUser.value = getEmptyUser();
}

async function onLoginSuccess() {
  isCheckingAuth.value = true;
  const authenticated = await loadMe();
  if (!authenticated) {
    resetSessionState();
    return;
  }
  isLoggedIn.value = true;
  isCheckingAuth.value = false;
  if (isAdmin.value) {
    selectedProject.value = null;
    projects.value = [];
    return;
  }
  await loadProjects();
}

function logout() {
  rememberUsername();
  resetSessionState();
  ElMessage.success('已退出登录');
}

function handleAuthExpired() {
  rememberUsername();
  resetSessionState();
}

// 当前用户信息
const currentUser = ref(getEmptyUser());
const isAdmin = computed(() => currentUser.value.is_admin);
const activeAdminPage = ref('users'); // users | orgs

async function loadMe() {
  try {
    currentUser.value = await api.get('/api/auth/me');
    rememberUsername(currentUser.value.username);
    return true;
  } catch {
    currentUser.value = getEmptyUser();
    return false;
  }
}

// 项目数据
const projects = ref([]);
const selectedProject = ref(null);
const { activeTab, activateTab, isTabActivated, reset: resetLazyTabs } = createLazyTabState('info');
const formDesignerTabRef = ref(null);
const { requestFormSelection } = useDesignerFormSelection(formDesignerTabRef);
const showCreateProject = ref(false);
const newProject = reactive({ name: '', version: '1.0', db_type: '其他' });
const copyingProjectId = ref(null);

const { dragging: draggingProjects, handleDragEnd: handleProjectDragEnd } = useOrderableList('/api/projects/reorder');

async function loadProjects() {
  if (isAdmin.value) {
    projects.value = [];
    selectedProject.value = null;
    return;
  }
  projects.value = await api.get('/api/projects');
}

async function restoreSession() {
  const hasToken = !!localStorage.getItem('crf_token');
  if (!hasToken) {
    isLoggedIn.value = false;
    isCheckingAuth.value = false;
    return;
  }
  isCheckingAuth.value = true;
  const authenticated = await loadMe();
  if (!authenticated) {
    resetSessionState();
    return;
  }
  isLoggedIn.value = true;
  try {
    if (!isAdmin.value) await loadProjects();
  } finally {
    isCheckingAuth.value = false;
  }
}

async function onProjectDragEnd() {
  await handleProjectDragEnd(projects.value, loadProjects, (err) => ElMessage.error(err.message));
}
onMounted(async () => {
  window.addEventListener('crf:auth-expired', handleAuthExpired);
  await restoreSession();
});

onBeforeUnmount(() => {
  window.removeEventListener('crf:auth-expired', handleAuthExpired);
});

// 全局刷新信号：子组件 inject 后 watch 此值来重载数据
const refreshKey = ref(0);
provide('refreshKey', refreshKey);

// 编辑模式（持久化，默认关闭）
const editMode = ref(localStorage.getItem('crf_edit_mode') === 'true');
const ADVANCED_EDIT_TABS = new Set(['codelists', 'units', 'fields']);
watch(editMode, (v) => {
  localStorage.setItem('crf_edit_mode', String(v));
  if (!v && ADVANCED_EDIT_TABS.has(activeTab.value)) resetLazyTabs('info');
});
provide('editMode', editMode);

// 当前项目数据库类型（字段库 / 设计器注入；缺省「其他」）
const projectDbType = computed(() => selectedProject.value?.db_type || '其他');
provide('projectDbType', projectDbType);

function handleRefresh() {
  api.clearAllCache();
  refreshKey.value++;
  loadProjects();
  ElMessage.success('数据已刷新');
}

async function selectProject(p) {
  if (selectedProject.value?.id === p.id) return;
  if (isTabActivated('designer') && formDesignerTabRef.value?.canLeaveProject) {
    const canLeave = await formDesignerTabRef.value.canLeaveProject();
    if (!canLeave) return;
  }
  selectedProject.value = p;
  resetLazyTabs('info');
}

// 切换Tab时刷新相关数据
watch(activeTab, (newTab) => {
  // 字段页与表单设计页共用字段定义数据；两者互相切换时都刷新，避免字段库看到过期缓存。
  if (newTab === 'fields' || newTab === 'designer') {
    api.invalidateCache(`/api/projects/${selectedProject.value?.id}/field-definitions`);
    refreshKey.value++;
  }
});

async function onMainTabBeforeLeave(activeName, oldActiveName) {
  if (
    oldActiveName === 'designer' &&
    isTabActivated('designer') &&
    formDesignerTabRef.value?.canLeaveTab
  ) {
    return await formDesignerTabRef.value.canLeaveTab();
  }
  return true;
}

function onMainTabChange(name) {
  activateTab(name);
}

function onProjectUpdated(p) {
  selectedProject.value = p;
  const idx = projects.value.findIndex((x) => x.id === p.id);
  if (idx >= 0) projects.value[idx] = p;
}

async function createProject() {
  if (!newProject.name) return ElMessage.warning('请输入项目名称');
  try {
    const p = await api.post('/api/projects', { ...newProject });
    projects.value.push(p);
    showCreateProject.value = false;
    newProject.name = '';
    selectProject(p);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function deleteProject(p) {
  try {
    await ElMessageBox.confirm(`删除项目 "${p.name}"？删除后如需恢复，请联系管理员。`, '确认', { type: 'warning' });
    await confirmFinalProjectDelete(ElMessageBox.confirm, { projectName: p.name, recoverable: true });
    await api.del(`/api/projects/${p.id}`);
    if (selectedProject.value?.id === p.id) {
      selectedProject.value = null;
    }
    loadProjects();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message);
  }
}

async function copyProject(p) {
  copyingProjectId.value = p.id;
  try {
    const copied = await api.post(`/api/projects/${p.id}/copy`, {});
    await loadProjects();
    selectProject(copied);
    ElMessage.success('项目复制成功');
  } catch (e) {
    ElMessage.error('项目复制失败: ' + e.message);
  } finally {
    copyingProjectId.value = null;
  }
}

const exportWordLoading = ref(false);

// collectColumnWidthOverrides 已集中到 useColumnResize.js（R4），App 仅保留导出时的调用。

async function exportWord(annotated = false) {
  if (!selectedProject.value || exportWordLoading.value) return;
  exportWordLoading.value = true;
  try {
    // 收集列宽覆盖配置
    const forms = formDesignerTabRef.value?.getForms?.() || [];
    const columnWidthOverrides = collectColumnWidthOverrides(forms);

    const response = await fetch(apiUrl(`/api/projects/${selectedProject.value.id}/export/word`), {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ column_width_overrides: columnWidthOverrides, annotated }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return ElMessage.error('导出失败: ' + (err.detail || '未知错误'));
    }
    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition');
    const fallbackFilename = `${selectedProject.value.name}_${annotated ? 'aCRF' : 'CRF'}.docx`;
    const filename = getDownloadFilename(contentDisposition, fallbackFilename);
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败: ' + e.message);
  } finally {
    exportWordLoading.value = false;
  }
}

function onExportCommand(command) {
  if (command === 'ecrf') {
    exportWord();
  } else if (command === 'acrf') {
    exportWord(true);
  }
}

async function _blobDownload(url, fallbackFilename) {
  const response = await fetch(apiUrl(url), { headers: getAuthHeaders() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || '未知错误');
  }
  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition');
  const filename = getDownloadFilename(contentDisposition, fallbackFilename);
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

async function exportFullDatabase() {
  const exportUrl = isAdmin.value ? '/api/export/database' : '/api/projects/export/database';
  const dialogTitle = '导出所有项目';
  const dialogMessage = isAdmin.value
    ? '将导出所有项目数据库文件，是否继续？'
    : '将导出当前账号名下的全部项目，是否继续？';
  const fallbackFilename = isAdmin.value ? 'crf_editor_full.db' : `${currentUser.value.username || 'my'}_projects.db`;

  try {
    await ElMessageBox.confirm(dialogMessage, dialogTitle, { type: 'info' });
  } catch {
    return;
  }
  try {
    await _blobDownload(exportUrl, fallbackFilename);
    ElMessage.success('数据库导出成功');
  } catch (e) {
    ElMessage.error('导出失败: ' + e.message);
  }
}

async function exportProjectDatabase() {
  if (!selectedProject.value) return;
  const name = selectedProject.value.name;
  try {
    await ElMessageBox.confirm(`将导出项目「${name}」的数据库，是否继续？`, '导出当前项目', { type: 'info' });
  } catch {
    return;
  }
  try {
    await _blobDownload(`/api/projects/${selectedProject.value.id}/export/database`, `${name}_template.db`);
    ElMessage.success('项目数据库导出成功');
  } catch (e) {
    ElMessage.error('导出失败: ' + e.message);
  }
}

// 导入项目（统一入口，自动检测单项目/多项目）
const importProjectInput = ref(null);
const importProjectLoading = ref(false);

function triggerImportProject() {
  importProjectInput.value?.click();
}

async function handleImportProject(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';
  importProjectLoading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(apiUrl('/api/projects/import/auto'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || '导入失败');
    const names = data.imported.map((p) => p.name).join('、');
    const renamedInfo = data.renamed.length
      ? `\n重命名：${data.renamed.map((r) => `${r.original} → ${r.new}`).join('、')}`
      : '';
    if (data.count === 1) {
      ElMessage.success(`导入成功：${names}`);
    } else {
      ElMessageBox.alert(`导入 ${data.count} 个项目：${names}${renamedInfo}`, '导入结果', { type: 'success' });
    }
    api.clearAllCache();
    loadProjects();
  } catch (err) {
    ElMessage.error('导入失败: ' + err.message);
  } finally {
    importProjectLoading.value = false;
  }
}

// 设置弹窗
const showSettings = ref(false);
const settingsForm = reactive({
  template_path: '',
  ai_enabled: false,
  ai_api_url: '',
  ai_api_key: '',
  ai_model: '',
  ai_api_format: '',
});
const aiTestLoading = ref(false);
const aiTestResult = ref(null); // { ok, latency_ms, model, error }
const showSelfPasswordDialog = ref(false);
const selfPasswordSaving = ref(false);
const selfPasswordForm = reactive({
  current_password: '',
  new_password: '',
  confirm_new_password: '',
});

function resetSelfPasswordForm() {
  selfPasswordForm.current_password = '';
  selfPasswordForm.new_password = '';
  selfPasswordForm.confirm_new_password = '';
}

function openSelfPasswordDialog() {
  resetSelfPasswordForm();
  showSelfPasswordDialog.value = true;
}

function closeSelfPasswordDialog() {
  showSelfPasswordDialog.value = false;
  selfPasswordSaving.value = false;
  resetSelfPasswordForm();
}

async function submitSelfPasswordChange() {
  if (selfPasswordForm.new_password !== selfPasswordForm.confirm_new_password) {
    ElMessage.error('新密码与确认新密码不一致');
    return;
  }
  selfPasswordSaving.value = true;
  try {
    await api.put('/api/auth/me/password', {
      current_password: selfPasswordForm.current_password,
      new_password: selfPasswordForm.new_password,
    });
    ElMessage.success('密码修改成功，请重新登录');
    closeSelfPasswordDialog();
    rememberUsername();
    resetSessionState();
  } catch (e) {
    if (e.status !== 401) ElMessage.error(e.message);
  } finally {
    selfPasswordSaving.value = false;
  }
}

function resetSettingsForm() {
  settingsForm.template_path = '';
  settingsForm.ai_enabled = false;
  settingsForm.ai_api_url = '';
  settingsForm.ai_api_key = '';
  settingsForm.ai_model = '';
  settingsForm.ai_api_format = '';
}

async function openSettings() {
  showSettings.value = true;
  aiTestResult.value = null;
  closeSelfPasswordDialog();
  resetSettingsForm();
  if (!isAdmin.value) return;
  try {
    const data = await api.get('/api/settings');
    settingsForm.template_path = data.template_path || '';
    settingsForm.ai_enabled = data.ai_enabled || false;
    settingsForm.ai_api_url = data.ai_api_url || '';
    settingsForm.ai_api_key = data.ai_api_key || '';
    settingsForm.ai_model = data.ai_model || '';
    settingsForm.ai_api_format = data.ai_api_format || '';
  } catch (e) {
    ElMessage.error('加载设置失败: ' + e.message);
  }
}

async function saveSettings() {
  if (!isAdmin.value) {
    showSettings.value = false;
    return;
  }
  try {
    await api.put('/api/settings', {
      template_path: settingsForm.template_path,
      ai_enabled: settingsForm.ai_enabled,
      ai_api_url: settingsForm.ai_api_url,
      ai_api_key: settingsForm.ai_api_key,
      ai_model: settingsForm.ai_model,
      ai_api_format: settingsForm.ai_api_format,
    });
    ElMessage.success('设置已保存');
    showSettings.value = false;
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message);
  }
}

async function testAiConnection() {
  aiTestLoading.value = true;
  aiTestResult.value = null;
  try {
    const res = await api.post('/api/settings/ai/test', {
      ai_api_url: settingsForm.ai_api_url,
      ai_api_key: settingsForm.ai_api_key,
      ai_model: settingsForm.ai_model,
    });
    aiTestResult.value = res;
    // 测试成功时自动记录探测到的API格式
    if (res.ok && res.api_format) {
      settingsForm.ai_api_format = res.api_format;
    }
  } catch (e) {
    aiTestResult.value = { ok: false, error: e.message };
  } finally {
    aiTestLoading.value = false;
  }
}

// 导入模板
const showImport = ref(false);
const importLoading = ref(false);
const importProjects = ref([]);
const importSelectedForms = ref([]); // 选中的表单 id 列表
// 树节点选中信息（用于定位 source_project_id）
const importTreeCheckedForms = ref([]); // [{projectId, formId, formName}]
// 预览对话框
const showTemplatePreview = ref(false);
const hasOpenedTemplatePreview = ref(false);
const templatePreviewFormId = ref(null);
const templatePreviewFormName = ref('');

// 模板字段查询（非模态、可拖拽；关闭后保留关键词与结果，会话内仅首次加载）
const showTemplateFieldSearch = ref(false);
const hasOpenedTemplateFieldSearch = ref(false);

async function openTemplateFieldSearch() {
  hasOpenedTemplateFieldSearch.value = true;
  if (showTemplateFieldSearch.value) {
    // 已打开时先关再开：重新获取顶层 z-index，让面板回到后开的全屏设计器之上
    showTemplateFieldSearch.value = false;
    await nextTick();
  }
  showTemplateFieldSearch.value = true;
}

watch(editMode, (enabled) => {
  if (!enabled) showTemplateFieldSearch.value = false;
});

// 将后端返回的项目+表单数据转换为 el-tree 所需格式
function buildImportTreeData(projects) {
  return projects.map((p) => ({
    id: `proj_${p.id}`,
    label: `${p.name}（v${p.version}，${p.forms.length} 个表单）`,
    projectId: p.id,
    isProject: true,
    children: p.forms.map((f) => ({
      id: `form_${f.id}`,
      label: f.name,
      formId: f.id,
      projectId: p.id,
      isForm: true,
    })),
  }));
}
const importTreeData = ref([]);

async function openImportDialog() {
  importProjects.value = [];
  importTreeData.value = [];
  importSelectedForms.value = [];
  importTreeCheckedForms.value = [];
  showImport.value = true;
  importLoading.value = true;
  try {
    const data = await api.post(`/api/projects/${selectedProject.value.id}/import-template`);
    importProjects.value = data.projects || [];
    importTreeData.value = buildImportTreeData(importProjects.value);
  } catch (e) {
    ElMessage.error('加载模板失败: ' + e.message);
    showImport.value = false;
  } finally {
    importLoading.value = false;
  }
}

function handleImportTreeCheck(node, { checkedNodes }) {
  // 只收集叶子节点（表单）
  const forms = checkedNodes.filter((n) => n.isForm);
  importSelectedForms.value = forms.map((n) => n.formId);
  importTreeCheckedForms.value = forms;
}

function openTemplatePreview(node) {
  if (!node.isForm) return;
  templatePreviewFormId.value = node.formId;
  templatePreviewFormName.value = node.label;
  hasOpenedTemplatePreview.value = true;
  showTemplatePreview.value = true;
}

// 从选中的表单中推断 source_project_id（取第一个选中表单所属项目）
function getSourceProjectId() {
  if (!importTreeCheckedForms.value.length) return null;
  return importTreeCheckedForms.value[0].projectId;
}

async function executeImport() {
  if (!importSelectedForms.value.length) return;
  const sourceProjectId = getSourceProjectId();
  if (!sourceProjectId) return;
  const targetProjectId = selectedProject.value?.id;
  if (targetProjectId == null) return;
  importLoading.value = true;
  try {
    const data = await api.post(`/api/projects/${targetProjectId}/import-template/execute`, {
      source_project_id: sourceProjectId,
      form_ids: importSelectedForms.value,
    });
    ElMessage.success(`导入成功：${data.imported_form_count}个表单`);
    showImport.value = false;
    api.clearAllCache();
    refreshKey.value++;
    // 展示交接只属于发起导入的项目：迟到的成功不得在切换后的工作区选中表单。
    try {
      const importedFormIds = Array.isArray(data.imported_form_ids) ? data.imported_form_ids : [];
      const firstImportedId = importedFormIds.length ? importedFormIds[0] : null;
      if (firstImportedId != null && selectedProject.value?.id === targetProjectId) {
        await requestFormSelection(firstImportedId);
      }
    } catch (e) {
      // 写入已成功：展示失败必须与导入失败区分，避免诱导重复导入。
      ElMessage.error('导入已完成，但展示新表单失败: ' + e.message);
    }
  } catch (e) {
    ElMessage.error('导入失败: ' + e.message);
  } finally {
    importLoading.value = false;
  }
}

// 导入Word
const showImportWordDialog = ref(false);

function openImportWordDialog() {
  showImportWordDialog.value = true;
}

// Step 3：跳转到表单设计页并选中该表单
async function openDesignerForImportedForm(formId) {
  showImportWordDialog.value = false;
  activateTab('designer');
  activeTab.value = 'designer';
  await nextTick();
  await requestFormSelection(formId);
}

// 暗色模式（持久化）
const isDark = ref(localStorage.getItem('crf_theme') === 'dark');

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDark.value);
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}

function setTheme(value) {
  isDark.value = !!value;
  localStorage.setItem('crf_theme', isDark.value ? 'dark' : 'light');
  applyTheme();
}

function toggleTheme() {
  setTheme(!isDark.value);
}

onMounted(() => {
  applyTheme();
});

// 侧边栏折叠
const isCollapsed = ref(false);

// 侧边栏宽度拖拽（持久化）
const sidebarWidth = ref(parseInt(localStorage.getItem('crf_sidebarWidth')) || 220);
const isResizing = ref(false);
watch(sidebarWidth, (v) => localStorage.setItem('crf_sidebarWidth', v));

function startResize(e) {
  if (isCollapsed.value) return;
  isResizing.value = true;
  const startX = e.clientX,
    startW = sidebarWidth.value;
  function onMove(e) {
    sidebarWidth.value = Math.max(120, Math.min(400, startW + e.clientX - startX));
  }
  function onUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<template>
  <div v-if="isCheckingAuth" class="auth-loading" aria-live="polite">
    <el-icon class="is-loading" size="24px"><Loading /></el-icon>
    <span>正在验证登录状态...</span>
  </div>
  <LoginView v-else-if="!isLoggedIn" @login-success="onLoginSuccess" />
  <template v-else-if="isAdmin">
    <div class="header">
      <div class="header-left">
        <h1>CRF编辑器</h1>
        <el-button class="header-icon-btn" text circle aria-label="打开设置" title="设置" @click="openSettings"
          ><el-icon aria-hidden="true"><Setting /></el-icon
        ></el-button>
        <el-button
          class="header-icon-btn"
          text
          circle
          :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
          :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
          @click="toggleTheme"
        >
          <el-icon aria-hidden="true"><Moon v-if="!isDark" /><Sunny v-else /></el-icon>
        </el-button>
      </div>
      <div class="header-right-group">
        <SessionTimer />
      </div>
    </div>
    <div class="admin-shell">
      <div class="admin-nav">
        <el-radio-group v-model="activeAdminPage" size="small">
          <el-radio-button value="users">用户管理</el-radio-button>
          <el-radio-button value="orgs">机构管理</el-radio-button>
        </el-radio-group>
      </div>
      <KeepAlive>
        <AdminView v-if="activeAdminPage === 'users'" @logout="logout" />
        <OrganizationManagementView v-else />
      </KeepAlive>
    </div>
  </template>
  <template v-else>
    <!-- 头部 -->
    <div class="header">
      <div class="header-left">
        <h1 v-if="!isCollapsed">CRF编辑器</h1>
        <el-button
          v-else
          class="header-icon-btn"
          text
          circle
          aria-label="展开侧边栏"
          title="展开侧边栏"
          @click="isCollapsed = false"
        >
          <el-icon aria-hidden="true"><Expand /></el-icon>
        </el-button>
        <el-button class="header-icon-btn" text circle aria-label="刷新数据" title="刷新数据" @click="handleRefresh"
          ><el-icon aria-hidden="true"><RefreshRight /></el-icon
        ></el-button>
        <el-button class="header-icon-btn" text circle aria-label="打开设置" title="设置" @click="openSettings"
          ><el-icon aria-hidden="true"><Setting /></el-icon
        ></el-button>
        <el-button
          v-if="editMode"
          class="header-icon-btn"
          text
          circle
          aria-label="模板字段查询"
          title="模板字段查询"
          @click="openTemplateFieldSearch"
          ><el-icon aria-hidden="true"><Search /></el-icon
        ></el-button>
        <el-button
          class="header-icon-btn"
          text
          circle
          :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
          :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
          @click="toggleTheme"
        >
          <el-icon aria-hidden="true"><Moon v-if="!isDark" /><Sunny v-else /></el-icon>
        </el-button>
      </div>
      <div class="header-right-group">
        <div class="header-right">
          <el-dropdown v-if="selectedProject" trigger="hover" :disabled="exportWordLoading" @command="onExportCommand">
            <el-button type="warning" size="small" :loading="exportWordLoading" aria-label="导出">导出Word</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="ecrf">导出eCRF</el-dropdown-item>
                <el-dropdown-item command="acrf">导出aCRF</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <SessionTimer />
      </div>
    </div>

    <!-- 主体布局 -->
    <div class="main">
      <!-- 侧边栏 -->
      <div
        class="sidebar"
        :class="{ collapsed: isCollapsed }"
        :style="{ width: isCollapsed ? '0px' : sidebarWidth + 'px' }"
      >
        <!-- eslint-disable-next-line vue/attributes-order -->
        <div class="sidebar-content" v-show="!isCollapsed">
          <div class="sidebar-header">
            <span>项目列表</span>
            <el-button type="primary" size="small" circle title="新建项目" @click="showCreateProject = true"
              ><el-icon><Plus /></el-icon
            ></el-button>
          </div>
          <div class="project-list">
            <draggable
              v-model="projects"
              item-key="id"
              handle=".drag-handle"
              @start="draggingProjects = true"
              @end="onProjectDragEnd"
            >
              <template #item="{ element: p }">
                <div class="project-item" :class="{ active: selectedProject?.id === p.id }">
                  <span class="drag-handle" aria-hidden="true">
                    <el-icon><Rank /></el-icon>
                  </span>
                  <button
                    class="project-select-btn"
                    type="button"
                    :aria-current="selectedProject?.id === p.id ? 'true' : undefined"
                    @click="selectProject(p)"
                  >
                    <span class="project-item-main">
                      <el-icon aria-hidden="true"><Files /></el-icon>
                      <span class="project-item-name">{{ p.name }}</span>
                    </span>
                  </button>
                  <div class="project-actions">
                    <el-button
                      class="project-action-btn project-action-btn--copy"
                      link
                      :loading="copyingProjectId === p.id"
                      aria-label="复制项目"
                      title="复制项目"
                      @click.stop="copyProject(p)"
                    >
                      <el-icon aria-hidden="true"><DocumentCopy /></el-icon>
                    </el-button>
                    <el-button
                      class="project-action-btn project-action-btn--delete"
                      link
                      type="danger"
                      aria-label="删除项目"
                      title="删除项目"
                      @click.stop="deleteProject(p)"
                    >
                      <el-icon aria-hidden="true"><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </template>
            </draggable>
          </div>
        </div>
      </div>
      <button
        v-if="!isCollapsed"
        type="button"
        class="sidebar-resizer"
        :class="{ dragging: isResizing }"
        aria-label="调整侧边栏宽度"
        @mousedown="startResize"
      ></button>

      <!-- 内容区 -->
      <div class="content">
        <div v-if="!selectedProject" class="empty-tip">
          <div class="empty-state">
            <el-icon size="64px" color="var(--color-text-muted)"><Monitor /></el-icon>
            <h3>欢迎使用 CRF 编辑器</h3>
            <p>请从左侧选择一个项目开始编辑，或新建一个项目</p>
            <el-button type="primary" plain @click="showCreateProject = true">新建项目</el-button>
          </div>
        </div>
        <template v-else>
          <!-- eslint-disable vue/attributes-order -->
          <el-tabs
            class="main-content-tabs"
            v-model="activeTab"
            style="height: 100%; display: flex; flex-direction: column"
            :before-leave="onMainTabBeforeLeave"
            @tab-change="onMainTabChange"
          >
            <!-- eslint-enable vue/attributes-order -->
            <el-tab-pane label="项目信息" name="info">
              <div class="content-inner"><ProjectInfoTab :project="selectedProject" @updated="onProjectUpdated" /></div>
            </el-tab-pane>
            <el-tab-pane v-if="editMode" label="选项" name="codelists">
              <div v-if="isTabActivated('codelists')" class="content-inner">
                <CodelistsTab :project-id="selectedProject.id" />
              </div>
            </el-tab-pane>
            <el-tab-pane v-if="editMode" label="单位" name="units">
              <div v-if="isTabActivated('units')" class="content-inner">
                <UnitsTab :project-id="selectedProject.id" />
              </div>
            </el-tab-pane>
            <el-tab-pane v-if="editMode" label="字段" name="fields">
              <div v-if="isTabActivated('fields')" class="content-inner">
                <FieldsTab :project-id="selectedProject.id" />
              </div>
            </el-tab-pane>
            <el-tab-pane label="表单" name="designer">
              <div v-if="isTabActivated('designer')" class="content-inner">
                <FormDesignerTab
                  ref="formDesignerTabRef"
                  :project-id="selectedProject.id"
                  @import-template="openImportDialog"
                  @open-template-field-search="openTemplateFieldSearch"
                />
              </div>
            </el-tab-pane>
            <el-tab-pane label="访视" name="visits">
              <div v-if="isTabActivated('visits')" class="content-inner">
                <VisitsTab :project-id="selectedProject.id" workspace="list" />
              </div>
            </el-tab-pane>
            <el-tab-pane label="访视流程" name="visitflow">
              <div v-if="isTabActivated('visitflow')" class="content-inner">
                <VisitsTab :project-id="selectedProject.id" workspace="flow" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </div>
    </div>

    <!-- 新建项目弹窗 -->
    <el-dialog v-model="showCreateProject" title="新建项目" width="400px" :close-on-click-modal="false">
      <el-form :model="newProject" label-width="90px">
        <el-form-item label="项目名称"><el-input v-model="newProject.name" /></el-form-item>
        <el-form-item label="版本号"><el-input v-model="newProject.version" /></el-form-item>
        <el-form-item label="数据库类型">
          <el-radio-group v-model="newProject.db_type">
            <el-radio label="赛美斯">赛美斯</el-radio>
            <el-radio label="其他">其他</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateProject = false">取消</el-button>
        <el-button type="primary" @click="createProject">确定</el-button>
      </template>
    </el-dialog>

    <!-- 导入模板弹窗 -->
    <el-dialog v-model="showImport" title="导入模板" width="560px" :close-on-click-modal="false">
      <div v-if="importLoading" style="text-align: center; padding: 30px 0">
        <el-icon class="is-loading" size="24px"><Loading /></el-icon> 加载中...
      </div>
      <template v-else>
        <p style="margin-bottom: 12px; color: var(--color-text-secondary)">请选择需要导入的表单：</p>
        <el-tree
          :data="importTreeData"
          show-checkbox
          node-key="id"
          :props="{ label: 'label', children: 'children' }"
          style="
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 8px;
          "
          @check="handleImportTreeCheck"
        >
          <template #default="{ node, data }">
            <span style="flex: 1">{{ node.label }}</span>
            <el-button v-if="data.isForm" size="small" text type="primary" @click.stop="openTemplatePreview(data)"
              >预览</el-button
            >
          </template>
        </el-tree>
        <div
          v-if="importTreeData.length === 0"
          style="color: var(--color-text-muted); text-align: center; padding: 20px 0"
        >
          模板库中没有项目
        </div>
      </template>
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" :disabled="importSelectedForms.length === 0" @click="executeImport"
          >确认导入</el-button
        >
      </template>
    </el-dialog>

    <!-- 模板预览对话框 -->
    <TemplatePreviewDialog
      v-if="hasOpenedTemplatePreview"
      v-model="showTemplatePreview"
      :project-id="selectedProject?.id"
      :form-id="templatePreviewFormId"
      :form-name="templatePreviewFormName"
    />

    <!-- 模板字段查询对话框 -->
    <TemplateFieldSearchDialog v-if="hasOpenedTemplateFieldSearch" v-model="showTemplateFieldSearch" />

    <!-- 导入Word弹窗（v-model + 只读 projectId；projectId 可为 null 时仍挂载） -->
    <WordImportDialog
      v-model="showImportWordDialog"
      :project-id="selectedProject?.id ?? null"
      @open-designer="openDesignerForImportedForm"
    />
  </template>

  <!-- 设置弹窗（全局可用） -->
  <el-dialog v-model="showSettings" title="设置" width="560px" :close-on-click-modal="false">
    <el-form label-width="100px">
      <el-divider>账号与界面</el-divider>
      <el-form-item label="当前用户">
        <div class="settings-current-user-row">
          <span>{{ currentUser.username || '未登录' }}</span>
          <el-button v-if="!isAdmin" link type="primary" @click="openSelfPasswordDialog">修改密码</el-button>
        </div>
      </el-form-item>
      <el-form-item v-if="!isAdmin" label="编辑模式">
        <el-switch v-model="editMode" inline-prompt active-text="完全" inactive-text="简要" />
        <span style="margin-left: 8px; color: var(--color-text-muted); font-size: 12px"
          >关闭时保留基础浏览与设计入口，开启后显示完整编辑能力</span
        >
      </el-form-item>
      <el-form-item label="主题模式">
        <el-switch :model-value="isDark" inline-prompt active-text="深色" inactive-text="浅色" @change="setTheme" />
      </el-form-item>

      <el-divider v-if="!isAdmin" />
      <div v-if="!isAdmin" class="settings-transfer-actions">
        <el-button @click="exportFullDatabase">导出所有项目</el-button>
        <el-button :disabled="!selectedProject" @click="exportProjectDatabase">导出当前项目</el-button>
        <el-button :loading="importProjectLoading" @click="triggerImportProject">导入项目</el-button>
        <el-button :disabled="!selectedProject" @click="openImportWordDialog">导入Word</el-button>
      </div>

      <template v-if="isAdmin">
        <el-divider>全局设置</el-divider>
        <el-form-item label="模板路径">
          <el-input v-model="settingsForm.template_path" placeholder="请输入模板 .db 文件的绝对路径" clearable />
        </el-form-item>
        <el-divider>AI 复核配置</el-divider>
        <el-form-item label="启用AI复核">
          <el-switch v-model="settingsForm.ai_enabled" />
        </el-form-item>
        <el-form-item label="API URL">
          <el-input
            v-model="settingsForm.ai_api_url"
            placeholder="如：https://api.openai.com/v1"
            :disabled="!settingsForm.ai_enabled"
            clearable
          />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="settingsForm.ai_api_key"
            type="password"
            show-password
            :disabled="!settingsForm.ai_enabled"
            clearable
          />
        </el-form-item>
        <el-form-item label="模型">
          <el-input
            v-model="settingsForm.ai_model"
            placeholder="如：gpt-4o, deepseek-chat"
            :disabled="!settingsForm.ai_enabled"
            clearable
          />
        </el-form-item>
        <el-form-item v-if="settingsForm.ai_enabled">
          <el-button
            :loading="aiTestLoading"
            :disabled="!settingsForm.ai_api_url || !settingsForm.ai_api_key || !settingsForm.ai_model"
            @click="testAiConnection"
          >
            测试连接
          </el-button>
          <span v-if="aiTestResult" style="margin-left: 10px; font-size: 13px">
            <span v-if="aiTestResult.ok" style="color: var(--color-success)">
              连接成功 ({{ aiTestResult.latency_ms }}ms,
              {{ aiTestResult.api_format === 'anthropic' ? 'Anthropic' : 'OpenAI' }}格式)
            </span>
            <span v-else style="color: var(--color-danger)"> 连接失败: {{ aiTestResult.error }} </span>
          </span>
        </el-form-item>
      </template>

      <input
        ref="importProjectInput"
        aria-label="导入项目数据库文件"
        type="file"
        accept=".db"
        style="display: none"
        @change="handleImportProject"
      />
    </el-form>
    <template #footer>
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%">
        <el-button type="danger" plain @click="logout">退出登录</el-button>
        <div style="display: flex; gap: 8px">
          <el-button
            @click="
              closeSelfPasswordDialog();
              showSettings = false;
            "
            >关闭</el-button
          >
          <el-button v-if="isAdmin" type="primary" @click="saveSettings">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showSelfPasswordDialog"
    title="修改密码"
    width="420px"
    append-to-body
    :close-on-click-modal="false"
    :before-close="closeSelfPasswordDialog"
  >
    <el-form label-width="100px">
      <el-form-item label="当前密码">
        <el-input
          v-model="selfPasswordForm.current_password"
          type="password"
          show-password
          autocomplete="current-password"
        />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="selfPasswordForm.new_password" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码">
        <el-input
          v-model="selfPasswordForm.confirm_new_password"
          type="password"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="selfPasswordSaving" @click="closeSelfPasswordDialog">取消</el-button>
      <el-button type="primary" :loading="selfPasswordSaving" @click="submitSelfPasswordChange">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 100vh;
  color: var(--color-text-secondary);
  background: var(--el-bg-color-page, #f5f7fa);
}

.project-item .drag-handle {
  flex-shrink: 0;
  padding: 4px;
  color: var(--color-text-muted);
  cursor: grab;
}

.project-select-btn {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.project-select-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.75);
  outline-offset: 2px;
}

.project-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.project-item-main .el-icon {
  flex-shrink: 0;
}

.project-item-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-action-btn {
  margin: 0;
  padding: 3px;
}

/* 侧边栏复制按钮三态对比度（仅作用于 .project-item .project-actions） */
.project-item .project-actions .project-action-btn--copy {
  color: rgba(255, 255, 255, 0.85);
}

.project-item:hover .project-actions .project-action-btn--copy {
  color: rgba(255, 255, 255, 0.75);
}

.project-item.active .project-actions .project-action-btn--copy {
  color: #ffffff;
}

.project-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}

.settings-current-user-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.settings-transfer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.settings-transfer-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.main-content-tabs {
  min-height: 0;
}

.admin-shell {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: 20px;
  box-sizing: border-box;
}

.admin-nav {
  margin-bottom: 12px;
}

.main-content-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
  padding-left: 20px;
}

.sidebar.collapsed {
  border-right: none;
}

.sidebar.collapsed .sidebar-content {
  display: none;
}

/* 弹窗圆角与头部渐变主题 */
:deep(.el-dialog) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

:deep(.el-dialog__header) {
  background: linear-gradient(135deg, var(--color-primary-subtle) 0%, var(--color-bg-card) 100%);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}
</style>
