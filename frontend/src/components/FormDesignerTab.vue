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
import { Check, EditPen, InfoFilled, Plus } from '@element-plus/icons-vue';
import { api, genCode, genFieldVarName, truncRefs } from '../composables/useApi';
import { useSortableTable } from '../composables/useSortableTable';
import { rankFuzzyMatches } from '../composables/searchRanking';
import {
  buildFieldDefinitionCreatePayload,
  isLabelFieldDefinition,
  isVisibleInFieldLibrary,
} from '../composables/fieldDefinitionVisibility';
import { useColumnResize } from '../composables/useColumnResize';
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
import { normalizeHexColorInput, syncFieldTypeSpecificProps } from '../composables/formDesignerPropertyEditor';
import { markPerfEnd, markPerfStart, recordPerfEvent } from '../composables/usePerfBaseline';
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldLabelPreviewStyle,
  getFormFieldTextColorStyle,
} from '../composables/formFieldPresentation';
import { buildPreviewGroupViewModels } from '../composables/formDesignerPreviewModel';
import { confirmDelete } from '../composables/projectDeleteConfirmation';
import { useOrdinalQuickEdit } from '../composables/useOrdinalQuickEdit';
import { resolveNormalTableAvailableCm, resolveInlineTableAvailableCm } from '../composables/visitPreviewLandscape';

const props = defineProps({ projectId: { type: Number, required: true } });
const refreshKey = inject('refreshKey', ref(0));
const editMode = inject('editMode', ref(false));
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
const filteredForms = computed(() => {
  const orderedForms = [...forms.value].sort((a, b) => {
    const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a?.id ?? 0) - (b?.id ?? 0);
  });
  return rankFuzzyMatches(orderedForms, searchForm.value, (item) => Object.values(item));
});
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
const dragSrcId = ref(null);
const dragOverIdx = ref(null);
const deletingFieldIds = ref(new Set());
const viewMode = ref(resolveInitialViewMode(editMode.value, readStoredViewMode()));
const designerHistory = useDesignerHistory();
let formFieldsLoadSession = 0;
let formSelectionSession = 0;

writeStoredViewMode(viewMode.value);

// 新增字段本地草稿：点「新建字段」先生成临时草稿对象（不落库），保存才 POST 建定义+建实例。
// 草稿带完整本地 field_definition，预览/渲染按本地数据工作，仅在发起网络请求处按草稿短路。
const DRAFT_FIELD_ID = '__draft__';
const savingDraft = ref(false);
function isDraftField(ff) {
  return ff?.__draft === true || ff?.id === DRAFT_FIELD_ID;
}
const hasDraft = computed(() => formFields.value.some(isDraftField));

