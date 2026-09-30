<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  onBeforeUpdate,
  nextTick,
  inject,
  defineExpose,
} from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Check,
  Delete,
  DocumentAdd,
  DocumentCopy,
  EditPen,
  Grid,
  InfoFilled,
  Memo,
  Plus,
  RefreshLeft,
  RefreshRight,
  Search,
} from '@element-plus/icons-vue';
import { api, genCode, genFieldVarName, truncRefs } from '../composables/useApi';
import { countDistinctForms, formatFieldImpactMessage } from '../composables/fieldReferenceImpact';
import { useSortableTable } from '../composables/useSortableTable';
import { rankFuzzyMatches } from '../composables/searchRanking';
import { isValidOptionalOid, isValidRequiredOid, OID_ERROR } from '../composables/oidValidation';
import {
  buildFieldDefinitionCreatePayload,
  isLabelFieldDefinition,
  isVisibleInFieldLibrary,
} from '../composables/fieldDefinitionVisibility';
import { useColumnResize } from '../composables/useColumnResize';
import { usePaneSplit } from '../composables/usePaneSplit';
import { useDesignerHistory } from '../composables/useDesignerHistory';
import {
  buildTableInstanceId,
  useRowResize,
  getNormalRowKey,
  getInlineHeaderRowKey,
  getInlineDataRowKey,
  getUnifiedRegularRowKey,
  getUnifiedFullRowKey,
  getUnifiedInlineHeaderRowKey,
  getUnifiedInlineDataRowKey,
} from '../composables/useRowResize';
import {
  ANNOTATION_FORM_KEY,
  ANNOTATION_KIND_FIELD,
  ANNOTATION_KIND_FORM,
  ANNOTATION_KIND_INLINE_HEADER,
  buildAnnotationStyle,
  hasAnnotationOverride,
  normalizeAnnotationPositions,
  readAnnotationDelta01Cm,
} from '../composables/acrfAnnotationGeometry.js';
import { useAcrfAnnotationDrag } from '../composables/useAcrfAnnotationDrag.js';
import { DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS } from '../composables/dateFormatOptions.js';
import {
  renderCtrl as renderCtrlBase,
  renderCtrlHtml,
  toHtml,
  isChoiceField,
  isDefaultValueSupported,
  normalizeDefaultValue,
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
  computeFillLineCharCount,
} from '../composables/useCRFRenderer';
import {
  applyLabelOidTransition,
  buildBindingProfileCommand,
  buildDefinitionPayload,
  buildEditorStateFromSnapshot,
  buildFieldProfileCommand,
  buildDeleteProfileCommand,
  buildFormPropState,
  buildInstanceOnlyProfileCommand,
  buildInstanceUpsert,
  buildLabelOidSession,
  ensureLabelVariableName,
  normalizeDateFormat,
  normalizeHexColorInput,
  resolveLabelOidSeedDefinition,
  resolveSharedWriteTarget,
  sameFormPropState,
  syncFieldTypeSpecificProps,
  withLabelOidSeed,
} from '../composables/formDesignerPropertyEditor';
import {
  buildAutocompleteCandidates,
  buildCopyVariableName,
  CANDIDATE_STATE_ADDED,
  CANDIDATE_STATE_CURRENT,
  findOidConflict,
  hydrateEditorFromCandidate,
} from '../composables/fieldDefinitionAutocomplete';
import { markPerfEnd, markPerfStart, recordPerfEvent } from '../composables/usePerfBaseline';
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldLabelPreviewStyle,
  getFormFieldListLabel,
  getFormFieldTextColorStyle,
} from '../composables/formFieldPresentation';
import { buildPreviewGroupViewModels } from '../composables/formDesignerPreviewModel';
import { confirmDelete } from '../composables/projectDeleteConfirmation';
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit';
import { resolveNormalTableAvailableCm, resolveInlineTableAvailableCm } from '../composables/visitPreviewLandscape';
import { buildFieldTypeOptions, isMultiselectFieldType, allowsMultiselect } from '../composables/fieldTypeAvailability';
import { summarizeDesignNotes, normalizeDesignNotesTooltip } from '../composables/designNotesSummary';
import DesignNotesDialog from './DesignNotesDialog.vue';

const props = defineProps({ projectId: { type: Number, required: true } });
const emit = defineEmits(['import-template', 'open-template-field-search']);
const refreshKey = inject('refreshKey', ref(0));
const editMode = inject('editMode', ref(false));
const projectDbType = inject('projectDbType', ref('其他'));
const VIEW_MODE_STORAGE_KEY = 'crf_view_mode';

function normalizeStoredViewMode(value) {
  return value === 'aCRF' ? 'aCRF' : 'eCRF';
}

function readStoredViewMode() {
  if (typeof window === 'undefined' || !window.localStorage) return 'eCRF';
  try {
    return normalizeStoredViewMode(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY));
  } catch {
    return 'eCRF';
  }
}

function writeStoredViewMode(mode) {
  const normalizedMode = normalizeStoredViewMode(mode);
  if (typeof window === 'undefined' || !window.localStorage) return normalizedMode;
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, normalizedMode);
  } catch {
    /* ignore localStorage errors */
  }
  return normalizedMode;
}

function resolveInitialViewMode(isEditModeEnabled, storedValue) {
  if (!isEditModeEnabled) return 'eCRF';
  return normalizeStoredViewMode(storedValue);
}

function getFieldOidAnnotationText(formField) {
  if (formField?.field_definition?.field_type === '标签') return '';
  const value = String(formField?.field_definition?.variable_name ?? '').trim();
  return value || '';
}

function getFormDomainAnnotationText(form) {
  const value = String(form?.domain ?? '').trim();
  return value || '';
}

// 核心数据
const forms = ref([]);
const searchForm = ref('');
// 全量有序表单列表（不受左侧 searchForm 过滤）；全屏设计器下拉切换必须用此列表，避免搜索态漏项。
const orderedForms = computed(() =>
  [...forms.value].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a?.id ?? 0) - (b?.id ?? 0);
  }),
);
const filteredForms = computed(() =>
  rankFuzzyMatches(orderedForms.value, searchForm.value, (item) => Object.values(item)),
);
const selectedForm = ref(null);
const fieldDefs = ref([]);
const formFields = ref([]);
const codelists = ref([]);
const units = ref([]);
const designerAuxiliaryLoaded = ref(false);
const designerAuxiliaryLoading = ref(false);
const designerAuxiliaryLoadError = ref('');
const selectedIds = ref([]);
const showAddForm = ref(false);
const showEditForm = ref(false);
const showDesigner = ref(false);
const newFormName = ref('');
const newFormCode = ref('');
const editFormName = ref('');
const editFormCode = ref('');
const editFormPaperOrientation = ref('auto');
const editFormTarget = ref(null);
// 全屏设计器右侧「表单属性」编辑缓冲（与左侧弹窗 editForm* 双入口；显式保存，镜像字段属性脏态模式）
const editFormProp = reactive({ name: '', code: '', paper_orientation: 'auto' });
const formPropBaseline = ref(null);
const isSavingFormProp = ref(false);
const dragSrcId = ref(null);
const dragOverIdx = ref(null);
const isReordering = ref(false);
const fieldMembershipMutationCount = ref(0);
const deletingFieldIds = ref(new Set());
const copyingFieldIds = ref(new Set());
const viewMode = ref(resolveInitialViewMode(editMode.value, readStoredViewMode()));
const designerHistory = useDesignerHistory();
let formFieldsLoadSession = 0;
let formSelectionSession = 0;
let formSelectionAttempt = 0;
let designerAuxiliaryLoadSession = 0;

writeStoredViewMode(viewMode.value);

// 新增字段与普通字段复制使用本地草稿：先在设计器中编辑，保存才 POST 建定义+建实例。
// 草稿带完整本地 field_definition，预览/渲染按本地数据工作，仅在发起网络请求处按草稿短路。
const DRAFT_FIELD_ID = '__draft__';
const savingDraft = ref(false);
function isDraftField(ff) {
  return ff?.__draft === true || ff?.id === DRAFT_FIELD_ID;
}
const hasDraft = computed(() => formFields.value.some(isDraftField));

function invalidateFormSelectionSession() {
  formSelectionSession += 1;
  formSelectionAttempt += 1;
}

function isFormSelectionAttemptCurrent(selectionAttempt, selectionSession, projectId) {
  return (
    selectionAttempt === formSelectionAttempt &&
    selectionSession === formSelectionSession &&
    projectId === props.projectId
  );
}

function captureDesignerHistoryContext(formId = selectedForm.value?.id ?? null) {
  return formId == null ? null : { formId, sessionId: formSelectionSession };
}

function isCurrentDesignerHistoryContext(context) {
  return Boolean(
    context &&
      context.sessionId === formSelectionSession &&
      context.formId === (selectedForm.value?.id ?? null),
  );
}

function recordDesignerHistory(context, entry) {
  if (!isCurrentDesignerHistoryContext(context)) return false;
  return designerHistory.record(entry);
}

function isFieldMembershipBusy() {
  return fieldMembershipMutationCount.value > 0;
}

function beginFieldMembershipMutation() {
  fieldMembershipMutationCount.value += 1;
}

function endFieldMembershipMutation() {
  fieldMembershipMutationCount.value = Math.max(0, fieldMembershipMutationCount.value - 1);
}

// 数据加载
async function loadForms() {
  forms.value = await api.cachedGet(`/api/projects/${props.projectId}/forms`);
}
async function reloadForms() {
  const selectedFormId = selectedForm.value?.id ?? null;
  api.invalidateCache(`/api/projects/${props.projectId}/forms`);
  await loadForms();
  if (selectedFormId == null) return;
  if ((selectedForm.value?.id ?? null) !== selectedFormId) return;
  const refreshedSelectedForm = forms.value.find((f) => f.id === selectedFormId) || null;
  if (refreshedSelectedForm) {
    Object.assign(selectedForm.value, refreshedSelectedForm);
    forms.value = forms.value.map((f) => (f.id === selectedFormId ? selectedForm.value : f));
    return;
  }
  invalidateFormSelectionSession();
  selectedForm.value = null;
  formFields.value = [];
  selectedIds.value = [];
}

function mergeFormIntoState(updatedForm) {
  if (!updatedForm?.id) return null;
  const currentForm =
    forms.value.find((item) => item.id === updatedForm.id) ||
    (selectedForm.value?.id === updatedForm.id ? selectedForm.value : null) ||
    {};
  const nextForm = { ...currentForm, ...updatedForm };
  if (forms.value.some((item) => item.id === updatedForm.id)) {
    forms.value = forms.value.map((item) => (item.id === updatedForm.id ? nextForm : item));
  } else {
    forms.value = [...forms.value, nextForm];
  }
  if (selectedForm.value?.id === updatedForm.id && selectedForm.value) {
    Object.assign(selectedForm.value, nextForm);
  }
  return nextForm;
}

function getFormStateById(formId = selectedForm.value?.id ?? null) {
  if (formId == null) return null;
  if (selectedForm.value?.id === formId) return selectedForm.value;
  return forms.value.find((item) => item.id === formId) || null;
}

function getFormAnnotationPositions(formId = selectedForm.value?.id ?? null) {
  return normalizeAnnotationPositions(getFormStateById(formId)?.annotation_positions);
}

function applyFormAnnotationPositions(formId, annotationPositions) {
  if (formId == null) return;
  const normalized = normalizeAnnotationPositions(annotationPositions);
  mergeFormIntoState({
    id: formId,
    annotation_positions: Object.keys(normalized).length > 0 ? normalized : null,
  });
}

async function loadFieldDefs(projectId = props.projectId) {
  const loadedFieldDefs = await api.cachedGet(`/api/projects/${projectId}/field-definitions`);
  if (projectId !== props.projectId) return false;
  fieldDefs.value = loadedFieldDefs;
  return true;
}
async function refreshDesignerFieldDefinitions(projectId = props.projectId) {
  api.invalidateCache(`/api/projects/${projectId}/field-definitions`);
  return loadFieldDefs(projectId);
}
async function loadCodelists(projectId = props.projectId) {
  const loadedCodelists = await api.cachedGet(`/api/projects/${projectId}/codelists`);
  if (projectId !== props.projectId) return false;
  codelists.value = loadedCodelists;
  return true;
}
async function loadUnits(projectId = props.projectId) {
  const loadedUnits = await api.cachedGet(`/api/projects/${projectId}/units`);
  if (projectId !== props.projectId) return false;
  units.value = loadedUnits;
  return true;
}

const LEGACY_FORCE_LANDSCAPE_KEY = 'crf_forceLandscape';
const LEGACY_FORCE_LANDSCAPE_MIGRATED_KEY = 'crf_forceLandscape_migrated_v1';

async function migrateLegacyForceLandscape(projectId) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const storage = window.localStorage;
  if (storage.getItem(LEGACY_FORCE_LANDSCAPE_MIGRATED_KEY) === 'true') {
    storage.removeItem(LEGACY_FORCE_LANDSCAPE_KEY);
    return;
  }
  if (storage.getItem(LEGACY_FORCE_LANDSCAPE_KEY) !== 'true') return;
  if (!projectId) return;
  let allOk = true;
  try {
    const list = await api.cachedGet(`/api/projects/${projectId}/forms`);
    const targets = (list || []).filter((f) => (f.paper_orientation || 'auto') === 'auto');
    for (const f of targets) {
      try {
        await api.put(`/api/forms/${f.id}`, { paper_orientation: 'landscape' });
      } catch (err) {
        allOk = false;
      }
    }
    api.invalidateCache(`/api/projects/${projectId}/forms`);
  } catch (err) {
    allOk = false;
  }
  if (allOk) {
    storage.setItem(LEGACY_FORCE_LANDSCAPE_MIGRATED_KEY, 'true');
    storage.removeItem(LEGACY_FORCE_LANDSCAPE_KEY);
  }
}

function sortFormFieldsByOrder(fields) {
  return [...fields].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a?.id ?? 0) - (b?.id ?? 0);
  });
}

// 返回 boolean：本次加载是否成功落地（被会话守卫吞掉时返回 false，调用方可决定是否原位保留草稿行）
async function loadFormFields(formId = selectedForm.value?.id ?? null) {
  const sessionId = ++formFieldsLoadSession;
  if (!formId) {
    formFields.value = [];
    selectedIds.value = [];
    return false;
  }
  const loadedFields = await api.cachedGet(`/api/forms/${formId}/fields`);
  if (sessionId !== formFieldsLoadSession || selectedForm.value?.id !== formId) return false;
  formFields.value = sortFormFieldsByOrder(loadedFields);
  return true;
}
watch(
  () => selectedForm.value?.id ?? null,
  () => {
    // 撤销栈按表单维度，切换表单即清空，避免跨表单回放到错误目标。
    designerHistory.clear();
  },
);
watch(selectedForm, (form) => {
  void loadFormFields(form?.id ?? null);
});

// 刷新信号
watch(refreshKey, () => {
  loadForms();
  if (designerAuxiliaryLoaded.value) {
    loadFieldDefs();
    loadCodelists();
    loadUnits();
  }
  if (selectedForm.value) loadFormFields();
});
watch(viewMode, (nextMode) => {
  const normalizedMode = resolveInitialViewMode(editMode.value, nextMode);
  if (normalizedMode !== nextMode) {
    viewMode.value = normalizedMode;
    return;
  }
  writeStoredViewMode(normalizedMode);
});
watch(editMode, (enabled) => {
  const normalizedMode = resolveInitialViewMode(enabled, viewMode.value);
  if (normalizedMode !== viewMode.value) {
    viewMode.value = normalizedMode;
    return;
  }
  writeStoredViewMode(normalizedMode);
});

