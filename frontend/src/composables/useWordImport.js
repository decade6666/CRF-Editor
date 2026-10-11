import { ref, computed, watch, onScopeDispose } from 'vue';
import { ElMessage } from 'element-plus';
import { api, toggleSelectAll } from './useApi';
import {
  buildAiOverridesPayload,
  getAcceptedSuggestionsForForm,
  isAllAccepted,
  isAllIndeterminate,
  reconcileAcceptedOverrides,
} from './docxAiSuggestionOverrides';

const AI_REVIEW_POLL_INTERVAL_MS = 3000;

function createImportWordRefs() {
  const importWordStep = ref(1);
  const importWordLoading = ref(false);
  const importedFormsPreview = ref([]);
  const selectedFormsToImport = ref([]);
  const tempDocxId = ref(null);
  const importWordErrorMessage = ref('');
  const importWordAiTaskId = ref(null);
  const importWordAiReviewStatus = ref('idle');
  const importWordAiReviewError = ref('');
  const showDocxCompare = ref(false);
  const compareFormData = ref(null);
  const importedResults = ref([]);
  const acceptedAiOverrides = ref({});

  return {
    importWordStep,
    importWordLoading,
    importedFormsPreview,
    selectedFormsToImport,
    tempDocxId,
    importWordErrorMessage,
    importWordAiTaskId,
    importWordAiReviewStatus,
    importWordAiReviewError,
    showDocxCompare,
    compareFormData,
    importedResults,
    acceptedAiOverrides,
  };
}

function createImportWordState() {
  const refs = createImportWordRefs();

  function getFormAiSuggestions(form) {
    return Array.isArray(form?.ai_suggestions) ? form.ai_suggestions : [];
  }

  function resetAcceptedAiOverrides() {
    refs.acceptedAiOverrides.value = {};
  }

  const hasAnyAiSuggestions = computed(() =>
    refs.importedFormsPreview.value.some((form) => getFormAiSuggestions(form).length > 0),
  );
  const allAiSuggestionsAccepted = computed(() =>
    isAllAccepted(refs.importedFormsPreview.value, refs.acceptedAiOverrides.value),
  );
  const allAiSuggestionsIndeterminate = computed(() =>
    isAllIndeterminate(refs.importedFormsPreview.value, refs.acceptedAiOverrides.value),
  );
  const compareFormAcceptedSuggestions = computed(() =>
    getAcceptedSuggestionsForForm(refs.compareFormData.value, refs.acceptedAiOverrides.value),
  );

  return {
    ...refs,
    getFormAiSuggestions,
    resetAcceptedAiOverrides,
    hasAnyAiSuggestions,
    allAiSuggestionsAccepted,
    allAiSuggestionsIndeterminate,
    compareFormAcceptedSuggestions,
  };
}

function createReviewTimer() {
  let timerId = null;

  function clear() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function schedule(callback) {
    clear();
    timerId = setTimeout(callback, AI_REVIEW_POLL_INTERVAL_MS);
  }

  return { clear, schedule };
}

function createPreviewReplacer(state) {
  function replaceImportedFormsPreview(forms) {
    state.importedFormsPreview.value = forms;
    if (!state.compareFormData.value) return;
    state.compareFormData.value = forms.find((form) => form.index === state.compareFormData.value.index) || null;
  }

  return replaceImportedFormsPreview;
}

function createSuggestionMerger({ state, replaceImportedFormsPreview }) {
  function mergeAiSuggestions(suggestionsByForm) {
    const suggestionsMap = new Map(
      Object.entries(suggestionsByForm || {}).map(([formIndex, suggestions]) => [Number(formIndex), suggestions]),
    );
    if (!suggestionsMap.size) return;
    const nextForms = state.importedFormsPreview.value.map((form) => {
      const aiSuggestions = suggestionsMap.get(form.index);
      if (!aiSuggestions) return form;
      return { ...form, ai_suggestions: aiSuggestions.map((item) => ({ ...item })) };
    });
    replaceImportedFormsPreview(nextForms);
    state.acceptedAiOverrides.value = reconcileAcceptedOverrides(nextForms, state.acceptedAiOverrides.value);
  }

  return mergeAiSuggestions;
}

