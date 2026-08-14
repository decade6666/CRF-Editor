import { ref, watch } from 'vue';

function clampRatio(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function readStoredRatio(storageKey, defaultRatio, min, max) {
  if (!storageKey) return clampRatio(defaultRatio, min, max);
  const storage = getStorage();
  if (!storage) return clampRatio(defaultRatio, min, max);
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null || raw === '') return clampRatio(defaultRatio, min, max);
    const storedRatio = Number(raw);
    if (!Number.isFinite(storedRatio)) return clampRatio(defaultRatio, min, max);
    return clampRatio(storedRatio, min, max);
  } catch {
    return clampRatio(defaultRatio, min, max);
  }
}

export function usePaneSplit(storageKey, defaultRatio, { min = 0.12, max = 0.88, axis = 'vertical' } = {}) {
  const ratio = ref(readStoredRatio(storageKey, defaultRatio, min, max));
  const isHorizontal = axis === 'horizontal';

  watch(ratio, (nextRatio) => {
    if (!storageKey) return;
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(storageKey, String(nextRatio));
    } catch {
      /* ignore */
    }
  });

  function startResize(event) {
    if (typeof document === 'undefined') return;
    const container = event.currentTarget?.parentElement;
    const rect = container?.getBoundingClientRect?.();
    if (!rect) return;
    const size = isHorizontal ? rect.width : rect.height;
    if (!Number.isFinite(size) || size <= 0) return;

    event.preventDefault?.();

    const startCoord = isHorizontal ? event.clientX : event.clientY;
    const startRatio = ratio.value;
    const previousUserSelect = document.body?.style?.userSelect ?? '';

    function onMove(moveEvent) {
      const moveCoord = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      ratio.value = clampRatio(startRatio + (moveCoord - startCoord) / size, min, max);
    }

    function onUp() {
      if (document.body?.style) {
        document.body.style.userSelect = previousUserSelect;
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    if (document.body?.style) {
      document.body.style.userSelect = 'none';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return { ratio, startResize };
}