// 表单CRUD
async function addForm() {
  if (!isValidOptionalOid(newFormCode.value)) return ElMessage.warning(OID_ERROR);
  try {
    const created = await api.post(`/api/projects/${props.projectId}/forms`, {
      name: newFormName.value,
      code: newFormCode.value,
    });
    showAddForm.value = false;
    newFormName.value = '';
    newFormCode.value = '';
    await loadForms();
    invalidateFormSelectionSession();
    selectedForm.value = forms.value.find((f) => f.id === created.id) || created;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function delForm(f) {
  try {
    const refs = await api.get(`/api/forms/${f.id}/references`);
    if (refs.length) {
      const msg = truncRefs(
        refs.map((r) => r.visit_name),
        5,
        '、',
      );
      await ElMessageBox.confirm(`删除表单 "${f.name}" 将同时从以下访视中移除：\n${msg}\n确认删除？`, '确认', {
        type: 'warning',
      });
    } else {
      await ElMessageBox.confirm(`删除表单 "${f.name}"？`, '确认', { type: 'warning' });
    }
    await api.del(`/api/forms/${f.id}`);
    if (selectedForm.value?.id === f.id) {
      invalidateFormSelectionSession();
      selectedForm.value = null;
      formFields.value = [];
    }
    reloadForms();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}

const selForms = ref([]);
async function batchDelForms() {
  try {
    const ids = selForms.value.map((f) => f.id);
    const refsMap = await api.post(`/api/projects/${props.projectId}/forms/batch-references`, { ids });
    const allRefs = [];
    for (const f of selForms.value) {
      const refs = refsMap[f.id] || [];
      if (refs.length)
        allRefs.push(
          `【${f.name}】：` +
            truncRefs(
              refs.map((r) => r.visit_name),
              3,
              '、',
            ),
        );
    }
    const msg = allRefs.length
      ? `以下表单将同时从相关访视中移除：\n${allRefs.join('\n')}\n确认删除？`
      : `确认删除选中的 ${selForms.value.length} 个表单？`;
    await ElMessageBox.confirm(msg, '批量删除', { type: 'warning' });
    await api.post(`/api/projects/${props.projectId}/forms/batch-delete`, { ids });
    invalidateFormSelectionSession();
    selForms.value = [];
    selectedForm.value = null;
    formFields.value = [];
    reloadForms();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}

async function copyForm(f) {
  try {
    await api.post(`/api/forms/${f.id}/copy`, {});
    reloadForms();
    ElMessage.success('复制成功');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function openEditForm(f) {
  editFormName.value = f.name;
  editFormCode.value = f.code || '';
  editFormPaperOrientation.value = f.paper_orientation || 'auto';
  editFormTarget.value = f;
  showEditForm.value = true;
}

function syncFormPropEditor(form = selectedForm.value) {
  const state = buildFormPropState(form);
  Object.assign(editFormProp, state);
  formPropBaseline.value = form ? { ...state } : null;
}

const isFormPropDirty = computed(() => {
  if (!formPropBaseline.value) return false;
  return !sameFormPropState(formPropBaseline.value, {
    name: editFormProp.name,
    code: editFormProp.code,
    paper_orientation: editFormProp.paper_orientation,
  });
});

/**
 * Shared form-property PUT path for the edit dialog and the designer side pane.
 * Returns true on success, false on validation/cancel/error.
 */
async function persistFormProps({ name, code, paper_orientation, targetForm }) {
  if (!targetForm?.id) return false;
  if (!String(name ?? '').trim()) {
    ElMessage.warning('表单名称不能为空');
    return false;
  }
  if (!isValidOptionalOid(code)) {
    ElMessage.warning(OID_ERROR);
    return false;
  }
  try {
    const refs = await api.get(`/api/forms/${targetForm.id}/references`);
    if (refs.length) {
      const msg = truncRefs(
        refs.map((r) => r.visit_name),
        5,
        '、',
      );
      await ElMessageBox.confirm(`修改将影响以下访视：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' });
    }
    if (
      paper_orientation === 'portrait' &&
      targetForm?.id === selectedForm.value?.id &&
      needsLandscape.value
    ) {
      await ElMessageBox.confirm('当前内容较宽，纵向显示可能出现换行或截断，仍要保存？', '纸张方向提醒', {
        type: 'warning',
      });
    }
    await api.put(`/api/forms/${targetForm.id}`, {
      name,
      code,
      paper_orientation,
    });
    await reloadForms();
    if (selectedForm.value?.id === targetForm.id) {
      syncFormPropEditor(selectedForm.value);
    }
    return true;
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || String(e));
    return false;
  }
}

async function updateForm() {
  const ok = await persistFormProps({
    name: editFormName.value,
    code: editFormCode.value,
    paper_orientation: editFormPaperOrientation.value,
    targetForm: editFormTarget.value,
  });
  if (ok) showEditForm.value = false;
}

async function saveFormProp() {
  if (designerHistory.busy.value || isReordering.value || savingDraft.value || isSavingFormProp.value) return false;
  if (!selectedForm.value) return false;
  isSavingFormProp.value = true;
  try {
    return await persistFormProps({
      name: editFormProp.name,
      code: editFormProp.code,
      paper_orientation: editFormProp.paper_orientation,
      targetForm: selectedForm.value,
    });
  } finally {
    isSavingFormProp.value = false;
  }
}

function cancelFormProp() {
  syncFormPropEditor(selectedForm.value);
}

async function resolveFormPropLeave({ actionText = '关闭' } = {}) {
  if (!isFormPropDirty.value) return true;
  try {
    await ElMessageBox.confirm(`表单属性修改尚未保存，保存或取消后将继续${actionText}。`, '表单属性未保存', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      distinguishCancelAndClose: true,
      type: 'warning',
    });
    return await saveFormProp();
  } catch (e) {
    if (e === 'cancel') {
      cancelFormProp();
      return true;
    }
    return false;
  }
}

async function onSwitchFormFromDropdown(formId) {
  // el-select 在部分场景会把 option value 以 string 抛出；forms.id 为 number，严格 === 会匹配失败导致静默不切换
  const targetId =
    formId == null || formId === ''
      ? null
      : typeof formId === 'number'
        ? formId
        : Number(formId);
  if (targetId == null || Number.isNaN(targetId)) {
    formsTableRef.value?.setCurrentRow(selectedForm.value);
    return;
  }
  if ((selectedForm.value?.id ?? null) === targetId) return;
  const next = forms.value.find((f) => f.id === targetId || String(f.id) === String(formId)) || null;
  if (!next) {
    ElMessage.warning('未找到目标表单');
    formsTableRef.value?.setCurrentRow(selectedForm.value);
    return;
  }
  const previousId = selectedForm.value?.id ?? null;
  await selectForm(next);
  // 仅在切换成功后同步左表高亮；失败路径由 selectForm 内部恢复
  if ((selectedForm.value?.id ?? null) === next.id && next.id !== previousId) {
    const row =
      filteredForms.value.find((f) => f.id === next.id) ||
      forms.value.find((f) => f.id === next.id) ||
      selectedForm.value;
    formsTableRef.value?.setCurrentRow(row);
  }
}

// 点击设计器空白处回到表单属性：字段列表容器（onCanvasBlankClick）与
// designer-shell / 弹窗标题栏（onDesignerBlankClick）共用同一守卫链。
async function returnToFormProperties() {
  if (!selectedFieldId.value) return;
  if (designerHistory.busy.value || isReordering.value || savingDraft.value) return;
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;
  const canLeaveFieldProp = await resolveFieldPropLeave({ actionText: '回到表单属性' });
  if (!isCurrentDesignerHistoryContext(historyContext)) return;
  if (!canLeaveFieldProp) return;
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (!proceed) return;
  }
  resetFieldPropAutoSaveState();
  syncFormPropEditor(selectedForm.value);
}

async function onCanvasBlankClick(event) {
  if (event?.target?.closest?.('.ff-item')) return;
  await returnToFormProperties();
}

// 除两张卡片、各类控件、字段条目与分隔条以外，设计器主体/标题栏空白都回到表单属性。
// .fd-canvas-list 由 onCanvasBlankClick 处理，排除以免事件冒泡导致双弹保存确认。
const DESIGNER_BLANK_EXCLUDE_SELECTOR = [
  '.designer-preview-pane',
  '.designer-editor-card',
  'button',
  'input',
  'textarea',
  '.el-select',
  '.el-input',
  '.el-input-number',
  '.el-radio',
  '.el-checkbox',
  '.el-switch',
  '.ff-item',
  '.pane-v-resizer',
  '.pane-h-resizer',
  '.fd-canvas-list',
].join(',');

async function onDesignerBlankClick(event) {
  if (event?.target?.closest?.(DESIGNER_BLANK_EXCLUDE_SELECTOR)) return;
  await returnToFormProperties();
}

// 表单字段操作
async function confirmFormChange() {
  if (!selectedForm.value) return;
  const refs = await api.get(`/api/forms/${selectedForm.value.id}/references`);
  if (refs.length) {
    const msg = truncRefs(
      refs.map((r) => r.visit_name),
      5,
      '、',
    );
    await ElMessageBox.confirm(`当前表单被以下访视引用，修改将影响这些访视：\n${msg}\n确认继续？`, '影响提醒', {
      type: 'warning',
    });
  }
}

// ── 撤销 / 恢复回放辅助 ────────────────────────────────────────────────────
// 由删除前的字段实例构造可直接 POST 重建的 payload（含 order_index 与全部属性）。
function buildFormFieldCreatePayload(ff) {
  return {
    field_definition_id: ff.field_definition_id ?? null,
    is_log_row: ff.is_log_row ?? 0,
    order_index: ff.order_index ?? null,
    required: ff.required ?? 0,
    label_override: ff.label_override ?? null,
    help_text: ff.help_text ?? null,
    default_value: ff.default_value ?? null,
    inline_mark: ff.inline_mark ?? 0,
    bg_color: ff.bg_color ?? null,
    text_color: ff.text_color ?? null,
    label_bold: ff.label_bold ?? 1,
    label_font_size: ff.label_font_size ?? null,
  };
}

function buildCopyDraft(ff, definitions, formId) {
  const sourceOrderIndex = Number.isInteger(Number(ff.order_index)) ? Number(ff.order_index) : 0;
  const sourceDefinition = ff.field_definition || {};
  const variableName = buildCopyVariableName(
    definitions.map((definition) => definition?.variable_name),
    sourceDefinition.variable_name,
  );
  return {
    ...buildFormFieldCreatePayload(ff),
    id: DRAFT_FIELD_ID,
    __draft: true,
    __draftOrigin: 'copy',
    __draftOrderIndex: sourceOrderIndex + 1,
    // 创建态标签 OID 种子快照（等价 withLabelOidSeed；本函数会被测试按固定参数抽取求值，
    // 不得引入新的模块级标识符，故内联构造）
    __labelOidSeed: {
      variable_name: variableName,
      field_type: sourceDefinition.field_type ?? null,
    },
    form_id: formId,
    field_definition_id: null,
    is_log_row: 0,
    order_index: sourceOrderIndex + 0.5,
    field_definition: {
      ...sourceDefinition,
      id: DRAFT_FIELD_ID,
      variable_name: variableName,
    },
  };
}

function buildReplaySnapshot(ff) {
  return {
    formFieldPayload: buildFormFieldCreatePayload(ff),
    fieldDefinitionPayload: isLabelFieldDefinition(ff?.field_definition)
      ? buildFieldDefinitionCreatePayload(ff.field_definition)
      : null,
  };
}

async function recreateFieldFromSnapshot(formId, snapshot) {
  try {
    return await api.post(`/api/forms/${formId}/fields`, snapshot.formFieldPayload);
  } catch (error) {
    const status = Number(error?.status ?? error?.response?.status);
    if (status !== 404) throw error;
    if (!snapshot.fieldDefinitionPayload) throw error;

    const recreatedDefinition = await api.post(
      `/api/projects/${props.projectId}/field-definitions`,
      snapshot.fieldDefinitionPayload,
    );
    try {
      return await api.post(`/api/forms/${formId}/fields`, {
        ...snapshot.formFieldPayload,
        field_definition_id: recreatedDefinition.id,
      });
    } catch (recreateError) {
      try {
        await api.del(`/api/field-definitions/${recreatedDefinition.id}`);
      } catch {
        // 清理失败时保留原始回放错误，避免吞掉真正的失败原因。
      }
      throw recreateError;
    }
  }
}

// 抓取属性编辑前/后的字段定义 + 实例状态，用于属性编辑的正/逆回放。
function snapshotFieldPropState(ff) {
  if (!ff) return null;
  const fd = ff.field_definition || {};
  return {
    required: ff.required ?? 0,
    label_override: ff.label_override ?? null,
    default_value: ff.default_value || null,
    inline_mark: ff.inline_mark ?? 0,
    bg_color: ff.bg_color ?? null,
    text_color: ff.text_color ?? null,
    label_bold: ff.label_bold ?? 1,
    label_font_size: ff.label_font_size ?? null,
    fd: {
      label: fd.label ?? null,
      variable_name: fd.variable_name ?? null,
      field_type: fd.field_type ?? null,
      integer_digits: fd.integer_digits ?? null,
      decimal_digits: fd.decimal_digits ?? null,
      date_format: fd.date_format ?? null,
      checkbox_label: fd.checkbox_label ?? null,
      codelist_id: fd.codelist_id ?? null,
      unit_id: fd.unit_id ?? null,
    },
  };
}

function sameFieldPropState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 重新加载列表与预览，并在被影响字段仍选中时同步属性编辑器。
async function reloadAfterReplay(formId, { defs = false, focusFieldId = null } = {}) {
  if (formId) api.invalidateCache(`/api/forms/${formId}/fields`);
  if (defs) {
    api.invalidateCache(`/api/projects/${props.projectId}/field-definitions`);
    await loadFieldDefs();
  }
  await loadFormFields(formId);
  if (focusFieldId && selectedFieldId.value === focusFieldId) {
    const fresh = formFields.value.find((f) => f.id === focusFieldId);
    if (fresh) selectField(fresh);
  }
}

// 原子回放：一次 binding-profile 请求完成定义/绑定/实例/清理，undo / redo 共用。
async function replayBindingProfile(historyContext, ffId, command, { focusFieldId = ffId } = {}) {
  const result = await api.put(`/api/form-fields/${ffId}/binding-profile`, command);
  await reloadAfterReplay(historyContext?.formId, { defs: true, focusFieldId });
  return result;
}

// 撤销/重做属性编辑：共享更新 / 候选换绑 / OID 分叉三类命令按需重建。
// - shared：update_shared 同一目标定义（before/after 快照）
// - rebind：换绑候选定义；undo 同时恢复候选共享快照并绑回原定义
// - fork：redo 复用 preferred 定义（OID 冲突时后端 409，回放失败保栈）；undo 绑回原定义并清理分叉定义
function buildFieldPropReplayCommand({
  entryType,
  writtenDefinitionId,
  originalDefinitionId = null,
  originalDefinitionOid = null,
  candidateBeforePayload = null,
  snapshot,
}) {
  const editorState = buildEditorStateFromSnapshot(snapshot);
  if (entryType === 'shared') {
    return buildBindingProfileCommand({
      currentDefinitionId: writtenDefinitionId,
      currentDefinitionOid: snapshot.fd.variable_name,
      editorState,
    });
  }
  if (entryType === 'rebind-undo') {
    // 恢复候选共享快照 + 绑回原定义（候选快照 OID 与现状一致时后端才接受）
    return {
      definition_operation: {
        operation: 'update_shared',
        update_shared: { target_definition_id: writtenDefinitionId, definition: candidateBeforePayload },
      },
      binding: { mode: 'existing', target_field_definition_id: originalDefinitionId },
      instance: { mode: 'upsert', upsert: buildInstanceUpsert(editorState) },
    };
  }
  if (entryType === 'rebind-redo') {
    return {
      definition_operation: {
        operation: 'update_shared',
        update_shared: {
          target_definition_id: writtenDefinitionId,
          definition: buildDefinitionPayload(snapshot.fd),
        },
      },
      binding: { mode: 'existing', target_field_definition_id: writtenDefinitionId },
      instance: { mode: 'upsert', upsert: buildInstanceUpsert(editorState) },
    };
  }
  if (entryType === 'fork-undo') {
    return {
      definition_operation: { operation: 'none' },
      binding: { mode: 'existing', target_field_definition_id: originalDefinitionId },
      instance: { mode: 'upsert', upsert: buildInstanceUpsert(editorState) },
      cleanup_definition_id: writtenDefinitionId,
    };
  }
  if (entryType === 'fork-redo') {
    return buildBindingProfileCommand({
      currentDefinitionId: originalDefinitionId,
      currentDefinitionOid: originalDefinitionOid,
      editorState,
      preferredDefinitionId: writtenDefinitionId,
    });
  }
  throw new Error('未知的属性回放类型');
}

// 记录一次排序命令（拖拽与键盘排序共用）。
function recordReorderHistory(historyContext, previousOrder, nextOrder) {
  const formId = historyContext?.formId;
  recordDesignerHistory(historyContext, {
    label: '排序',
    ids: { previousOrder, nextOrder },
    undo: async (ids) => {
      await api.post(`/api/forms/${formId}/fields/reorder`, { ordered_ids: ids.previousOrder });
      await reloadAfterReplay(formId);
    },
    redo: async (ids) => {
      await api.post(`/api/forms/${formId}/fields/reorder`, { ordered_ids: ids.nextOrder });
      await reloadAfterReplay(formId);
    },
  });
}

// 统一执行撤销 / 恢复：失败时提示并保持栈状态，不静默吞错。
async function runHistory(direction) {
  if (designerHistory.busy.value || isReordering.value || savingDraft.value) return;
  const historyContext = captureDesignerHistoryContext();
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (historyContext && !isCurrentDesignerHistoryContext(historyContext)) return;
    if (!proceed) return;
  }
  try {
    await (direction === 'undo' ? designerHistory.undo() : designerHistory.redo());
  } catch (e) {
    ElMessage.error(`${direction === 'undo' ? '撤回' : '恢复'}失败：${e?.message || '后端回放出错'}`);
    if (selectedForm.value) loadFormFields();
  }
}
function handleUndo() {
  if (designerHistory.canUndo.value) void runHistory('undo');
}
function handleRedo() {
  if (designerHistory.canRedo.value) void runHistory('redo');
}

async function copyFormField(ff) {
  if (isDraftField(ff)) return;
  if (designerHistory.busy.value || isReordering.value) return;
  if (copyingFieldIds.value.has(ff.id)) return;
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;

  copyingFieldIds.value = new Set([...copyingFieldIds.value, ff.id]);
  try {
    const canLeaveFieldProp = await resolveFieldPropLeave({ actionText: '复制字段' });
    if (!canLeaveFieldProp) return;
    // 从表单属性视图进入复制结果选中时，先处理未保存的表单属性（镜像 onSelectFieldClick）
    if (!selectedFieldId.value) {
      const canLeaveFormProp = await resolveFormPropLeave({ actionText: '复制字段' });
      if (!canLeaveFormProp) return;
    }
    if (hasDraft.value) {
      const proceed = await confirmDiscardDraft();
      if (!isCurrentDesignerHistoryContext(historyContext)) return;
      if (!proceed) return;
    }
    if (isReordering.value || !isCurrentDesignerHistoryContext(historyContext)) return;
    const formId = historyContext.formId;
    const currentField = formFields.value.find((field) => field.id === ff.id) || ff;
    const isLogRow = Boolean(currentField.is_log_row) && currentField.field_definition_id == null;

    if (!isLogRow) {
      const draft = buildCopyDraft(currentField, fieldDefs.value, formId);
      formFields.value = [...formFields.value, draft];
      selectField(draft);
      return;
    }

    const baseInstancePayload = {
      ...buildFormFieldCreatePayload(currentField),
      order_index: (currentField.order_index ?? 0) + 1,
    };
    let createdFormField;
    beginFieldMembershipMutation();
    try {
      createdFormField = await api.post(`/api/forms/${formId}/fields`, {
        ...baseInstancePayload,
        field_definition_id: null,
      });

      api.invalidateCache(`/api/forms/${formId}/fields`);
      if (!isCurrentDesignerHistoryContext(historyContext)) return;
      if (isReordering.value) return;

      await reloadAfterReplay(formId, { defs: false });
      if (!isCurrentDesignerHistoryContext(historyContext)) return;
      if (isReordering.value) return;
      const created = formFields.value.find((field) => field.id === createdFormField.id);
      if (created) selectField(created);

      recordDesignerHistory(historyContext, {
        label: '复制字段',
        ids: { ffId: createdFormField.id, fdId: null },
        undo: async (ids) => {
          await api.del(`/api/form-fields/${ids.ffId}`);
          await reloadAfterReplay(formId, { defs: false });
        },
        redo: async (ids, { remapId }) => {
          const recreated = await api.post(`/api/forms/${formId}/fields`, {
            ...baseInstancePayload,
            field_definition_id: null,
          });
          remapId(ids.ffId, recreated.id);
          await reloadAfterReplay(formId, { defs: false });
        },
      });
    } finally {
      endFieldMembershipMutation();
    }
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    const next = new Set(copyingFieldIds.value);
    next.delete(ff.id);
    copyingFieldIds.value = next;
  }
}

async function removeField(ff) {
  if (isDraftField(ff)) {
    try {
      await confirmDelete(ElMessageBox.confirm, { targetText: `草稿字段 "${getFormFieldDisplayLabel(ff)}"` });
      removeDraftFromState();
    } catch (e) {
      if (e !== 'cancel') ElMessage.error(e.message);
    }
    return;
  }
  if (designerHistory.busy.value && !isDraftField(ff)) return;
  if (isReordering.value) return;
  if (deletingFieldIds.value.has(ff.id)) return;
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;
  const formId = historyContext.formId;
  const snapshot = buildReplaySnapshot(ff);
  const shouldReloadDefs = Boolean(snapshot.fieldDefinitionPayload);
  const shouldResetSelectedField = selectedFieldId.value === ff.id;
  try {
    await confirmFormChange();
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (isReordering.value) return;
    deletingFieldIds.value = new Set([...deletingFieldIds.value, ff.id]);
    beginFieldMembershipMutation();
    try {
      await api.del(`/api/form-fields/${ff.id}`);
      api.invalidateCache(`/api/forms/${formId}/fields`);
      if (!isCurrentDesignerHistoryContext(historyContext)) return;
      if (isReordering.value) return;
      formFields.value = formFields.value.filter((f) => f.id !== ff.id);
      if (shouldResetSelectedField) resetFieldPropAutoSaveState();
      await reloadAfterReplay(formId, { defs: shouldReloadDefs });
      recordDesignerHistory(historyContext, {
        label: '删除字段',
        ids: { ffId: ff.id },
        undo: async (ids, { remapId }) => {
          const recreated = await recreateFieldFromSnapshot(formId, snapshot);
          remapId(ids.ffId, recreated.id);
          await reloadAfterReplay(formId, { defs: shouldReloadDefs });
        },
        redo: async (ids) => {
          await api.del(`/api/form-fields/${ids.ffId}`);
          await reloadAfterReplay(formId, { defs: shouldReloadDefs });
        },
      });
    } finally {
      endFieldMembershipMutation();
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  } finally {
    const next = new Set(deletingFieldIds.value);
    next.delete(ff.id);
    deletingFieldIds.value = next;
  }
}

async function batchDelete() {
  if (designerHistory.busy.value || isReordering.value) return;
  if (!selectedIds.value.length) return;
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;
  const formId = historyContext.formId;
  const ids = [...selectedIds.value];
  const shouldResetSelectedField = selectedFieldId.value != null && ids.includes(selectedFieldId.value);
  const snapshots = formFields.value
    .filter((f) => ids.includes(f.id))
    .map((f) => ({ ffId: f.id, snapshot: buildReplaySnapshot(f) }));
  const shouldReloadDefs = snapshots.some((item) => Boolean(item.snapshot.fieldDefinitionPayload));
  try {
    await confirmFormChange();
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (isReordering.value) return;
    beginFieldMembershipMutation();
    try {
      await api.post(`/api/forms/${formId}/fields/batch-delete`, { ids });
      api.invalidateCache(`/api/forms/${formId}/fields`);
      if (!isCurrentDesignerHistoryContext(historyContext)) return;
      if (isReordering.value) return;
      selectedIds.value = [];
      if (shouldResetSelectedField) resetFieldPropAutoSaveState();
      await reloadAfterReplay(formId, { defs: shouldReloadDefs });
      recordDesignerHistory(historyContext, {
        label: '批量删除',
        ids: { ffIds: ids },
        undo: async (entryIds, { remapId }) => {
          // 逐条重建（按原 order_index 携带全部属性），并回写新 id。
          for (let i = 0; i < snapshots.length; i += 1) {
            const recreated = await recreateFieldFromSnapshot(formId, snapshots[i].snapshot);
            remapId(snapshots[i].ffId, recreated.id);
            snapshots[i].ffId = recreated.id;
          }
          await reloadAfterReplay(formId, { defs: shouldReloadDefs });
        },
        redo: async (entryIds) => {
          await api.post(`/api/forms/${formId}/fields/batch-delete`, { ids: entryIds.ffIds });
          await reloadAfterReplay(formId, { defs: shouldReloadDefs });
        },
      });
    } finally {
      endFieldMembershipMutation();
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}

// 拖拽排序
function onDragStart(ff, e) {
  if (designerHistory.busy.value || isReordering.value || isFieldMembershipBusy()) {
    e?.preventDefault();
    return;
  }
  if (e?.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  dragSrcId.value = ff.id;
}
function onDragOver(e, idx) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dragOverIdx.value = idx;
}
function onDragLeave() {
  dragOverIdx.value = null;
}
function normalizeFormFieldOrder(fields) {
  return fields.map((field, index) => ({ ...field, order_index: index + 1 }));
}

async function persistFieldReorder(historyContext, previousFields, normalized) {
  if (isReordering.value || isFieldMembershipBusy()) return false;
  const formId = historyContext.formId;
  const previousOrder = previousFields.map((f) => f.id);
  const nextOrder = normalized.map((f) => f.id);
  isReordering.value = true;
  formFields.value = normalized;
  try {
    await api.post(`/api/forms/${formId}/fields/reorder`, { ordered_ids: nextOrder });
    api.invalidateCache(`/api/forms/${formId}/fields`);
    if (!isCurrentDesignerHistoryContext(historyContext)) return false;
    recordReorderHistory(historyContext, previousOrder, nextOrder);
    return true;
  } catch (e) {
    if (isCurrentDesignerHistoryContext(historyContext)) {
      formFields.value = previousFields;
      ElMessage.warning('排序保存失败，已恢复');
      loadFormFields(formId);
    }
    return false;
  } finally {
    isReordering.value = false;
  }
}

async function onDrop(e, targetIdx) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dragOverIdx.value = null;
  if (designerHistory.busy.value || isReordering.value || isFieldMembershipBusy()) return;
  recordPerfEvent({
    type: 'instant',
    name: 'designer_reorder_field',
    project_id: props.projectId,
    form_id: selectedForm.value?.id ?? null,
  });
  const srcIdx = formFields.value.findIndex((f) => f.id === dragSrcId.value);
  if (srcIdx === -1 || srcIdx === targetIdx) return;
  if (hasDraft.value) return ElMessage.warning('请先保存或丢弃新增字段草稿');
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;
  const previousFields = formFields.value;
  const arr = [...previousFields];
  const [item] = arr.splice(srcIdx, 1);
  arr.splice(targetIdx, 0, item);
  await persistFieldReorder(historyContext, previousFields, normalizeFormFieldOrder(arr));
}

// 键盘排序与焦点
const fieldItemRefs = ref({});
onBeforeUpdate(() => {
  fieldItemRefs.value = {};
});

async function handleFieldKeydown(event, field, index) {
  const { key, ctrlKey } = event;
  if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(key)) return;
  event.preventDefault();
  if (key === 'Enter') {
    await onSelectFieldClick(field);
    return;
  }
  if (key === ' ') {
    if (isDraftField(field)) return;
    const id = field.id,
      idx = selectedIds.value.indexOf(id);
    if (idx > -1) selectedIds.value.splice(idx, 1);
    else selectedIds.value.push(id);
    return;
  }
  if (ctrlKey && (designerHistory.busy.value || isReordering.value || isFieldMembershipBusy())) return;
  const move = async (from, to) => {
    if (designerHistory.busy.value || isReordering.value || isFieldMembershipBusy()) return;
    if (to < 0 || to >= formFields.value.length) return;
    if (hasDraft.value) return ElMessage.warning('请先保存或丢弃新增字段草稿');
    const historyContext = captureDesignerHistoryContext();
    if (!historyContext) return;
    const previousFields = formFields.value;
    const arr = [...previousFields];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    const saved = await persistFieldReorder(historyContext, previousFields, normalizeFormFieldOrder(arr));
    if (saved) {
      nextTick(() => {
        if (!isCurrentDesignerHistoryContext(historyContext)) return;
        fieldItemRefs.value[formFields.value[to].id]?.focus();
      });
    }
  };
  if (ctrlKey) {
    if (key === 'ArrowUp') await move(index, index - 1);
    else if (key === 'ArrowDown') await move(index, index + 1);
  } else {
    let nextIdx = key === 'ArrowUp' ? index - 1 : index + 1;
    if (nextIdx >= 0 && nextIdx < formFields.value.length) fieldItemRefs.value[formFields.value[nextIdx].id]?.focus();
  }
}

// 字段库自动完成：OID / 字段标签两个输入框共用同一套候选（模糊搜索 + 当前/已添加状态）。
const formFieldDefinitionIds = computed(() =>
  formFields.value.map((f) => f.field_definition_id).filter((id) => id != null),
);
// 点击候选后才设置；手输同名 OID 不自动换绑。
const selectedDefinitionId = ref(null);
const candidateOid = ref(null);
// 点击候选时的候选定义快照（撤销候选换绑时需要恢复其共享内容）。
let candidateBeforeDefinition = null;

function buildOidCandidates(keyword) {
  const ff = getSelectedFormField();
  return buildAutocompleteCandidates({
    definitions: fieldDefs.value.filter(isVisibleInFieldLibrary),
    keyword,
    currentDefinitionId: ff?.field_definition_id ?? null,
    formFieldDefinitionIds: formFieldDefinitionIds.value,
    excludeOwnFormFieldId: ff?.field_definition_id ?? null,
  });
}

// el-autocomplete 的 fetch-suggestions 接口（两个输入框共用同一套字段库候选）。
function fetchFieldDefSuggestions(queryString, callback) {
  callback(buildOidCandidates(queryString));
}

// 明确点击候选：丢弃当前未保存属性编辑，用候选定义重建编辑态（实例覆盖保留）。
function selectAutocompleteCandidate(item) {
  if (!item || item.state === CANDIDATE_STATE_ADDED) return;
  const ff = getSelectedFormField();
  const definition = item.definition;
  selectedDefinitionId.value = definition.id;
  candidateOid.value = definition.variable_name;
  candidateBeforeDefinition = buildDefinitionPayload(definition);
  const currentInlineMark = ff?.inline_mark ? 1 : 0;
  const inlineAllowed = canToggleInline({ ...ff, field_definition: definition });
  const normalizedInlineMark = inlineAllowed ? currentInlineMark : 0;
  const supportsDefaultValue = isDefaultValueSupported(definition.field_type, Boolean(normalizedInlineMark));
  const normalizedDefaultValue = supportsDefaultValue
    ? normalizeDefaultValue(ff?.default_value || '', !normalizedInlineMark)
    : null;
  Object.assign(
    editProp,
    hydrateEditorFromCandidate({
      editor: editProp,
      definition,
      instance: ff || {},
      normalizedDefaultValue,
      normalizedInlineMark,
    }),
  );
  if (isDraftField(ff)) applyEditorToDraft();
  // 基线不回写：保存基线仍是原字段状态，「取消」可完整恢复原绑定与属性。
}

// 渲染逻辑
function renderCtrl(fd, fillLineChars = null) {
  if (!fd) return '________________';
  const field = {
    field_type: fd.field_type,
    label: fd.label,
    checkbox_label: fd.checkbox_label,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  };
  return renderCtrlBase(field, fillLineChars);
}

function getPreviewField(ff) {
  if (!ff?.field_definition) return null;
  return {
    field_type: ff.field_definition.field_type,
    label: ff.field_definition.label,
    checkbox_label: ff.field_definition.checkbox_label,
    options: ff.field_definition.codelist?.options || [],
    unit_symbol: ff.field_definition.unit?.symbol,
    integer_digits: ff.field_definition.integer_digits,
    decimal_digits: ff.field_definition.decimal_digits,
    date_format: ff.field_definition.date_format,
  };
}

function canToggleInline(ff) {
  const type = ff?.field_definition?.field_type || '';
  return !ff?.is_log_row && type !== '标签' && type !== '日志行';
}

function getScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type;
  const inlineMark = Boolean(ff?.inline_mark);
  if (!fieldType || !ff?.default_value) return '';
  if (!isDefaultValueSupported(fieldType, inlineMark)) return '';
  return normalizeDefaultValue(ff.default_value, singleLine);
}

function renderCellHtml(ff, fillLineChars = null) {
  const previewField = getPreviewField(ff);
  if (!previewField) return '<span class="fill-line"></span>';
  const defaultValue = getScopedDefaultValue(ff, false);
  if (defaultValue) return toHtml(defaultValue);
  return renderCtrlHtml(previewField, fillLineChars);
}

// normal 表 control 列宽（cm）：按整张表单的 render groups + 纸张方向解析（显式
// landscape 或 mixed_landscape → 23.36），镜像后端 _build_form_table 的宽度选择。
function normalColumnCm(groupIndex, group, scope) {
  const resizer = getResizer('normal', 2, groupIndex, group, scope);
  const controlFrac = resizer?.colRatios?.[1];
  if (controlFrac == null) return null;
  const formGroups = scope === 'designer' ? designerRenderGroups.value : renderGroups.value;
  const availableCm = resolveNormalTableAvailableCm(formGroups, selectedFormPaperOrientation.value);
  return controlFrac * availableCm;
}

function normalFillChars(groupIndex, group, scope) {
  const columnCm = normalColumnCm(groupIndex, group, scope);
  return columnCm == null ? null : computeFillLineCharCount(columnCm);
}

function getInlineRows(fields, fillCharsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null;
    const defaultValue = getScopedDefaultValue(ff);
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n');
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return {
        lines: lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: toHtml(renderCtrl(ff.field_definition, fillChars)),
      };
    }
    // 选项类用结构化渲染（renderCtrlHtml→renderChoiceHtml 产出 .choice-atom），
    // 非选项类等价于 toHtml(renderCtrl(...))。与 TemplatePreviewDialog 保持一致。
    const ctrl = renderCtrlHtml(getPreviewField(ff), fillChars);
    return { lines: [ctrl], repeat: true, fallback: ctrl };
  });
  const maxRows = Math.max(1, ...cols.filter((c) => !c.repeat).map((c) => c.lines.length));
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map((col) => (col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))),
  );
}

function resolveInlineHostGroups(fields) {
  if (renderGroups.value.some((group) => group.type === 'inline' && group.fields === fields)) return renderGroups.value;
  if (designerRenderGroups.value.some((group) => group.type === 'inline' && group.fields === fields)) {
    return designerRenderGroups.value;
  }
  return renderGroups.value;
}

// inline 整格文本填写线：每列按其规划宽度（cm）自适应根数，与后端 _add_inline_table
// 共享 compute_fill_line_char_count 公式。仅独立 inline 组使用（unified band 不传）。
function getInlineColumnCms(fields) {
  const fractions = planInlineColumnFractions(fields);
  const availableCm = resolveInlineTableAvailableCm(
    resolveInlineHostGroups(fields),
    { type: 'inline', fields },
    selectedFormPaperOrientation.value,
  );
  return fractions.map((f) => f * availableCm);
}

function getInlineFillChars(fields) {
  return getInlineColumnCms(fields).map((columnCm) => computeFillLineCharCount(columnCm));
}

function computeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1);
  const base = Math.floor(N / M),
    extra = N % M;
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0));
}

function computeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)));
  return { labelSpan, valueSpan: N - labelSpan };
}

const renderGroups = computed(() => buildFormDesignerRenderGroups(formFields.value));

// 预览视图模型：把模板内按单元格反复调用的纯函数提前算好（segments / inlineRows /
// mergeSpans / labelValueSpans），模板只读属性，消除 inline 表 colspan 的 O(M²) 重建。
// 复用本组件内同名纯函数，保证渲染输出与原模板逐元素相等。
const previewModelHelpers = {
  buildSegments: buildFormDesignerUnifiedSegments,
  getInlineRows,
  getInlineFillChars,
  getInlineColumnCms,
  computeMergeSpans,
  computeLabelValueSpans,
};
const renderGroupsView = computed(() => buildPreviewGroupViewModels(renderGroups.value, previewModelHelpers));

const designerVisibleFields = computed(() => {
  return sortFormFieldsByOrder(formFields.value).map((field, index) => ({
    ...field,
    _displayOrder: index + 1,
  }));
});

function resolveCodelist(codelistId) {
  return codelists.value.find((item) => item.id === codelistId) || null;
}

function resolveUnit(unitId) {
  return units.value.find((item) => item.id === unitId) || null;
}

function normalizePreviewDefaultValue(fieldType, inlineMark, defaultValue) {
  if (!isDefaultValueSupported(fieldType, Boolean(inlineMark))) return '';
  return normalizeDefaultValue(defaultValue ?? '', !inlineMark);
}

function applyPreviewSnapshot(baseField, snapshot) {
  if (!snapshot) return baseField;
  if (baseField.is_log_row) {
    return {
      ...baseField,
      label_override: snapshot.label ?? baseField.label_override,
      bg_color: Object.prototype.hasOwnProperty.call(snapshot, 'bg_color')
        ? snapshot.bg_color
        : (baseField.bg_color ?? null),
      text_color: Object.prototype.hasOwnProperty.call(snapshot, 'text_color')
        ? snapshot.text_color
        : (baseField.text_color ?? null),
      label_bold: Object.prototype.hasOwnProperty.call(snapshot, 'label_bold')
        ? snapshot.label_bold
        : (baseField.label_bold ?? 1),
      label_font_size: Object.prototype.hasOwnProperty.call(snapshot, 'label_font_size')
        ? snapshot.label_font_size
        : (baseField.label_font_size ?? null),
    };
  }

  const fieldDefinition = baseField.field_definition || {};
  const fieldType = snapshot.field_type ?? fieldDefinition.field_type ?? '文本';
  const inlineMark = snapshot.inline_mark ?? baseField.inline_mark ?? 0;
  const supportsUnit = fieldType === '文本' || fieldType === '数值';
  const supportsDateFormat = ['日期', '日期时间', '时间'].includes(fieldType);
  const codelistId = isChoiceField(fieldType) ? (snapshot.codelist_id ?? fieldDefinition.codelist_id ?? null) : null;
  const unitId = supportsUnit ? (snapshot.unit_id ?? fieldDefinition.unit_id ?? null) : null;

  return {
    ...baseField,
    default_value: normalizePreviewDefaultValue(
      fieldType,
      inlineMark,
      snapshot.default_value ?? baseField.default_value,
    ),
    inline_mark: inlineMark,
    bg_color: Object.prototype.hasOwnProperty.call(snapshot, 'bg_color')
      ? snapshot.bg_color
      : (baseField.bg_color ?? null),
    text_color: Object.prototype.hasOwnProperty.call(snapshot, 'text_color')
      ? snapshot.text_color
      : (baseField.text_color ?? null),
    label_bold: Object.prototype.hasOwnProperty.call(snapshot, 'label_bold')
      ? snapshot.label_bold
      : (baseField.label_bold ?? 1),
    label_font_size: Object.prototype.hasOwnProperty.call(snapshot, 'label_font_size')
      ? snapshot.label_font_size
      : (baseField.label_font_size ?? null),
    field_definition: {
      ...fieldDefinition,
      label: snapshot.label ?? fieldDefinition.label,
      variable_name: snapshot.variable_name ?? fieldDefinition.variable_name,
      field_type: fieldType,
      integer_digits: fieldType === '数值' ? (snapshot.integer_digits ?? fieldDefinition.integer_digits) : null,
      decimal_digits: fieldType === '数值' ? (snapshot.decimal_digits ?? fieldDefinition.decimal_digits) : null,
      date_format: supportsDateFormat ? (snapshot.date_format ?? fieldDefinition.date_format) : null,
      checkbox_label: fieldType === '复选'
        ? (snapshot.checkbox_label ?? fieldDefinition.checkbox_label ?? null)
        : null,
      codelist_id: codelistId,
      unit_id: unitId,
      codelist: codelistId ? resolveCodelist(codelistId) : null,
      unit: unitId ? resolveUnit(unitId) : null,
    },
  };
}

const liveEditSnapshot = computed(() => {
  if (!selectedFieldId.value) return null;
  return buildFieldPropSnapshot(selectedFieldId.value);
});
const designerPreviewFields = computed(() => {
  return designerVisibleFields.value.map((field) => {
    const liveSnapshot = liveEditSnapshot.value?.fieldId === field.id ? liveEditSnapshot.value : null;
    return applyPreviewSnapshot(field, liveSnapshot);
  });
});
const designerRenderGroups = computed(() => buildFormDesignerRenderGroups(designerPreviewFields.value));
const designerRenderGroupsView = computed(() =>
  buildPreviewGroupViewModels(designerRenderGroups.value, previewModelHelpers),
);
const showAcrfAnnotations = computed(() => editMode.value && viewMode.value === 'aCRF');

const annotationDrag = useAcrfAnnotationDrag({
  apiClient: api,
  getCurrentPositions: (formId) => getFormAnnotationPositions(formId),
  applyOptimisticPositions: (formId, annotationPositions) => applyFormAnnotationPositions(formId, annotationPositions),
  onPersisted: (updatedForm) => {
    mergeFormIntoState(updatedForm);
  },
  onError: (error, snapshot) => {
    ElMessage.error(`aCRF 标注位置保存失败：${error.message}`);
    if (snapshot?.projectId != null) {
      api.invalidateCache(`/api/projects/${snapshot.projectId}/forms`);
    }
    if (snapshot?.formId != null) {
      api.invalidateCache(`/api/forms/${snapshot.formId}/fields`);
    }
    void reloadForms();
  },
});

function getFieldAnnotationTarget(formField) {
  const key = getFieldOidAnnotationText(formField);
  if (!key || selectedForm.value?.id == null) return null;
  return {
    formId: selectedForm.value.id,
    projectId: props.projectId,
    key,
  };
}

function getFormAnnotationTarget(form) {
  const text = getFormDomainAnnotationText(form);
  if (!text || form?.id == null) return null;
  return {
    formId: form.id,
    projectId: props.projectId,
    key: ANNOTATION_FORM_KEY,
  };
}

function isAnnotationDraggable(target) {
  return Boolean(showAcrfAnnotations.value && target?.formId != null && target?.key);
}

function hasAnnotationOverrideForTarget(target) {
  return Boolean(target?.key && hasAnnotationOverride(getFormAnnotationPositions(target.formId), target.key));
}

function getAnnotationStyle(text, kind, target) {
  return buildAnnotationStyle({
    text,
    kind,
    deltaY01cm: readAnnotationDelta01Cm(getFormAnnotationPositions(target?.formId), target?.key),
  });
}

function onAnnotationPointerDown(target, event) {
  if (!isAnnotationDraggable(target)) return;
  annotationDrag.onAnnotationPointerDown(target, event);
}

function resetAnnotationPosition(target) {
  if (!target) return;
  annotationDrag.resetAnnotationPosition(target);
}

async function flushAnnotationPositionSave(options = {}) {
  return annotationDrag.flushPending(options);
}

const needsLandscape = computed(() =>
  renderGroups.value.some((g) => g.type === 'unified' || (g.type === 'inline' && g.fields.length > 4)),
);
const designerNeedsLandscape = computed(() =>
  designerRenderGroups.value.some((g) => g.type === 'unified' || (g.type === 'inline' && g.fields.length > 4)),
);
const selectedFormPaperOrientation = computed(() => selectedForm.value?.paper_orientation || 'auto');
function resolveLandscape(orientation, autoFlag) {
  if (orientation === 'landscape') return true;
  if (orientation === 'portrait') return false;
  return autoFlag;
}
const landscapeMode = computed(() => resolveLandscape(selectedFormPaperOrientation.value, needsLandscape.value));
const designerLandscapeMode = computed(() =>
  resolveLandscape(selectedFormPaperOrientation.value, designerNeedsLandscape.value),
);

// 预览表格列宽拖拽（R5）：per-group 隔离（同一表单内多张表可独立调整）
// formIdRef / tableKindRef 以 computed 形式传入 useColumnResize，切表单时自动 rehydrate；
// defaultsSource 使用工厂闭包，基于内容驱动的 planner 计算默认比例（与 width_planning.py 对齐）。
const formIdRef = computed(() => selectedForm.value?.id);
const resizerCache = new Map();
const rowResizerCache = new Map();
watch(
  () => selectedForm.value?.id,
  () => {
    resizerCache.clear();
    rowResizerCache.clear();
  },
);

/**
 * 旧键格式正则：匹配 <groupIndex>-<kind>-<colCount> 格式
 * 用于迁移到新格式。
 */

/**
 * 检测并迁移旧格式的 localStorage 键。
 * 在首次访问新格式键时，若发现旧格式键存在，则迁移后删除旧键。
 * @param {string} formId 表单 ID
 * @param {string} newTableInstanceId 新格式 table_instance_id
 * @param {string} legacyMapKey 旧格式 mapKey（groupIndex-kind-colCount）
 */
function migrateLegacyKeyIfNeeded(formId, newTableInstanceId, legacyMapKey) {
  if (!formId || !newTableInstanceId || !legacyMapKey) return;
  const legacyKey = `crf:designer:col-widths:${formId}:${legacyMapKey}`;
  const newKey = `crf:designer:col-widths:${formId}:${newTableInstanceId}`;
  try {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue != null && localStorage.getItem(newKey) == null) {
      localStorage.setItem(newKey, legacyValue);
    }
    if (legacyValue != null) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore localStorage errors */
  }
}
function buildResizerDefaultsFactory(kind, colCount, group) {
  if (kind === 'normal') {
    return () => {
      const fractions = planNormalColumnFractions(group?.fields || []);
      return fractions.length === 2 ? fractions : [0.5, 0.5];
    };
  }
  if (kind === 'inline') {
    return () => {
      const fractions = planInlineColumnFractions(group?.fields || []);
      return fractions.length === colCount ? fractions : Array.from({ length: colCount }, () => 1 / colCount);
    };
  }
  if (kind === 'unified') {
    return () => {
      const unifiedColCount = group?.colCount || colCount;
      const segments = buildFormDesignerUnifiedSegments(group?.fields || []);
      const fractions = planUnifiedColumnFractions(segments, unifiedColCount);
      return fractions.length === unifiedColCount
        ? fractions
        : Array.from({ length: unifiedColCount }, () => 1 / unifiedColCount);
    };
  }
  return () => Array.from({ length: colCount }, () => 1 / colCount);
}
function getResizer(kind, colCount, groupIndex, group, scope = 'main') {
  if (selectedForm.value?.id == null || !group) return null;
  const tableInstanceId = buildTableInstanceId(kind, group.fields || []);
  const legacyMapKey = `${groupIndex}-${kind}-${colCount}`;
  const mapKey = `${scope}:${kind}:${colCount}:${tableInstanceId}`;

  if (!resizerCache.has(mapKey)) {
    migrateLegacyKeyIfNeeded(selectedForm.value.id, tableInstanceId, legacyMapKey);

    const tableKindRef = computed(() => tableInstanceId);
    const defaultsFactory = buildResizerDefaultsFactory(kind, colCount, group);
    resizerCache.set(mapKey, useColumnResize(formIdRef, tableKindRef, defaultsFactory));
  }
  return resizerCache.get(mapKey);
}
function cumRatio(ratios, boundaryIdx) {
  let sum = 0;
  for (let i = 0; i <= boundaryIdx; i += 1) sum += ratios[i];
  return sum;
}

function getRowResizer(kind, group) {
  if (selectedForm.value?.id == null || !group) return null;
  const tableInstanceId = buildTableInstanceId(kind, group.fields || []);
  if (!rowResizerCache.has(tableInstanceId)) {
    rowResizerCache.set(
      tableInstanceId,
      useRowResize(
        formIdRef,
        computed(() => tableInstanceId),
      ),
    );
  }
  return rowResizerCache.get(tableInstanceId);
}

function getRowHeightStyle(rowResizer, rowKey) {
  return rowResizer?.getRowHeightStyle(rowKey) || null;
}

function getPreviewGroupColumnCount(group) {
  if (!group) return 0;
  if (group.type === 'normal') return 2;
  if (group.type === 'inline') return group.fields.length;
  if (group.type === 'unified') return group.colCount || 0;
  return 0;
}

// 全屏设计器对话框关闭后内容仍保留挂载；重新打开时需要显式从 localStorage
// 回灌列宽/行高覆盖，避免主预览已调整而全屏预览仍停留在旧缓存对象上。
function refreshPreviewOverrideState(groups, scope = 'main') {
  groups.forEach((group, groupIndex) => {
    const colCount = getPreviewGroupColumnCount(group);
    if (colCount > 0) {
      const resizer = getResizer(group.type, colCount, groupIndex, group, scope);
      resizer?.rehydrate?.();
    }
    const rowResizer = getRowResizer(group.type, group);
    rowResizer?.rehydrate?.();
  });
}

function refreshDesignerPreviewOverrides() {
  refreshPreviewOverrideState(renderGroupsView.value, 'main');
  refreshPreviewOverrideState(designerRenderGroupsView.value, 'designer');
}

// 两栏布局：外层左右 38/62（横向拖拽），左栏字段列表/属性卡 50/50（纵向拖拽）。
// 比例注入 CSS 变量，窄屏（≤1100px）由媒体查询整体改为上下堆叠。
const { ratio: mainSplitRatio, startResize: startMainSplitResize } = usePaneSplit(
  'crf:designer:main-split',
  0.38,
  { axis: 'horizontal', min: 0.2, max: 0.8 },
);
const { ratio: leftSplitRatio, startResize: startLeftSplitResize } = usePaneSplit(
  'crf:designer:left-split',
  0.5,
);
const mainSplitStyle = computed(() => ({
  '--main-first': `${mainSplitRatio.value}fr`,
  '--main-second': `${1 - mainSplitRatio.value}fr`,
}));
const leftSplitStyle = computed(() => ({
  '--left-first': `${leftSplitRatio.value}fr`,
  '--left-second': `${1 - leftSplitRatio.value}fr`,
}));

// 设计备注弹窗：独立草稿，「确定」一次保存 /「取消」丢弃，无自动保存、无防抖。
const showNotesDialog = ref(false);
const previewDesignNotesText = computed(() => String(selectedForm.value?.design_notes ?? ''));
// 顶栏空间有限：摘要有换行时只显示第一行（有后续内容补省略号），完整原文交给悬浮提示按原样分行
const headerDesignNotesSummary = computed(() => summarizeDesignNotes(previewDesignNotesText.value));
const headerDesignNotesTooltip = computed(() => normalizeDesignNotesTooltip(previewDesignNotesText.value));

function openNotesDialog() {
  showNotesDialog.value = true;
}

function onNotesDialogSaved({ formId, designNotes }) {
  mergeFormIntoState({ id: formId, design_notes: designNotes });
}

// el-table 的 @current-change 在 :data（filteredForms 每次返回新数组）重算或程序化
// setCurrentRow 之后，会以「当前已选中行」重新 emit 一次 current-change。若直接透传给
// selectForm，这类回显会命中 selectForm 的同 id 分支并 `formSelectionAttempt += 1`，
// 从而作废正在进行中的下拉切换（selectForm(目标) 在后续 await 处静默 return，永不 commit）。
// 用户点击其它行时 el-table 只会以「不同行」触发 current-change，故过滤 null 与同 id 回显是安全的。
function onFormsTableCurrentChange(row) {
  if (!row) return;
  if ((row.id ?? null) === (selectedForm.value?.id ?? null)) return;
  return selectForm(row);
}

async function selectForm(nextForm) {
  const currentForm = selectedForm.value;
  if ((currentForm?.id ?? null) === (nextForm?.id ?? null)) {
    formSelectionAttempt += 1;
    return;
  }
  if (designerHistory.busy.value || isReordering.value || savingDraft.value) {
    formSelectionAttempt += 1;
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  const selectionSession = formSelectionSession;
  const projectId = props.projectId;
  const selectionAttempt = ++formSelectionAttempt;
  const eventName = currentForm ? 'designer_switch_form' : 'designer_select_form';
  markPerfStart(eventName, { project_id: projectId, form_id: nextForm?.id ?? null });
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!isFormSelectionAttemptCurrent(selectionAttempt, selectionSession, projectId)) return;
    if (!proceed) {
      formsTableRef.value?.setCurrentRow(currentForm);
      return;
    }
  }
  const annotationFlushSucceeded = await flushAnnotationPositionSave({ cancelActiveDrag: true });
  if (!isFormSelectionAttemptCurrent(selectionAttempt, selectionSession, projectId)) return;
  if (!annotationFlushSucceeded && currentForm?.id) {
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  const canLeaveFieldProp = await resolveFieldPropLeave({
    resetOptions: { preserveEditor: true },
    actionText: '切换表单',
  });
  if (!isFormSelectionAttemptCurrent(selectionAttempt, selectionSession, projectId)) return;
  if (!canLeaveFieldProp) {
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  const canLeaveFormProp = await resolveFormPropLeave({ actionText: '切换表单' });
  if (!isFormSelectionAttemptCurrent(selectionAttempt, selectionSession, projectId)) return;
  if (!canLeaveFormProp) {
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  resetFieldPropAutoSaveState();
  invalidateFormSelectionSession();
  formFields.value = [];
  selectedIds.value = [];
  selectedForm.value = nextForm || null;
  syncFormPropEditor(selectedForm.value);
  markPerfEnd(eventName, { project_id: projectId, form_id: nextForm?.id ?? null });
}

// 快速编辑
const showQuickEdit = ref(false);
const quickEditField = ref(null);
const quickEditProp = reactive({
  label: '',
  field_type: '',
  bg_color: '',
  text_color: '',
  inline_mark: false,
  default_value: '',
  label_bold: 1,
  label_font_size: 'default',
});
function openQuickEdit(ff) {
  if (isDraftField(ff)) return; // 草稿无真实实例 id，禁止快编（saveQuickEdit 会 PUT /form-fields/__draft__）
  if (ff?.is_log_row || ff?.field_definition?.field_type === '日志行') return;
  recordPerfEvent({
    type: 'instant',
    name: 'designer_edit_label',
    project_id: props.projectId,
    form_id: selectedForm.value?.id ?? null,
    field_id: ff?.id ?? null,
  });
  quickEditField.value = ff;
  Object.assign(quickEditProp, {
    label: getFormFieldDisplayLabel(ff) || '',
    field_type: ff.field_definition?.field_type || '',
    bg_color: ff.bg_color || '',
    text_color: ff.text_color || '',
    inline_mark: !!ff.inline_mark,
    default_value: ff.default_value || '',
    label_bold: ff.label_bold === 0 ? 0 : 1,
    label_font_size: ff.label_font_size || 'default',
  });
  showQuickEdit.value = true;
}
async function saveQuickEdit() {
  if (!quickEditField.value) return;
  if (isReordering.value) return;
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;
  const formId = historyContext.formId;
  const fieldId = quickEditField.value.id;
  try {
    const supportsDefaultValue = isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark));
    const normalizedDefaultValue = supportsDefaultValue
      ? normalizeDefaultValue(quickEditProp.default_value, !quickEditProp.inline_mark)
      : '';
    const command = buildInstanceOnlyProfileCommand({
      instance: {
        label_override: quickEditProp.label,
        bg_color: quickEditProp.bg_color || null,
        text_color: quickEditProp.text_color || null,
        inline_mark: quickEditProp.inline_mark ? 1 : 0,
        default_value: normalizedDefaultValue || null,
        label_bold: quickEditProp.label_bold,
        label_font_size: quickEditProp.label_font_size === 'default' ? null : quickEditProp.label_font_size,
      },
    });
    const updated = await api.put(`/api/form-fields/${fieldId}/binding-profile`, command);
    const updatedField = updated.form_field ?? null;
    api.invalidateCache(`/api/forms/${formId}/fields`);
    // 写成功先失效缓存；仅当 formId+session 仍匹配当前设计器上下文时才改本地 UI。
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    const sourceField = formFields.value.find((field) => field.id === fieldId) || quickEditField.value;
    const currentField = updatedField
      ? { ...sourceField, ...updatedField }
      : {
          ...sourceField,
          label_override: quickEditProp.label,
          bg_color: quickEditProp.bg_color || null,
          text_color: quickEditProp.text_color || null,
          inline_mark: quickEditProp.inline_mark ? 1 : 0,
          default_value: normalizedDefaultValue || null,
          label_bold: quickEditProp.label_bold,
          label_font_size: quickEditProp.label_font_size === 'default' ? null : quickEditProp.label_font_size,
        };
    quickEditField.value = currentField;
    syncSelectedField(currentField, { syncEditor: false });
    if (!isReordering.value) {
      await loadFormFields(formId);
      if (!isCurrentDesignerHistoryContext(historyContext)) return;
      const refreshed = formFields.value.find((item) => item.id === fieldId);
      if (refreshed && selectedFieldId.value === refreshed.id && !isFieldPropDirty.value) selectField(refreshed);
    }
    ElMessage.success('已保存');
    showQuickEdit.value = false;
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message);
  }
}

async function toggleInline(ff) {
  if (isDraftField(ff)) return; // 草稿走属性编辑器写本地，不经真实实例 PATCH
  if (isReordering.value) return;
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext || !canToggleInline(ff)) return;
  const formId = historyContext.formId;
  const nextInlineMark = ff.inline_mark ? 0 : 1;
  recordPerfEvent({
    type: 'instant',
    name: 'designer_toggle_inline',
    project_id: props.projectId,
    form_id: formId,
    field_id: ff?.id ?? null,
  });
  try {
    await confirmFormChange();
    if (!isCurrentDesignerHistoryContext(historyContext) || isReordering.value) return;
    await api.put(
      `/api/form-fields/${ff.id}/binding-profile`,
      buildInstanceOnlyProfileCommand({ instance: { inline_mark: nextInlineMark } }),
    );
    api.invalidateCache(`/api/forms/${formId}/fields`);
    // 写成功先失效缓存；session 已变则停止 UI 提交（缓存已为下次加载准备好）。
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (isReordering.value) {
      const sourceField = formFields.value.find((field) => field.id === ff.id) || ff;
      const updatedField = { ...sourceField, inline_mark: nextInlineMark };
      syncSelectedField(updatedField, { syncEditor: false });
      if (selectedFieldId.value === ff.id) editProp.inline_mark = nextInlineMark;
      return;
    }
    await loadFormFields(formId);
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (selectedFieldId.value === ff.id && !isFieldPropDirty.value) {
      const refreshed = formFields.value.find((item) => item.id === ff.id);
      if (refreshed) selectField(refreshed);
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}

const selectedFieldId = ref(null);
const editProp = reactive({
  label: '',
  variable_name: '',
  field_type: '文本',
  integer_digits: null,
  decimal_digits: null,
  date_format: null,
  checkbox_label: null,
  codelist_id: null,
  unit_id: null,
  default_value: '',
  inline_mark: 0,
  bg_color: null,
  text_color: null,
  label_bold: 1,
  label_font_size: 'default',
});
const fieldPropBaseline = ref(null);
const isSavingFieldProp = ref(false);
let isHydratingFieldProp = false;
let labelOidSession = buildLabelOidSession();
let fieldPropSaveSession = 0;
const fieldPropProjectId = ref(props.projectId);
let lastHydratedFieldPropDraftKey = '';
const designerFieldTypes = [
  '文本',
  '数值',
  '日期',
  '日期时间',
  '时间',
  '单选',
  '多选',
  '单选（纵向）',
  '多选（纵向）',
  '复选',
  '标签',
];
const designerAvailableFieldTypes = computed(() =>
  buildFieldTypeOptions(designerFieldTypes, projectDbType.value, editProp.field_type)
);
const BG_COLOR_OPTIONS = [
  { value: null, label: '默认' },
  { value: 'A6A6A6', label: '灰色' },
  { value: '0070C0', label: '蓝色' },
  { value: 'E3F2FD', label: '浅蓝' },
  { value: 'E8F5E9', label: '浅绿' },
  { value: 'FFE0B2', label: '浅橙' },
];
const TEXT_COLOR_OPTIONS = [
  { value: 'A6A6A6', label: '灰色' },
  { value: '0070C0', label: '蓝色' },
  { value: 'E3F2FD', label: '浅蓝' },
  { value: 'E8F5E9', label: '浅绿' },
  { value: 'FFE0B2', label: '浅橙' },
];
const customBgColorInput = ref(''),
  customTextColorInput = ref('');

watch(
  () => editProp.field_type,
  (newType) => {
    Object.assign(editProp, syncFieldTypeSpecificProps(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS));
  },
);

// 字段类型切换（仅用户选择触发）：标签 OID 由系统托管，切入/切出时迁移 OID
function onDesignerFieldTypeChange(nextType) {
  const next = applyLabelOidTransition({
    variableName: editProp.variable_name,
    session: labelOidSession,
    previousType: editProp.field_type,
    nextType,
    generateVariableName: genFieldVarName,
  });
  labelOidSession = next.session;
  editProp.variable_name = next.variableName;
  editProp.field_type = nextType;
}

function getSelectedFormField(fieldId = selectedFieldId.value) {
  if (!fieldId) return null;
  return formFields.value.find((f) => f.id === fieldId) || null;
}

function normalizeEditorDefaultValue() {
  if (!isDefaultValueSupported(editProp.field_type, Boolean(editProp.inline_mark))) return null;
  return normalizeDefaultValue(editProp.default_value, !editProp.inline_mark) || null;
}

function currentEditorPropState() {
  const ff = getSelectedFormField();
  if (!ff || ff.is_log_row || selectedFieldId.value === DRAFT_FIELD_ID) return null;
  const normalizedFieldType = editProp.field_type || null;
  const normalizedCheckboxLabel = normalizedFieldType === '复选' ? (editProp.checkbox_label ?? null) : null;
  const normalizedCodelistId = isChoiceField(normalizedFieldType) ? editProp.codelist_id : null;
  const normalizedUnitId = ['文本', '数值'].includes(normalizedFieldType) ? (editProp.unit_id ?? null) : null;
  return {
    label_override: ff.label_override ?? null,
    default_value: normalizeEditorDefaultValue(),
    bg_color: editProp.bg_color ?? null,
    text_color: editProp.text_color ?? null,
    label_bold: editProp.label_bold ? 1 : 0,
    label_font_size: editProp.label_font_size === 'default' ? null : editProp.label_font_size,
    fd: {
      label: editProp.label ?? null,
      variable_name: editProp.variable_name ?? null,
      field_type: normalizedFieldType,
      integer_digits: normalizedFieldType !== '数值' ? null : editProp.integer_digits,
      decimal_digits: normalizedFieldType !== '数值' ? null : editProp.decimal_digits,
      date_format: !DATE_FORMAT_OPTIONS[normalizedFieldType]
        ? null
        : normalizeDateFormat(normalizedFieldType, editProp.date_format, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS),
      checkbox_label: normalizedCheckboxLabel,
      codelist_id: normalizedCodelistId,
      unit_id: normalizedUnitId,
    },
  };
}

function syncFieldPropBaselineFromEditor() {
  fieldPropBaseline.value = selectedFieldId.value === DRAFT_FIELD_ID ? null : currentEditorPropState();
}

const isFieldPropDirty = computed(() => {
  if (!selectedFieldId.value || selectedFieldId.value === DRAFT_FIELD_ID) return false;
  if (!fieldPropBaseline.value) return false;
  const currentState = currentEditorPropState();
  return Boolean(currentState && !sameFieldPropState(fieldPropBaseline.value, currentState));
});

function applyCustomBgColor() {
  const raw = String(customBgColorInput.value ?? '').trim();
  if (!raw) {
    editProp.bg_color = null;
    return;
  }
  const normalized = normalizeHexColorInput(raw);
  if (!normalized) return;
  customBgColorInput.value = normalized;
  editProp.bg_color = normalized;
}

function applyCustomTextColor() {
  const raw = String(customTextColorInput.value ?? '').trim();
  if (!raw) {
    editProp.text_color = null;
    return;
  }
  const normalized = normalizeHexColorInput(raw);
  if (!normalized) return;
  customTextColorInput.value = normalized;
  editProp.text_color = normalized;
}

function syncSelectedField(updatedField, { syncEditor = true } = {}) {
  if (!updatedField) return;
  formFields.value = formFields.value.map((f) => (f.id === updatedField.id ? updatedField : f));
  if (syncEditor && selectedFieldId.value === updatedField.id) selectField(updatedField);
}

function buildFieldPropSnapshot(fieldId = selectedFieldId.value) {
  if (!fieldId) return null;
  return {
    fieldId,
    projectId: fieldPropProjectId.value,
    label: editProp.label,
    variable_name: editProp.variable_name,
    field_type: editProp.field_type,
    integer_digits: editProp.integer_digits,
    decimal_digits: editProp.decimal_digits,
    date_format: editProp.date_format,
    checkbox_label: editProp.checkbox_label,
    codelist_id: editProp.codelist_id,
    unit_id: editProp.unit_id,
    default_value: editProp.default_value,
    inline_mark: editProp.inline_mark,
    bg_color: editProp.bg_color,
    text_color: editProp.text_color,
    label_bold: editProp.label_bold ? 1 : 0,
    label_font_size: editProp.label_font_size === 'default' ? null : editProp.label_font_size,
  };
}

function getFieldPropSnapshotKey(snapshot = buildFieldPropSnapshot()) {
  return snapshot ? JSON.stringify(snapshot) : '';
}

function resetFieldPropAutoSaveState({ preserveEditor = false } = {}) {
  fieldPropSaveSession += 1;
  isSavingFieldProp.value = false;
  fieldPropBaseline.value = null;
  selectedDefinitionId.value = null;
  candidateOid.value = null;
  candidateBeforeDefinition = null;
  labelOidSession = buildLabelOidSession();
  if (!preserveEditor) {
    selectedFieldId.value = null;
    Object.assign(editProp, {
      label: '',
      variable_name: '',
      field_type: '文本',
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
      default_value: '',
      inline_mark: 0,
      bg_color: null,
      text_color: null,
      label_bold: 1,
      label_font_size: 'default',
    });
    customBgColorInput.value = '';
    customTextColorInput.value = '';
    lastHydratedFieldPropDraftKey = '';
  }
}

async function confirmFieldReferenceImpact(definitionId) {
  if (!definitionId) return true;
  const refs = await api.get(`/api/field-definitions/${definitionId}/references`);
  if (countDistinctForms(refs) <= 1) return true;
  const msg = formatFieldImpactMessage(refs, { max: 5, sep: '、' });
  await ElMessageBox.confirm(`修改将影响以下表单：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' });
  return true;
}

async function saveSelectedFieldProp() {
  if (designerHistory.busy.value || isSavingFieldProp.value) return false;
  if (!selectedFieldId.value || selectedFieldId.value === DRAFT_FIELD_ID || !isFieldPropDirty.value) return true;
  const ff = getSelectedFormField();
  if (!ff) return false;
  // 标签 OID 由系统托管：空/非法（历史数据）时换成占位值，避免 OID 校验阻塞保存
  if (editProp.field_type === '标签') {
    editProp.variable_name = ensureLabelVariableName(editProp.variable_name, genFieldVarName);
  }
  const snapshot = buildFieldPropSnapshot();
  let sessionId = null;
  isSavingFieldProp.value = true;
  try {
    if (isChoiceField(snapshot.field_type) && !snapshot.codelist_id) {
      ElMessage.warning('单选/多选字段必须选择选项字典');
      return false;
    }
    if (
      isMultiselectFieldType(snapshot.field_type) &&
      !allowsMultiselect(projectDbType.value)
    ) {
      ElMessage.warning('当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型');
      return false;
    }
    if (
      !['标签', '日志行'].includes(snapshot.field_type) &&
      !isValidRequiredOid(snapshot.variable_name)
    ) {
      ElMessage.warning(OID_ERROR);
      return false;
    }
    // 手输 OID 命中其他现有定义但未明确点击候选：阻止并提示（后端唯一约束兜底）
    const oidConflict = findOidConflict(
      fieldDefs.value.filter(isVisibleInFieldLibrary),
      snapshot.variable_name,
      ff.field_definition_id,
    );
    if (oidConflict && selectedDefinitionId.value !== oidConflict.id) {
      ElMessage.warning('该OID已在字段库中存在，请从候选中选择或修改OID');
      return false;
    }
    // 影响确认只针对真正被 update_shared 写入的目标定义（换绑=候选；分叉=无需确认）
    const sharedWriteTarget = resolveSharedWriteTarget({
      currentDefinitionId: ff.field_definition_id,
      currentDefinitionOid: ff.field_definition?.variable_name ?? null,
      editorState: snapshot,
      selectedDefinitionId: selectedDefinitionId.value,
      candidateOid: candidateOid.value,
    });
    await confirmFieldReferenceImpact(sharedWriteTarget);
    fieldPropSaveSession += 1;
    sessionId = fieldPropSaveSession;
    await saveFieldProp(snapshot, sessionId);
    if (selectedFieldId.value === snapshot.fieldId) syncFieldPropBaselineFromEditor();
    ElMessage.success('已保存');
    return true;
  } catch (e) {
    if (e === 'cancel' || e === 'close') return false;
    ElMessage.error(e.message || '字段属性保存失败');
    return false;
  } finally {
    if (sessionId == null || sessionId === fieldPropSaveSession) isSavingFieldProp.value = false;
  }
}

function cancelSelectedFieldProp() {
  if (!selectedFieldId.value || selectedFieldId.value === DRAFT_FIELD_ID) return;
  const ff = getSelectedFormField();
  if (ff) selectField(ff);
}

async function resolveFieldPropLeave({ resetOptions = {}, actionText = '关闭' } = {}) {
  if (!isFieldPropDirty.value) return true;
  try {
    await ElMessageBox.confirm(`字段属性修改尚未保存，保存或取消后将继续${actionText}。`, '字段属性未保存', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      distinguishCancelAndClose: true,
      type: 'warning',
    });
    return await saveSelectedFieldProp();
  } catch (e) {
    if (e === 'cancel') {
      resetFieldPropAutoSaveState(resetOptions);
      return true;
    }
    return false;
  }
}

const currentFieldPropDraftKey = computed(() => getFieldPropSnapshotKey());

watch(currentFieldPropDraftKey, (draftKey) => {
  if (!draftKey || isHydratingFieldProp || draftKey === lastHydratedFieldPropDraftKey) return;
  // 草稿态：编辑只写本地草稿对象，不入队、不发自动保存请求。
  if (selectedFieldId.value === DRAFT_FIELD_ID) {
    applyEditorToDraft();
    lastHydratedFieldPropDraftKey = draftKey;
  }
});

function selectField(ff) {
  labelOidSession = buildLabelOidSession(resolveLabelOidSeedDefinition(ff));
  isHydratingFieldProp = true;
  selectedFieldId.value = ff.id;
  selectedDefinitionId.value = null;
  candidateOid.value = null;
  candidateBeforeDefinition = null;
  if (ff.is_log_row) {
    Object.assign(editProp, {
      label: '以下为log行',
      variable_name: '',
      field_type: '日志行',
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
      default_value: '',
      inline_mark: 0,
      bg_color: null,
      text_color: null,
      label_bold: 1,
      label_font_size: 'default',
    });
    customBgColorInput.value = '';
    customTextColorInput.value = '';
    fieldPropBaseline.value = null;
    lastHydratedFieldPropDraftKey = '';
    isHydratingFieldProp = false;
    return;
  }
  const fd = ff.field_definition;
  if (!fd) {
    fieldPropBaseline.value = null;
    lastHydratedFieldPropDraftKey = '';
    isHydratingFieldProp = false;
    return;
  }
  Object.assign(editProp, {
    label: fd.label || '',
    variable_name: fd.variable_name || '',
    field_type: fd.field_type || '文本',
    integer_digits: fd.integer_digits ?? null,
    decimal_digits: fd.decimal_digits ?? null,
    date_format: fd.date_format ?? null,
    checkbox_label: fd.checkbox_label ?? null,
    codelist_id: fd.codelist_id ?? null,
    unit_id: fd.unit_id ?? null,
    default_value: ff.default_value || '',
    inline_mark: ff.inline_mark || 0,
    bg_color: ff.bg_color || null,
    text_color: ff.text_color || null,
    label_bold: ff.label_bold === 0 ? 0 : 1,
    label_font_size: ff.label_font_size || 'default',
  });
  // 同步归一类型专属属性：让异步 flush:pre 的 field_type watcher 变成幂等空操作，
  // 避免基线快照之后再改写 editProp 造成假脏态。
  Object.assign(editProp, syncFieldTypeSpecificProps(editProp, editProp.field_type, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS));
  customBgColorInput.value = ff.bg_color && !BG_COLOR_OPTIONS.some((o) => o.value === ff.bg_color) ? ff.bg_color : '';
  customTextColorInput.value =
    ff.text_color && !TEXT_COLOR_OPTIONS.some((o) => o.value === ff.text_color) ? ff.text_color : '';
  lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey(buildFieldPropSnapshot(ff.id));
  syncFieldPropBaselineFromEditor();
  isHydratingFieldProp = false;
}

async function saveFieldProp(snapshot = buildFieldPropSnapshot(), sessionId = fieldPropSaveSession) {
  if (designerHistory.busy.value) return false;
  if (!snapshot?.fieldId) return;
  if (sessionId !== fieldPropSaveSession) throw new Error('字段属性保存上下文已变更');
  const historyContext = captureDesignerHistoryContext();
  const ff = formFields.value.find((f) => f.id === snapshot.fieldId);
  const formId = historyContext?.formId;
  const projectId = snapshot.projectId;
  if (!ff || !formId || projectId !== fieldPropProjectId.value) throw new Error('字段属性保存上下文已变更');
  if (isChoiceField(snapshot.field_type) && !snapshot.codelist_id)
    throw new Error('单选/多选字段必须选择选项字典');
  const propEditFieldId = ff.id;
  const originalDefinitionId = ff.field_definition_id;
  const originalDefinitionOid = ff.field_definition?.variable_name ?? null;
  const beforePropState = snapshotFieldPropState(ff);
  const supportsDefaultValue = isDefaultValueSupported(snapshot.field_type, Boolean(snapshot.inline_mark));
  const normalizedDefaultValue = supportsDefaultValue
    ? normalizeDefaultValue(snapshot.default_value, !snapshot.inline_mark)
    : null;
  const editorState = {
    variable_name: snapshot.variable_name,
    label: snapshot.label,
    field_type: snapshot.field_type,
    integer_digits: snapshot.integer_digits,
    decimal_digits: snapshot.decimal_digits,
    date_format: snapshot.date_format,
    checkbox_label: snapshot.checkbox_label ?? null,
    codelist_id: snapshot.codelist_id,
    unit_id: snapshot.unit_id ?? null,
    required: ff.required ?? 0,
    label_override: ff.label_override ?? null,
    help_text: ff.help_text ?? null,
    default_value: normalizedDefaultValue,
    inline_mark: snapshot.inline_mark ? 1 : 0,
    bg_color: snapshot.bg_color ?? null,
    text_color: snapshot.text_color ?? null,
    label_bold: snapshot.label_bold,
    label_font_size: snapshot.label_font_size,
  };
  // 一次原子请求：共享更新 / 候选换绑 / OID 分叉 + 实例更新
  const command = buildBindingProfileCommand({
    currentDefinitionId: originalDefinitionId,
    currentDefinitionOid: originalDefinitionOid,
    editorState,
    selectedDefinitionId: selectedDefinitionId.value,
    candidateOid: candidateOid.value,
  });
  const result = await api.put(`/api/form-fields/${propEditFieldId}/binding-profile`, command);
  if (sessionId !== fieldPropSaveSession) throw new Error('字段属性保存上下文已变更');
  api.invalidateCache(`/api/forms/${formId}/fields`);
  api.invalidateCache(`/api/projects/${projectId}/field-definitions`);
  refreshKey.value++;
  if (!isReordering.value) {
    await loadFormFields();
  }
  if (!isCurrentDesignerHistoryContext(historyContext)) return;
  const candidateBeforePayload = candidateBeforeDefinition;
  selectedDefinitionId.value = null;
  candidateOid.value = null;
  candidateBeforeDefinition = null;
  if (selectedFieldId.value === propEditFieldId) {
    const fresh = formFields.value.find((f) => f.id === propEditFieldId);
    if (fresh && !isFieldPropDirty.value) selectField(fresh);
  }
  const afterField = formFields.value.find((f) => f.id === propEditFieldId);
  const afterPropState = snapshotFieldPropState(afterField);
  if (afterPropState && beforePropState && !sameFieldPropState(beforePropState, afterPropState)) {
    const isFork = command.definition_operation.operation === 'create_or_restore';
    const isRebind = command.binding.mode === 'existing' && command.definition_operation.operation === 'update_shared';
    const writtenDefinitionId = result.final_definition_id ?? originalDefinitionId;
    recordDesignerHistory(historyContext, {
      label: isFork ? 'OID 分叉' : isRebind ? '换绑字段' : '编辑属性',
      ids: { ffId: propEditFieldId, fdId: writtenDefinitionId, origFdId: originalDefinitionId },
      undo: async (ids) => {
        const undoCommand = buildFieldPropReplayCommand({
          entryType: isFork ? 'fork-undo' : isRebind ? 'rebind-undo' : 'shared',
          writtenDefinitionId: ids.fdId,
          originalDefinitionId: ids.origFdId,
          originalDefinitionOid,
          candidateBeforePayload,
          snapshot: beforePropState,
        });
        const replayResult = await replayBindingProfile(historyContext, ids.ffId, undoCommand);
        if (replayResult?.cleanup?.retained_in_use) {
          ElMessage.warning('字段定义已被其他表单引用，已保留定义');
        }
      },
      redo: async (ids) => {
        const redoCommand = buildFieldPropReplayCommand({
          entryType: isFork ? 'fork-redo' : isRebind ? 'rebind-redo' : 'shared',
          writtenDefinitionId: ids.fdId,
          originalDefinitionId: ids.origFdId,
          originalDefinitionOid,
          snapshot: afterPropState,
        });
        await replayBindingProfile(historyContext, ids.ffId, redoCommand);
      },
    });
  }
}

// 把当前属性编辑器的值不可变地写回本地草稿对象（含 field_definition 与实例属性）。
function applyEditorToDraft() {
  const draft = formFields.value.find(isDraftField);
  if (!draft) return;
  const updated = {
    ...draft,
    default_value: editProp.default_value || '',
    inline_mark: editProp.inline_mark || 0,
    bg_color: editProp.bg_color || null,
    text_color: editProp.text_color || null,
    label_bold: editProp.label_bold ? 1 : 0,
    label_font_size: editProp.label_font_size === 'default' ? null : editProp.label_font_size,
    field_definition: {
      ...draft.field_definition,
      label: editProp.label,
      variable_name: editProp.variable_name,
      field_type: editProp.field_type,
      integer_digits: editProp.integer_digits,
      decimal_digits: editProp.decimal_digits,
      date_format: editProp.date_format,
      checkbox_label: editProp.checkbox_label ?? null,
      codelist_id: editProp.codelist_id,
      unit_id: editProp.unit_id ?? null,
    },
  };
  formFields.value = formFields.value.map((f) => (isDraftField(f) ? updated : f));
}

// 仅移除本地草稿，不发任何请求；若草稿正被选中则清空编辑器。
function removeDraftFromState() {
  formFields.value = formFields.value.filter((f) => !isDraftField(f));
  if (selectedFieldId.value === DRAFT_FIELD_ID) resetFieldPropAutoSaveState();
}

// 存在未保存草稿时切换/新建前的统一确认：保存 / 丢弃 / 取消。
// 返回 true 表示可继续后续动作（已保存或已丢弃），false 表示取消。
async function confirmDiscardDraft() {
  if (!hasDraft.value) return true;
  let action = 'save';
  try {
    await ElMessageBox.confirm('有未保存的新增字段草稿，是否先保存？', '未保存草稿', {
      confirmButtonText: '保存',
      cancelButtonText: '丢弃',
      distinguishCancelAndClose: true,
      type: 'warning',
    });
  } catch (e) {
    action = e === 'cancel' ? 'discard' : 'abort';
  }
  if (action === 'save') return await saveDraftField();
  if (action === 'discard') {
    removeDraftFromState();
    return true;
  }
  return false;
}

async function newField() {
  if (designerHistory.busy.value || isReordering.value) return;
  if (!selectedForm.value) return;
  const canLeaveFieldProp = await resolveFieldPropLeave({ actionText: '新建字段' });
  if (!canLeaveFieldProp) return;
  // 从表单属性视图新建草稿字段时，先处理未保存的表单属性（镜像 onSelectFieldClick）
  if (!selectedFieldId.value) {
    const canLeaveFormProp = await resolveFormPropLeave({ actionText: '新建字段' });
    if (!canLeaveFormProp) return;
  }
  const historyContext = captureDesignerHistoryContext();
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (!proceed) return;
  }
  const maxOrder = formFields.value.reduce((m, f) => Math.max(m, f?.order_index ?? 0), 0);
  const draft = withLabelOidSeed({
    id: DRAFT_FIELD_ID,
    __draft: true,
    form_id: historyContext.formId,
    field_definition_id: null,
    is_log_row: 0,
    order_index: maxOrder + 1,
    required: 0,
    label_override: null,
    help_text: null,
    default_value: '',
    inline_mark: 0,
    bg_color: null,
    text_color: null,
    field_definition: {
      id: DRAFT_FIELD_ID,
      label: '新字段',
      variable_name: genFieldVarName(),
      field_type: '文本',
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
    },
  });
  formFields.value = [...formFields.value, draft];
  selectField(draft);
}

// 保存草稿：一次 field-profile 原子请求（建定义/绑定候选 + 建实例），
// 成功后移除草稿并用真实记录刷新；失败保留草稿与编辑内容。返回 true 表示保存成功。
async function saveDraftField() {
  if (designerHistory.busy.value || isReordering.value) return false;
  const draft = formFields.value.find(isDraftField);
  if (!draft) return false;
  if (savingDraft.value) return false;
  const historyContext = captureDesignerHistoryContext();
  const formId = historyContext?.formId;
  const projectId = props.projectId;
  if (!formId) return false;
  const fd = draft.field_definition || {};
  if (isChoiceField(fd.field_type) && !fd.codelist_id) {
    ElMessage.error('单选/多选字段必须选择选项字典');
    return false;
  }
  if (isMultiselectFieldType(fd.field_type) && !allowsMultiselect(projectDbType.value)) {
    ElMessage.error('当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型');
    return false;
  }
  if (!['标签', '日志行'].includes(fd.field_type) && !isValidRequiredOid(fd.variable_name)) {
    ElMessage.warning(OID_ERROR);
    return false;
  }
  const draftVariableName =
    fd.field_type === '标签' ? ensureLabelVariableName(fd.variable_name, genFieldVarName) : fd.variable_name;
  // 手输 OID 命中其他现有定义但未明确点击候选：阻止并提示
  const oidConflict = findOidConflict(
    fieldDefs.value.filter(isVisibleInFieldLibrary),
    draftVariableName,
    null,
  );
  if (oidConflict && selectedDefinitionId.value !== oidConflict.id) {
    ElMessage.error('该OID已在字段库中存在，请从候选中选择或修改OID');
    return false;
  }
  if (isReordering.value) return false;
  const supportsDefaultValue = isDefaultValueSupported(fd.field_type, Boolean(draft.inline_mark));
  const editorState = {
    variable_name: draftVariableName,
    label: fd.label ?? '',
    field_type: fd.field_type ?? '文本',
    integer_digits: fd.integer_digits ?? null,
    decimal_digits: fd.decimal_digits ?? null,
    date_format: fd.date_format ?? null,
    checkbox_label: fd.checkbox_label ?? null,
    codelist_id: fd.codelist_id ?? null,
    unit_id: fd.unit_id ?? null,
    ...(fd.is_multi_record != null ? { is_multi_record: fd.is_multi_record } : {}),
    ...(fd.table_type != null ? { table_type: fd.table_type } : {}),
    required: draft.required ?? 0,
    label_override: draft.label_override ?? null,
    help_text: draft.help_text ?? null,
    default_value: supportsDefaultValue ? normalizeDefaultValue(draft.default_value, !draft.inline_mark) : null,
    inline_mark: draft.inline_mark ? 1 : 0,
    bg_color: draft.bg_color ?? null,
    text_color: draft.text_color ?? null,
    label_bold: draft.label_bold ?? 1,
    label_font_size: draft.label_font_size ?? null,
  };
  const command = buildFieldProfileCommand({
    editorState,
    selectedDefinitionId: selectedDefinitionId.value,
    candidateOid: candidateOid.value,
    candidateDefinitionPayload: candidateBeforeDefinition,
  });
  if (Number.isInteger(draft.__draftOrderIndex)) command.order_index = draft.__draftOrderIndex;
  // 草稿内改了定义级属性 → 随保存共享更新候选定义；多表单引用时先确认影响范围
  const definitionChanged = command.definition_operation?.operation === 'update_shared';
  // 确认弹窗 await 期间用户可能经 onSelectFieldClick→丢弃草稿 清空 candidateBeforeDefinition：
  // 恢复快照必须在首个 await 前捕获，否则 undo 静默丢失定义内容恢复
  const restoreDefinitionPayload = definitionChanged ? candidateBeforeDefinition : null;
  savingDraft.value = true;
  beginFieldMembershipMutation();
  try {
    if (definitionChanged) {
      await confirmFieldReferenceImpact(selectedDefinitionId.value);
      // 确认弹窗期间草稿可能被丢弃：不再物化已丢弃字段
      if (!hasDraft.value) return false;
    }
    const result = await api.post(`/api/forms/${formId}/field-profile`, command);
    const createdFfId = result.form_field_id ?? result.form_field?.id;
    const createdFdId = result.final_definition_id;
    // 只有本次新建的定义才能随撤销清理；绑定既有候选时不得删除候选定义。
    const definitionCreated = Boolean(result.definition_created);
    api.invalidateCache(`/api/forms/${formId}/fields`);
    api.invalidateCache(`/api/projects/${projectId}/field-definitions`);
    // 字段库同步刷新：与 saveFieldProp 一致（草稿保存的更新要立即反映到「字段」页）
    refreshKey.value++;
    if (!isCurrentDesignerHistoryContext(historyContext)) return true;
    if (isReordering.value) return true;
    // 不再「先删草稿行再回填」：加载被会话守卫吞掉或失败时草稿行原位转正，
    // 避免保存后字段行消失 / 长时间不出现（2.10 根因 c）
    let reloaded = false;
    try {
      reloaded = await loadFormFields(formId);
    } catch {
      reloaded = false;
      ElMessage.warning('字段已保存，但列表刷新失败，请稍后刷新查看');
    }
    await loadFieldDefs();
    if (!reloaded) {
      formFields.value = formFields.value.map((f) =>
        isDraftField(f)
          ? { ...f, id: createdFfId, field_definition_id: createdFdId ?? f.field_definition_id, __draft: false }
          : f,
      );
      const realFf = formFields.value.find((f) => f.id === createdFfId);
      if (realFf) selectField(realFf);
    } else {
      if (!isCurrentDesignerHistoryContext(historyContext)) return true;
      if (isReordering.value) return true;
      const realFf = formFields.value.find((f) => f.id === createdFfId);
      if (realFf) selectField(realFf);
    }
    // 保存即一次字段创建；撤销=删除实例+条件清理定义，重做=复用原定义或按原快照重建。
    recordDesignerHistory(historyContext, {
      label: draft.__draftOrigin === 'copy' ? '复制字段' : '新建字段',
      ids: { ffId: createdFfId, fdId: createdFdId },
      undo: async (ids) => {
        if (restoreDefinitionPayload) {
          // 先恢复候选定义内容（其他表单同引用的定义保持内容一致），再删除实例
          await api.put(`/api/projects/${projectId}/field-definitions/${ids.fdId}`, restoreDefinitionPayload);
          api.invalidateCache(`/api/projects/${projectId}/field-definitions`);
        }
        const deleteCommand = buildDeleteProfileCommand({
          cleanupDefinitionId: definitionCreated ? ids.fdId : null,
        });
        const replayResult = await replayBindingProfile(historyContext, ids.ffId, deleteCommand);
        if (replayResult?.cleanup?.retained_in_use) {
          ElMessage.warning('字段定义已被其他表单引用，已保留定义');
        }
      },
      redo: async (ids, { remapId }) => {
        // 链接候选路径（有无定义级差异都原样重放捕获命令：existing 绑定 + 可选共享更新 + 实例 upsert）；
        // 新建定义路径：重放为 create_or_restore 复用原定义。
        const redoCommand = command.binding?.mode === 'existing'
          ? command
          : {
              ...command,
              definition_operation: {
                operation: 'create_or_restore',
                create_or_restore: {
                  definition: buildDefinitionPayload(editorState),
                  preferred_definition_id: ids.fdId,
                },
              },
              binding: { mode: 'operation_result' },
            };
        const redoResult = await api.post(`/api/forms/${formId}/field-profile`, redoCommand);
        remapId(ids.ffId, redoResult.form_field_id ?? redoResult.form_field?.id);
        remapId(ids.fdId, redoResult.final_definition_id ?? ids.fdId);
        await reloadAfterReplay(formId, { defs: true });
      },
    });
    return true;
  } catch (e) {
    if (e === 'cancel' || e === 'close') return false;
    ElMessage.error(e.message);
    return false;
  } finally {
    endFieldMembershipMutation();
    savingDraft.value = false;
  }
}

// 字段行点击选中入口：存在草稿且点击非草稿字段时先确认保存/丢弃。
async function onSelectFieldClick(ff) {
  const historyContext = captureDesignerHistoryContext();
  if (!historyContext) return;
  const currentField = formFields.value.find((field) => field.id === ff.id);
  if (!currentField) return;
  if (isDraftField(ff) || selectedFieldId.value === ff.id) {
    selectField(currentField);
    return;
  }
  const canLeaveFieldProp = await resolveFieldPropLeave({ actionText: '切换字段' });
  if (!isCurrentDesignerHistoryContext(historyContext)) return;
  if (!canLeaveFieldProp) return;
  // 从「表单属性」切到字段前，先处理未保存的表单属性
  if (!selectedFieldId.value) {
    const canLeaveFormProp = await resolveFormPropLeave({ actionText: '切换字段' });
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (!canLeaveFormProp) return;
  }
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (!proceed) return;
  }
  const fresh = formFields.value.find((field) => field.id === ff.id);
  if (fresh) selectField(fresh);
}

async function addLogRow() {
  if (designerHistory.busy.value || isReordering.value) return;
  if (!selectedForm.value) return;
  const historyContext = captureDesignerHistoryContext();
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (!proceed) return;
  }
  if (isReordering.value) return;
  const formId = historyContext.formId;
  beginFieldMembershipMutation();
  try {
    const created = await api.post(`/api/forms/${formId}/fields`, { is_log_row: 1, label_override: '以下为log行' });
    api.invalidateCache(`/api/forms/${formId}/fields`);
    if (!isCurrentDesignerHistoryContext(historyContext)) return;
    if (isReordering.value) return;
    await loadFormFields(formId);
    recordDesignerHistory(historyContext, {
      label: '添加log行提示',
      ids: { ffId: created.id },
      undo: async (ids) => {
        await api.del(`/api/form-fields/${ids.ffId}`);
        await reloadAfterReplay(formId);
      },
      redo: async (ids, { remapId }) => {
        const recreated = await api.post(`/api/forms/${formId}/fields`, {
          is_log_row: 1,
          label_override: '以下为log行',
        });
        remapId(ids.ffId, recreated.id);
        await reloadAfterReplay(formId);
      },
    });
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    endFieldMembershipMutation();
  }
}

// 选项字典快速CRUD
const showQuickAddCodelist = ref(false),
  quickCodelistName = ref(''),
  quickCodelistDescription = ref(''),
  quickCodelistOpts = ref([]),
  quickOptCode = ref(''),
  quickOptDecode = ref(''),
  quickAddCodelistSaving = ref(false);
function quickAddOptRow() {
  if (!quickOptDecode.value.trim()) return ElMessage.warning('请输入标签');
  const n = quickCodelistOpts.value.length;
  quickCodelistOpts.value.push({
    id: null,
    code: quickOptCode.value.trim() || `C.${n + 1}`,
    decode: quickOptDecode.value.trim(),
  });
  quickOptCode.value = `C.${n + 2}`;
  quickOptDecode.value = '';
}
async function quickDelOptRow(idx) {
  try {
    await confirmDelete(ElMessageBox.confirm, {
      targetText: `选项 "${quickCodelistOpts.value[idx]?.decode || idx + 1}"`,
    });
    quickCodelistOpts.value.splice(idx, 1);
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}
function closeQuickAddCodelist() {
  showQuickAddCodelist.value = false;
  quickCodelistName.value = '';
  quickCodelistDescription.value = '';
  quickCodelistOpts.value = [];
  quickOptCode.value = '';
  quickOptDecode.value = '';
  quickAddCodelistSaving.value = false;
}
function openQuickAddCodelist() {
  quickCodelistName.value = '';
  quickCodelistDescription.value = '';
  quickCodelistOpts.value = [];
  quickOptCode.value = 'C.1';
  quickOptDecode.value = '';
  quickAddCodelistSaving.value = false;
  showQuickAddCodelist.value = true;
}
async function quickAddCodelist() {
  if (quickAddCodelistSaving.value) return;

  const savedName = quickCodelistName.value.trim();
  if (!savedName) return ElMessage.warning('请输入字典名称');

  const normalizedOptions = quickCodelistOpts.value.map((opt) => ({
    ...opt,
    code: String(opt.code ?? '').trim(),
    decode: String(opt.decode ?? '').trim(),
  }));
  const invalidOptionIndex = normalizedOptions.findIndex((opt) => !opt.code || !opt.decode);
  if (invalidOptionIndex !== -1) return ElMessage.warning(`请完整填写第 ${invalidOptionIndex + 1} 行的编码和值标签`);

  quickAddCodelistSaving.value = true;
  try {
    quickCodelistName.value = savedName;
    quickCodelistOpts.value = normalizedOptions;
    const created = await api.post(`/api/projects/${props.projectId}/codelists`, {
      name: savedName,
      description: quickCodelistDescription.value,
      options: normalizedOptions.map((opt, index) => ({
        code: opt.code,
        decode: opt.decode,
        order_index: index + 1,
      })),
    });
    await loadCodelists();
    editProp.codelist_id = created.id;
    closeQuickAddCodelist();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    quickAddCodelistSaving.value = false;
  }
}

const showQuickEditCodelist = ref(false),
  quickEditCodelistId = ref(null),
  quickEditCodelistName = ref(''),
  quickEditCodelistDescription = ref(''),
  quickEditCodelistOpts = ref([]),
  quickEditOptCode = ref(''),
  quickEditOptDecode = ref(''),
  quickEditCodelistSaving = ref(false);
function openQuickEditCodelist() {
  if (!editProp.codelist_id) return;
  const cl = codelists.value.find((c) => c.id === editProp.codelist_id);
  if (!cl) return;
  quickEditCodelistId.value = cl.id;
  quickEditCodelistName.value = cl.name;
  quickEditCodelistDescription.value = cl.description || '';
  quickEditCodelistOpts.value = (cl.options || []).map((o) => ({
    id: o.id,
    code: o.code,
    decode: o.decode,
  }));
  quickEditOptCode.value = `C.${(cl.options || []).length + 1}`;
  quickEditOptDecode.value = '';
  showQuickEditCodelist.value = true;
}
function quickEditAddOptRow() {
  if (!quickEditOptDecode.value.trim()) return ElMessage.warning('请输入标签');
  const n = quickEditCodelistOpts.value.length;
  quickEditCodelistOpts.value.push({
    id: null,
    code: quickEditOptCode.value.trim() || `C.${n + 1}`,
    decode: quickEditOptDecode.value.trim(),
  });
  quickEditOptCode.value = `C.${n + 2}`;
  quickEditOptDecode.value = '';
}
async function quickEditDelOptRow(idx) {
  try {
    await confirmDelete(ElMessageBox.confirm, {
      targetText: `选项 "${quickEditCodelistOpts.value[idx]?.decode || idx + 1}"`,
    });
    quickEditCodelistOpts.value.splice(idx, 1);
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}
function closeQuickEditCodelist() {
  showQuickEditCodelist.value = false;
  quickEditCodelistId.value = null;
  quickEditCodelistName.value = '';
  quickEditCodelistDescription.value = '';
  quickEditCodelistOpts.value = [];
  quickEditOptCode.value = '';
  quickEditOptDecode.value = '';
}
async function quickSaveCodelist() {
  if (quickEditCodelistSaving.value) return;

  const savedName = quickEditCodelistName.value.trim();
  if (!savedName) return ElMessage.warning('请输入字典名称');

  const normalizedOptions = quickEditCodelistOpts.value.map((opt) => ({
    ...opt,
    code: String(opt.code ?? '').trim(),
    decode: String(opt.decode ?? '').trim(),
  }));
  const invalidOptionIndex = normalizedOptions.findIndex((opt) => !opt.code || !opt.decode);
  if (invalidOptionIndex !== -1) return ElMessage.warning(`请完整填写第 ${invalidOptionIndex + 1} 行的编码和值标签`);

  quickEditCodelistSaving.value = true;
  try {
    const refs = await api.get(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/references`);
    if (refs.length) {
      const msg = truncRefs(refs.map((r) => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`));
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' });
    }

    quickEditCodelistName.value = savedName;
    quickEditCodelistOpts.value = normalizedOptions;

    await api.put(`/api/projects/${props.projectId}/codelists/${quickEditCodelistId.value}/snapshot`, {
      name: savedName,
      description: quickEditCodelistDescription.value,
      options: normalizedOptions.map((opt) => ({
        id: opt.id,
        code: opt.code,
        decode: opt.decode,
      })),
    });

    api.invalidateCache(`/api/projects/${props.projectId}/codelists`);
    await loadCodelists();
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`);
      await loadFormFields();
      const updated = formFields.value.find((f) => f.id === selectedFieldId.value);
      if (updated && !isFieldPropDirty.value) selectField(updated);
    }
    refreshKey.value++;
    closeQuickEditCodelist();
    ElMessage.success('保存成功');
  } catch (e) {
    if (e === 'cancel') return;
    api.invalidateCache(`/api/projects/${props.projectId}/codelists`);
    await loadCodelists();
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`);
      await loadFormFields();
      const updated = formFields.value.find((f) => f.id === selectedFieldId.value);
      if (updated && !isFieldPropDirty.value) selectField(updated);
    }
    refreshKey.value++;
    closeQuickEditCodelist();
    ElMessage.error(`保存失败：${e.message}。已刷新为最新字典数据，请重新检查后再编辑。`);
  } finally {
    quickEditCodelistSaving.value = false;
  }
}

const showQuickAddUnit = ref(false),
  quickUnitSymbol = ref('');
async function quickAddUnit() {
  if (!quickUnitSymbol.value.trim()) return ElMessage.warning('请输入单位符号');
  try {
    const created = await api.post(`/api/projects/${props.projectId}/units`, { symbol: quickUnitSymbol.value.trim() });
    await loadUnits();
    editProp.unit_id = created.id;
    showQuickAddUnit.value = false;
    quickUnitSymbol.value = '';
  } catch (e) {
    ElMessage.error(e.message);
  }
}

// 拖拽排序（表单）
const formsTableRef = ref(null),
  isFormsFiltered = computed(() => searchForm.value.trim().length > 0),
  formsReorderUrl = computed(() => `/api/projects/${props.projectId}/forms/reorder`);
const { initSortable: initFormsSortable } = useSortableTable(formsTableRef, forms, formsReorderUrl, {
  reloadFn: reloadForms,
  isFiltered: isFormsFiltered,
  renderList: filteredForms,
});
function applyForms(nextForms) {
  const selectedFormId = selectedForm.value?.id ?? null;
  forms.value = nextForms;
  if (selectedFormId != null) {
    selectedForm.value = nextForms.find((item) => item.id === selectedFormId) || null;
  }
}
const {
  editingId: editingFormId,
  editingValue: editingFormOrdinal,
  inputRef: formOrdinalInputRef,
  startEdit: startFormOrdinalEdit,
  commitEdit: commitFormOrdinalEdit,
  cancelEdit: cancelFormOrdinalEdit,
} = useOrdinalQuickEdit(forms, formsReorderUrl, {
  applyList: applyForms,
  isFiltered: isFormsFiltered,
  reloadFn: reloadForms,
  renderList: filteredForms,
});

async function ensureDesignerAuxiliaryDataLoaded({ refreshFieldDefs = false } = {}) {
  const loadSession = designerAuxiliaryLoadSession;
  const projectId = props.projectId;
  const isStaleLoad = () => loadSession !== designerAuxiliaryLoadSession || projectId !== props.projectId;
  if (designerAuxiliaryLoaded.value) {
    if (!refreshFieldDefs) return;
    designerAuxiliaryLoadError.value = '';
    try {
      const loaded = await refreshDesignerFieldDefinitions(projectId);
      if (!loaded || isStaleLoad()) throw new Error('项目已切换，请重新打开设计器');
    } catch (error) {
      designerAuxiliaryLoadError.value = error?.message || '加载失败';
      throw error;
    }
    return;
  }
  if (designerAuxiliaryLoading.value) return;
  designerAuxiliaryLoading.value = true;
  designerAuxiliaryLoadError.value = '';
  const loadFieldDefinitions = refreshFieldDefs ? refreshDesignerFieldDefinitions : loadFieldDefs;
  try {
    const loaded = await Promise.all([loadFieldDefinitions(projectId), loadCodelists(projectId), loadUnits(projectId)]);
    if (loaded.some((item) => item === false) || isStaleLoad()) throw new Error('项目已切换，请重新打开设计器');
    designerAuxiliaryLoaded.value = true;
  } catch (error) {
    if (!isStaleLoad()) designerAuxiliaryLoadError.value = error?.message || '加载失败';
    throw error;
  } finally {
    if (!isStaleLoad()) designerAuxiliaryLoading.value = false;
  }
}

// 焦点在文本输入控件内时让出 Ctrl+Z/Y 给浏览器原生撤销，避免与字段属性编辑冲突。
function isEditableTarget(target) {
  if (!target || typeof target.tagName !== 'string') return false;
  const tag = target.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}
function handleHistoryKeydown(event) {
  if (!showDesigner.value) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  if (isEditableTarget(event.target)) return;
  const key = (event.key || '').toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    handleUndo();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    handleRedo();
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', handleHistoryKeydown);
  await loadForms();
  nextTick(() => initFormsSortable());
  void migrateLegacyForceLandscape(props.projectId);
});
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', handleHistoryKeydown);
  void annotationDrag.dispose();
});
watch(
  () => props.projectId,
  async (newProjectId, previousProjectId) => {
    if (newProjectId === previousProjectId) return;
    invalidateFormSelectionSession();
    const annotationFlushSucceeded = await flushAnnotationPositionSave({ cancelActiveDrag: true });
    if (!annotationFlushSucceeded) return;
    const canLeaveFieldProp = await resolveFieldPropLeave({
      resetOptions: { preserveEditor: true },
      actionText: '切换项目',
    });
    if (!canLeaveFieldProp) {
      fieldPropProjectId.value = previousProjectId;
      return;
    }
    // 防御：App 路径已走 canLeaveProject，此处补 form leave 避免未来绕过静默丢表单属性
    const canLeaveFormProp = await resolveFormPropLeave({ actionText: '切换项目' });
    if (!canLeaveFormProp) {
      fieldPropProjectId.value = previousProjectId;
      return;
    }
    fieldPropProjectId.value = newProjectId;
    designerAuxiliaryLoadSession += 1;
    designerAuxiliaryLoaded.value = false;
    designerAuxiliaryLoading.value = false;
    designerAuxiliaryLoadError.value = '';
    selectedForm.value = null;
    formFields.value = [];
    selectedFieldId.value = null;
    loadForms();
  },
);

