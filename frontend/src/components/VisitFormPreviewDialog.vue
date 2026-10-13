<script setup>
import { ref, computed, watch, onBeforeUnmount, inject, toRef } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import { api } from '../composables/useApi';
import DesignerAcrfAnnotation from './DesignerAcrfAnnotation.vue';
import FormPreviewOid from './FormPreviewOid.vue';
import {
  ANNOTATION_KIND_FIELD,
  ANNOTATION_KIND_FORM,
  ANNOTATION_KIND_INLINE_HEADER,
} from '../composables/acrfAnnotationGeometry';
import { useVisitPreviewAnnotation } from '../composables/useVisitPreviewAnnotation';
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldLabelPreviewStyle,
} from '../composables/formFieldPresentation';
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
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
  renderCtrlTextHtml,
  computeFillLineCharCount,
} from '../composables/useCRFRenderer';
import { shouldUseLandscapePreview, resolveNormalTableAvailableCm } from '../composables/visitPreviewLandscape';
import { readColumnWidthRatios } from '../composables/useColumnResize';
import {
  computeMergeSpans,
  computeLabelValueSpans,
  getScopedDefaultValue,
  createPreviewCellRenderers,
} from '../composables/previewCellRender';
import { buildPreviewGroupViewModels } from '../composables/formDesignerPreviewModel';

// 单表单预览弹窗：自持被预览表单的权威数据（FormResponse）、字段列表、视图模式与 aCRF 标注状态。
// 父组件（VisitsTab）只保留开关 + 表单 id 两项桥接状态，不再持有预览数据的副本。
const props = defineProps({
  modelValue: { type: Boolean, required: true },
  projectId: { type: Number, required: true },
  formId: { type: Number, default: null },
});

const emit = defineEmits(['update:modelValue']);

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

function getFormDomainAnnotationText(formState) {
  const value = String(formState?.domain ?? '').trim();
  return value || '';
}

function toRendererField(fd) {
  if (!fd) return null;
  return {
    field_type: fd.field_type,
    label: fd.label,
    checkbox_label: fd.checkbox_label,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  };
}

function escapePreviewText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

const viewMode = ref(resolveInitialViewMode(editMode.value, readStoredViewMode()));
// 解析出的权威表单对象（浅拷贝缓存返回体，绝不改写缓存对象本体）
const formPreviewForm = ref(null);
const formPreviewFields = ref([]);
const formPreviewLoading = ref(false);
const formPreviewError = ref('');
let formPreviewRequestSeq = 0;
const previewRowResizerCache = new Map();

writeStoredViewMode(viewMode.value);

const formPreviewTitle = computed(() => formPreviewForm.value?.name || '表单预览');
const formPreviewPaperOrientation = computed(() => formPreviewForm.value?.paper_orientation || 'auto');
const hasPreviewNotes = computed(() => Boolean(String(formPreviewForm.value?.design_notes ?? '').trim()));
const previewDesignNotesHtml = computed(() =>
  hasPreviewNotes.value ? escapePreviewText(formPreviewForm.value.design_notes) : '',
);

const showAcrfAnnotations = computed(() => editMode.value && viewMode.value === 'aCRF');

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

// 共享预览渲染函数（previewCellRender.js）：cell / inline 默认值策略经适配器注入。
// cell 策略由历史实现的 singleLine=true 改为 false（R2 修复：普通表单元格多行默认值
// 经 toHtml 渲染全部行，与设计器 / 模板预览 / Word 导出一致），
// 由 tests/previewCellRender.test.js 的黄金参考矩阵与 R2 锁锁定。
const { renderCellHtml, getInlineRows, getInlineColumnCms, getInlineFillChars } = createPreviewCellRenderers({
  toRendererField: (ff) => toRendererField(ff.field_definition),
  getCellValue: (ff) => getScopedDefaultValue(ff, false),
  getInlineValue: (ff) => getScopedDefaultValue(ff),
  renderFallback: renderCtrlTextHtml,
  resolveHostGroups: () => previewRenderGroups.value,
  getPaperOrientation: () => formPreviewPaperOrientation.value,
});

