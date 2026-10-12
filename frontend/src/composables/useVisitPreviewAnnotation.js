import {
  ANNOTATION_FORM_KEY,
  buildAnnotationStyle,
  hasAnnotationOverride,
  normalizeAnnotationPositions,
  readAnnotationDelta01Cm,
} from './acrfAnnotationGeometry';
import { useAcrfAnnotationDrag } from './useAcrfAnnotationDrag';

// 单表单预览弹窗的 aCRF 标注胶水：target 构造 / 样式 / 拖拽门禁与持久化接线。
// 每次调用独立（无模块级可变状态）：一次调用 = 一个弹窗实例 = 一个 useAcrfAnnotationDrag 实例。
// 入参：
//   apiClient    — api 对象（PATCH + invalidate 走它）
//   projectId    — 当前项目 id 的 ref（toRef(props, 'projectId')），跨项目切换后 target 必须带新 id
//   formId       — 被预览表单 id 的 ref（toRef(props, 'formId')）
//   formState    — 弹窗自持的权威表单对象 ref（浅拷贝缓存返回体，写回一律整体替换，绝不改缓存对象）
//   isEnabled    — () => boolean，aCRF 标注是否可交互（弹窗的 showAcrfAnnotations）
//   onError      — (error, snapshot) => void，PATCH 失败时弹窗自行 toast / 失效缓存 / 重解析
export function useVisitPreviewAnnotation({ apiClient, projectId, formId, formState, isEnabled, onError } = {}) {
  const currentFormId = () => formId?.value ?? null;
  const currentFormState = () => formState?.value ?? null;
  const canEdit = () => Boolean(isEnabled?.() && currentFormState()?.id != null);

  // 项目 id 按 ref 注入、每次取用现读（旧代码读 props.projectId 的语义）：
  // App.vue 程序化换项目时弹窗保持挂载，值捕获会把旧 id 永久 stamped 进 target。
  const currentProjectId = () => projectId?.value ?? null;

  function getFormAnnotationPositions(targetFormId = currentFormId()) {
    const form = currentFormState();
    return normalizeAnnotationPositions(form?.id === targetFormId ? form.annotation_positions : null);
  }

  // 乐观位置只写弹窗自身的 form ref（整体替换），绝不改写缓存对象本体
  function applyFormAnnotationPositions(targetFormId, annotationPositions) {
    const form = currentFormState();
    if (targetFormId == null || form?.id !== targetFormId) return;
    const normalized = normalizeAnnotationPositions(annotationPositions);
    formState.value = {
      ...form,
      annotation_positions: Object.keys(normalized).length > 0 ? normalized : null,
    };
  }

  const annotationDrag = useAcrfAnnotationDrag({
    apiClient,
    getCurrentPositions: (targetFormId) => getFormAnnotationPositions(targetFormId),
    applyOptimisticPositions: (targetFormId, annotationPositions) =>
      applyFormAnnotationPositions(targetFormId, annotationPositions),
    onPersisted: (updatedForm) => {
      const form = currentFormState();
      if (!updatedForm?.id || form?.id !== updatedForm.id) return;
      formState.value = { ...form, ...updatedForm };
    },
    onError: (error, snapshot) => onError?.(error, snapshot),
  });

  function getFieldAnnotationTarget(formField) {
    if (formField?.field_definition?.field_type === '标签') return null;
    const key = String(formField?.field_definition?.variable_name ?? '').trim();
    if (!key || currentFormId() == null) return null;
    return {
      formId: currentFormId(),
      projectId: currentProjectId(),
      key,
    };
  }

  function getFormAnnotationTarget(targetFormState) {
    const text = String(targetFormState?.domain ?? '').trim();
    if (!text || targetFormState?.id == null) return null;
    return {
      formId: targetFormState.id,
      projectId: currentProjectId(),
      key: ANNOTATION_FORM_KEY,
    };
  }

  function isAnnotationDraggable(target) {
    return Boolean(canEdit() && target?.formId != null && target?.key);
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

  function cancelActiveDrag() {
    return annotationDrag.cancelActiveDrag();
  }

  return {
    getFormAnnotationPositions,
    applyFormAnnotationPositions,
    getFieldAnnotationTarget,
    getFormAnnotationTarget,
    isAnnotationDraggable,
    hasAnnotationOverrideForTarget,
    getAnnotationStyle,
    onAnnotationPointerDown,
    resetAnnotationPosition,
    flushAnnotationPositionSave,
    cancelActiveDrag,
    dispose: annotationDrag.dispose,
  };
}