async function resolveDesignerLeave({ actionText }) {
  if (designerHistory.busy.value || isReordering.value || savingDraft.value) return false;
  formSelectionAttempt += 1;
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!proceed) return false;
  }
  const annotationFlushSucceeded = await flushAnnotationPositionSave({ cancelActiveDrag: true });
  if (!annotationFlushSucceeded && selectedForm.value?.id) return false;
  const canLeaveFieldProp = await resolveFieldPropLeave({ resetOptions: { preserveEditor: true }, actionText });
  if (!canLeaveFieldProp) return false;
  return resolveFormPropLeave({ actionText });
}

async function canLeaveProject() {
  return resolveDesignerLeave({ actionText: '切换项目' });
}

async function canLeaveTab() {
  // Tab leave keeps FormDesignerTab mounted (lazy tabs). After a dirty-prop discard
  // with preserveEditor, baseline is cleared but editProp still holds the abandoned
  // values — rehydrate so returning to the designer does not show pseudo-discarded edits.
  const ok = await resolveDesignerLeave({ actionText: '切换标签页' });
  if (
    ok &&
    selectedFieldId.value &&
    selectedFieldId.value !== DRAFT_FIELD_ID &&
    !fieldPropBaseline.value
  ) {
    const ff = getSelectedFormField();
    if (ff) selectField(ff);
    else resetFieldPropAutoSaveState();
  }
  return ok;
}