function invalidateFormSelectionSession() {
  formSelectionSession += 1;
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
  invalidateFormSelectionSession();
  selectedForm.value = forms.value.find((f) => f.id === selectedFormId) || null;
  if (!selectedForm.value) formFields.value = [];
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

async function loadFieldDefs() {
  fieldDefs.value = await api.cachedGet(`/api/projects/${props.projectId}/field-definitions`);
}
async function loadCodelists() {
  codelists.value = await api.cachedGet(`/api/projects/${props.projectId}/codelists`);
}
async function loadUnits() {
  units.value = await api.cachedGet(`/api/projects/${props.projectId}/units`);
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

async function loadFormFields(formId = selectedForm.value?.id ?? null) {
  const sessionId = ++formFieldsLoadSession;
  if (!formId) {
    formFields.value = [];
    selectedIds.value = [];
    return;
  }
  const loadedFields = await api.cachedGet(`/api/forms/${formId}/fields`);
  if (sessionId !== formFieldsLoadSession || selectedForm.value?.id !== formId) return;
  formFields.value = sortFormFieldsByOrder(loadedFields);
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

async function updateForm() {
  try {
    const refs = await api.get(`/api/forms/${editFormTarget.value.id}/references`);
    if (refs.length) {
      const msg = truncRefs(
        refs.map((r) => r.visit_name),
        5,
        '、',
      );
      await ElMessageBox.confirm(`修改将影响以下访视：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' });
    }
    if (
      editFormPaperOrientation.value === 'portrait' &&
      editFormTarget.value?.id === selectedForm.value?.id &&
      needsLandscape.value
    ) {
      await ElMessageBox.confirm('当前内容较宽，纵向显示可能出现换行或截断，仍要保存？', '纸张方向提醒', {
        type: 'warning',
      });
    }
    await api.put(`/api/forms/${editFormTarget.value.id}`, {
      name: editFormName.value,
      code: editFormCode.value,
      paper_orientation: editFormPaperOrientation.value,
    });
    showEditForm.value = false;
    reloadForms();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
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
    is_log_row: !!ff.is_log_row,
    label_override: ff.label_override ?? null,
    default_value: ff.default_value ?? null,
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

// 回放一份属性状态（字段定义 + 实例 + 颜色），undo / redo 共用。
async function applyFieldPropState(ctx, state) {
  const { formId, projectId, ffId, fieldDefinitionId } = ctx;
  if (state.is_log_row) {
    await api.put(`/api/form-fields/${ffId}`, { label_override: state.label_override });
  } else {
    await api.put(`/api/projects/${projectId}/field-definitions/${fieldDefinitionId}`, { ...state.fd });
    await api.put(`/api/form-fields/${ffId}`, { default_value: state.default_value });
  }
  // 颜色与标签样式对日志行与普通字段都适用，与正向保存 saveFieldProp 的无条件 PATCH 对齐。
  await api.patch(`/api/form-fields/${ffId}/colors`, {
    bg_color: state.bg_color,
    text_color: state.text_color,
    label_bold: state.label_bold,
    label_font_size: state.label_font_size,
  });
  await reloadAfterReplay(formId, { defs: true, focusFieldId: ffId });
}

// 记录一次排序命令（拖拽与键盘排序共用）。
function recordReorderHistory(formId, previousOrder, nextOrder) {
  designerHistory.record({
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

async function addField(fd) {
  if (!selectedForm.value) return ElMessage.warning('请先选择表单');
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!proceed) return;
  }
  const formId = selectedForm.value.id;
  try {
    const created = await api.post(`/api/forms/${formId}/fields`, { field_definition_id: fd.id });
    await loadFormFields(formId);
    designerHistory.record({
      label: '新增字段',
      ids: { ffId: created.id, fdId: fd.id },
      undo: async (ids) => {
        await api.del(`/api/form-fields/${ids.ffId}`);
        await reloadAfterReplay(formId);
      },
      redo: async (ids, { remapId }) => {
        const recreated = await api.post(`/api/forms/${formId}/fields`, { field_definition_id: ids.fdId });
        remapId(ids.ffId, recreated.id);
        await reloadAfterReplay(formId);
      },
    });
  } catch (e) {
    ElMessage.error(e.message);
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
  if (deletingFieldIds.value.has(ff.id)) return;
  const formId = selectedForm.value?.id;
  const snapshot = buildReplaySnapshot(ff);
  const shouldReloadDefs = Boolean(snapshot.fieldDefinitionPayload);
  try {
    await confirmFormChange();
    deletingFieldIds.value = new Set([...deletingFieldIds.value, ff.id]);
    await api.del(`/api/form-fields/${ff.id}`);
    formFields.value = formFields.value.filter((f) => f.id !== ff.id);
    await reloadAfterReplay(formId, { defs: shouldReloadDefs });
    designerHistory.record({
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
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  } finally {
    const next = new Set(deletingFieldIds.value);
    next.delete(ff.id);
    deletingFieldIds.value = next;
  }
}

async function batchDelete() {
  if (!selectedIds.value.length) return;
  const formId = selectedForm.value?.id;
  const ids = [...selectedIds.value];
  const snapshots = formFields.value
    .filter((f) => ids.includes(f.id))
    .map((f) => ({ ffId: f.id, snapshot: buildReplaySnapshot(f) }));
  const shouldReloadDefs = snapshots.some((item) => Boolean(item.snapshot.fieldDefinitionPayload));
  try {
    await confirmFormChange();
    await api.post(`/api/forms/${formId}/fields/batch-delete`, { ids });
    selectedIds.value = [];
    await reloadAfterReplay(formId, { defs: shouldReloadDefs });
    designerHistory.record({
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
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}

// 拖拽排序
function onDragStart(ff) {
  dragSrcId.value = ff.id;
}
function onDragOver(e, idx) {
  e.preventDefault();
  dragOverIdx.value = idx;
}
function onDragLeave() {
  dragOverIdx.value = null;
}
function normalizeFormFieldOrder(fields) {
  return fields.map((field, index) => ({ ...field, order_index: index + 1 }));
}

async function onDrop(e, targetIdx) {
  e.preventDefault();
  dragOverIdx.value = null;
  recordPerfEvent({
    type: 'instant',
    name: 'designer_reorder_field',
    project_id: props.projectId,
    form_id: selectedForm.value?.id ?? null,
  });
  const srcIdx = formFields.value.findIndex((f) => f.id === dragSrcId.value);
  if (srcIdx === -1 || srcIdx === targetIdx) return;
  if (hasDraft.value) return ElMessage.warning('请先保存或丢弃新增字段草稿');
  const formId = selectedForm.value.id;
  const previousOrder = formFields.value.map((f) => f.id);
  try {
    const arr = [...formFields.value];
    const [item] = arr.splice(srcIdx, 1);
    arr.splice(targetIdx, 0, item);
    const normalized = normalizeFormFieldOrder(arr);
    const nextOrder = normalized.map((f) => f.id);
    formFields.value = normalized;
    await api.post(`/api/forms/${formId}/fields/reorder`, { ordered_ids: nextOrder });
    api.invalidateCache(`/api/forms/${formId}/fields`);
    await loadFormFields();
    recordReorderHistory(formId, previousOrder, nextOrder);
  } catch (e) {
    ElMessage.warning('排序保存失败，已恢复');
    loadFormFields();
  }
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
    selectField(field);
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
  const move = async (from, to) => {
    if (to < 0 || to >= formFields.value.length) return;
    if (hasDraft.value) return ElMessage.warning('请先保存或丢弃新增字段草稿');
    const formId = selectedForm.value.id;
    const previousOrder = formFields.value.map((f) => f.id);
    try {
      const arr = [...formFields.value];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      const normalized = normalizeFormFieldOrder(arr);
      const nextOrder = normalized.map((f) => f.id);
      formFields.value = normalized;
      await api.post(`/api/forms/${formId}/fields/reorder`, { ordered_ids: nextOrder });
      api.invalidateCache(`/api/forms/${formId}/fields`);
      await loadFormFields();
      nextTick(() => fieldItemRefs.value[formFields.value[to].id]?.focus());
      recordReorderHistory(formId, previousOrder, nextOrder);
    } catch (e) {
      ElMessage.warning('排序保存失败，已恢复');
      loadFormFields();
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

const usedDefIds = computed(() => new Set(formFields.value.map((f) => f.field_definition_id)));

// 字段库搜索
const fieldSearch = ref('');
const filteredFieldDefs = computed(() =>
  rankFuzzyMatches(fieldDefs.value.filter(isVisibleInFieldLibrary), fieldSearch.value, (fd) => [
    fd.label,
    fd.variable_name,
  ]),
);

// 渲染逻辑
function renderCtrl(fd, fillLineChars = null) {
  if (!fd) return '________________';
  const field = {
    field_type: fd.field_type,
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

function renderCellHtml(ff, fillLineChars = null, columnCm = null) {
  const previewField = getPreviewField(ff);
  if (!previewField) return '<span class="fill-line"></span>';
  const defaultValue = getScopedDefaultValue(ff, false);
  if (defaultValue) return toHtml(defaultValue);
  return renderCtrlHtml(previewField, fillLineChars, columnCm);
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

function getInlineRows(fields, fillCharsByCol = null, columnCmsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null;
    const columnCm = columnCmsByCol ? (columnCmsByCol[i] ?? null) : null;
    const defaultValue = getScopedDefaultValue(ff);
    if (defaultValue) {
      const lines = normalizeDefaultValue(defaultValue).split('\n');
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return {
        lines: lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: toHtml(renderCtrl(ff.field_definition, fillChars, columnCm)),
      };
    }
    // 选项类用结构化渲染（renderCtrlHtml→renderChoiceHtml 产出 .choice-atom），
    // 使纵向选项尾线按 .choice-group--vertical .choice-atom .fill-line 的 flex 规则填满剩余宽、不溢出；
    // 非选项类等价于 toHtml(renderCtrl(...))。与 TemplatePreviewDialog 保持一致。
    const ctrl = renderCtrlHtml(getPreviewField(ff), fillChars, columnCm);
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
      codelist_id: codelistId,
      unit_id: unitId,
      codelist: codelistId ? resolveCodelist(codelistId) : null,
      unit: unitId ? resolveUnit(unitId) : null,
    },
  };
}

const pendingFieldPropSnapshotVersion = ref(0);
const pendingFieldPropSnapshotMap = computed(() => {
  pendingFieldPropSnapshotVersion.value;
  return new Map(pendingFieldPropSnapshots.map((snapshot) => [snapshot.fieldId, snapshot]));
});
const liveEditSnapshot = computed(() => {
  if (!selectedFieldId.value) return null;
  return buildFieldPropSnapshot(selectedFieldId.value);
});
const designerPreviewFields = computed(() => {
  return designerVisibleFields.value.map((field) => {
    const pendingSnapshot = pendingFieldPropSnapshotMap.value.get(field.id);
    const liveSnapshot = liveEditSnapshot.value?.fieldId === field.id ? liveEditSnapshot.value : null;
    return applyPreviewSnapshot(field, liveSnapshot || pendingSnapshot);
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

const libraryWidth = ref(parseInt(localStorage.getItem('crf_libraryWidth')) || 240);
const isLibResizing = ref(false);
watch(libraryWidth, (v) => localStorage.setItem('crf_libraryWidth', v));
function startLibResize(e) {
  isLibResizing.value = true;
  const startX = e.clientX,
    startW = libraryWidth.value;
  function onMove(e) {
    libraryWidth.value = Math.max(140, Math.min(400, startW + e.clientX - startX));
  }
  function onUp() {
    isLibResizing.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const previewPaneWidth = 460;
const propWidth = computed(() => previewPaneWidth);

const formDesignNotes = ref('');
let notesTimer = null;
let notesPendingSave = null;
let notesSavePromise = null;
let notesAutoSaveErrorShown = false;
const previewDesignNotesText = computed(() => String(selectedForm.value?.design_notes ?? ''));
const HEADER_NOTES_MAX_LENGTH = 20;
const headerDesignNotesSummary = computed(() => {
  const raw = previewDesignNotesText.value.replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > HEADER_NOTES_MAX_LENGTH ? raw.slice(0, HEADER_NOTES_MAX_LENGTH) + '…' : raw;
});
const headerDesignNotesTooltip = computed(() => previewDesignNotesText.value);

watch(
  () => selectedForm.value?.id,
  (formId) => {
    clearTimeout(notesTimer);
    notesAutoSaveErrorShown = false;
    const current = forms.value.find((f) => f.id === formId) || selectedForm.value;
    formDesignNotes.value = current?.design_notes || '';
  },
);

function buildDesignNotesSaveSnapshot({
  form = selectedForm.value,
  projectId = props.projectId,
  notes = formDesignNotes.value,
} = {}) {
  if (!form?.id) return null;
  return { formId: form.id, projectId, notes: String(notes ?? '') };
}

async function persistDesignNotesSnapshot(snapshot) {
  await api.put(`/api/forms/${snapshot.formId}`, { design_notes: snapshot.notes });
  mergeFormIntoState({ id: snapshot.formId, design_notes: snapshot.notes });
  api.invalidateCache(`/api/projects/${snapshot.projectId}/forms`);
  notesAutoSaveErrorShown = false;
}

async function flushDesignNotesSave(snapshot = buildDesignNotesSaveSnapshot()) {
  clearTimeout(notesTimer);
  if (snapshot) notesPendingSave = snapshot;
  if (!notesPendingSave && !notesSavePromise) return true;
  if (notesSavePromise) return notesSavePromise;
  notesSavePromise = (async () => {
    try {
      while (notesPendingSave) {
        const queuedSave = notesPendingSave;
        notesPendingSave = null;
        try {
          await persistDesignNotesSnapshot(queuedSave);
        } catch (e) {
          if (!notesAutoSaveErrorShown) {
            ElMessage.error(`设计备注保存失败：${e.message}`);
            notesAutoSaveErrorShown = true;
          }
          if (!notesPendingSave) notesPendingSave = queuedSave;
          break;
        }
      }
      return !notesPendingSave;
    } finally {
      notesSavePromise = null;
    }
  })();
  return notesSavePromise;
}

async function selectForm(nextForm) {
  const sessionId = ++formSelectionSession;
  const currentForm = selectedForm.value;
  const eventName = currentForm ? 'designer_switch_form' : 'designer_select_form';
  markPerfStart(eventName, { project_id: props.projectId, form_id: nextForm?.id ?? null });
  if ((currentForm?.id ?? null) === (nextForm?.id ?? null)) return;
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (sessionId !== formSelectionSession) return;
    if (!proceed) {
      formsTableRef.value?.setCurrentRow(currentForm);
      return;
    }
  }
  const annotationFlushSucceeded = await flushAnnotationPositionSave({ cancelActiveDrag: true });
  if (sessionId !== formSelectionSession) return;
  if (!annotationFlushSucceeded && currentForm?.id) {
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  const flushSucceeded = await flushDesignNotesSave(buildDesignNotesSaveSnapshot({ form: currentForm }));
  if (sessionId !== formSelectionSession) return;
  if (!flushSucceeded && currentForm?.id) {
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  const canLeaveFieldProp = await resolveFieldPropLeave({
    resetOptions: { preserveEditor: true },
    actionText: '切换表单',
  });
  if (sessionId !== formSelectionSession) return;
  if (!canLeaveFieldProp) {
    formsTableRef.value?.setCurrentRow(currentForm);
    return;
  }
  resetFieldPropAutoSaveState();
  formFields.value = [];
  selectedIds.value = [];
  selectedForm.value = nextForm || null;
  markPerfEnd(eventName, { project_id: props.projectId, form_id: nextForm?.id ?? null });
}

function onNotesInput() {
  notesAutoSaveErrorShown = false;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    void flushDesignNotesSave();
  }, 500);
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
  try {
    const supportsDefaultValue = isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark));
    const normalizedDefaultValue = supportsDefaultValue
      ? normalizeDefaultValue(quickEditProp.default_value, !quickEditProp.inline_mark)
      : '';
    const payload = {
      label_override: quickEditProp.label,
      bg_color: quickEditProp.bg_color || null,
      text_color: quickEditProp.text_color || null,
      inline_mark: quickEditProp.inline_mark ? 1 : 0,
      default_value: normalizedDefaultValue || null,
      label_bold: quickEditProp.label_bold,
      label_font_size: quickEditProp.label_font_size === 'default' ? null : quickEditProp.label_font_size,
    };
    const updated = await api.put(`/api/form-fields/${quickEditField.value.id}`, payload);
    const currentField = {
      ...quickEditField.value,
      ...updated,
      field_definition: quickEditField.value.field_definition,
    };
    quickEditField.value = currentField;
    syncSelectedField(currentField, { syncEditor: false });
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`);
      await loadFormFields();
    }
    ElMessage.success('已保存');
    showQuickEdit.value = false;
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message);
  }
}

async function toggleInline(ff) {
  if (isDraftField(ff)) return; // 草稿走属性编辑器写本地，不经真实实例 PATCH
  if (!selectedForm.value || !canToggleInline(ff)) return;
  recordPerfEvent({
    type: 'instant',
    name: 'designer_toggle_inline',
    project_id: props.projectId,
    form_id: selectedForm.value?.id ?? null,
    field_id: ff?.id ?? null,
  });
  try {
    await confirmFormChange();
    await api.patch(`/api/form-fields/${ff.id}/inline-mark`, {
      inline_mark: ff.inline_mark ? 0 : 1,
    });
    api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`);
    await loadFormFields();
    if (selectedFieldId.value === ff.id) {
      const refreshed = formFields.value.find((item) => item.id === ff.id);
      if (refreshed) editProp.inline_mark = refreshed.inline_mark || 0;
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
  codelist_id: null,
  unit_id: null,
  default_value: '',
  inline_mark: 0,
  bg_color: null,
  text_color: null,
  label_bold: 1,
  label_font_size: 'default',
});
let fieldPropSaveTimer = null;
let pendingFieldPropSnapshots = [];
let isHydratingFieldProp = false;
let isSavingFieldProp = false;
let fieldPropAutoSaveErrorShown = false;
let fieldPropSaveSession = 0;
let lastFieldPropSaveError = null;
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
  '标签',
];
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
const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MMM/yyyy', 'dd-MMM-yyyy', 'yyyy/MM/dd'],
  日期时间: ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm:ss', 'dd/MM/yyyy HH:mm:ss'],
  时间: ['HH:mm:ss', 'HH:mm', 'hh:mm:ss AP', 'hh:mm AP'],
};
const DEFAULT_DATE_FORMATS = { 日期: 'yyyy-MM-dd', 日期时间: 'yyyy-MM-dd HH:mm', 时间: 'HH:mm' };

watch(
  () => editProp.field_type,
  (newType) => {
    Object.assign(editProp, syncFieldTypeSpecificProps(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS));
  },
);

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

function upsertPendingFieldPropSnapshot(snapshot) {
  if (!snapshot?.fieldId) return;
  const snapshotKey = getFieldPropSnapshotKey(snapshot);
  pendingFieldPropSnapshots = [
    ...pendingFieldPropSnapshots.filter((item) => item.fieldId !== snapshot.fieldId),
    { ...snapshot, snapshotKey },
  ];
  pendingFieldPropSnapshotVersion.value += 1;
}

function hasPendingFieldPropSnapshot(fieldId, snapshotKey = '') {
  return pendingFieldPropSnapshots.some(
    (item) => item.fieldId === fieldId && (!snapshotKey || item.snapshotKey !== snapshotKey),
  );
}

function classifyFieldPropSaveError(error) {
  const message = String(error?.message || '').trim() || '字段属性保存失败';
  const status = Number(error?.status || error?.response?.status);
  let code = 'unknown';
  if (message === '自动保存上下文已变更') {
    code = 'context_changed';
  } else if (message === '单选/多选字段必须选择选项字典') {
    code = 'missing_codelist';
  } else if (Number.isFinite(status) && status > 0) {
    code = `http_${status}`;
  }
  const retryable =
    code !== 'context_changed' &&
    code !== 'missing_codelist' &&
    (!Number.isFinite(status) || status >= 500 || status === 429 || status === 408);
  return {
    code,
    message,
    status: Number.isFinite(status) ? status : null,
    retryable,
    discardable: code === 'missing_codelist',
  };
}

function buildFieldPropLeaveFailureResult(message, overrides = {}) {
  return {
    ok: false,
    message,
    retryable: false,
    discardable: false,
    code: 'unknown',
    ...overrides,
  };
}

function discardPendingFieldPropChanges(resetOptions = {}) {
  resetFieldPropAutoSaveState(resetOptions);
}

async function confirmDiscardFieldPropChanges(failure, { resetOptions = {}, actionText = '关闭' } = {}) {
  try {
    await ElMessageBox.confirm(
      `${failure.message}\n是否放弃当前未保存的字段属性修改并继续${actionText}？`,
      '字段属性未保存',
      {
        confirmButtonText: '继续修改',
        cancelButtonText: `放弃并${actionText}`,
        distinguishCancelAndClose: true,
        type: 'warning',
      },
    );
    return false;
  } catch (e) {
    if (e === 'cancel') {
      discardPendingFieldPropChanges(resetOptions);
      return true;
    }
    return false;
  }
}

function resetFieldPropAutoSaveState({ preserveEditor = false } = {}) {
  fieldPropSaveSession += 1;
  clearTimeout(fieldPropSaveTimer);
  fieldPropSaveTimer = null;
  pendingFieldPropSnapshots = [];
  pendingFieldPropSnapshotVersion.value += 1;
  isSavingFieldProp = false;
  fieldPropAutoSaveErrorShown = false;
  lastFieldPropSaveError = null;
  if (!preserveEditor) {
    selectedFieldId.value = null;
    Object.assign(editProp, {
      label: '',
      variable_name: '',
      field_type: '文本',
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
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

async function flushFieldPropSaveBeforeReset(resetOptions = {}) {
  const sessionId = fieldPropSaveSession;
  clearTimeout(fieldPropSaveTimer);
  fieldPropSaveTimer = null;
  lastFieldPropSaveError = null;
  const flushResult = await flushPendingFieldPropSave(sessionId);
  if (flushResult === false) {
    return buildFieldPropLeaveFailureResult(lastFieldPropSaveError?.message || '字段属性保存失败，请稍后重试', {
      ...lastFieldPropSaveError,
    });
  }
  if (isSavingFieldProp) {
    const settled = await new Promise((resolve) => {
      const check = () => {
        if (!isSavingFieldProp) {
          resolve(true);
          return;
        }
        if (sessionId !== fieldPropSaveSession) {
          resolve(false);
          return;
        }
        setTimeout(check, 20);
      };
      check();
    });
    if (!settled) {
      return buildFieldPropLeaveFailureResult(lastFieldPropSaveError?.message || '字段属性保存尚未完成，请稍后重试', {
        ...lastFieldPropSaveError,
      });
    }
  }
  if (pendingFieldPropSnapshots.length) {
    return buildFieldPropLeaveFailureResult(lastFieldPropSaveError?.message || '字段属性保存失败，请先处理后再离开', {
      ...lastFieldPropSaveError,
    });
  }
  resetFieldPropAutoSaveState(resetOptions);
  return { ok: true };
}

async function resolveFieldPropLeave({ resetOptions = {}, actionText = '关闭' } = {}) {
  const result = await flushFieldPropSaveBeforeReset(resetOptions);
  if (result.ok) return true;
  if (result.discardable) {
    return confirmDiscardFieldPropChanges(result, { resetOptions, actionText });
  }
  ElMessage.error(`字段属性未保存：${result.message}`);
  return false;
}

const currentFieldPropDraftKey = computed(() => getFieldPropSnapshotKey());

async function flushPendingFieldPropSave(sessionId = fieldPropSaveSession) {
  if (sessionId !== fieldPropSaveSession) return false;
  if (!pendingFieldPropSnapshots.length || isSavingFieldProp) return true;
  const [snapshot, ...rest] = pendingFieldPropSnapshots;
  pendingFieldPropSnapshots = rest;
  pendingFieldPropSnapshotVersion.value += 1;
  const snapshotKey = snapshot.snapshotKey || getFieldPropSnapshotKey(snapshot);
  let saveSucceeded = false;
  let flushFailed = false;
  let interrupted = false;
  let shouldContinue = false;
  isSavingFieldProp = true;
  try {
    await saveFieldProp(snapshot, sessionId);
    fieldPropAutoSaveErrorShown = false;
    saveSucceeded = true;
  } catch (e) {
    flushFailed = true;
    const failure = classifyFieldPropSaveError(e);
    lastFieldPropSaveError = failure;
    const isExpiredContext = failure.code === 'context_changed';
    if (!hasPendingFieldPropSnapshot(snapshot.fieldId, snapshotKey)) upsertPendingFieldPropSnapshot(snapshot);
    if (!fieldPropAutoSaveErrorShown && !isExpiredContext) {
      ElMessage.error(failure.message);
      fieldPropAutoSaveErrorShown = true;
    }
    if (classifyFieldPropSaveError(e).retryable) {
      clearTimeout(fieldPropSaveTimer);
      fieldPropSaveTimer = setTimeout(() => {
        void flushPendingFieldPropSave(sessionId);
      }, 1000);
    }
  } finally {
    interrupted = sessionId !== fieldPropSaveSession;
    isSavingFieldProp = false;
    if (!interrupted) {
      const isCurrentSelectedField = selectedFieldId.value === snapshot.fieldId;
      const hasNewerDraft = isCurrentSelectedField && getFieldPropSnapshotKey() !== snapshotKey;
      const hasQueuedDraft = hasPendingFieldPropSnapshot(snapshot.fieldId, snapshotKey);
      if (hasNewerDraft && !hasQueuedDraft) upsertPendingFieldPropSnapshot(buildFieldPropSnapshot(snapshot.fieldId));
      const shouldRefillEditor =
        selectedFieldId.value === snapshot.fieldId && !hasPendingFieldPropSnapshot(snapshot.fieldId);
      if (saveSucceeded && shouldRefillEditor) {
        const updated = formFields.value.find((f) => f.id === snapshot.fieldId);
        if (updated) selectField(updated);
      }
      if (saveSucceeded && pendingFieldPropSnapshots.length) {
        clearTimeout(fieldPropSaveTimer);
        shouldContinue = true;
      }
    }
  }
  if (interrupted) return false;
  if (shouldContinue) return flushPendingFieldPropSave(sessionId);
  return !flushFailed;
}

watch(currentFieldPropDraftKey, (draftKey) => {
  if (!draftKey || isHydratingFieldProp || draftKey === lastHydratedFieldPropDraftKey) return;
  // 草稿态：编辑只写本地草稿对象，不入队、不发自动保存请求。
  if (selectedFieldId.value === DRAFT_FIELD_ID) {
    applyEditorToDraft();
    lastHydratedFieldPropDraftKey = draftKey;
    return;
  }
  const snapshot = buildFieldPropSnapshot();
  if (!snapshot) return;
  fieldPropAutoSaveErrorShown = false;
  upsertPendingFieldPropSnapshot(snapshot);
  clearTimeout(fieldPropSaveTimer);
  fieldPropSaveTimer = setTimeout(() => {
    void flushPendingFieldPropSave(fieldPropSaveSession);
  }, 400);
});

function selectField(ff) {
  if (selectedFieldId.value && selectedFieldId.value !== ff.id) void flushPendingFieldPropSave();
  isHydratingFieldProp = true;
  selectedFieldId.value = ff.id;
  if (ff.is_log_row) {
    Object.assign(editProp, {
      label: ff.label_override || '以下为log行',
      variable_name: '',
      field_type: '日志行',
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      codelist_id: null,
      unit_id: null,
      default_value: '',
      inline_mark: 0,
      bg_color: ff.bg_color || null,
      text_color: ff.text_color || null,
      label_bold: ff.label_bold === 0 ? 0 : 1,
      label_font_size: ff.label_font_size || 'default',
    });
    customBgColorInput.value = ff.bg_color && !BG_COLOR_OPTIONS.some((o) => o.value === ff.bg_color) ? ff.bg_color : '';
    customTextColorInput.value =
      ff.text_color && !TEXT_COLOR_OPTIONS.some((o) => o.value === ff.text_color) ? ff.text_color : '';
    lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey(buildFieldPropSnapshot(ff.id));
    isHydratingFieldProp = false;
    return;
  }
  const fd = ff.field_definition;
  if (!fd) {
    lastHydratedFieldPropDraftKey = '';
    isHydratingFieldProp = false;
    return;
  }
  Object.assign(editProp, {
    label: fd.label || '',
    variable_name: fd.variable_name || '',
    field_type: fd.field_type || '文本',
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
    codelist_id: fd.codelist_id,
    unit_id: fd.unit_id ?? null,
    default_value: ff.default_value || '',
    inline_mark: ff.inline_mark || 0,
    bg_color: ff.bg_color || null,
    text_color: ff.text_color || null,
    label_bold: ff.label_bold === 0 ? 0 : 1,
    label_font_size: ff.label_font_size || 'default',
  });
  customBgColorInput.value = ff.bg_color && !BG_COLOR_OPTIONS.some((o) => o.value === ff.bg_color) ? ff.bg_color : '';
  customTextColorInput.value =
    ff.text_color && !TEXT_COLOR_OPTIONS.some((o) => o.value === ff.text_color) ? ff.text_color : '';
  lastHydratedFieldPropDraftKey = getFieldPropSnapshotKey(buildFieldPropSnapshot(ff.id));
  isHydratingFieldProp = false;
}

async function saveFieldProp(snapshot = buildFieldPropSnapshot(), sessionId = fieldPropSaveSession) {
  if (!snapshot?.fieldId) return;
  if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更');
  const ff = formFields.value.find((f) => f.id === snapshot.fieldId);
  const formId = selectedForm.value?.id;
  const projectId = snapshot.projectId;
  if (!ff || !formId || projectId !== props.projectId) throw new Error('自动保存上下文已变更');
  if (!ff.is_log_row && isChoiceField(snapshot.field_type) && !snapshot.codelist_id)
    throw new Error('单选/多选字段必须选择选项字典');
  const propEditFieldId = ff.id;
  const propEditDefinitionId = ff.field_definition_id;
  const beforePropState = snapshotFieldPropState(ff);
  if (ff.is_log_row) {
    const updated = await api.put(`/api/form-fields/${ff.id}`, { label_override: snapshot.label });
    if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更');
    syncSelectedField(updated, { syncEditor: false });
    api.invalidateCache(`/api/forms/${formId}/fields`);
  } else {
    const supportsDefaultValue = isDefaultValueSupported(snapshot.field_type, Boolean(snapshot.inline_mark));
    const normalizedDefaultValue = supportsDefaultValue
      ? normalizeDefaultValue(snapshot.default_value, !snapshot.inline_mark)
      : '';
    const updatedDefinition = await api.put(`/api/projects/${projectId}/field-definitions/${ff.field_definition_id}`, {
      label: snapshot.label,
      variable_name: snapshot.variable_name,
      field_type: snapshot.field_type,
      integer_digits: snapshot.integer_digits,
      decimal_digits: snapshot.decimal_digits,
      date_format: snapshot.date_format,
      codelist_id: snapshot.codelist_id,
      unit_id: snapshot.unit_id ?? null,
    });
    if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更');
    let currentField = { ...ff, field_definition: { ...ff.field_definition, ...updatedDefinition } };
    syncSelectedField(currentField, { syncEditor: false });
    api.invalidateCache(`/api/forms/${formId}/fields`);
    const updatedField = await api.put(`/api/form-fields/${ff.id}`, { default_value: normalizedDefaultValue });
    if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更');
    currentField = { ...currentField, ...updatedField, field_definition: currentField.field_definition };
    syncSelectedField(currentField, { syncEditor: false });
  }
  const baseField = formFields.value.find((f) => f.id === ff.id) || ff;
  const updatedColors = await api.patch(`/api/form-fields/${ff.id}/colors`, {
    bg_color: snapshot.bg_color,
    text_color: snapshot.text_color,
    label_bold: snapshot.label_bold,
    label_font_size: snapshot.label_font_size,
  });
  if (sessionId !== fieldPropSaveSession) throw new Error('自动保存上下文已变更');
  syncSelectedField(
    { ...baseField, ...updatedColors, field_definition: baseField.field_definition },
    { syncEditor: false },
  );
  await loadFormFields();
  const afterField = formFields.value.find((f) => f.id === propEditFieldId);
  const afterPropState = snapshotFieldPropState(afterField);
  if (afterPropState && beforePropState && !sameFieldPropState(beforePropState, afterPropState)) {
    designerHistory.record({
      label: '编辑属性',
      ids: { ffId: propEditFieldId, fdId: propEditDefinitionId },
      undo: async (ids) => {
        await applyFieldPropState({ formId, projectId, ffId: ids.ffId, fieldDefinitionId: ids.fdId }, beforePropState);
      },
      redo: async (ids) => {
        await applyFieldPropState({ formId, projectId, ffId: ids.ffId, fieldDefinitionId: ids.fdId }, afterPropState);
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
  if (!selectedForm.value) return;
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!proceed) return;
  }
  const maxOrder = formFields.value.reduce((m, f) => Math.max(m, f?.order_index ?? 0), 0);
  const draft = {
    id: DRAFT_FIELD_ID,
    __draft: true,
    form_id: selectedForm.value.id,
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
      codelist_id: null,
      unit_id: null,
    },
  };
  formFields.value = [...formFields.value, draft];
  selectField(draft);
}

// 保存草稿：依次 POST 建定义 + 建实例，成功后移除草稿并用真实记录刷新；失败保留草稿与编辑内容。
// 返回 true 表示保存成功。
async function saveDraftField() {
  const draft = formFields.value.find(isDraftField);
  if (!draft) return false;
  if (savingDraft.value) return false;
  const formId = selectedForm.value?.id;
  const projectId = props.projectId;
  if (!formId) return false;
  const fd = draft.field_definition || {};
  if (isChoiceField(fd.field_type) && !fd.codelist_id) {
    ElMessage.error('单选/多选字段必须选择选项字典');
    return false;
  }
  savingDraft.value = true;
  try {
    const definitionPayload = buildFieldDefinitionCreatePayload(fd);
    const supportsDefaultValue = isDefaultValueSupported(fd.field_type, Boolean(draft.inline_mark));
    const instancePayload = {
      default_value: supportsDefaultValue ? normalizeDefaultValue(draft.default_value, !draft.inline_mark) : '',
      inline_mark: draft.inline_mark ? 1 : 0,
      bg_color: draft.bg_color ?? null,
      text_color: draft.text_color ?? null,
      label_bold: draft.label_bold ?? 1,
      label_font_size: draft.label_font_size ?? null,
    };
    const createdFd = await api.post(`/api/projects/${projectId}/field-definitions`, definitionPayload);
    const createdFf = await api.post(`/api/forms/${formId}/fields`, {
      field_definition_id: createdFd.id,
      ...instancePayload,
    });
    formFields.value = formFields.value.filter((f) => !isDraftField(f));
    await loadFormFields(formId);
    await loadFieldDefs();
    const realFf = formFields.value.find((f) => f.id === createdFf.id);
    if (realFf) selectField(realFf);
    // 保存即一次「新建字段」，入撤销栈；撤销对称删除实例与定义（定义被其他表单引用则降级保留）。
    designerHistory.record({
      label: '新建字段',
      ids: { ffId: createdFf.id, fdId: createdFd.id },
      undo: async (ids) => {
        await api.del(`/api/form-fields/${ids.ffId}`);
        try {
          await api.del(`/api/field-definitions/${ids.fdId}`);
        } catch (err) {
          if (Number(err?.status ?? err?.response?.status) === 409) {
            ElMessage.warning('字段定义已被其他表单引用，已保留定义');
          } else {
            throw err;
          }
        }
        await reloadAfterReplay(formId, { defs: true });
      },
      redo: async (ids, { remapId }) => {
        const recreatedFd = await api.post(`/api/projects/${projectId}/field-definitions`, definitionPayload);
        remapId(ids.fdId, recreatedFd.id);
        const recreatedFf = await api.post(`/api/forms/${formId}/fields`, {
          field_definition_id: recreatedFd.id,
          ...instancePayload,
        });
        remapId(ids.ffId, recreatedFf.id);
        await reloadAfterReplay(formId, { defs: true });
      },
    });
    return true;
  } catch (e) {
    ElMessage.error(e.message);
    return false;
  } finally {
    savingDraft.value = false;
  }
}

// 字段行点击选中入口：存在草稿且点击非草稿字段时先确认保存/丢弃。
async function onSelectFieldClick(ff) {
  if (isDraftField(ff) || selectedFieldId.value === ff.id) {
    selectField(ff);
    return;
  }
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!proceed) return;
  }
  const fresh = formFields.value.find((f) => f.id === ff.id) || ff;
  selectField(fresh);
}

async function addLogRow() {
  if (!selectedForm.value) return;
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!proceed) return;
  }
  const formId = selectedForm.value.id;
  try {
    const created = await api.post(`/api/forms/${formId}/fields`, { is_log_row: 1, label_override: '以下为log行' });
    await loadFormFields();
    designerHistory.record({
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
    trailing_underscore: 0,
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
    trailing_underscore: opt.trailing_underscore || 0,
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
        trailing_underscore: opt.trailing_underscore || 0,
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
    trailing_underscore: o.trailing_underscore || 0,
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
    trailing_underscore: 0,
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
function toggleTrailingLine(row) {
  row.trailing_underscore = row.trailing_underscore ? 0 : 1;
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
    trailing_underscore: opt.trailing_underscore || 0,
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
        trailing_underscore: opt.trailing_underscore || 0,
      })),
    });

    api.invalidateCache(`/api/projects/${props.projectId}/codelists`);
    await loadCodelists();
    if (selectedForm.value) {
      api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`);
      await loadFormFields();
      const updated = formFields.value.find((f) => f.id === selectedFieldId.value);
      if (updated) selectField(updated);
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
      if (updated) selectField(updated);
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

async function ensureDesignerAuxiliaryDataLoaded() {
  if (designerAuxiliaryLoaded.value || designerAuxiliaryLoading.value) return;
  designerAuxiliaryLoading.value = true;
  designerAuxiliaryLoadError.value = '';
  try {
    await Promise.all([loadFieldDefs(), loadCodelists(), loadUnits()]);
    designerAuxiliaryLoaded.value = true;
  } catch (error) {
    designerAuxiliaryLoadError.value = error?.message || '加载失败';
    throw error;
  } finally {
    designerAuxiliaryLoading.value = false;
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
    const flushSnapshot = buildDesignNotesSaveSnapshot({ projectId: previousProjectId });
    const flushSucceeded = await flushDesignNotesSave(flushSnapshot);
    if (!flushSucceeded && selectedForm.value?.id) return;
    const canLeave = await resolveFieldPropLeave({ resetOptions: { preserveEditor: true }, actionText: '切换项目' });
    if (!canLeave) {
      fieldPropProjectId.value = previousProjectId;
      return;
    }
    fieldPropProjectId.value = newProjectId;
    designerAuxiliaryLoaded.value = false;
    designerAuxiliaryLoading.value = false;
    designerAuxiliaryLoadError.value = '';
    selectedForm.value = null;
    formFields.value = [];
    selectedFieldId.value = null;
    loadForms();
  },
);

async function canLeaveProject() {
  if (hasDraft.value) {
    const proceed = await confirmDiscardDraft();
    if (!proceed) return false;
  }
  const annotationFlushSucceeded = await flushAnnotationPositionSave({ cancelActiveDrag: true });
  if (!annotationFlushSucceeded && selectedForm.value?.id) return false;
  const flushSucceeded = await flushDesignNotesSave(buildDesignNotesSaveSnapshot());
  if (!flushSucceeded && selectedForm.value?.id) return false;
  return resolveFieldPropLeave({ resetOptions: { preserveEditor: true }, actionText: '切换项目' });
}

async function handleDesignerBeforeClose(done) {
  const canClose = await resolveFieldPropLeave({ actionText: '关闭设计窗口' });
  if (canClose) {
    refreshPreviewOverrideState(renderGroupsView.value, 'main');
    done();
  }
}

async function openDesigner() {
  markPerfStart('designer_open_fullscreen', { project_id: props.projectId, form_id: selectedForm.value?.id ?? null });
  try {
    await ensureDesignerAuxiliaryDataLoaded();
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
      <div style="margin-bottom: 12px; display: flex; gap: 8px">
        <el-button type="primary" size="small" @click="openAddForm">新建表单</el-button>
        <el-button type="danger" size="small" :disabled="!selForms.length" @click="batchDelForms"
          >批量删除({{ selForms.length }})</el-button
        >
        <el-input v-model="searchForm" placeholder="搜索表单..." clearable size="small" style="width: 180px" />
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
        @current-change="selectForm"
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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }"
            ><el-button size="small" link @click.stop="copyForm(row)">复制</el-button
            ><el-button size="small" link @click.stop="openEditForm(row)">编辑</el-button
            ><el-button type="danger" size="small" link @click.stop="delForm(row)">删除</el-button></template
          >
        </el-table-column>
      </el-table>
    </div>

    <div class="fd-right">
      <div class="fd-canvas" style="flex: 1">
        <div class="fd-canvas-header">
          <el-button v-if="selectedForm" size="small" type="primary" @click="openDesigner">设计表单</el-button>
          <el-switch
            v-if="selectedForm && editMode"
            v-model="viewMode"
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
              :content="headerDesignNotesTooltip"
            >
              <span class="fd-canvas-header-notes" data-test="canvas-notes-summary">{{
                headerDesignNotesSummary
              }}</span>
            </el-tooltip>
          </div>
          <span class="fd-canvas-header-count">共 {{ formFields.length }} 个字段</span>
        </div>
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
                                  renderCellHtml(ff, normalFillChars(gi, gv, 'main'), normalColumnCm(gi, gv, 'main'))
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
        <div class="designer-dialog-header">
          <div class="designer-dialog-header-main">
            <span :id="titleId" :class="[titleClass, 'designer-dialog-title']">设计：{{ selectedForm?.name || '' }}</span>
            <el-switch
              v-if="editMode"
              v-model="viewMode"
              inline-prompt
              active-text="aCRF"
              inactive-text="eCRF"
              :active-value="'aCRF'"
              :inactive-value="'eCRF'"
            />
          </div>
        </div>
      </template>
      <div class="designer-shell">
        <div class="fd-library designer-library-pane" :style="{ width: libraryWidth + 'px' }">
          <div class="fd-library-header">字段库</div>
          <div class="designer-pane-toolbar">
            <el-input v-model="fieldSearch" placeholder="搜索..." size="small" clearable />
          </div>
          <div class="fd-library-list">
            <button
              v-for="fd in filteredFieldDefs"
              :key="fd.id"
              type="button"
              class="fd-item"
              :style="usedDefIds.has(fd.id) ? 'opacity:0.4' : ''"
              @click="addField(fd)"
            >
              <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{
                fd.label
              }}</span
              ><span style="color: var(--color-text-muted); font-size: 11px; flex-shrink: 0">{{ fd.field_type }}</span>
            </button>
          </div>
        </div>
        <button type="button" class="fd-panel-resizer" aria-label="调整字段库宽度" @mousedown="startLibResize"></button>
        <div class="designer-workspace">
          <div class="designer-workspace-top">
            <div class="fd-canvas designer-fields-panel">
              <div class="fd-canvas-header">
                <el-button size="small" type="primary" aria-label="新建字段" title="新建字段" @click="newField"
                  ><el-icon aria-hidden="true"><Plus /></el-icon></el-button
                ><el-button
                  v-if="hasDraft"
                  size="small"
                  type="success"
                  data-test="designer-save-draft"
                  aria-label="保存新增字段"
                  title="保存新增字段"
                  :loading="savingDraft"
                  @click="saveDraftField"
                  ><el-icon aria-hidden="true"><Check /></el-icon></el-button
                ><el-button
                  size="small"
                  aria-label="添加“以下为log行”提示"
                  title="添加“以下为log行”提示"
                  @click="addLogRow"
                  >log</el-button
                ><el-button
                  size="small"
                  data-test="designer-undo"
                  aria-label="撤回"
                  title="撤回"
                  :disabled="!designerHistory.canUndo.value"
                  :loading="designerHistory.busy.value"
                  @click="handleUndo"
                  ><el-icon aria-hidden="true"
                    ><svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
                      /></svg></el-icon></el-button
                ><el-button
                  size="small"
                  data-test="designer-redo"
                  aria-label="恢复"
                  title="恢复"
                  :disabled="!designerHistory.canRedo.value"
                  :loading="designerHistory.busy.value"
                  @click="handleRedo"
                  ><el-icon aria-hidden="true"
                    ><svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"
                      /></svg></el-icon></el-button
                ><el-button v-if="selectedIds.length" type="danger" size="small" @click="batchDelete"
                  >批量删除({{ selectedIds.length }})</el-button
                ><span style="color: var(--color-text-muted); font-size: 12px; margin-left: auto"
                  >共 {{ designerVisibleFields.length }} 个字段</span
                >
              </div>
              <div class="fd-canvas-list designer-field-list">
                <div
                  v-for="(ff, idx) in designerVisibleFields"
                  :key="ff.id"
                  :ref="(el) => (fieldItemRefs[ff.id] = el)"
                  class="ff-item"
                  :class="{ inline: ff.inline_mark, 'ff-selected': selectedFieldId === ff.id }"
                  :draggable="true"
                  role="button"
                  :style="
                    (dragOverIdx === idx ? 'border-top:2px solid var(--color-primary);' : '') +
                    (ff.bg_color ? 'border-left:4px solid #' + ff.bg_color + ';' : '')
                  "
                  tabindex="0"
                  @click="onSelectFieldClick(ff)"
                  @dragstart="onDragStart(ff)"
                  @dragover="onDragOver($event, idx)"
                  @dragleave="onDragLeave"
                  @drop="onDrop($event, idx)"
                  @keydown="handleFieldKeydown($event, ff, idx)"
                >
                  <el-checkbox
                    v-if="!isDraftField(ff)"
                    v-model="selectedIds"
                    :label="ff.id"
                    size="small"
                    @click.stop
                  ></el-checkbox
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
                    getFormFieldDisplayLabel(ff)
                  }}</span
                  ><el-tag v-if="isDraftField(ff)" size="small" type="success" effect="plain" style="margin-left: 4px"
                    >未保存</el-tag
                  ><el-tooltip v-if="canToggleInline(ff) && !isDraftField(ff)" content="横向表格标记"
                    ><el-button
                      size="small"
                      link
                      :type="ff.inline_mark ? 'warning' : ''"
                      :aria-label="'切换 ' + getFormFieldDisplayLabel(ff) + ' 的横向表格标记'"
                      @click.stop="toggleInline(ff)"
                      >⊞</el-button
                    ></el-tooltip
                  ><el-button type="danger" size="small" link @click.stop="removeField(ff)">删除</el-button>
                </div>
              </div>
            </div>
          </div>
          <div class="designer-workspace-bottom">
            <div class="designer-preview-pane">
              <div class="designer-section-title">
                <span>实时预览</span>
                <el-tooltip
                  v-if="headerDesignNotesSummary"
                  effect="dark"
                  placement="bottom"
                  :content="headerDesignNotesTooltip"
                >
                  <span class="fd-canvas-header-notes" data-test="designer-canvas-notes-summary">{{
                    headerDesignNotesSummary
                  }}</span>
                </el-tooltip>
              </div>
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
                                              normalColumnCm(gi, gv, 'designer'),
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
          </div>
        </div>
        <div class="designer-side-pane" :style="{ width: propWidth + 'px' }">
          <div class="designer-editor-card">
            <div class="designer-section-title">属性编辑</div>
            <el-empty v-if="!selectedFieldId" class="empty-state" :image-size="56" style="height: 100%">
              <template #image>
                <el-icon aria-hidden="true"><EditPen /></el-icon>
              </template>
              <template #description>
                <p>← 选择字段</p>
              </template>
            </el-empty>
            <div v-else-if="editProp.field_type === '日志行'" class="designer-editor-scroll">
              <el-form :model="editProp" label-width="88px" size="small">
                <el-form-item label="标签"><el-input v-model="editProp.label" /></el-form-item>
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
            </div>
            <div v-else class="designer-editor-scroll">
              <el-form :model="editProp" label-width="88px" size="small">
                <el-form-item label="字段标签"
                  ><el-input
                    v-model="editProp.label"
                    :type="editProp.field_type === '标签' ? 'textarea' : 'text'"
                    :autosize="editProp.field_type === '标签' ? { minRows: 2, maxRows: 4 } : undefined"
                /></el-form-item>
                <el-form-item v-if="editMode && !['标签', '日志行'].includes(editProp.field_type)" label="OID"
                  ><el-input v-model="editProp.variable_name"
                /></el-form-item>
                <el-form-item label="字段类型">
                  <el-select v-model="editProp.field_type" style="width: 100%">
                    <el-option v-for="t in designerFieldTypes" :key="t" :label="t" :value="t" />
                  </el-select>
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
              <div v-if="selectedFieldId === DRAFT_FIELD_ID" class="designer-draft-actions">
                <el-button size="small" data-test="designer-draft-cancel" @click="removeDraftFromState">
                  取消
                </el-button>
                <el-button
                  type="primary"
                  size="small"
                  data-test="designer-draft-save"
                  :loading="savingDraft"
                  @click="saveDraftField"
                >
                  保存
                </el-button>
              </div>
            </div>
          </div>
          <div class="designer-notes-card">
            <div class="designer-section-title">设计备注</div>
            <div class="designer-notes-editor">
              <el-input
                v-model="formDesignNotes"
                type="textarea"
                :autosize="false"
                class="designer-notes-input"
                @input="onNotesInput"
              />
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 各类弹窗 -->
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
        <el-table-column label="后加下划线" width="110" align="center">
          <template #default="{ row }"
            ><el-checkbox :model-value="row.trailing_underscore === 1" @change="() => toggleTrailingLine(row)"
          /></template>
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
        <el-table-column label="后加下划线" width="110" align="center">
          <template #default="{ row }"
            ><el-checkbox :model-value="row.trailing_underscore === 1" @change="() => toggleTrailingLine(row)"
          /></template>
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
  padding: 0;
  height: calc(100vh - 54px);
  overflow: hidden;
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
.fd-canvas {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fd-canvas-header {
  padding: 8px 12px;
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
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.drag-handle {
  cursor: move;
  color: #ccc;
}
.ff-label {
  flex: 1;
  font-size: 13px;
}
.fd-library {
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.fd-library-header {
  padding: 8px;
  background: var(--color-bg-hover);
  font-weight: bold;
  font-size: 13px;
}
.fd-library-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.fd-item {
  width: 100%;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  box-sizing: border-box;
}
.fd-item:hover {
  background: var(--color-bg-hover);
}
.fd-panel-resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
}
.fd-panel-resizer:hover {
  background: var(--color-primary-subtle);
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
  grid-template-columns: auto 4px minmax(320px, 1fr) 460px;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-body);
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-library-pane {
  min-width: 220px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: none;
  border-right: 1px solid var(--color-border);
  border-radius: 0;
}

.designer-pane-toolbar {
  padding: 4px 6px;
  border-bottom: 1px solid var(--color-border);
}

.designer-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 8px;
  padding: 8px;
}

.designer-workspace-top,
.designer-workspace-bottom {
  min-height: 0;
}

.designer-workspace-bottom {
  display: flex;
  overflow: hidden;
}

.designer-workspace-top {
  padding: 0;
}

.designer-fields-panel {
  height: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
}

.designer-field-list {
  padding: 4px;
}

.designer-side-pane {
  min-width: 460px;
  max-width: 460px;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(180px, 1fr);
  gap: 8px;
  padding: 8px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-hover);
}

.designer-editor-card,
.designer-notes-card,
.designer-preview-pane,
.designer-preview-viewport {
  min-height: 0;
}

.designer-editor-card,
.designer-notes-card {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
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
  flex: 0 1 auto;
  min-width: 0;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: normal;
  color: var(--color-text-muted);
  background: var(--color-bg-hover);
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  padding: 0 6px;
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

.designer-editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.designer-draft-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.designer-draft-actions .el-button--primary {
  min-width: 88px;
}

.designer-notes-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 6px;
}

.designer-notes-input {
  flex: 1;
}

.designer-notes-input :deep(.el-textarea),
.designer-notes-input :deep(.el-textarea__inner) {
  height: 100%;
}

.designer-notes-input :deep(.el-textarea__inner) {
  resize: none;
}

.designer-preview-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
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
</style>