function createReviewPolling({ state, projectId, visible, isDisposed, timer, mergeAiSuggestions }) {
  function scheduleAiReviewPoll(taskId) {
    timer.clear();
    if (isDisposed() || !taskId || !visible.value) return;
    timer.schedule(() => {
      pollAiReview(taskId);
    });
  }

  async function pollAiReview(taskId) {
    if (isDisposed() || !taskId || !projectId.value || !visible.value) return;
    try {
      const data = await api.get(
        `/api/projects/${projectId.value}/import-docx/${encodeURIComponent(taskId)}/ai-review/status`,
      );
      if (isDisposed() || state.importWordAiTaskId.value !== taskId || !visible.value) return;
      state.importWordAiReviewStatus.value = data.status || 'running';
      state.importWordAiReviewError.value = data.error || '';
      if (data.suggestions) mergeAiSuggestions(data.suggestions);
      if (data.status === 'done' || data.status === 'failed') {
        timer.clear();
        return;
      }
      scheduleAiReviewPoll(taskId);
    } catch (error) {
      if (isDisposed() || state.importWordAiTaskId.value !== taskId || !visible.value) return;
      timer.clear();
      state.importWordAiReviewStatus.value = 'failed';
      state.importWordAiReviewError.value =
        error?.status === 404 ? 'AI复核任务已中断，请重新上传文档。' : error?.message || 'AI复核不可用';
    }
  }

  return { scheduleAiReviewPoll, pollAiReview };
}

function createReviewSession({ state, timer, polling }) {
  function stopAiReviewPolling() {
    timer.clear();
  }

  function resetImportWordAiReview() {
    stopAiReviewPolling();
    state.importWordAiTaskId.value = null;
    state.importWordAiReviewStatus.value = 'idle';
    state.importWordAiReviewError.value = '';
  }

  function startAiReviewPolling(taskId) {
    resetImportWordAiReview();
    state.importWordAiTaskId.value = taskId;
    state.importWordAiReviewStatus.value = 'pending';
    polling.scheduleAiReviewPoll(taskId);
  }

  return { stopAiReviewPolling, resetImportWordAiReview, startAiReviewPolling };
}

function createAiReviewControls({ state, projectId, visible, isDisposed }) {
  const timer = createReviewTimer();
  const replaceImportedFormsPreview = createPreviewReplacer(state);
  const mergeAiSuggestions = createSuggestionMerger({ state, replaceImportedFormsPreview });
  const polling = createReviewPolling({ state, projectId, visible, isDisposed, timer, mergeAiSuggestions });
  const session = createReviewSession({ state, timer, polling });

  return { ...session, replaceImportedFormsPreview, mergeAiSuggestions };
}

function createSuggestionToggles(state) {
  function toggleAiSuggestionAcceptance({ formIndex, fieldIndex, suggestedType, accepted }) {
    if (formIndex == null || fieldIndex == null || !suggestedType) return;
    const nextAccepted = { ...state.acceptedAiOverrides.value };
    const formAccepted = { ...(nextAccepted[formIndex] || {}) };

    if (accepted) {
      formAccepted[fieldIndex] = suggestedType;
      nextAccepted[formIndex] = formAccepted;
    } else {
      delete formAccepted[fieldIndex];
      if (Object.keys(formAccepted).length) {
        nextAccepted[formIndex] = formAccepted;
      } else {
        delete nextAccepted[formIndex];
      }
    }

    state.acceptedAiOverrides.value = nextAccepted;
  }

  function toggleAiSuggestionsForForm({ formIndex, accepted }) {
    const form = state.importedFormsPreview.value.find((item) => item.index === formIndex);
    if (!form) return;

    const suggestions = state.getFormAiSuggestions(form);
    const nextAccepted = { ...state.acceptedAiOverrides.value };
    if (!accepted || !suggestions.length) {
      delete nextAccepted[formIndex];
      state.acceptedAiOverrides.value = nextAccepted;
      return;
    }

    const formAccepted = {};
    for (const suggestion of suggestions) {
      formAccepted[suggestion.index] = suggestion.suggested_type;
    }
    nextAccepted[formIndex] = formAccepted;
    state.acceptedAiOverrides.value = nextAccepted;
  }

  return { toggleAiSuggestionAcceptance, toggleAiSuggestionsForForm };
}

function createBulkSuggestionToggles(state) {
  function toggleAiSuggestionsForAll(accepted) {
    if (!accepted) {
      state.resetAcceptedAiOverrides();
      return;
    }

    const nextAccepted = {};
    for (const form of state.importedFormsPreview.value) {
      const suggestions = state.getFormAiSuggestions(form);
      if (!suggestions.length) continue;

      const formAccepted = {};
      for (const suggestion of suggestions) {
        formAccepted[suggestion.index] = suggestion.suggested_type;
      }
      nextAccepted[form.index] = formAccepted;
    }

    state.acceptedAiOverrides.value = nextAccepted;
  }

  function clearAllAiSuggestions() {
    state.resetAcceptedAiOverrides();
  }

  return { toggleAiSuggestionsForAll, clearAllAiSuggestions };
}

