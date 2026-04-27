const PERF_STORAGE_KEY = 'crf_perf_baseline';
const PERF_EXPORT_KEY = '__CRF_PERF_EXPORT__';
const perfEvents = [];
const perfStarts = new Map();

function isPerfBaselineEnabled() {
  if (typeof window === 'undefined') return false;
  let search = null;
  try {
    search = new URLSearchParams(window.location.search);
  } catch (_error) {
    search = null;
  }
  if (search?.get('perf') === '1') return true;
  try {
    return window.localStorage.getItem(PERF_STORAGE_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

function sanitizeProjectId(value) {
  if (value == null) return null;
  return `project-${String(value).length}`;
}

function normalizeEvent(event) {
  const normalized = {
    ...event,
    timestamp_ms: Number.isFinite(event.timestamp_ms) ? event.timestamp_ms : performance.now(),
  };
  if (Object.prototype.hasOwnProperty.call(normalized, 'project_id')) {
    normalized.project_id = sanitizeProjectId(normalized.project_id);
  }
  return normalized;
}

function recordPerfEvent(event) {
  if (!isPerfBaselineEnabled()) return null;
  const normalized = normalizeEvent(event);
  perfEvents.push(normalized);
  return normalized;
}

function markPerfStart(name, payload = {}) {
  if (!isPerfBaselineEnabled()) return null;
  const startedAt = performance.now();
  perfStarts.set(name, startedAt);
  return recordPerfEvent({
    type: 'start',
    name,
    timestamp_ms: startedAt,
    ...payload,
  });
}

function markPerfEnd(name, payload = {}) {
  if (!isPerfBaselineEnabled()) return null;
  const endedAt = performance.now();
  const startedAt = perfStarts.get(name);
  perfStarts.delete(name);
  return recordPerfEvent({
    type: 'end',
    name,
    timestamp_ms: endedAt,
    duration_ms: Number.isFinite(startedAt) ? endedAt - startedAt : null,
    ...payload,
  });
}

function exportPerfEvents() {
  return perfEvents.map((event) => ({ ...event }));
}

function clearPerfEvents() {
  perfEvents.splice(0, perfEvents.length);
  perfStarts.clear();
}

if (typeof window !== 'undefined' && isPerfBaselineEnabled()) {
  window[PERF_EXPORT_KEY] = exportPerfEvents;
}

export { clearPerfEvents, exportPerfEvents, isPerfBaselineEnabled, markPerfEnd, markPerfStart, recordPerfEvent };