async function handleDesignerBeforeClose(done) {
  const canLeaveFieldProp = await resolveFieldPropLeave({ actionText: '关闭设计窗口' });
  if (!canLeaveFieldProp) return;
  const canLeaveFormProp = await resolveFormPropLeave({ actionText: '关闭设计窗口' });
  if (canLeaveFormProp) {
    refreshPreviewOverrideState(renderGroupsView.value, 'main');
    done();
  }
}

async function openDesigner() {
  markPerfStart('designer_open_fullscreen', { project_id: props.projectId, form_id: selectedForm.value?.id ?? null });
  try {
    await ensureDesignerAuxiliaryDataLoaded({ refreshFieldDefs: true });
    syncFormPropEditor(selectedForm.value);
    showDesigner.value = true;
    refreshDesignerPreviewOverrides();
    markPerfEnd('designer_open_fullscreen', { project_id: props.projectId, form_id: selectedForm.value?.id ?? null });
  } catch (error) {
    markPerfEnd('designer_open_fullscreen', {
      project_id: props.projectId,
      form_id: selectedForm.value?.id ?? null,
      error: true,
    });
    ElMessage.error(`设计器辅助数据加载失败：${error?.message || designerAuxiliaryLoadError.value || '未知错误'}`);
  }
}

defineExpose({
  canLeaveProject,
  canLeaveTab,
  getForms: () => forms.value,
  async selectFormById(formId) {
    if (formId == null) return;
    await loadForms();
    const target = forms.value.find((f) => f.id === formId);
    if (!target) return;
    formsTableRef.value?.setCurrentRow(target);
    await selectForm(target);
  },
});