// 列宽持久化读取已集中到 useColumnResize.js（R4）：统一模块门（和容差 1e-3、
// 边界 [0.02,0.98]、长度校验）——与设计器读取端完全一致；历史宽松容差数组不再被
// 访视预览应用，回退到规划器默认（键不删除、不规范化）。
// 长度校验按历史形状保留在调用方（与模块内校验互为冗余）。

// inline 表：优先读设计器持久化的列宽；缺失则用 planInlineColumnFractions 出与导出一致的内容驱动默认；
// planner 异常时回退到等宽。返回值始终是一个长度等于 fields.length 的数组，模板可以直接迭代。
function resolveInlineColRatios(fields) {
  if (!fields || !fields.length) return [];
  const persisted = readColumnWidthRatios(props.formId, buildTableInstanceId('inline', fields), fields.length);
  if (persisted && persisted.length === fields.length) return persisted;
  const planned = planInlineColumnFractions(fields);
  if (planned.length === fields.length) return planned;
  return Array.from({ length: fields.length }, () => 1 / fields.length);
}

// normal 表：固定两列（label / control），同样优先持久化、缺失走 planNormalColumnFractions、兜底 50/50。
function resolveNormalColRatios(fields) {
  if (!fields || !fields.length) return [0.5, 0.5];
  const persisted = readColumnWidthRatios(props.formId, buildTableInstanceId('normal', fields), 2);
  if (persisted && persisted.length === 2) return persisted;
  const planned = planNormalColumnFractions(fields);
  if (planned.length === 2) return planned;
  return [0.5, 0.5];
}

function getPreviewColumnFractions(group) {
  if (group.type === 'unified') {
    const colCount = group.colCount;
    const shared = readColumnWidthRatios(props.formId, buildTableInstanceId('unified', group.fields), colCount);
    if (shared && shared.length === colCount) return shared;
    const plannerFractions = planUnifiedColumnFractions(group.segments, colCount);
    return plannerFractions.length === colCount
      ? plannerFractions
      : Array.from({ length: colCount }, () => 1 / colCount);
  }
  if (group.type === 'normal') {
    return resolveNormalColRatios(group.fields);
  }
  const colCount = group.fields.length;
  const inlineRatios = resolveInlineColRatios(group.fields);
  return inlineRatios.length === colCount ? inlineRatios : Array.from({ length: colCount }, () => 1 / colCount);
}

// normal 表 control 列宽（cm）：按整张表单 render groups + 纸张方向解析
// （显式 landscape 或 mixed_landscape → 23.36），与后端导出共享宽度选择。
function normalColumnCm(group, groupIndex) {
  if (group?.type !== 'normal') return null;
  const controlFrac = getPreviewColumnFractions(group, groupIndex)?.[1];
  if (controlFrac == null) return null;
  const availableCm = resolveNormalTableAvailableCm(previewRenderGroups.value, formPreviewPaperOrientation.value);
  return controlFrac * availableCm;
}

function normalFillChars(group, groupIndex) {
  const columnCm = normalColumnCm(group, groupIndex);
  return columnCm == null ? null : computeFillLineCharCount(columnCm);
}