function createAiSuggestionControls(state) {
  return { ...createSuggestionToggles(state), ...createBulkSuggestionToggles(state) };
}

function createStepNavigation({ state, aiReview }) {
  function goBackToImportWordStep1() {
    state.importWordStep.value = 1;
    state.importedFormsPreview.value = [];
    state.selectedFormsToImport.value = [];
    state.tempDocxId.value = null;
    state.importWordErrorMessage.value = '';
    aiReview.resetImportWordAiReview();
    state.showDocxCompare.value = false;
    state.compareFormData.value = null;
    state.resetAcceptedAiOverrides();
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

function createUploadResultHandlers({ state, aiReview }) {
  function handleDocxUploadSuccess(response) {
    state.importWordLoading.value = false;
    if (response?.forms && response?.temp_id) {
      state.resetAcceptedAiOverrides();
      aiReview.replaceImportedFormsPreview(response.forms);
      state.selectedFormsToImport.value = [];
      state.tempDocxId.value = response.temp_id;
      state.importWordErrorMessage.value = '';
      state.importWordStep.value = 2;
      if (response.ai_task_id) {
        aiReview.startAiReviewPolling(response.ai_task_id);
      } else {
        aiReview.resetImportWordAiReview();
      }
    } else {
      state.importWordErrorMessage.value = '文件解析失败或响应格式不正确。';
      ElMessage.error(state.importWordErrorMessage.value);
    }
  }

  function handleDocxUploadError(error) {
    state.importWordLoading.value = false;
    aiReview.resetImportWordAiReview();
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

function createImportExecution({ state, projectId, refreshKey, aiReview }) {
  function toggleSelectAllImportWordForms() {
    toggleSelectAll(state.importedFormsPreview, state.selectedFormsToImport, (f) => f.index);
  }

  async function executeImportWord() {
    if (!state.selectedFormsToImport.value.length || !state.tempDocxId.value) {
      state.importWordErrorMessage.value = '请选择要导入的表单。';
      return ElMessage.warning(state.importWordErrorMessage.value);
    }
    aiReview.resetImportWordAiReview();
    state.importWordLoading.value = true;
    state.importWordErrorMessage.value = '';
    try {
      const payload = {
        temp_id: state.tempDocxId.value,
        form_indices: state.selectedFormsToImport.value,
      };
      const aiOverrides = buildAiOverridesPayload({
        forms: state.importedFormsPreview.value,
        accepted: state.acceptedAiOverrides.value,
        selectedFormIndices: state.selectedFormsToImport.value,
      });
      if (aiOverrides.length) {
        payload.ai_overrides = aiOverrides;
      }
      const data = await api.post(`/api/projects/${projectId.value}/import-docx/execute`, payload);
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

function createWordImportHandlers({ state, projectId, refreshKey, aiReview }) {
  return {
    ...createStepNavigation({ state, aiReview }),
    ...createUploadGuard({ state }),
    ...createUploadResultHandlers({ state, aiReview }),
    ...createImportExecution({ state, projectId, refreshKey, aiReview }),
  };
}

function createWordImportSession({ projectId, visible, refreshKey }) {
  let disposed = false;
  const state = createImportWordState();
  const aiReview = createAiReviewControls({ state, projectId, visible, isDisposed: () => disposed });
  const aiSuggestion = createAiSuggestionControls(state);
  const handlers = createWordImportHandlers({ state, projectId, refreshKey, aiReview });

  function dispose() {
    disposed = true;
    aiReview.stopAiReviewPolling();
  }

  return { state, aiReview, aiSuggestion, handlers, dispose };
}

export function useWordImport({ projectId, visible, refreshKey }) {
  const { state, aiReview, aiSuggestion, handlers, dispose } = createWordImportSession({
    projectId,
    visible,
    refreshKey,
  });

  onScopeDispose(dispose);

  function resetImportWordSession() {
    state.importWordStep.value = 1;
    state.importWordLoading.value = false;
    state.importedFormsPreview.value = [];
    state.selectedFormsToImport.value = [];
    state.tempDocxId.value = null;
    state.importWordErrorMessage.value = '';
    aiReview.resetImportWordAiReview();
    state.showDocxCompare.value = false;
    state.compareFormData.value = null;
    state.importedResults.value = [];
    state.resetAcceptedAiOverrides();
  }

  watch(
    visible,
    (isVisible) => {
      if (isVisible) {
        resetImportWordSession();
        return;
      }
      aiReview.stopAiReviewPolling();
      state.importWordAiTaskId.value = null;
      state.showDocxCompare.value = false;
      state.compareFormData.value = null;
      state.resetAcceptedAiOverrides();
    },
    { immediate: true },
  );

  return { ...state, ...aiSuggestion, ...handlers };
}