function openAddForm() {
  newFormCode.value = genCode('FORM');
  showAddForm.value = true;
}
</script>

<template>
  <div class="form-designer">
    <div class="fd-formlist">
      <div class="list-toolbar">
        <el-tooltip content="新建表单" placement="top">
          <el-button type="primary" size="small" :icon="Plus" aria-label="新建表单" @click="openAddForm" />
        </el-tooltip>
        <el-button type="warning" size="small" @click="emit('import-template')">导入模板</el-button>
        <el-tooltip content="批量删除表单" placement="top">
          <el-button type="danger" size="small" :icon="Delete" aria-label="批量删除表单" :disabled="!selForms.length" @click="batchDelForms" />
        </el-tooltip>
        <el-input v-model="searchForm" placeholder="搜索表单..." clearable size="small" style="width: 180px; flex: 1 1 auto" />
      </div>
      <el-table
        ref="formsTableRef"
        :data="filteredForms"
        size="small"
        border
        highlight-current-row
        row-key="id"
        style="width: 100%"
        height="100%"
        @current-change="onFormsTableCurrentChange"
        @selection-change="(r) => (selForms = r)"
      >
        <el-table-column v-if="!isFormsFiltered" width="32"
          ><template #default
            ><span class="drag-handle" style="cursor: move; color: var(--color-text-muted)">☰</span></template
          ></el-table-column
        >
        <el-table-column type="selection" width="40" />
        <el-table-column label="序号" width="100">
          <template #default="{ row }"
            ><el-input-number
              v-if="editingFormId === row.id"
              ref="formOrdinalInputRef"
              v-model="editingFormOrdinal"
              :min="1"
              :max="filteredForms.length"
              :controls="false"
              size="small"
              style="width: 80px"
              @click.stop
              @keyup.enter.stop="commitFormOrdinalEdit"
              @keydown.esc.stop.prevent="cancelFormOrdinalEdit"
              @blur="cancelFormOrdinalEdit"
            />
            <button
              v-else
              type="button"
              style="border: none; background: transparent; padding: 0; cursor: pointer"
              @click.stop
              @dblclick.stop="startFormOrdinalEdit(row)"
            >
              <span class="ordinal-cell">{{ row.order_index }}</span>
            </button></template
          >
        </el-table-column>
        <el-table-column v-if="editMode" prop="code" label="OID" min-width="110" show-overflow-tooltip />
        <el-table-column prop="name" label="表单名称" show-overflow-tooltip />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="复制" placement="top">
              <el-button size="small" link :icon="DocumentCopy" aria-label="复制" @click.stop="copyForm(row)" />
            </el-tooltip>
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" link :icon="EditPen" aria-label="编辑" @click.stop="openEditForm(row)" />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button type="danger" size="small" link :icon="Delete" aria-label="删除" @click.stop="delForm(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="fd-right">
      <!-- 工具栏槽位在卡片外，与左侧表单列表工具栏对齐（左表格/右预览卡顶边一致） -->
      <div class="pane-tool-slot fd-canvas-toolbar">
        <el-button v-if="selectedForm" size="small" type="primary" @click="openDesigner">设计表单</el-button>
        <el-switch
          v-if="selectedForm && editMode"
          v-model="viewMode"
          size="small"
          inline-prompt
          active-text="aCRF"
          inactive-text="eCRF"
          :active-value="'aCRF'"
          :inactive-value="'eCRF'"
        />
        <div class="fd-canvas-header-main">
          <span class="fd-canvas-form-title">{{ selectedForm?.name || '未选择表单' }}</span>
          <el-tooltip
            v-if="headerDesignNotesSummary"
            effect="dark"
            placement="bottom"
            popper-class="fd-notes-tooltip"
          >
            <template #content>
              <div class="fd-notes-tooltip-content">{{ headerDesignNotesTooltip }}</div>
            </template>
            <span class="fd-canvas-header-notes" data-test="canvas-notes-summary">{{
              headerDesignNotesSummary
            }}</span>
          </el-tooltip>
        </div>
        <span class="fd-canvas-header-count">共 {{ formFields.length }} 个字段</span>
      </div>
      <div class="fd-canvas" style="flex: 1">
        <div class="word-preview">
          <div
            :class="['word-page', 'form-designer-word-page', 'designer-scaled-word-page', { landscape: landscapeMode }]"
          >
            <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
            <template v-else>
              <div class="wp-form-title-row">
                <div class="wp-form-title">{{ selectedForm.name }}</div>
                <span
                  v-if="showAcrfAnnotations && getFormDomainAnnotationText(selectedForm)"
                  :class="[
                    'wp-acrf-annotation',
                    'wp-acrf-annotation--form',
                    { 'wp-acrf-annotation--interactive': isAnnotationDraggable(getFormAnnotationTarget(selectedForm)) },
                  ]"
                  :style="
                    getAnnotationStyle(
                      getFormDomainAnnotationText(selectedForm),
                      ANNOTATION_KIND_FORM,
                      getFormAnnotationTarget(selectedForm),
                    )
                  "
                  @pointerdown="(event) => onAnnotationPointerDown(getFormAnnotationTarget(selectedForm), event)"
                >
                  <span class="wp-acrf-annotation__text">{{ getFormDomainAnnotationText(selectedForm) }}</span>
                  <button
                    type="button"
                    class="wp-acrf-annotation-reset"
                    :disabled="!hasAnnotationOverrideForTarget(getFormAnnotationTarget(selectedForm))"
                    aria-label="重置表单 domain 标注位置"
                    @pointerdown.stop
                    @click.stop="resetAnnotationPosition(getFormAnnotationTarget(selectedForm))"
                  >
                    R
                  </button>
                </span>
              </div>
              <div v-if="!formFields.length" class="wp-empty">暂无字段</div>
              <div class="wp-body">
                <div class="wp-main">
                  <template v-for="(gv, gi) in renderGroupsView" :key="gi">
                    <div v-if="gv.type === 'unified'" class="col-resize-host unified-host">
                      <table class="unified-table">
                        <colgroup v-if="getResizer('unified', gv.colCount, gi, gv, 'main')">
                          <col
                            v-for="(r, ci) in getResizer('unified', gv.colCount, gi, gv, 'main').colRatios"
                            :key="ci"
                            :style="{ width: r * 100 + '%' }"
                          />
                        </colgroup>
                        <template v-for="seg in gv.segments" :key="seg.fields[0]?.id">
                          <tr
                            v-if="seg.type === 'regular_field'"
                            class="row-resize-host"
                            :style="
                              getRowHeightStyle(getRowResizer('unified', gv), getUnifiedRegularRowKey(seg.fields[0]))
                            "
                            @dblclick="openQuickEdit(seg.fields[0])"
                          >
                            <td
                              class="unified-label row-resize-anchor"
                              :colspan="gv.labelValueSpans.labelSpan"
                              :style="getFormFieldLabelPreviewStyle(seg.fields[0])"
                            >
                              {{ getFormFieldDisplayLabel(seg.fields[0]) }}
                              <span
                                class="row-resizer-handle"
                                @pointerdown="
                                  (e) =>
                                    getRowResizer('unified', gv).onResizeStart(
                                      getUnifiedRegularRowKey(seg.fields[0]),
                                      e,
                                    )
                                "
                              ></span>
                            </td>
                            <td
                              class="unified-value row-resize-anchor"
                              :colspan="gv.labelValueSpans.valueSpan"
                              :style="getFormFieldPreviewStyle(seg.fields[0])"
                            >
                              <span v-html="renderCellHtml(seg.fields[0])"></span>
                              <span
                                v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                                :class="[
                                  'wp-acrf-annotation',
                                  'wp-acrf-annotation--field',
                                  {
                                    'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                      getFieldAnnotationTarget(seg.fields[0]),
                                    ),
                                  },
                                ]"
                                :style="
                                  getAnnotationStyle(
                                    getFieldOidAnnotationText(seg.fields[0]),
                                    ANNOTATION_KIND_FIELD,
                                    getFieldAnnotationTarget(seg.fields[0]),
                                  )
                                "
                                @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)"
                              >
                                <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(seg.fields[0]) }}</span>
                                <button
                                  type="button"
                                  class="wp-acrf-annotation-reset"
                                  :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                                  aria-label="重置字段标注位置"
                                  @pointerdown.stop
                                  @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                                >
                                  R
                                </button>
                              </span>
                              <span
                                class="row-resizer-handle"
                                @pointerdown="
                                  (e) =>
                                    getRowResizer('unified', gv).onResizeStart(
                                      getUnifiedRegularRowKey(seg.fields[0]),
                                      e,
                                    )
                                "
                              ></span>
                            </td>
                          </tr>
                          <tr
                            v-else-if="seg.type === 'full_row'"
                            class="row-resize-host"
                            :style="
                              getRowHeightStyle(getRowResizer('unified', gv), getUnifiedFullRowKey(seg.fields[0]))
                            "
                            @dblclick="openQuickEdit(seg.fields[0])"
                          >
                            <td
                              :class="{
                                'wp-structure-label--multiline': seg.fields[0].field_definition?.field_type === '标签',
                                'row-resize-anchor': true,
                              }"
                              :colspan="gv.colCount"
                              :style="getFormFieldLabelPreviewStyle(seg.fields[0], { structure: true })"
                            >
                              {{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}
                              <span
                                v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                                :class="[
                                  'wp-acrf-annotation',
                                  'wp-acrf-annotation--field',
                                  {
                                    'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                      getFieldAnnotationTarget(seg.fields[0]),
                                    ),
                                  },
                                ]"
                                :style="
                                  getAnnotationStyle(
                                    getFieldOidAnnotationText(seg.fields[0]),
                                    ANNOTATION_KIND_FIELD,
                                    getFieldAnnotationTarget(seg.fields[0]),
                                  )
                                "
                                @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)"
                              >
                                <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(seg.fields[0]) }}</span>
                                <button
                                  type="button"
                                  class="wp-acrf-annotation-reset"
                                  :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                                  aria-label="重置字段标注位置"
                                  @pointerdown.stop
                                  @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                                >
                                  R
                                </button>
                              </span>
                              <span
                                class="row-resizer-handle"
                                @pointerdown="
                                  (e) =>
                                    getRowResizer('unified', gv).onResizeStart(getUnifiedFullRowKey(seg.fields[0]), e)
                                "
                              ></span>
                            </td>
                          </tr>
                          <template v-else-if="seg.type === 'inline_block'">
                            <tr
                              class="row-resize-host"
                              :style="
                                getRowHeightStyle(
                                  getRowResizer('unified', gv),
                                  getUnifiedInlineHeaderRowKey(seg.fields),
                                )
                              "
                            >
                              <td
                                v-for="(ff, idx) in seg.fields"
                                :key="ff.id"
                                class="wp-inline-header row-resize-anchor"
                                :colspan="seg.mergeSpans[idx]"
                                :style="getFormFieldLabelPreviewStyle(ff)"
                                @dblclick="openQuickEdit(ff)"
                              >
                                {{ getFormFieldDisplayLabel(ff) }}
                                <span
                                  v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                  :class="[
                                    'wp-acrf-annotation',
                                    'wp-acrf-annotation--field',
                                    'wp-acrf-annotation--inline-header',
                                    {
                                      'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                        getFieldAnnotationTarget(ff),
                                      ),
                                    },
                                  ]"
                                  :style="
                                    getAnnotationStyle(
                                      getFieldOidAnnotationText(ff),
                                      ANNOTATION_KIND_INLINE_HEADER,
                                      getFieldAnnotationTarget(ff),
                                    )
                                  "
                                  @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                                >
                                  <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                  <button
                                    type="button"
                                    class="wp-acrf-annotation-reset"
                                    :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                    aria-label="重置字段标注位置"
                                    @pointerdown.stop
                                    @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                  >
                                    R
                                  </button>
                                </span>
                                <span
                                  class="row-resizer-handle"
                                  @pointerdown="
                                    (e) =>
                                      getRowResizer('unified', gv).onResizeStart(
                                        getUnifiedInlineHeaderRowKey(seg.fields),
                                        e,
                                      )
                                  "
                                ></span>
                              </td>
                            </tr>
                            <tr
                              v-for="(row, ri) in seg.inlineRows"
                              :key="ri"
                              class="row-resize-host"
                              :style="
                                getRowHeightStyle(
                                  getRowResizer('unified', gv),
                                  getUnifiedInlineDataRowKey(seg.fields, ri),
                                )
                              "
                            >
                              <td
                                v-for="(cell, ci) in row"
                                :key="ci"
                                class="wp-ctrl row-resize-anchor"
                                :colspan="seg.mergeSpans[ci]"
                                :style="getFormFieldPreviewStyle(seg.fields[ci])"
                                @dblclick="openQuickEdit(seg.fields[ci])"
                              >
                                <span v-html="cell"></span>
                                <span
                                  class="row-resizer-handle"
                                  @pointerdown="
                                    (e) =>
                                      getRowResizer('unified', gv).onResizeStart(
                                        getUnifiedInlineDataRowKey(seg.fields, ri),
                                        e,
                                      )
                                  "
                                ></span>
                              </td>
                            </tr>
                          </template>
                        </template>
                      </table>
                      <template v-if="getResizer('unified', gv.colCount, gi, gv, 'main')"
                        ><div
                          v-for="bi in getResizer('unified', gv.colCount, gi, gv, 'main').colRatios.length - 1"
                          :key="bi"
                          class="resizer-handle"
                          :style="{
                            left:
                              cumRatio(getResizer('unified', gv.colCount, gi, gv, 'main').colRatios, bi - 1) * 100 +
                              '%',
                          }"
                          @pointerdown="
                            (e) => getResizer('unified', gv.colCount, gi, gv, 'main').onResizeStart(bi - 1, e)
                          "
                        ></div>
                        <div
                          v-if="getResizer('unified', gv.colCount, gi, gv, 'main').snapGuideX !== null"
                          class="snap-guide"
                          :style="{ left: getResizer('unified', gv.colCount, gi, gv, 'main').snapGuideX + 'px' }"
                        ></div
                      ></template>
                    </div>
                    <div v-else-if="gv.type === 'normal'" class="col-resize-host">
                      <table>
                        <colgroup v-if="getResizer('normal', 2, gi, gv, 'main')">
                          <col
                            v-for="(r, ci) in getResizer('normal', 2, gi, gv, 'main').colRatios"
                            :key="ci"
                            :style="{ width: r * 100 + '%' }"
                          />
                        </colgroup>
                        <template v-for="ff in gv.fields" :key="ff.id">
                          <tr
                            v-if="ff.field_definition?.field_type === '标签'"
                            class="row-resize-host"
                            :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                            @dblclick="openQuickEdit(ff)"
                          >
                            <td
                              class="wp-structure-label--multiline row-resize-anchor"
                              colspan="2"
                              :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                            >
                              {{ getFormFieldDisplayLabel(ff) }}
                              <span
                                v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                :class="[
                                  'wp-acrf-annotation',
                                  'wp-acrf-annotation--field',
                                  {
                                    'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                      getFieldAnnotationTarget(ff),
                                    ),
                                  },
                                ]"
                                :style="
                                  getAnnotationStyle(
                                    getFieldOidAnnotationText(ff),
                                    ANNOTATION_KIND_FIELD,
                                    getFieldAnnotationTarget(ff),
                                  )
                                "
                                @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                              >
                                <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                <button
                                  type="button"
                                  class="wp-acrf-annotation-reset"
                                  :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                  aria-label="重置字段标注位置"
                                  @pointerdown.stop
                                  @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                >
                                  R
                                </button>
                              </span>
                              <span
                                class="row-resizer-handle"
                                @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                              ></span>
                            </td>
                          </tr>
                          <tr
                            v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"
                            class="row-resize-host"
                            :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                            @dblclick="openQuickEdit(ff)"
                          >
                            <td
                              colspan="2"
                              class="row-resize-anchor"
                              :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                            >
                              {{ getFormFieldDisplayLabel(ff) || '以下为log行' }}
                              <span
                                v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                :class="[
                                  'wp-acrf-annotation',
                                  'wp-acrf-annotation--field',
                                  {
                                    'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                      getFieldAnnotationTarget(ff),
                                    ),
                                  },
                                ]"
                                :style="
                                  getAnnotationStyle(
                                    getFieldOidAnnotationText(ff),
                                    ANNOTATION_KIND_FIELD,
                                    getFieldAnnotationTarget(ff),
                                  )
                                "
                                @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                              >
                                <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                <button
                                  type="button"
                                  class="wp-acrf-annotation-reset"
                                  :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                  aria-label="重置字段标注位置"
                                  @pointerdown.stop
                                  @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                >
                                  R
                                </button>
                              </span>
                              <span
                                class="row-resizer-handle"
                                @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                              ></span>
                            </td>
                          </tr>
                          <tr
                            v-else
                            class="row-resize-host"
                            :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                            @dblclick="openQuickEdit(ff)"
                          >
                            <td class="wp-label row-resize-anchor" :style="getFormFieldLabelPreviewStyle(ff)">
                              {{ getFormFieldDisplayLabel(ff) }}
                              <span
                                class="row-resizer-handle"
                                @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                              ></span>
                            </td>
                            <td class="wp-ctrl row-resize-anchor" :style="getFormFieldPreviewStyle(ff)">
                              <span
                                v-html="
                                  renderCellHtml(ff, normalFillChars(gi, gv, 'main'))
                                "
                              ></span>
                              <span
                                v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                :class="[
                                  'wp-acrf-annotation',
                                  'wp-acrf-annotation--field',
                                  {
                                    'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                      getFieldAnnotationTarget(ff),
                                    ),
                                  },
                                ]"
                                :style="
                                  getAnnotationStyle(
                                    getFieldOidAnnotationText(ff),
                                    ANNOTATION_KIND_FIELD,
                                    getFieldAnnotationTarget(ff),
                                  )
                                "
                                @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                              >
                                <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                <button
                                  type="button"
                                  class="wp-acrf-annotation-reset"
                                  :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                  aria-label="重置字段标注位置"
                                  @pointerdown.stop
                                  @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                >
                                  R
                                </button>
                              </span>
                              <span
                                class="row-resizer-handle"
                                @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                              ></span>
                            </td>
                          </tr>
                        </template>
                      </table>
                      <template v-if="getResizer('normal', 2, gi, gv, 'main')"
                        ><div
                          v-for="bi in getResizer('normal', 2, gi, gv, 'main').colRatios.length - 1"
                          :key="bi"
                          class="resizer-handle"
                          :style="{
                            left: cumRatio(getResizer('normal', 2, gi, gv, 'main').colRatios, bi - 1) * 100 + '%',
                          }"
                          @pointerdown="(e) => getResizer('normal', 2, gi, gv, 'main').onResizeStart(bi - 1, e)"
                        ></div>
                        <div
                          v-if="getResizer('normal', 2, gi, gv, 'main').snapGuideX !== null"
                          class="snap-guide"
                          :style="{ left: getResizer('normal', 2, gi, gv, 'main').snapGuideX + 'px' }"
                        ></div
                      ></template>
                    </div>
                    <div v-else class="col-resize-host inline-host">
                      <table class="inline-table">
                        <colgroup v-if="getResizer('inline', gv.fields.length, gi, gv, 'main')">
                          <col
                            v-for="(r, ci) in getResizer('inline', gv.fields.length, gi, gv, 'main').colRatios"
                            :key="ci"
                            :style="{ width: r * 100 + '%' }"
                          />
                        </colgroup>
                        <tr
                          class="row-resize-host"
                          :style="getRowHeightStyle(getRowResizer('inline', gv), getInlineHeaderRowKey(gv.fields))"
                        >
                          <td
                            v-for="ff in gv.fields"
                            :key="ff.id"
                            class="wp-inline-header row-resize-anchor"
                            :style="getFormFieldLabelPreviewStyle(ff)"
                            @dblclick="openQuickEdit(ff)"
                          >
                            {{ getFormFieldDisplayLabel(ff) }}
                            <span
                              v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                              :class="[
                                'wp-acrf-annotation',
                                'wp-acrf-annotation--field',
                                'wp-acrf-annotation--inline-header',
                                {
                                  'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                    getFieldAnnotationTarget(ff),
                                  ),
                                },
                              ]"
                              :style="
                                getAnnotationStyle(
                                  getFieldOidAnnotationText(ff),
                                  ANNOTATION_KIND_INLINE_HEADER,
                                  getFieldAnnotationTarget(ff),
                                )
                              "
                              @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                            >
                              <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                              <button
                                type="button"
                                class="wp-acrf-annotation-reset"
                                :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                aria-label="重置字段标注位置"
                                @pointerdown.stop
                                @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                              >
                                R
                              </button>
                            </span>
                            <span
                              class="row-resizer-handle"
                              @pointerdown="
                                (e) => getRowResizer('inline', gv).onResizeStart(getInlineHeaderRowKey(gv.fields), e)
                              "
                            ></span>
                          </td>
                        </tr>
                        <tr
                          v-for="(row, ri) in gv.inlineRows"
                          :key="ri"
                          class="row-resize-host"
                          :style="getRowHeightStyle(getRowResizer('inline', gv), getInlineDataRowKey(gv.fields, ri))"
                        >
                          <td
                            v-for="(cell, ci) in row"
                            :key="ci"
                            class="wp-ctrl row-resize-anchor"
                            :style="getFormFieldPreviewStyle(gv.fields[ci])"
                            @dblclick="openQuickEdit(gv.fields[ci])"
                          >
                            <span v-html="cell"></span>
                            <span
                              class="row-resizer-handle"
                              @pointerdown="
                                (e) => getRowResizer('inline', gv).onResizeStart(getInlineDataRowKey(gv.fields, ri), e)
                              "
                            ></span>
                          </td>
                        </tr>
                      </table>
                      <template v-if="getResizer('inline', gv.fields.length, gi, gv, 'main')"
                        ><div
                          v-for="bi in getResizer('inline', gv.fields.length, gi, gv, 'main').colRatios.length - 1"
                          :key="bi"
                          class="resizer-handle"
                          :style="{
                            left:
                              cumRatio(getResizer('inline', gv.fields.length, gi, gv, 'main').colRatios, bi - 1) * 100 +
                              '%',
                          }"
                          @pointerdown="
                            (e) => getResizer('inline', gv.fields.length, gi, gv, 'main').onResizeStart(bi - 1, e)
                          "
                        ></div>
                        <div
                          v-if="getResizer('inline', gv.fields.length, gi, gv, 'main').snapGuideX !== null"
                          class="snap-guide"
                          :style="{ left: getResizer('inline', gv.fields.length, gi, gv, 'main').snapGuideX + 'px' }"
                        ></div
                      ></template>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="showDesigner"
      :before-close="handleDesignerBeforeClose"
      :close-on-click-modal="false"
      fullscreen
      class="designer-dialog"
    >
      <template #header="{ titleId, titleClass }">
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- blank header click returns to form props -->
        <div class="designer-dialog-header" @click="onDesignerBlankClick">
          <div class="designer-dialog-header-main">
            <span :id="titleId" :class="[titleClass, 'designer-dialog-title']">
              <span class="designer-dialog-title-prefix">设计：</span>
              <el-select
                data-test="designer-form-switch"
                class="designer-form-switch"
                size="small"
                filterable
                teleported
                :model-value="selectedForm?.id ?? undefined"
                placeholder="选择表单"
                :disabled="designerHistory.busy.value || isReordering || savingDraft"
                @change="onSwitchFormFromDropdown"
              >
                <el-option
                  v-for="f in orderedForms"
                  :key="f.id"
                  :label="f.name"
                  :value="f.id"
                />
              </el-select>
            </span>
            <el-switch
              v-if="editMode"
              v-model="viewMode"
              inline-prompt
              active-text="aCRF"
              inactive-text="eCRF"
              :active-value="'aCRF'"
              :inactive-value="'eCRF'"
            />
            <el-tooltip content="模板字段查询" placement="top" :show-after="300">
              <el-button
                v-if="editMode"
                size="small"
                data-test="designer-template-field-search"
                aria-label="模板字段查询"
                @click="emit('open-template-field-search')"
                ><el-icon aria-hidden="true"><Search /></el-icon
              ></el-button>
            </el-tooltip>
          </div>
        </div>
      </template>
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- blank designer click returns to form props -->
      <div class="designer-shell" :style="{ ...mainSplitStyle, ...leftSplitStyle }" @click="onDesignerBlankClick">
            <div class="designer-fields-panel">
              <div class="fd-canvas-header">
                <el-tooltip content="新建字段" placement="top" :show-after="300"
                  ><el-button
                    size="small"
                    type="primary"
                    data-test="designer-new-field"
                    aria-label="新建字段"
                    :disabled="designerHistory.busy.value || isReordering.value"
                    @click="newField"
                    ><el-icon aria-hidden="true"><Plus /></el-icon></el-button
                  ></el-tooltip
                ><el-tooltip v-if="hasDraft" content="保存新增字段" placement="top" :show-after="300"
                  ><el-button
                    size="small"
                    type="success"
                    data-test="designer-save-draft"
                    aria-label="保存新增字段"
                    :loading="savingDraft"
                    :disabled="designerHistory.busy.value"
                    @click="saveDraftField"
                    ><el-icon aria-hidden="true"><Check /></el-icon></el-button
                  ></el-tooltip
                ><el-tooltip content="添加“以下为log行”提示" placement="top" :show-after="300"
                  ><el-button
                    size="small"
                    data-test="designer-add-log-row"
                    aria-label="添加“以下为log行”提示"
                    :disabled="designerHistory.busy.value"
                    @click="addLogRow"
                    ><el-icon aria-hidden="true"><DocumentAdd /></el-icon></el-button
                  ></el-tooltip
                ><el-tooltip content="撤回" placement="top" :show-after="300"
                  ><el-button
                    size="small"
                    data-test="designer-undo"
                    aria-label="撤回"
                    :disabled="!designerHistory.canUndo.value"
                    :loading="designerHistory.busy.value"
                    @click="handleUndo"
                    ><el-icon aria-hidden="true"><RefreshLeft /></el-icon></el-button
                  ></el-tooltip
                ><el-tooltip content="恢复" placement="top" :show-after="300"
                  ><el-button
                    size="small"
                    data-test="designer-redo"
                    aria-label="恢复"
                    :disabled="!designerHistory.canRedo.value"
                    :loading="designerHistory.busy.value"
                    @click="handleRedo"
                    ><el-icon aria-hidden="true"><RefreshRight /></el-icon></el-button
                  ></el-tooltip
                ><el-tooltip content="批量删除" placement="top" :show-after="300"
                  ><el-button
                    type="danger"
                    size="small"
                    data-test="designer-batch-delete"
                    aria-label="批量删除"
                    :disabled="designerHistory.busy.value || !selectedIds.length"
                    @click="batchDelete"
                    ><el-icon aria-hidden="true"><Delete /></el-icon></el-button
                  ></el-tooltip
                ><span style="color: var(--color-text-muted); font-size: 12px; margin-left: auto"
                  >共 {{ designerVisibleFields.length }} 个字段</span
                >
              </div>
              <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- blank-area click deselects field and shows form props -->
              <div class="fd-canvas-list designer-field-list" @click="onCanvasBlankClick">
                <div
                  v-for="(ff, idx) in designerVisibleFields"
                  :key="ff.id"
                  :ref="(el) => (fieldItemRefs[ff.id] = el)"
                  class="ff-item"
                  :class="{ inline: ff.inline_mark, 'ff-selected': selectedFieldId === ff.id }"
                  :draggable="!designerHistory.busy.value && !isReordering && !isFieldMembershipBusy()"
                  role="button"
                  :style="
                    (dragOverIdx === idx ? 'border-top:2px solid var(--color-primary);' : '') +
                    (ff.bg_color ? 'border-left:4px solid #' + ff.bg_color + ';' : '')
                  "
                  tabindex="0"
                  @click="onSelectFieldClick(ff)"
                  @dragstart="onDragStart(ff, $event)"
                  @dragover.prevent="onDragOver($event, idx)"
                  @dragleave="onDragLeave"
                  @drop="onDrop($event, idx)"
                  @keydown="handleFieldKeydown($event, ff, idx)"
                >
                  <span class="ff-select-slot"
                    ><el-checkbox
                      v-if="!isDraftField(ff)"
                      v-model="selectedIds"
                      :value="ff.id"
                      size="small"
                      draggable="false"
                      @click.stop
                      ><span></span></el-checkbox
                  ></span
                  ><span class="ordinal-cell" style="width: 56px; margin-left: 2px">{{ ff._displayOrder }}</span
                  ><span class="drag-handle">⠿</span
                  ><template v-if="showAcrfAnnotations"
                    ><el-tooltip
                      v-if="ff.field_definition?.field_type !== '标签'"
                      :content="ff.field_definition?.variable_name || '\u2014'"
                      placement="top"
                      :show-after="300"
                      :disabled="!ff.field_definition?.variable_name"
                      ><span class="ff-var-name">{{ ff.field_definition?.variable_name || '' }}</span></el-tooltip
                    ><span v-else class="ff-var-name" aria-hidden="true"></span></template
                  ><span class="ff-label" :style="getFormFieldTextColorStyle(ff)">{{
                    getFormFieldListLabel(ff)
                  }}</span
                  ><el-tag v-if="isDraftField(ff)" size="small" type="success" effect="plain" style="margin-left: 4px"
                    >未保存</el-tag
                  ><el-tooltip v-if="canToggleInline(ff) && !isDraftField(ff)" content="横向表格标记"
                    ><el-button
                      size="small"
                      link
                      :type="ff.inline_mark ? 'warning' : ''"
                      draggable="false"
                      :aria-label="'切换 ' + getFormFieldDisplayLabel(ff) + ' 的横向表格标记'"
                      @click.stop="toggleInline(ff)"
                      ><el-icon aria-hidden="true"><Grid /></el-icon></el-button
                    ></el-tooltip
                  ><el-tooltip
                    v-if="!isDraftField(ff)"
                    :content="'复制 ' + getFormFieldDisplayLabel(ff)"
                    placement="top"
                    :show-after="300"
                    ><el-button
                      size="small"
                      link
                      data-test="designer-copy-field"
                      draggable="false"
                      :disabled="copyingFieldIds.has(ff.id) || designerHistory.busy.value"
                      :aria-label="'复制 ' + getFormFieldDisplayLabel(ff)"
                      @click.stop="copyFormField(ff)"
                      ><el-icon aria-hidden="true"><DocumentCopy /></el-icon></el-button
                    ></el-tooltip
                  ><el-tooltip
                    :content="'删除 ' + getFormFieldDisplayLabel(ff)"
                    placement="top"
                    :show-after="300"
                    ><el-button
                      type="danger"
                      size="small"
                      link
                      data-test="designer-delete-field"
                      draggable="false"
                      :disabled="!isDraftField(ff) && designerHistory.busy.value"
                      @click.stop="removeField(ff)"
                      ><el-icon aria-hidden="true"><Delete /></el-icon></el-button
                    ></el-tooltip>
                </div>
              </div>
            </div>
          <button
            type="button"
            class="pane-v-resizer designer-left-resizer"
            aria-label="调整字段列表与属性编辑高度"
            @mousedown="startLeftSplitResize"
          ></button>
          <div class="designer-preview-pane">
              <div class="designer-section-title"><span>实时预览</span></div>
              <div class="designer-preview-viewport">
                <div class="designer-preview-stage">
                  <div class="designer-preview-page">
                    <div
                      :class="[
                        'word-page',
                        'form-designer-word-page',
                        'designer-scaled-word-page',
                        { landscape: designerLandscapeMode },
                      ]"
                    >
                      <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
                      <template v-else>
                        <div class="wp-form-title-row">
                          <div class="wp-form-title">{{ selectedForm.name }}</div>
                          <span
                            v-if="showAcrfAnnotations && getFormDomainAnnotationText(selectedForm)"
                            :class="[
                              'wp-acrf-annotation',
                              'wp-acrf-annotation--form',
                              {
                                'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                  getFormAnnotationTarget(selectedForm),
                                ),
                              },
                            ]"
                            :style="
                              getAnnotationStyle(
                                getFormDomainAnnotationText(selectedForm),
                                ANNOTATION_KIND_FORM,
                                getFormAnnotationTarget(selectedForm),
                              )
                            "
                            @pointerdown="
                              (event) => onAnnotationPointerDown(getFormAnnotationTarget(selectedForm), event)
                            "
                          >
                            <span class="wp-acrf-annotation__text">{{ getFormDomainAnnotationText(selectedForm) }}</span>
                            <button
                              type="button"
                              class="wp-acrf-annotation-reset"
                              :disabled="!hasAnnotationOverrideForTarget(getFormAnnotationTarget(selectedForm))"
                              aria-label="重置表单 domain 标注位置"
                              @pointerdown.stop
                              @click.stop="resetAnnotationPosition(getFormAnnotationTarget(selectedForm))"
                            >
                              R
                            </button>
                          </span>
                        </div>
                        <div v-if="!designerPreviewFields.length" class="wp-empty">暂无字段</div>
                        <div class="wp-body">
                          <div class="wp-main">
                            <template v-for="(gv, gi) in designerRenderGroupsView" :key="gi">
                              <div v-if="gv.type === 'unified'" class="col-resize-host unified-host">
                                <table class="unified-table">
                                  <colgroup v-if="getResizer('unified', gv.colCount, gi, gv, 'designer')">
                                    <col
                                      v-for="(r, ci) in getResizer('unified', gv.colCount, gi, gv, 'designer')
                                        .colRatios"
                                      :key="ci"
                                      :style="{ width: r * 100 + '%' }"
                                    />
                                  </colgroup>
                                  <template v-for="seg in gv.segments" :key="seg.fields[0]?.id">
                                    <tr
                                      v-if="seg.type === 'regular_field'"
                                      class="row-resize-host"
                                      :style="
                                        getRowHeightStyle(
                                          getRowResizer('unified', gv),
                                          getUnifiedRegularRowKey(seg.fields[0]),
                                        )
                                      "
                                      @dblclick="openQuickEdit(seg.fields[0])"
                                    >
                                      <td
                                        class="unified-label row-resize-anchor"
                                        :colspan="gv.labelValueSpans.labelSpan"
                                        :style="getFormFieldLabelPreviewStyle(seg.fields[0])"
                                      >
                                        {{ getFormFieldDisplayLabel(seg.fields[0]) }}
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) =>
                                              getRowResizer('unified', gv).onResizeStart(
                                                getUnifiedRegularRowKey(seg.fields[0]),
                                                e,
                                              )
                                          "
                                        ></span>
                                      </td>
                                      <td
                                        class="unified-value row-resize-anchor"
                                        :colspan="gv.labelValueSpans.valueSpan"
                                        :style="getFormFieldPreviewStyle(seg.fields[0])"
                                      >
                                        <span v-html="renderCellHtml(seg.fields[0])"></span>
                                        <span
                                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                                          :class="[
                                            'wp-acrf-annotation',
                                            'wp-acrf-annotation--field',
                                            {
                                              'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                                getFieldAnnotationTarget(seg.fields[0]),
                                              ),
                                            },
                                          ]"
                                          :style="
                                            getAnnotationStyle(
                                              getFieldOidAnnotationText(seg.fields[0]),
                                              ANNOTATION_KIND_FIELD,
                                              getFieldAnnotationTarget(seg.fields[0]),
                                            )
                                          "
                                          @pointerdown="
                                            (event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)
                                          "
                                        >
                                          <span class="wp-acrf-annotation__text">{{
                                            getFieldOidAnnotationText(seg.fields[0])
                                          }}</span>
                                          <button
                                            type="button"
                                            class="wp-acrf-annotation-reset"
                                            :disabled="
                                              !hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))
                                            "
                                            aria-label="重置字段标注位置"
                                            @pointerdown.stop
                                            @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                                          >
                                            R
                                          </button>
                                        </span>
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) =>
                                              getRowResizer('unified', gv).onResizeStart(
                                                getUnifiedRegularRowKey(seg.fields[0]),
                                                e,
                                              )
                                          "
                                        ></span>
                                      </td>
                                    </tr>
                                    <tr
                                      v-else-if="seg.type === 'full_row'"
                                      class="row-resize-host"
                                      :style="
                                        getRowHeightStyle(
                                          getRowResizer('unified', gv),
                                          getUnifiedFullRowKey(seg.fields[0]),
                                        )
                                      "
                                      @dblclick="openQuickEdit(seg.fields[0])"
                                    >
                                      <td
                                        :class="{
                                          'wp-structure-label--multiline':
                                            seg.fields[0].field_definition?.field_type === '标签',
                                          'row-resize-anchor': true,
                                        }"
                                        :colspan="gv.colCount"
                                        :style="getFormFieldLabelPreviewStyle(seg.fields[0], { structure: true })"
                                      >
                                        {{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}
                                        <span
                                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                                          :class="[
                                            'wp-acrf-annotation',
                                            'wp-acrf-annotation--field',
                                            {
                                              'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                                getFieldAnnotationTarget(seg.fields[0]),
                                              ),
                                            },
                                          ]"
                                          :style="
                                            getAnnotationStyle(
                                              getFieldOidAnnotationText(seg.fields[0]),
                                              ANNOTATION_KIND_FIELD,
                                              getFieldAnnotationTarget(seg.fields[0]),
                                            )
                                          "
                                          @pointerdown="
                                            (event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)
                                          "
                                        >
                                          <span class="wp-acrf-annotation__text">{{
                                            getFieldOidAnnotationText(seg.fields[0])
                                          }}</span>
                                          <button
                                            type="button"
                                            class="wp-acrf-annotation-reset"
                                            :disabled="
                                              !hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))
                                            "
                                            aria-label="重置字段标注位置"
                                            @pointerdown.stop
                                            @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                                          >
                                            R
                                          </button>
                                        </span>
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) =>
                                              getRowResizer('unified', gv).onResizeStart(
                                                getUnifiedFullRowKey(seg.fields[0]),
                                                e,
                                              )
                                          "
                                        ></span>
                                      </td>
                                    </tr>
                                    <template v-else-if="seg.type === 'inline_block'"
                                      ><tr
                                        class="row-resize-host"
                                        :style="
                                          getRowHeightStyle(
                                            getRowResizer('unified', gv),
                                            getUnifiedInlineHeaderRowKey(seg.fields),
                                          )
                                        "
                                      >
                                        <td
                                          v-for="(ff, idx) in seg.fields"
                                          :key="ff.id"
                                          class="wp-inline-header row-resize-anchor"
                                          :colspan="seg.mergeSpans[idx]"
                                          :style="getFormFieldLabelPreviewStyle(ff)"
                                          @dblclick="openQuickEdit(ff)"
                                        >
                                          {{ getFormFieldDisplayLabel(ff) }}
                                          <span
                                            v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                            :class="[
                                              'wp-acrf-annotation',
                                              'wp-acrf-annotation--field',
                                              'wp-acrf-annotation--inline-header',
                                              {
                                                'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                                  getFieldAnnotationTarget(ff),
                                                ),
                                              },
                                            ]"
                                            :style="
                                              getAnnotationStyle(
                                                getFieldOidAnnotationText(ff),
                                                ANNOTATION_KIND_INLINE_HEADER,
                                                getFieldAnnotationTarget(ff),
                                              )
                                            "
                                            @pointerdown="
                                              (event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)
                                            "
                                          >
                                            <span class="wp-acrf-annotation__text">{{
                                              getFieldOidAnnotationText(ff)
                                            }}</span>
                                            <button
                                              type="button"
                                              class="wp-acrf-annotation-reset"
                                              :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                              aria-label="重置字段标注位置"
                                              @pointerdown.stop
                                              @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                            >
                                              R
                                            </button>
                                          </span>
                                          <span
                                            class="row-resizer-handle"
                                            @pointerdown="
                                              (e) =>
                                                getRowResizer('unified', gv).onResizeStart(
                                                  getUnifiedInlineHeaderRowKey(seg.fields),
                                                  e,
                                                )
                                            "
                                          ></span>
                                        </td>
                                      </tr>
                                      <tr
                                        v-for="(row, ri) in seg.inlineRows"
                                        :key="ri"
                                        class="row-resize-host"
                                        :style="
                                          getRowHeightStyle(
                                            getRowResizer('unified', gv),
                                            getUnifiedInlineDataRowKey(seg.fields, ri),
                                          )
                                        "
                                      >
                                        <td
                                          v-for="(cell, ci) in row"
                                          :key="ci"
                                          class="wp-ctrl row-resize-anchor"
                                          :colspan="seg.mergeSpans[ci]"
                                          :style="getFormFieldPreviewStyle(seg.fields[ci])"
                                          @dblclick="openQuickEdit(seg.fields[ci])"
                                        >
                                          <span v-html="cell"></span>
                                          <span
                                            class="row-resizer-handle"
                                            @pointerdown="
                                              (e) =>
                                                getRowResizer('unified', gv).onResizeStart(
                                                  getUnifiedInlineDataRowKey(seg.fields, ri),
                                                  e,
                                                )
                                            "
                                          ></span>
                                        </td></tr
                                    ></template>
                                  </template>
                                </table>
                                <template v-if="getResizer('unified', gv.colCount, gi, gv, 'designer')"
                                  ><div
                                    v-for="bi in getResizer('unified', gv.colCount, gi, gv, 'designer').colRatios
                                      .length - 1"
                                    :key="bi"
                                    class="resizer-handle"
                                    :style="{
                                      left:
                                        cumRatio(
                                          getResizer('unified', gv.colCount, gi, gv, 'designer').colRatios,
                                          bi - 1,
                                        ) *
                                          100 +
                                        '%',
                                    }"
                                    @pointerdown="
                                      (e) =>
                                        getResizer('unified', gv.colCount, gi, gv, 'designer').onResizeStart(bi - 1, e)
                                    "
                                  ></div>
                                  <div
                                    v-if="getResizer('unified', gv.colCount, gi, gv, 'designer').snapGuideX !== null"
                                    class="snap-guide"
                                    :style="{
                                      left: getResizer('unified', gv.colCount, gi, gv, 'designer').snapGuideX + 'px',
                                    }"
                                  ></div
                                ></template>
                              </div>
                              <div v-else-if="gv.type === 'normal'" class="col-resize-host">
                                <table>
                                  <colgroup v-if="getResizer('normal', 2, gi, gv, 'designer')">
                                    <col
                                      v-for="(r, ci) in getResizer('normal', 2, gi, gv, 'designer').colRatios"
                                      :key="ci"
                                      :style="{ width: r * 100 + '%' }"
                                    />
                                  </colgroup>
                                  <template v-for="ff in gv.fields" :key="ff.id"
                                    ><tr
                                      v-if="ff.field_definition?.field_type === '标签'"
                                      class="row-resize-host"
                                      :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                                      @dblclick="openQuickEdit(ff)"
                                    >
                                      <td
                                        class="wp-structure-label--multiline row-resize-anchor"
                                        colspan="2"
                                        :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                                      >
                                        {{ getFormFieldDisplayLabel(ff) }}
                                        <span
                                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                          :class="[
                                            'wp-acrf-annotation',
                                            'wp-acrf-annotation--field',
                                            {
                                              'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                                getFieldAnnotationTarget(ff),
                                              ),
                                            },
                                          ]"
                                          :style="
                                            getAnnotationStyle(
                                              getFieldOidAnnotationText(ff),
                                              ANNOTATION_KIND_FIELD,
                                              getFieldAnnotationTarget(ff),
                                            )
                                          "
                                          @pointerdown="
                                            (event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)
                                          "
                                        >
                                          <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                          <button
                                            type="button"
                                            class="wp-acrf-annotation-reset"
                                            :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                            aria-label="重置字段标注位置"
                                            @pointerdown.stop
                                            @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                          >
                                            R
                                          </button>
                                        </span>
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)
                                          "
                                        ></span>
                                      </td>
                                    </tr>
                                    <tr
                                      v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"
                                      class="row-resize-host"
                                      :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                                      @dblclick="openQuickEdit(ff)"
                                    >
                                      <td
                                        colspan="2"
                                        class="row-resize-anchor"
                                        :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                                      >
                                        {{ getFormFieldDisplayLabel(ff) || '以下为log行' }}
                                        <span
                                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                          :class="[
                                            'wp-acrf-annotation',
                                            'wp-acrf-annotation--field',
                                            {
                                              'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                                getFieldAnnotationTarget(ff),
                                              ),
                                            },
                                          ]"
                                          :style="
                                            getAnnotationStyle(
                                              getFieldOidAnnotationText(ff),
                                              ANNOTATION_KIND_FIELD,
                                              getFieldAnnotationTarget(ff),
                                            )
                                          "
                                          @pointerdown="
                                            (event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)
                                          "
                                        >
                                          <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                          <button
                                            type="button"
                                            class="wp-acrf-annotation-reset"
                                            :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                            aria-label="重置字段标注位置"
                                            @pointerdown.stop
                                            @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                          >
                                            R
                                          </button>
                                        </span>
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)
                                          "
                                        ></span>
                                      </td>
                                    </tr>
                                    <tr
                                      v-else
                                      class="row-resize-host"
                                      :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                                      @dblclick="openQuickEdit(ff)"
                                    >
                                      <td class="wp-label row-resize-anchor" :style="getFormFieldLabelPreviewStyle(ff)">
                                        {{ getFormFieldDisplayLabel(ff) }}
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)
                                          "
                                        ></span>
                                      </td>
                                      <td class="wp-ctrl row-resize-anchor" :style="getFormFieldPreviewStyle(ff)">
                                        <span
                                          v-html="
                                            renderCellHtml(
                                              ff,
                                              normalFillChars(gi, gv, 'designer'),
                                            )
                                          "
                                        ></span>
                                        <span
                                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                          :class="[
                                            'wp-acrf-annotation',
                                            'wp-acrf-annotation--field',
                                            {
                                              'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                                getFieldAnnotationTarget(ff),
                                              ),
                                            },
                                          ]"
                                          :style="
                                            getAnnotationStyle(
                                              getFieldOidAnnotationText(ff),
                                              ANNOTATION_KIND_FIELD,
                                              getFieldAnnotationTarget(ff),
                                            )
                                          "
                                          @pointerdown="
                                            (event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)
                                          "
                                        >
                                          <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                          <button
                                            type="button"
                                            class="wp-acrf-annotation-reset"
                                            :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                            aria-label="重置字段标注位置"
                                            @pointerdown.stop
                                            @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                          >
                                            R
                                          </button>
                                        </span>
                                        <span
                                          class="row-resizer-handle"
                                          @pointerdown="
                                            (e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)
                                          "
                                        ></span>
                                      </td></tr
                                  ></template>
                                </table>
                                <template v-if="getResizer('normal', 2, gi, gv, 'designer')"
                                  ><div
                                    v-for="bi in getResizer('normal', 2, gi, gv, 'designer').colRatios.length - 1"
                                    :key="bi"
                                    class="resizer-handle"
                                    :style="{
                                      left:
                                        cumRatio(getResizer('normal', 2, gi, gv, 'designer').colRatios, bi - 1) * 100 +
                                        '%',
                                    }"
                                    @pointerdown="
                                      (e) => getResizer('normal', 2, gi, gv, 'designer').onResizeStart(bi - 1, e)
                                    "
                                  ></div>
                                  <div
                                    v-if="getResizer('normal', 2, gi, gv, 'designer').snapGuideX !== null"
                                    class="snap-guide"
                                    :style="{ left: getResizer('normal', 2, gi, gv, 'designer').snapGuideX + 'px' }"
                                  ></div
                                ></template>
                              </div>
                              <div v-else class="col-resize-host inline-host">
                                <table class="inline-table">
                                  <colgroup v-if="getResizer('inline', gv.fields.length, gi, gv, 'designer')">
                                    <col
                                      v-for="(r, ci) in getResizer('inline', gv.fields.length, gi, gv, 'designer')
                                        .colRatios"
                                      :key="ci"
                                      :style="{ width: r * 100 + '%' }"
                                    />
                                  </colgroup>
                                  <tr
                                    class="row-resize-host"
                                    :style="
                                      getRowHeightStyle(getRowResizer('inline', gv), getInlineHeaderRowKey(gv.fields))
                                    "
                                  >
                                    <td
                                      v-for="ff in gv.fields"
                                      :key="ff.id"
                                      class="wp-inline-header row-resize-anchor"
                                      :style="getFormFieldLabelPreviewStyle(ff)"
                                      @dblclick="openQuickEdit(ff)"
                                    >
                                      {{ getFormFieldDisplayLabel(ff) }}
                                      <span
                                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                                        :class="[
                                          'wp-acrf-annotation',
                                          'wp-acrf-annotation--field',
                                          'wp-acrf-annotation--inline-header',
                                          {
                                            'wp-acrf-annotation--interactive': isAnnotationDraggable(
                                              getFieldAnnotationTarget(ff),
                                            ),
                                          },
                                        ]"
                                        :style="
                                          getAnnotationStyle(
                                            getFieldOidAnnotationText(ff),
                                            ANNOTATION_KIND_INLINE_HEADER,
                                            getFieldAnnotationTarget(ff),
                                          )
                                        "
                                        @pointerdown="
                                          (event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)
                                        "
                                      >
                                        <span class="wp-acrf-annotation__text">{{ getFieldOidAnnotationText(ff) }}</span>
                                        <button
                                          type="button"
                                          class="wp-acrf-annotation-reset"
                                          :disabled="!hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                                          aria-label="重置字段标注位置"
                                          @pointerdown.stop
                                          @click.stop="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                                        >
                                          R
                                        </button>
                                      </span>
                                      <span
                                        class="row-resizer-handle"
                                        @pointerdown="
                                          (e) =>
                                            getRowResizer('inline', gv).onResizeStart(
                                              getInlineHeaderRowKey(gv.fields),
                                              e,
                                            )
                                        "
                                      ></span>
                                    </td>
                                  </tr>
                                  <tr
                                    v-for="(row, ri) in gv.inlineRows"
                                    :key="ri"
                                    class="row-resize-host"
                                    :style="
                                      getRowHeightStyle(getRowResizer('inline', gv), getInlineDataRowKey(gv.fields, ri))
                                    "
                                  >
                                    <td
                                      v-for="(cell, ci) in row"
                                      :key="ci"
                                      class="wp-ctrl row-resize-anchor"
                                      :style="getFormFieldPreviewStyle(gv.fields[ci])"
                                      @dblclick="openQuickEdit(gv.fields[ci])"
                                    >
                                      <span v-html="cell"></span>
                                      <span
                                        class="row-resizer-handle"
                                        @pointerdown="
                                          (e) =>
                                            getRowResizer('inline', gv).onResizeStart(
                                              getInlineDataRowKey(gv.fields, ri),
                                              e,
                                            )
                                        "
                                      ></span>
                                    </td>
                                  </tr>
                                </table>
                                <template v-if="getResizer('inline', gv.fields.length, gi, gv, 'designer')"
                                  ><div
                                    v-for="bi in getResizer('inline', gv.fields.length, gi, gv, 'designer').colRatios
                                      .length - 1"
                                    :key="bi"
                                    class="resizer-handle"
                                    :style="{
                                      left:
                                        cumRatio(
                                          getResizer('inline', gv.fields.length, gi, gv, 'designer').colRatios,
                                          bi - 1,
                                        ) *
                                          100 +
                                        '%',
                                    }"
                                    @pointerdown="
                                      (e) =>
                                        getResizer('inline', gv.fields.length, gi, gv, 'designer').onResizeStart(
                                          bi - 1,
                                          e,
                                        )
                                    "
                                  ></div>
                                  <div
                                    v-if="
                                      getResizer('inline', gv.fields.length, gi, gv, 'designer').snapGuideX !== null
                                    "
                                    class="snap-guide"
                                    :style="{
                                      left:
                                        getResizer('inline', gv.fields.length, gi, gv, 'designer').snapGuideX + 'px',
                                    }"
                                  ></div
                                ></template>
                              </div>
                            </template>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          <button
            type="button"
            class="pane-h-resizer"
            aria-label="调整左右分栏宽度"
            @mousedown="startMainSplitResize"
          ></button>
          <div class="designer-editor-card">
            <div class="designer-section-title">{{ selectedFieldId ? '字段属性' : '表单属性' }}</div>
            <div v-if="!selectedFieldId" class="designer-editor-scroll" data-test="designer-form-property-form">
              <el-form
                :model="editFormProp"
                label-width="88px"
                size="small"
                :disabled="designerHistory.busy.value || isReordering || savingDraft || !selectedForm"
              >
                <el-form-item v-if="editMode" label="OID">
                  <el-input v-model="editFormProp.code" data-test="designer-form-property-code" />
                </el-form-item>
                <el-form-item label="名称">
                  <el-input v-model="editFormProp.name" data-test="designer-form-property-name" />
                </el-form-item>
                <el-form-item label="纸张方向">
                  <el-radio-group
                    v-model="editFormProp.paper_orientation"
                    data-test="designer-form-paper-orientation"
                  >
                    <el-radio label="auto">自动</el-radio>
                    <el-radio label="landscape">横向</el-radio>
                    <el-radio label="portrait">纵向</el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-form>
            </div>
            <div v-else class="designer-editor-scroll">
              <div
                v-if="editProp.field_type === '日志行'"
                class="designer-readonly-hint"
                data-test="designer-log-property-readonly"
              >
                「以下为log行」为固定样式的结构提示行，不支持编辑属性。
              </div>
              <template v-else>
              <el-form
                :model="editProp"
                label-width="88px"
                size="small"
                data-test="designer-field-property-form"
                :disabled="designerHistory.busy.value"
              >
                <el-form-item v-if="editMode && !['标签', '日志行'].includes(editProp.field_type)" label="OID">
                  <el-autocomplete
                    v-model="editProp.variable_name"
                    :fetch-suggestions="fetchFieldDefSuggestions"
                    :trigger-on-focus="false"
                    placeholder="输入OID搜索字段库"
                    style="width: 100%"
                    data-test="designer-field-oid-autocomplete"
                    @select="selectAutocompleteCandidate"
                  >
                    <template #default="{ item }">
                      <div
                        class="fd-autocomplete-item"
                        :class="{ 'is-added': item.state === CANDIDATE_STATE_ADDED }"
                        :aria-disabled="item.state === CANDIDATE_STATE_ADDED"
                      >
                        <span class="fd-autocomplete-oid">{{ item.definition.variable_name }}</span>
                        <span class="fd-autocomplete-label">{{ item.definition.label }}</span>
                        <span class="fd-autocomplete-type">{{ item.definition.field_type }}</span>
                        <span v-if="item.state === CANDIDATE_STATE_CURRENT" class="fd-autocomplete-state"
                          >当前字段</span
                        >
                        <span v-else-if="item.state === CANDIDATE_STATE_ADDED" class="fd-autocomplete-state"
                          >已添加</span
                        >
                      </div>
                    </template>
                  </el-autocomplete>
                </el-form-item>
                <el-form-item label="字段标签">
                  <el-input
                    v-if="editProp.field_type === '标签'"
                    v-model="editProp.label"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 4 }"
                  />
                  <el-autocomplete
                    v-else
                    v-model="editProp.label"
                    :fetch-suggestions="fetchFieldDefSuggestions"
                    :trigger-on-focus="false"
                    placeholder="输入标签搜索字段库"
                    style="width: 100%"
                    data-test="designer-field-label-autocomplete"
                    @select="selectAutocompleteCandidate"
                  >
                    <template #default="{ item }">
                      <div
                        class="fd-autocomplete-item"
                        :class="{ 'is-added': item.state === CANDIDATE_STATE_ADDED }"
                        :aria-disabled="item.state === CANDIDATE_STATE_ADDED"
                      >
                        <span class="fd-autocomplete-oid">{{ item.definition.variable_name }}</span>
                        <span class="fd-autocomplete-label">{{ item.definition.label }}</span>
                        <span class="fd-autocomplete-type">{{ item.definition.field_type }}</span>
                        <span v-if="item.state === CANDIDATE_STATE_CURRENT" class="fd-autocomplete-state"
                          >当前字段</span
                        >
                        <span v-else-if="item.state === CANDIDATE_STATE_ADDED" class="fd-autocomplete-state"
                          >已添加</span
                        >
                      </div>
                    </template>
                  </el-autocomplete>
                </el-form-item>
                <el-form-item label="字段类型">
                  <el-select
                    :model-value="editProp.field_type"
                    style="width: 100%"
                    @update:model-value="onDesignerFieldTypeChange"
                  >
                    <el-option
                      v-for="t in designerAvailableFieldTypes"
                      :key="t.value"
                      :label="t.label"
                      :value="t.value"
                      :disabled="t.disabled"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="editProp.field_type === '复选'" label="复选文本">
                  <el-input v-model="editProp.checkbox_label" placeholder="✔" />
                </el-form-item>
                <template v-if="editProp.field_type === '数值'">
                  <el-form-item label="整数位数"
                    ><el-input-number v-model="editProp.integer_digits" :min="1" :max="20" style="width: 100%"
                  /></el-form-item>
                  <el-form-item label="小数位数"
                    ><el-input-number v-model="editProp.decimal_digits" :min="0" :max="15" style="width: 100%"
                  /></el-form-item>
                </template>
                <el-form-item v-if="['日期', '日期时间', '时间'].includes(editProp.field_type)" label="日期格式">
                  <el-select v-model="editProp.date_format" clearable style="width: 100%">
                    <el-option
                      v-for="f in DATE_FORMAT_OPTIONS[editProp.field_type] || []"
                      :key="f"
                      :label="f"
                      :value="f"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="isChoiceField(editProp.field_type)" label="字段选项">
                  <div class="choice-codelist-row">
                    <el-select
                      v-model="editProp.codelist_id"
                      class="choice-codelist-select"
                      clearable
                      filterable
                      placeholder="请选择"
                    >
                      <el-option v-for="c in codelists" :key="c.id" :label="c.name" :value="c.id" />
                    </el-select>
                    <div class="choice-codelist-actions">
                      <el-button
                        class="choice-codelist-icon-btn"
                        size="small"
                        circle
                        type="primary"
                        plain
                        :icon="Plus"
                        aria-label="新增字典"
                        title="新增字典"
                        @click="openQuickAddCodelist"
                      />
                      <el-button
                        class="choice-codelist-icon-btn"
                        size="small"
                        circle
                        type="warning"
                        plain
                        :icon="EditPen"
                        aria-label="编辑字典"
                        title="编辑字典"
                        :disabled="!editProp.codelist_id"
                        @click="openQuickEditCodelist"
                      />
                    </div>
                  </div>
                </el-form-item>
                <el-form-item v-if="['文本', '数值'].includes(editProp.field_type)" label="单位">
                  <div style="display: flex; gap: 4px">
                    <el-select
                      v-model="editProp.unit_id"
                      clearable
                      filterable
                      style="flex: 1"
                      placeholder="请选择"
                      :value-on-clear="null"
                    >
                      <el-option v-for="u in units" :key="u.id" :label="u.symbol" :value="u.id" />
                    </el-select>
                    <el-button
                      class="choice-codelist-icon-btn"
                      size="small"
                      circle
                      type="primary"
                      plain
                      :icon="Plus"
                      aria-label="新增单位"
                      title="新增单位"
                      @click="showQuickAddUnit = true"
                    />
                  </div>
                </el-form-item>
                <el-form-item
                  v-if="isDefaultValueSupported(editProp.field_type, Boolean(editProp.inline_mark))"
                  label="默认值/覆盖"
                >
                  <template #label>
                    <el-tooltip
                      :content="
                        editProp.inline_mark ? '横向表格字段支持多行默认值。' : '仅支持非表格普通字段的单行覆盖值。'
                      "
                    >
                      <span
                        >默认值 <el-icon><InfoFilled /></el-icon
                      ></span>
                    </el-tooltip>
                  </template>
                  <el-input
                    v-model="editProp.default_value"
                    :type="editProp.inline_mark ? 'textarea' : 'text'"
                    :rows="editProp.inline_mark ? 2 : undefined"
                    :placeholder="editProp.inline_mark ? '请输入多行默认值' : '请输入单行覆盖值'"
                  />
                </el-form-item>
                <el-form-item label="底纹颜色">
                  <div class="color-picker">
                    <button
                      type="button"
                      class="color-option color-option-default"
                      :class="{ 'color-selected': !editProp.bg_color && !customBgColorInput }"
                      @click="
                        editProp.bg_color = null;
                        customBgColorInput = '';
                      "
                    >
                      默认
                    </button>
                    <button
                      v-for="opt in BG_COLOR_OPTIONS.slice(1)"
                      :key="opt.value"
                      type="button"
                      class="color-option"
                      :class="{ 'color-selected': editProp.bg_color === opt.value && !customBgColorInput }"
                      :style="{ background: '#' + opt.value }"
                      :aria-label="`选择底纹颜色：${opt.label}`"
                      :title="opt.label"
                      @click="
                        editProp.bg_color = opt.value;
                        customBgColorInput = '';
                      "
                    ></button>
                    <el-input
                      v-model="customBgColorInput"
                      placeholder="自定义HEX"
                      size="small"
                      style="width: 90px; margin-left: 4px"
                      @input="applyCustomBgColor"
                    >
                      <template #prefix
                        ><span :style="customBgColorInput ? 'color:#' + customBgColorInput : ''">■</span></template
                      >
                    </el-input>
                  </div>
                </el-form-item>
                <el-form-item label="文字颜色">
                  <div class="color-picker">
                    <button
                      type="button"
                      class="color-option color-option-default"
                      :class="{ 'color-selected': !editProp.text_color && !customTextColorInput }"
                      @click="
                        editProp.text_color = null;
                        customTextColorInput = '';
                      "
                    >
                      默认
                    </button>
                    <button
                      v-for="opt in TEXT_COLOR_OPTIONS"
                      :key="opt.value"
                      type="button"
                      class="color-option"
                      :class="{ 'color-selected': editProp.text_color === opt.value && !customTextColorInput }"
                      :style="{ background: '#' + opt.value }"
                      :aria-label="`选择文字颜色：${opt.label}`"
                      :title="opt.label"
                      @click="
                        editProp.text_color = opt.value;
                        customTextColorInput = '';
                      "
                    ></button>
                    <el-input
                      v-model="customTextColorInput"
                      placeholder="自定义HEX"
                      size="small"
                      style="width: 90px; margin-left: 4px"
                      @input="applyCustomTextColor"
                    >
                      <template #prefix
                        ><span :style="customTextColorInput ? 'color:#' + customTextColorInput : ''">■</span></template
                      >
                    </el-input>
                  </div>
                </el-form-item>
                <el-form-item label="标签加粗">
                  <el-switch v-model="editProp.label_bold" :active-value="1" :inactive-value="0" />
                </el-form-item>
                <el-form-item label="标签字号">
                  <el-radio-group v-model="editProp.label_font_size" size="small">
                    <el-radio-button label="large">大</el-radio-button>
                    <el-radio-button label="default">默认</el-radio-button>
                    <el-radio-button label="small">小</el-radio-button>
                  </el-radio-group>
                </el-form-item>
              </el-form>
              </template>
            </div>
            <div class="designer-editor-actions">
              <template v-if="!selectedFieldId">
                <el-tooltip content="设计备注" placement="top" :show-after="300"
                  ><el-button
                    size="small"
                    data-test="designer-notes-button"
                    aria-label="设计备注"
                    @click="openNotesDialog"
                    ><el-icon aria-hidden="true"><Memo /></el-icon></el-button
                  ></el-tooltip
                ><span class="designer-editor-actions-spacer"></span>
                <el-button
                  size="small"
                  data-test="designer-form-property-cancel"
                  :disabled="!isFormPropDirty || designerHistory.busy.value || isReordering || savingDraft || isSavingFormProp"
                  @click="cancelFormProp"
                >
                  取消
                </el-button>
                <el-button
                  type="primary"
                  size="small"
                  data-test="designer-form-property-save"
                  :loading="isSavingFormProp"
                  :disabled="!isFormPropDirty || designerHistory.busy.value || isReordering || savingDraft || !selectedForm"
                  @click="saveFormProp"
                >
                  保存
                </el-button>
              </template>
              <template v-else-if="selectedFieldId === DRAFT_FIELD_ID">
                <span class="designer-editor-actions-spacer"></span>
                <el-button size="small" data-test="designer-draft-cancel" @click="removeDraftFromState">
                  取消
                </el-button>
                <el-button
                  type="primary"
                  size="small"
                  data-test="designer-draft-save"
                  :loading="savingDraft"
                  :disabled="designerHistory.busy.value"
                  @click="saveDraftField"
                >
                  保存
                </el-button>
              </template>
              <template v-else-if="editProp.field_type !== '日志行'">
                <span class="designer-editor-actions-spacer"></span>
                <el-button
                  size="small"
                  data-test="designer-property-cancel"
                  :disabled="!isFieldPropDirty || designerHistory.busy.value || isSavingFieldProp"
                  @click="cancelSelectedFieldProp"
                >
                  取消
                </el-button>
                <el-button
                  type="primary"
                  size="small"
                  data-test="designer-property-save"
                  :loading="isSavingFieldProp"
                  :disabled="!isFieldPropDirty || designerHistory.busy.value"
                  @click="saveSelectedFieldProp"
                >
                  保存
                </el-button>
              </template>
            </div>
          </div>
      </div>
    </el-dialog>

    <!-- 各类弹窗 -->
    <DesignNotesDialog
      v-model="showNotesDialog"
      :form="selectedForm"
      :project-id="props.projectId"
      @saved="onNotesDialogSaved"
    />
    <el-dialog v-model="showAddForm" title="新建表单" width="360px">
      <el-form label-width="80px">
        <el-form-item v-if="editMode" label="OID"><el-input v-model="newFormCode" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="newFormName" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddForm = false">取消</el-button>
        <el-button type="primary" @click="addForm">确定</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showEditForm" title="编辑表单" width="360px">
      <el-form label-width="80px">
        <el-form-item v-if="editMode" label="OID"><el-input v-model="editFormCode" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="editFormName" /></el-form-item>
        <el-form-item label="纸张方向">
          <el-radio-group v-model="editFormPaperOrientation" data-test="edit-form-paper-orientation">
            <el-radio label="auto">自动</el-radio>
            <el-radio label="landscape">横向</el-radio>
            <el-radio label="portrait">纵向</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditForm = false">取消</el-button>
        <el-button type="primary" @click="updateForm">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showQuickEdit" title="快速编辑字段" width="480px" append-to-body>
      <el-form :model="quickEditProp" label-width="80px" size="small">
        <el-form-item label="字段标签">
          <el-input
            v-model="quickEditProp.label"
            :type="quickEditProp.field_type === '标签' ? 'textarea' : 'text'"
            :autosize="quickEditProp.field_type === '标签' ? { minRows: 2, maxRows: 4 } : undefined"
          />
        </el-form-item>
        <el-form-item v-if="quickEditField?.field_definition" label="字段类型">
          <el-input :model-value="quickEditField.field_definition.field_type" disabled />
        </el-form-item>
        <template v-if="quickEditField?.field_definition?.field_type === '数值'">
          <el-form-item label="整数位数">
            <el-input :model-value="quickEditField.field_definition.integer_digits" disabled />
          </el-form-item>
          <el-form-item label="小数位数">
            <el-input :model-value="quickEditField.field_definition.decimal_digits" disabled />
          </el-form-item>
        </template>
        <el-form-item
          v-if="['日期', '日期时间', '时间'].includes(quickEditField?.field_definition?.field_type)"
          label="日期格式"
        >
          <el-input :model-value="quickEditField.field_definition.date_format" disabled />
        </el-form-item>
        <el-form-item v-if="quickEditField?.field_definition?.codelist" label="字段选项">
          <el-input :model-value="quickEditField.field_definition.codelist.name" disabled />
        </el-form-item>
        <el-form-item v-if="quickEditField?.field_definition?.unit" label="单位">
          <el-input :model-value="quickEditField.field_definition.unit.symbol" disabled />
        </el-form-item>
        <el-form-item
          v-if="isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark))"
          label="默认值/覆盖"
        >
          <el-input
            v-model="quickEditProp.default_value"
            :type="quickEditProp.inline_mark ? 'textarea' : 'text'"
            :autosize="quickEditProp.inline_mark ? { minRows: 1, maxRows: 3 } : undefined"
          />
        </el-form-item>
        <el-form-item label="底纹颜色">
          <div class="color-picker">
            <button
              type="button"
              class="color-option color-option-default"
              :class="{ 'color-selected': !quickEditProp.bg_color }"
              @click="quickEditProp.bg_color = null"
            >
              默认
            </button>
            <button
              v-for="opt in BG_COLOR_OPTIONS.slice(1)"
              :key="opt.value"
              type="button"
              class="color-option"
              :class="{ 'color-selected': quickEditProp.bg_color === opt.value }"
              :style="{ background: '#' + opt.value }"
              :aria-label="`选择底纹颜色：${opt.label}`"
              :title="opt.label"
              @click="quickEditProp.bg_color = opt.value"
            ></button>
          </div>
        </el-form-item>
        <el-form-item label="文字颜色">
          <div class="color-picker">
            <button
              type="button"
              class="color-option color-option-default"
              :class="{ 'color-selected': !quickEditProp.text_color }"
              @click="quickEditProp.text_color = null"
            >
              默认
            </button>
            <button
              v-for="opt in TEXT_COLOR_OPTIONS"
              :key="opt.value"
              type="button"
              class="color-option"
              :class="{ 'color-selected': quickEditProp.text_color === opt.value }"
              :style="{ background: '#' + opt.value }"
              :aria-label="`选择文字颜色：${opt.label}`"
              :title="opt.label"
              @click="quickEditProp.text_color = opt.value"
            ></button>
          </div>
        </el-form-item>
        <el-form-item label="标签加粗">
          <el-switch v-model="quickEditProp.label_bold" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="标签字号">
          <el-radio-group v-model="quickEditProp.label_font_size" size="small">
            <el-radio-button label="large">大</el-radio-button>
            <el-radio-button label="default">默认</el-radio-button>
            <el-radio-button label="small">小</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="quickEditProp.field_type !== '标签' && quickEditProp.field_type !== '日志行'" label="布局">
          <el-checkbox v-model="quickEditProp.inline_mark">横向显示</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="showQuickEdit = false">取消</el-button
        ><el-button type="primary" @click="saveQuickEdit">确定</el-button></template
      >
    </el-dialog>

    <el-dialog
      v-model="showQuickAddCodelist"
      title="新增选项"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="quickCodelistName" /></el-form-item>
        <el-form-item label="描述"
          ><el-input v-model="quickCodelistDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
        /></el-form-item>
      </el-form>
      <el-table :data="quickCodelistOpts" size="small" border>
        <el-table-column prop="code" label="编码" width="120">
          <template #default="{ row }"><el-input v-model="row.code" size="small" /></template>
        </el-table-column>
        <el-table-column prop="decode" label="标签">
          <template #default="{ row }"><el-input v-model="row.decode" size="small" /></template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }"
            ><el-button type="danger" size="small" link @click="quickDelOptRow($index)">删除</el-button></template
          >
        </el-table-column>
      </el-table>
      <div style="margin-top: 8px; display: flex; gap: 6px">
        <el-input v-model="quickOptCode" size="small" style="width: 100px" />
        <el-input v-model="quickOptDecode" size="small" style="flex: 1" />
        <el-button size="small" @click="quickAddOptRow">添加</el-button>
      </div>
      <template #footer
        ><el-button :disabled="quickAddCodelistSaving" @click="closeQuickAddCodelist">取消</el-button
        ><el-button
          type="primary"
          :loading="quickAddCodelistSaving"
          :disabled="quickAddCodelistSaving"
          @click="quickAddCodelist"
          >确定</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="showQuickEditCodelist"
      title="编辑选项字典"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-form label-width="80px" size="small">
        <el-form-item label="名称"><el-input v-model="quickEditCodelistName" /></el-form-item>
        <el-form-item label="描述"
          ><el-input v-model="quickEditCodelistDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
        /></el-form-item>
      </el-form>
      <el-table :data="quickEditCodelistOpts" size="small" border>
        <el-table-column prop="code" label="编码" width="120">
          <template #default="{ row }"><el-input v-model="row.code" size="small" /></template>
        </el-table-column>
        <el-table-column prop="decode" label="标签">
          <template #default="{ row }"><el-input v-model="row.decode" size="small" /></template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }"
            ><el-button type="danger" size="small" link @click="quickEditDelOptRow($index)">删除</el-button></template
          >
        </el-table-column>
      </el-table>
      <div style="margin-top: 8px; display: flex; gap: 6px">
        <el-input v-model="quickEditOptCode" size="small" style="width: 100px" />
        <el-input v-model="quickEditOptDecode" size="small" style="flex: 1" />
        <el-button size="small" @click="quickEditAddOptRow">添加</el-button>
      </div>
      <template #footer
        ><el-button :disabled="quickEditCodelistSaving" @click="closeQuickEditCodelist">取消</el-button
        ><el-button
          type="primary"
          :loading="quickEditCodelistSaving"
          :disabled="quickEditCodelistSaving"
          @click="quickSaveCodelist"
          >确定</el-button
        ></template
      >
    </el-dialog>

    <el-dialog v-model="showQuickAddUnit" title="新增单位" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px" size="small">
        <el-form-item label="符号"><el-input v-model="quickUnitSymbol" placeholder="单位符号，如 kg" /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="showQuickAddUnit = false">取消</el-button
        ><el-button type="primary" @click="quickAddUnit">确定</el-button></template
      >
    </el-dialog>
  </div>