// aCRF 标注胶水（target / 样式 / 拖拽门禁与持久化）由 useVisitPreviewAnnotation 提供；
// onPersisted 回写弹窗自身的 form ref，onError 重跑弹窗自身的表单解析。
const {
  getFieldAnnotationTarget,
  getFormAnnotationTarget,
  isAnnotationDraggable,
  hasAnnotationOverrideForTarget,
  getAnnotationStyle,
  onAnnotationPointerDown,
  resetAnnotationPosition,
  flushAnnotationPositionSave,
  cancelActiveDrag,
  dispose: disposeAnnotationDrag,
} = useVisitPreviewAnnotation({
  apiClient: api,
  projectId: toRef(props, 'projectId'),
  formId: toRef(props, 'formId'),
  formState: formPreviewForm,
  isEnabled: () => showAcrfAnnotations.value,
  onError: (error, snapshot) => {
    ElMessage.error(`aCRF 标注位置保存失败：${error.message}`);
    if (snapshot?.projectId != null) {
      api.invalidateCache(`/api/projects/${snapshot.projectId}/forms`);
    }
    if (snapshot?.formId != null) {
      api.invalidateCache(`/api/forms/${snapshot.formId}/fields`);
    }
    if (props.modelValue && props.formId != null) void loadPreviewForm();
  },
});

function getPreviewRowResizer(group) {
  if (!props.formId || !group?.fields?.length) return null;
  const tableInstanceId = buildTableInstanceId(group.type, group.fields);
  if (!previewRowResizerCache.has(tableInstanceId)) {
    previewRowResizerCache.set(
      tableInstanceId,
      useRowResize(
        toRef(props, 'formId'),
        computed(() => tableInstanceId),
      ),
    );
  }
  return previewRowResizerCache.get(tableInstanceId);
}

function getPreviewRowHeightStyle(group, rowKey) {
  return getPreviewRowResizer(group)?.getRowHeightStyle(rowKey) || null;
}

const previewRenderGroups = computed(() => buildFormDesignerRenderGroups(formPreviewFields.value));

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
const previewGroupsView = computed(() => buildPreviewGroupViewModels(previewRenderGroups.value, previewModelHelpers));

const previewNeedsLandscape = computed(() => shouldUseLandscapePreview(previewRenderGroups.value));
function resolvePreviewLandscape(orientation, autoFlag) {
  if (orientation === 'landscape') return true;
  if (orientation === 'portrait') return false;
  return autoFlag;
}
const previewLandscapeMode = computed(() =>
  resolvePreviewLandscape(formPreviewPaperOrientation.value, previewNeedsLandscape.value),
);

// 打开（或换表单）时重新解析权威表单：矩阵行对象只有 {id,name,sequence}，
// 预览必须读 /api/projects/{id}/forms 的 FormResponse（design_notes / paper_orientation /
// domain / annotation_positions 四项都来自它）。
async function resolvePreviewForm(seq) {
  try {
    const forms = await api.cachedGet('/api/projects/' + props.projectId + '/forms');
    if (seq !== formPreviewRequestSeq) return false;
    const foundForm = Array.isArray(forms) ? forms.find((item) => item.id === props.formId) : null;
    if (!foundForm) {
      formPreviewForm.value = null;
      formPreviewError.value = '表单不存在';
      return false;
    }
    formPreviewForm.value = { ...foundForm };
    return true;
  } catch (e) {
    if (seq !== formPreviewRequestSeq) return false;
    formPreviewForm.value = null;
    formPreviewError.value = '加载表单信息失败：' + (e.message || '未知错误');
    ElMessage.error(formPreviewError.value);
    return false;
  }
}

async function loadPreviewForm() {
  const seq = ++formPreviewRequestSeq;
  formPreviewError.value = '';
  formPreviewFields.value = [];
  formPreviewLoading.value = true;
  try {
    // 先冲掉上一会话排队的标注 PATCH：关闭后立刻重开不得读到未失效前的缓存
    await flushAnnotationPositionSave();
    if (seq !== formPreviewRequestSeq) return;
    const resolved = await resolvePreviewForm(seq);
    if (!resolved) return;
    const data = await api.cachedGet('/api/forms/' + props.formId + '/fields');
    if (seq !== formPreviewRequestSeq) return;
    formPreviewFields.value = data;
  } catch (e) {
    if (seq !== formPreviewRequestSeq) return;
    formPreviewFields.value = [];
    formPreviewError.value = '加载表单字段失败：' + (e.message || '未知错误');
    ElMessage.error(formPreviewError.value);
  } finally {
    if (seq === formPreviewRequestSeq) formPreviewLoading.value = false;
  }
}

