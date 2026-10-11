import { watch } from 'vue';

export function useDesignerFormSelection(designerRef) {
  let pendingFormId = null;
  let hasPendingFormId = false;

  function consumePendingFormId(designer) {
    const formId = pendingFormId;
    pendingFormId = null;
    hasPendingFormId = false;
    return designer.selectFormById(formId);
  }

  /**
   * Queued requests resolve before selection occurs; only the latest pending id is retained.
   * @param {*} formId
   */
  function requestFormSelection(formId) {
    pendingFormId = formId;
    hasPendingFormId = true;

    const designer = designerRef.value;
    if (typeof designer?.selectFormById === 'function') {
      return consumePendingFormId(designer);
    }
    return Promise.resolve();
  }

  watch(designerRef, (designer) => {
    if (!hasPendingFormId || typeof designer?.selectFormById !== 'function') {
      return;
    }
    return consumePendingFormId(designer);
  });

  return { requestFormSelection };
}