</template>

<style>
.designer-dialog .el-dialog__body {
  /* 底部留白：属性卡底边不再被窗口边缘裁切 */
  padding: 0 0 12px;
  height: calc(100vh - 54px);
  box-sizing: border-box;
  overflow: hidden;
}
/* 设计备注悬浮提示：popper 被 teleport 到 body，须用全局类；pre-wrap 让完整原文按换行分行 */
.fd-notes-tooltip {
  max-width: 420px;
}
.fd-notes-tooltip .fd-notes-tooltip-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  max-height: 40vh;
  overflow-y: auto;
}
</style>

<style scoped>
.form-designer {
  display: flex;
  gap: 16px;
  height: 100%;
}
.fd-formlist {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.fd-right {
  flex: 2 1 0;
  width: auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fd-canvas-toolbar {
  flex-wrap: nowrap;
}
.fd-canvas {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fd-canvas-header {
  min-height: 24px;
  padding: 0 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fd-canvas-header-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fd-canvas-form-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fd-canvas-header-count {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 12px;
  flex-shrink: 0;
}
.fd-canvas-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.ff-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  margin-bottom: 2px;
  background: var(--color-bg-card);
  cursor: pointer;
}
.ff-item.ff-selected {
  border-color: var(--color-selected-border);
  background: var(--color-selected-bg);
}
.drag-handle {
  cursor: move;
  color: #ccc;
}
.ff-label {
  flex: 1;
  font-size: 13px;
}
.choice-codelist-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}
.choice-codelist-select {
  flex: 1;
  min-width: 0;
}
.choice-codelist-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.choice-codelist-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.choice-codelist-actions :deep(.choice-codelist-icon-btn) {
  width: 28px;
  height: 28px;
  padding: 0;
}
.color-picker {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}
.color-option {
  width: 20px;
  height: 20px;
  border-radius: 2px;
  cursor: pointer;
  border: 1px solid #eee;
}
.color-option-default {
  width: auto;
  min-width: 36px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  border-style: dashed;
}
.color-option.color-selected {
  border: 2px solid var(--color-primary);
}

.designer-shell {
  display: grid;
  /* 比例经 inline :style 注入 CSS 变量（可拖拽分栏，usePaneSplit 持久化） */
  grid-template-columns: var(--main-first, 0.38fr) 6px var(--main-second, 0.62fr);
  grid-template-rows: var(--left-first, 0.5fr) 6px var(--left-second, 0.5fr);
  grid-template-areas:
    'fields hresizer preview'
    'lresizer hresizer preview'
    'editor hresizer preview';
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-body);
}

.designer-fields-panel {
  grid-area: fields;
}

.designer-left-resizer {
  grid-area: lresizer;
}

.pane-h-resizer {
  grid-area: hresizer;
  position: relative;
  width: 6px;
  /* resizer 是 <button>：浏览器默认 2px outset 边框会与 ::before 分隔线叠加成双线，必须显式移除 */
  border: none;
  padding: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}

/* 三面板之间的单条细线：resizer 轨道中心画 1px 竖线（内缘卡片边框已移除） */
.pane-h-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--color-border);
  transform: translateX(-50%);
}

