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
    const storedRatio = Number(storage.getItem(storageKey));
    if (!Number.isFinite(storedRatio)) return clampRatio(defaultRatio, min, max);
    return clampRatio(storedRatio, min, max);
  } catch {
    return clampRatio(defaultRatio, min, max);
  }
}

export function usePaneSplit(storageKey, defaultRatio, { min = 0.12, max = 0.88 } = {}) {
  const ratio = ref(readStoredRatio(storageKey, defaultRatio, min, max));

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
    const height = container?.getBoundingClientRect?.().height;
    if (!Number.isFinite(height) || height <= 0) return;

    event.preventDefault?.();

    const startY = event.clientY;
    const startRatio = ratio.value;
    const previousUserSelect = document.body?.style?.userSelect ?? '';

    function onMove(moveEvent) {
      ratio.value = clampRatio(startRatio + (moveEvent.clientY - startY) / height, min, max);
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
