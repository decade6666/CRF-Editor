import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api, toggleSelectAll } from './useApi';

function createImportWordRefs() {
  const importWordStep = ref(1);
  const importWordLoading = ref(false);
  const importedFormsPreview = ref([]);
  const selectedFormsToImport = ref([]);
  const tempDocxId = ref(null);
  const importWordErrorMessage = ref('');
  const showDocxCompare = ref(false);
  const compareFormData = ref(null);
  const importedResults = ref([]);

  return {
    importWordStep,
    importWordLoading,
    importedFormsPreview,
    selectedFormsToImport,
    tempDocxId,
    importWordErrorMessage,
    showDocxCompare,
    compareFormData,
    importedResults,
  };
}

function createImportWordState() {
  const refs = createImportWordRefs();

  function replaceImportedFormsPreview(forms) {
    refs.importedFormsPreview.value = forms;
    if (!refs.compareFormData.value) return;
    refs.compareFormData.value = forms.find((form) => form.index === refs.compareFormData.value.index) || null;
  }

  return { ...refs, replaceImportedFormsPreview };
}

function createStepNavigation({ state }) {
  function goBackToImportWordStep1() {
    state.importWordStep.value = 1;
    state.importedFormsPreview.value = [];
    state.selectedFormsToImport.value = [];
    state.tempDocxId.value = null;
    state.importWordErrorMessage.value = '';
    state.showDocxCompare.value = false;
    state.compareFormData.value = null;
  }

  function openDocxCompare(form) {
    state.compareFormData.value = form;
    state.showDocxCompare.value = true;
  }

  return { goBackToImportWordStep1, openDocxCompare };
}

function createUploadGuard({ state }) {
  function beforeDocxUpload(file) {
    if (file.size > 10 * 1024 * 1024) {
      ElMessage.error('文件大小不能超过 10MB');
      return false;
    }
    state.importWordErrorMessage.value = '';
    state.importWordLoading.value = true;
    return true;
  }

  return { beforeDocxUpload };
}

function createUploadResultHandlers({ state }) {
  function handleDocxUploadSuccess(response) {
    state.importWordLoading.value = false;
    if (response?.forms && response?.temp_id) {
      state.replaceImportedFormsPreview(response.forms);
      state.selectedFormsToImport.value = [];
      state.tempDocxId.value = response.temp_id;
      state.importWordErrorMessage.value = '';
      state.importWordStep.value = 2;
    } else {
      state.importWordErrorMessage.value = '文件解析失败或响应格式不正确。';
      ElMessage.error(state.importWordErrorMessage.value);
    }
  }

  function handleDocxUploadError(error) {
    state.importWordLoading.value = false;
    state.importWordErrorMessage.value = '文件上传失败。';
    if (error?.message) {
      try {
        state.importWordErrorMessage.value += ` 错误: ${JSON.parse(error.message).detail || error.message}`;
      } catch {
        state.importWordErrorMessage.value += ` 错误: ${error.message}`;
      }
    }
    ElMessage.error(state.importWordErrorMessage.value);
  }

  return { handleDocxUploadSuccess, handleDocxUploadError };
}

function createImportExecution({ state, projectId, refreshKey }) {
  function toggleSelectAllImportWordForms() {
    toggleSelectAll(state.importedFormsPreview, state.selectedFormsToImport, (f) => f.index);
  }

  async function executeImportWord() {
    if (!state.selectedFormsToImport.value.length || !state.tempDocxId.value) {
      state.importWordErrorMessage.value = '请选择要导入的表单。';
      return ElMessage.warning(state.importWordErrorMessage.value);
    }
    state.importWordLoading.value = true;
    state.importWordErrorMessage.value = '';
    try {
      const data = await api.post(`/api/projects/${projectId.value}/import-docx/execute`, {
        temp_id: state.tempDocxId.value,
        form_indices: state.selectedFormsToImport.value,
      });
      ElMessage.success(`导入成功：${data.imported_form_count}个表单`);
      state.importedResults.value = Array.isArray(data.detail) ? data.detail : [];
      state.importWordStep.value = 3;
      api.clearAllCache();
      refreshKey.value++;
    } catch (e) {
      state.importWordErrorMessage.value = '导入失败: ' + e.message;
      ElMessage.error(state.importWordErrorMessage.value);
    } finally {
      state.importWordLoading.value = false;
    }
  }

  return { toggleSelectAllImportWordForms, executeImportWord };
}

function createWordImportHandlers({ state, projectId, refreshKey }) {
  return {
    ...createStepNavigation({ state }),
    ...createUploadGuard({ state }),
    ...createUploadResultHandlers({ state }),
    ...createImportExecution({ state, projectId, refreshKey }),
  };
}

export function useWordImport({ projectId, visible, refreshKey }) {
  const state = createImportWordState();
  const handlers = createWordImportHandlers({ state, projectId, refreshKey });

  function resetImportWordSession() {
    state.importWordStep.value = 1;
    state.importWordLoading.value = false;
    state.importedFormsPreview.value = [];
    state.selectedFormsToImport.value = [];
    state.tempDocxId.value = null;
    state.importWordErrorMessage.value = '';
    state.showDocxCompare.value = false;
    state.compareFormData.value = null;
    state.importedResults.value = [];
  }

  watch(
    visible,
    (isVisible) => {
      if (isVisible) {
        resetImportWordSession();
        return;
      }
      state.showDocxCompare.value = false;
      state.compareFormData.value = null;
    },
    { immediate: true },
  );

  return { ...state, ...handlers };
}