.pane-h-resizer:hover {
  background: var(--color-primary-subtle);
}

/* 窄屏（约 1100px 以下）退化为上下堆叠：字段列表 + 属性在上，预览在下，隐藏横向拖拽条 */
@media (max-width: 1100px) {
  .designer-shell {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(240px, 42vh) 6px minmax(220px, 30vh) minmax(300px, auto);
    grid-template-areas:
      'fields'
      'lresizer'
      'editor'
      'preview';
    overflow-y: auto;
  }
  .pane-h-resizer {
    display: none;
  }
  /* 堆叠时右侧/左侧成为页面外缘 → 恢复边框（preview 顶边去边框须位于基础规则之后，见文件尾媒体块）；
     整列堆叠无内缘圆角需求，清除外缘分角 */
  .designer-fields-panel,
  .designer-editor-card,
  .designer-preview-pane {
    border-radius: 0;
  }
  .designer-fields-panel {
    border-right: 1px solid var(--color-border);
  }
  .designer-editor-card {
    border-right: 1px solid var(--color-border);
  }
  .designer-preview-pane {
    border-left: 1px solid var(--color-border);
  }
}

.designer-dialog-header {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 32px;
  white-space: nowrap;
}

.designer-dialog-header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.designer-dialog-title {
  flex: 0 1 auto;
  min-width: 0;
  /* 允许下拉框完整交互；ellipsis 留给前缀文案即可 */
  overflow: visible;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.designer-dialog-title-prefix {
  flex: 0 0 auto;
}

.designer-form-switch {
  min-width: 160px;
  max-width: min(360px, 40vw);
}

/* 去掉下拉聚焦时的强选中光标/描边提醒 */
.designer-form-switch :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
  cursor: pointer;
}
.designer-form-switch :deep(.el-select__wrapper.is-focused),
.designer-form-switch :deep(.el-select__wrapper.is-hovering:not(.is-focused)) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.designer-form-switch :deep(.el-select__caret),
.designer-form-switch :deep(.el-select__suffix) {
  cursor: pointer;
}
.designer-form-switch :deep(.el-select__selected-item),
.designer-form-switch :deep(.el-select__input) {
  cursor: pointer;
  caret-color: transparent;
}

