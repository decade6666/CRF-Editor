import {
  annotationDeltaPxTo01Cm,
  buildNextAnnotationPositions,
  clampAnnotationDelta01Cm,
  normalizeAnnotationPositions,
  readAnnotationDelta01Cm,
} from './acrfAnnotationGeometry.js';

function areAnnotationPositionsEqual(left, right) {
  const leftEntries = Object.entries(normalizeAnnotationPositions(left)).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(normalizeAnnotationPositions(right)).sort(([a], [b]) => a.localeCompare(b));
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, position], index) => {
    const [otherKey, otherPosition] = rightEntries[index];
    return key === otherKey && position.y === otherPosition.y;
  });
}

export function useAcrfAnnotationDrag({
  apiClient,
  getCurrentPositions,
  applyOptimisticPositions,
  onPersisted,
  onError,
  debounceMs = 220,
} = {}) {
  let dragState = null;
  let saveTimer = null;
  const pendingSnapshots = new Map();
  let savePromise = null;

  function getSnapshotKey(snapshot) {
    return `${snapshot?.projectId ?? ''}:${snapshot?.formId ?? ''}`;
  }

  function clearSaveTimer() {
    if (saveTimer != null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  function commitSnapshot(snapshot) {
    applyOptimisticPositions?.(snapshot.formId, snapshot.annotation_positions);
    pendingSnapshots.set(getSnapshotKey(snapshot), snapshot);
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      void flushPending();
    }, debounceMs);
  }

  function cancelActiveDrag({ revert = true } = {}) {
    if (!dragState) return false;
    teardownPointerListeners();
    const snapshot = dragState;
    dragState = null;
    if (revert) {
      applyOptimisticPositions?.(snapshot.formId, snapshot.startPositions);
    }
    return true;
  }

  async function flushPending({ cancelActiveDrag: shouldCancelActiveDrag = false } = {}) {
    if (shouldCancelActiveDrag) {
      cancelActiveDrag();
    }
    clearSaveTimer();
    if (pendingSnapshots.size === 0 && !savePromise) return true;
    if (savePromise) return savePromise;

    savePromise = (async () => {
      let lastOk = true;
      try {
        while (pendingSnapshots.size > 0) {
          const [snapshotKey, snapshot] = pendingSnapshots.entries().next().value;
          pendingSnapshots.delete(snapshotKey);
          try {
            const updatedForm = await apiClient.patch(
              `/api/forms/${snapshot.formId}`,
              {
                annotation_positions:
                  Object.keys(snapshot.annotation_positions || {}).length > 0 ? snapshot.annotation_positions : null,
              },
              {
                invalidate: [`/api/forms/${snapshot.formId}/fields`, `/api/projects/${snapshot.projectId}/forms`],
              },
            );
            if (!pendingSnapshots.has(snapshotKey)) {
              onPersisted?.(updatedForm, snapshot);
            }
          } catch (error) {
            lastOk = false;
            onError?.(error, snapshot);
            break;
          }
        }
      } finally {
        savePromise = null;
      }
      return lastOk;
    })();

    return savePromise;
  }

  function queueAnnotationPosition({ formId, projectId, key, deltaY01cm, basePositions }) {
    if (formId == null || projectId == null || !key) return;
    const currentPositions = getCurrentPositions?.(formId) || {};
    const comparisonPositions = normalizeAnnotationPositions(basePositions ?? currentPositions);
    const nextPositions = buildNextAnnotationPositions(comparisonPositions, key, deltaY01cm);
    if (areAnnotationPositionsEqual(comparisonPositions, nextPositions)) return;
    commitSnapshot({
      formId,
      projectId,
      key,
      annotation_positions: nextPositions,
    });
  }

  function resetAnnotationPosition(target) {
    if (!target?.key) return;
    queueAnnotationPosition({
      ...target,
      deltaY01cm: 0,
    });
  }

  function onPointerMove(event) {
    if (!dragState) return;
    const deltaY01cm = clampAnnotationDelta01Cm(
      dragState.startDeltaY01cm + annotationDeltaPxTo01Cm(event.clientY - dragState.startClientY),
    );
    dragState.lastDeltaY01cm = deltaY01cm;
    dragState.lastPositions = buildNextAnnotationPositions(dragState.startPositions, dragState.key, deltaY01cm);
    applyOptimisticPositions?.(dragState.formId, dragState.lastPositions);
  }

  function teardownPointerListeners() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerUp() {
    if (!dragState) return;
    teardownPointerListeners();
    const snapshot = dragState;
    dragState = null;
    queueAnnotationPosition({
      formId: snapshot.formId,
      projectId: snapshot.projectId,
      key: snapshot.key,
      deltaY01cm: snapshot.lastDeltaY01cm,
      basePositions: snapshot.startPositions,
    });
  }

  function onAnnotationPointerDown(target, event) {
    if (!target?.key || target.formId == null || target.projectId == null) return;
    event.preventDefault();
    dragState = {
      formId: target.formId,
      projectId: target.projectId,
      key: target.key,
      startClientY: event.clientY,
      startDeltaY01cm: readAnnotationDelta01Cm(getCurrentPositions?.(target.formId), target.key),
      startPositions: normalizeAnnotationPositions(getCurrentPositions?.(target.formId)),
      lastDeltaY01cm: readAnnotationDelta01Cm(getCurrentPositions?.(target.formId), target.key),
      lastPositions: normalizeAnnotationPositions(getCurrentPositions?.(target.formId)),
    };
    if (typeof event.currentTarget?.setPointerCapture === 'function' && event.pointerId != null) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
      window.addEventListener('pointercancel', onPointerUp, { once: true });
    }
  }

  function dispose() {
    cancelActiveDrag();
    return flushPending();
  }

  return {
    queueAnnotationPosition,
    resetAnnotationPosition,
    onAnnotationPointerDown,
    cancelActiveDrag,
    flushPending,
    dispose,
  };
}