function resetPreviewState() {
  cancelActiveDrag();
  void flushAnnotationPositionSave();
  formPreviewRequestSeq++;
  formPreviewForm.value = null;
  formPreviewFields.value = [];
  formPreviewLoading.value = false;
  formPreviewError.value = '';
  previewRowResizerCache.clear();
}

// immediate：父组件可能带着已打开的 modelValue 挂载（挂载即打开），
// 打开路径不能依赖后续变化事件。
watch(
  () => [props.modelValue, props.formId],
  ([visible, formId]) => {
    if (!visible || formId == null) return;
    void loadPreviewForm();
  },
  { immediate: true },
);

watch(
  () => props.projectId,
  async (newProjectId, previousProjectId) => {
    if (newProjectId === previousProjectId) return;
    // 快照自带旧的 projectId/formId，PATCH 仍指向切换前的表单
    await flushAnnotationPositionSave({ cancelActiveDrag: true });
  },
);

onBeforeUnmount(() => {
  void disposeAnnotationDrag();
});
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    width="90%"
    style="max-width: 1200px"
    top="5vh"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="resetPreviewState"
  >
    <template #header>
      <div style="display: flex; align-items: center; gap: 12px; padding-right: 32px">
        <span style="font-size: 16px; font-weight: bold">{{ formPreviewTitle }}</span>
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
    </template>
    <div v-if="formPreviewLoading" style="text-align: center; padding: 40px">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中...
    </div>
    <el-alert
      v-else-if="formPreviewError"
      :title="formPreviewError"
      type="error"
      :closable="false"
      style="margin: 12px 0"
    />
    <div v-else-if="!formPreviewFields.length" style="text-align: center; color: #999; padding: 40px">暂无字段</div>
    <div v-else class="word-preview">
      <div
        :class="[
          'word-page',
          'word-page--a4',
          { landscape: previewLandscapeMode, 'word-page--with-notes': hasPreviewNotes },
        ]"
      >
        <div class="wp-form-title-row">
          <div class="wp-form-title">{{ formPreviewTitle }}</div>
          <FormPreviewOid v-if="editMode" :code="formPreviewForm?.code" />
          <DesignerAcrfAnnotation
            v-if="showAcrfAnnotations && getFormDomainAnnotationText(formPreviewForm)"
            kind="form"
            :text="getFormDomainAnnotationText(formPreviewForm)"
            :interactive="isAnnotationDraggable(getFormAnnotationTarget(formPreviewForm))"
            :has-override="hasAnnotationOverrideForTarget(getFormAnnotationTarget(formPreviewForm))"
            :annotation-style="
              getAnnotationStyle(
                getFormDomainAnnotationText(formPreviewForm),
                ANNOTATION_KIND_FORM,
                getFormAnnotationTarget(formPreviewForm),
              )
            "
            @pointerdown="(event) => onAnnotationPointerDown(getFormAnnotationTarget(formPreviewForm), event)"
            @reset="resetAnnotationPosition(getFormAnnotationTarget(formPreviewForm))"
          />
        </div>
        <div :class="['wp-body', { 'wp-body--with-notes': hasPreviewNotes }]">
          <div class="wp-main">
            <template v-for="(gv, gi) in previewGroupsView" :key="gi">
              <table v-if="gv.type === 'unified'" class="unified-table" style="width: 100%; border-collapse: collapse">
                <colgroup>
                  <col
                    v-for="(ratio, ci) in getPreviewColumnFractions(gv, gi)"
                    :key="ci"
                    :style="{ width: ratio * 100 + '%' }"
                  />
                </colgroup>
                <template v-for="seg in gv.segments" :key="seg.fields[0]?.id">
                  <tr
                    v-if="seg.type === 'regular_field'"
                    :style="getPreviewRowHeightStyle(gv, getUnifiedRegularRowKey(seg.fields[0]))"
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
                          (e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedRegularRowKey(seg.fields[0]), e)
                        "
                      ></span>
                    </td>
                    <td
                      class="unified-value row-resize-anchor"
                      :colspan="gv.labelValueSpans.valueSpan"
                      :style="getFormFieldPreviewStyle(seg.fields[0])"
                    >
                      <span v-html="renderCellHtml(seg.fields[0])"></span>
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                        kind="field"
                        :text="getFieldOidAnnotationText(seg.fields[0])"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(seg.fields[0]))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(seg.fields[0]),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(seg.fields[0]),
                          )
                        "
                        @pointerdown="
                          (event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)
                        "
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="
                          (e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedRegularRowKey(seg.fields[0]), e)
                        "
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else-if="seg.type === 'full_row'"
                    :style="getPreviewRowHeightStyle(gv, getUnifiedFullRowKey(seg.fields[0]))"
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
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                        kind="field"
                        :text="getFieldOidAnnotationText(seg.fields[0])"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(seg.fields[0]))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(seg.fields[0]),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(seg.fields[0]),
                          )
                        "
                        @pointerdown="
                          (event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)
                        "
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="
                          (e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedFullRowKey(seg.fields[0]), e)
                        "
                      ></span>
                    </td>
                  </tr>
                  <template v-else-if="seg.type === 'inline_block'">
                    <tr :style="getPreviewRowHeightStyle(gv, getUnifiedInlineHeaderRowKey(seg.fields))">
                      <td
                        v-for="(ff, idx) in seg.fields"
                        :key="ff.id"
                        class="wp-inline-header row-resize-anchor"
                        :colspan="seg.mergeSpans[idx]"
                        :style="getFormFieldLabelPreviewStyle(ff)"
                      >
                        {{ getFormFieldDisplayLabel(ff) }}
                        <DesignerAcrfAnnotation
                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                          kind="inline-header"
                          :text="getFieldOidAnnotationText(ff)"
                          :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                          :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                          :annotation-style="
                            getAnnotationStyle(
                              getFieldOidAnnotationText(ff),
                              ANNOTATION_KIND_INLINE_HEADER,
                              getFieldAnnotationTarget(ff),
                            )
                          "
                          @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                          @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                        />
                        <span
                          class="row-resizer-handle"
                          @pointerdown="
                            (e) => getPreviewRowResizer(gv)?.onResizeStart(getUnifiedInlineHeaderRowKey(seg.fields), e)
                          "
                        ></span>
                      </td>
                    </tr>
                    <tr
                      v-for="(row, ri) in seg.inlineRows"
                      :key="ri"
                      :style="getPreviewRowHeightStyle(gv, getUnifiedInlineDataRowKey(seg.fields, ri))"
                    >
                      <td
                        v-for="(cell, ci) in row"
                        :key="ci"
                        class="wp-ctrl row-resize-anchor"
                        :colspan="seg.mergeSpans[ci]"
                        :style="getFormFieldPreviewStyle(seg.fields[ci])"
                      >
                        <span v-html="cell"></span>
                        <span
                          class="row-resizer-handle"
                          @pointerdown="
                            (e) =>
                              getPreviewRowResizer(gv)?.onResizeStart(getUnifiedInlineDataRowKey(seg.fields, ri), e)
                          "
                        ></span>
                      </td>
                    </tr>
                  </template>
                </template>
              </table>
              <table v-else-if="gv.type === 'normal'" style="width: 100%; border-collapse: collapse">
                <colgroup>
                  <col
                    v-for="(ratio, ci) in getPreviewColumnFractions(gv, gi)"
                    :key="ci"
                    :style="{ width: ratio * 100 + '%' }"
                  />
                </colgroup>
                <template v-for="ff in gv.fields" :key="ff.id">
                  <tr
                    v-if="ff.field_definition?.field_type === '标签'"
                    :style="getPreviewRowHeightStyle(gv, getNormalRowKey(ff))"
                  >
                    <td
                      class="wp-structure-label--multiline row-resize-anchor"
                      colspan="2"
                      :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                    >
                      {{ getFormFieldDisplayLabel(ff) }}
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        kind="field"
                        :text="getFieldOidAnnotationText(ff)"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"
                    :style="getPreviewRowHeightStyle(gv, getNormalRowKey(ff))"
                  >
                    <td
                      colspan="2"
                      class="row-resize-anchor"
                      :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                    >
                      {{ getFormFieldDisplayLabel(ff) || '以下为log行' }}
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        kind="field"
                        :text="getFieldOidAnnotationText(ff)"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr v-else :style="getPreviewRowHeightStyle(gv, getNormalRowKey(ff))">
                    <td class="wp-label row-resize-anchor" :style="getFormFieldLabelPreviewStyle(ff)">
                      {{ getFormFieldDisplayLabel(ff) }}
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                    <td class="wp-ctrl row-resize-anchor" :style="getFormFieldPreviewStyle(ff)">
                      <span v-html="renderCellHtml(ff, normalFillChars(gv, gi))"></span>
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        kind="field"
                        :text="getFieldOidAnnotationText(ff)"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                </template>
              </table>
              <table v-else class="inline-table" style="width: 100%; border-collapse: collapse">
                <colgroup>
                  <col
                    v-for="(ratio, ci) in getPreviewColumnFractions(gv, gi)"
                    :key="ci"
                    :style="{ width: ratio * 100 + '%' }"
                  />
                </colgroup>
                <tr :style="getPreviewRowHeightStyle(gv, getInlineHeaderRowKey(gv.fields))">
                  <td
                    v-for="ff in gv.fields"
                    :key="ff.id"
                    class="wp-inline-header row-resize-anchor"
                    :style="getFormFieldLabelPreviewStyle(ff)"
                  >
                    {{ getFormFieldDisplayLabel(ff) }}
                    <DesignerAcrfAnnotation
                      v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                      kind="inline-header"
                      :text="getFieldOidAnnotationText(ff)"
                      :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                      :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                      :annotation-style="
                        getAnnotationStyle(
                          getFieldOidAnnotationText(ff),
                          ANNOTATION_KIND_INLINE_HEADER,
                          getFieldAnnotationTarget(ff),
                        )
                      "
                      @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                      @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                    />
                    <span
                      class="row-resizer-handle"
                      @pointerdown="(e) => getPreviewRowResizer(gv)?.onResizeStart(getInlineHeaderRowKey(gv.fields), e)"
                    ></span>
                  </td>
                </tr>
                <tr
                  v-for="(row, ri) in gv.inlineRows"
                  :key="ri"
                  :style="getPreviewRowHeightStyle(gv, getInlineDataRowKey(gv.fields, ri))"
                >
                  <td
                    v-for="(cell, ci) in row"
                    :key="ci"
                    class="wp-ctrl row-resize-anchor"
                    :style="getFormFieldPreviewStyle(gv.fields[ci])"
                  >
                    <span v-html="cell"></span>
                    <span
                      class="row-resizer-handle"
                      @pointerdown="
                        (e) => getPreviewRowResizer(gv)?.onResizeStart(getInlineDataRowKey(gv.fields, ri), e)
                      "
                    ></span>
                  </td>
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

<style scoped>
.wp-form-title-row {
  position: relative;
  min-height: 0.7cm;
  padding-right: 4.8cm;
  /* 表单 OID 元数据与名称同行基线排列；超长时在行内换行，右侧 4.8cm 仍为 domain 标注保留区。 */
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