.designer-fields-panel {
  height: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color var(--transition-fast);
  /* 三块主工作区之间只留一条细线：内缘边框移除，由 resizer ::before 的 1px 分隔线承担；
     无阴影光晕、仅外缘圆角，避免相邻面板视觉上出现第二条线 */
  border-top: 1px solid var(--color-border);
  border-left: 1px solid var(--color-border);
  border-radius: var(--radius-md) 0 0 0;
  background: var(--color-bg-card);
}

.designer-field-list {
  padding: 4px;
}

.designer-editor-card,
.designer-preview-pane,
.designer-preview-viewport {
  min-height: 0;
}

.designer-editor-card {
  grid-area: editor;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  border-radius: 0 0 0 var(--radius-md);
  background: var(--color-bg-card);
  overflow: hidden;
}

.pane-v-resizer {
  position: relative;
  height: 6px;
  border: none;
  padding: 0;
  cursor: row-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}

/* 字段列表与属性编辑之间的单条细线：resizer 轨道中心画 1px 横线 */
.pane-v-resizer::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--color-border);
  transform: translateY(-50%);
}

.pane-v-resizer:hover {
  background: var(--color-primary-subtle);
}

.designer-section-title {
  padding: 8px 12px;
  background: var(--color-bg-hover);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
}

.fd-canvas-header-notes {
  /* 摘要已收敛为「只取第一行」，框宽跟随文字；min-width: 0 + ellipsis 保证空间不足时仍可收缩省略 */
  flex: 0 1 auto;
  min-width: 0;
  max-width: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: normal;
  color: var(--color-text-secondary);
  /* 独立胶囊：卡片底 + 掺主色实线边 + 阴影，暗色顶栏 primary-subtle/hover/border 几乎同色时仍一眼可见 */
  background: var(--color-bg-card);
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
  padding: 0 10px;
  line-height: 18px;
  cursor: help;
}

.designer-empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.designer-readonly-hint {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
  padding: 12px;
}

.designer-editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

/* 固定底部动作栏：滚动区之外，与卡片标题同框（无分隔框线，2.9） */
.designer-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-bg-card);
  flex-shrink: 0;
}

.designer-editor-actions-spacer {
  flex: 1;
}

.designer-editor-actions .el-button--primary {
  min-width: 88px;
}

/* 字段库自动完成候选条目：OID + 标签 + 类型 + 状态 */
.fd-autocomplete-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  line-height: 1.4;
}

.fd-autocomplete-item.is-added {
  opacity: 0.55;
}

.fd-autocomplete-oid {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fd-autocomplete-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.fd-autocomplete-type {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-muted);
}

.fd-autocomplete-state {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-primary);
}

.designer-preview-pane {
  grid-area: preview;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  background: var(--color-bg-card);
  overflow: hidden;
}

.designer-preview-viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0;
}

.designer-preview-stage {
  width: 100%;
  min-height: 100%;
}

.designer-preview-page {
  position: static;
  width: 100%;
  min-height: 100%;
  transform: none;
}

.designer-scaled-word-page {
  width: 21cm;
  min-height: 29.7cm;
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.designer-scaled-word-page.landscape {
  width: 29.7cm;
  min-height: 21cm;
}

.wp-form-title-row {
  position: relative;
  min-height: 0.7cm;
  margin-bottom: 24px;
  padding-right: 4.8cm;
}

.wp-form-title-row .wp-form-title {
  margin-bottom: 0;
}

.wp-acrf-annotation {
  position: absolute;
  top: var(--acrf-annotation-top);
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--acrf-annotation-width);
  height: var(--acrf-annotation-height);
  max-width: min(var(--acrf-annotation-max-width), 100%);
  padding: var(--acrf-annotation-padding-y) var(--acrf-annotation-padding-x);
  box-sizing: border-box;
  border: var(--acrf-annotation-border-width) solid #c00000;
  border-radius: 2px;
  background: #fff2f2;
  color: #c00000;
  font-family: 'SimSun', serif;
  font-size: var(--acrf-annotation-font-size);
  font-weight: normal;
  white-space: nowrap;
  overflow: visible;
  user-select: none;
  touch-action: none;
  z-index: 3;
}

.wp-acrf-annotation__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wp-acrf-annotation--interactive {
  cursor: ns-resize;
}

.wp-acrf-annotation-reset {
  position: absolute;
  top: -8px;
  right: -8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #c00000;
  border-radius: 999px;
  background: #fff;
  color: #c00000;
  font-size: 10px;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset {
  opacity: 1;
}

.wp-acrf-annotation-reset:hover:not(:disabled),
.wp-acrf-annotation-reset:focus-visible:not(:disabled) {
  background: #c00000;
  color: #fff;
  outline: none;
}

.wp-acrf-annotation-reset:disabled {
  cursor: not-allowed;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled {
  opacity: 0.45;
}

.wp-acrf-annotation--inline-header {
  z-index: 4;
}

/* 预览表格列宽拖拽（R5） */
.col-resize-host {
  position: relative;
  margin-bottom: 4px;
}
/* !important 确保设计器拖拽场景下始终固定布局 */
.col-resize-host > table,
.col-resize-host > table.inline-table {
  width: 100% !important;
  table-layout: fixed !important;
  margin: 0;
}
.resizer-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  transform: translateX(-5px);
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}
.resizer-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  background: transparent;
  pointer-events: none;
  transition: background 0.15s;
}
.resizer-handle:hover::after,
.resizer-handle:active::after {
  background: var(--color-primary);
}
.snap-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-primary);
  pointer-events: none;
  z-index: 1;
}
.unified-table-host {
  cursor: default;
}

/* 窄屏堆叠：preview 顶边与 editor 底边相邻 → 去自身顶边框避免双线。
   必须位于 .designer-preview-pane 基础规则之后（同特异性下后声明者胜）。 */
@media (max-width: 1100px) {
  .designer-preview-pane {
    border-top: none;
  }
}
</style>
