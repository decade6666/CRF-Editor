const PERF_STORAGE_KEY = 'crf_perf_baseline';
const PERF_EXPORT_KEY = '__CRF_PERF_EXPORT__';
const perfEvents = [];
const perfStarts = new Map();
const perfIdMap = new Map();
let perfIdCounter = 0;

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

function sanitizeEntityId(value) {
  if (value == null) return null;
  const raw = String(value);
  if (!perfIdMap.has(raw)) {
    perfIdCounter += 1;
    perfIdMap.set(raw, `id-${perfIdCounter.toString(36)}`);
  }
  return perfIdMap.get(raw);
}

function normalizeMetrics(metrics) {
  const normalized = { ...metrics };
  if (Object.prototype.hasOwnProperty.call(normalized, 'project_id')) {
    normalized.project_id = sanitizeEntityId(normalized.project_id);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'form_id')) {
    normalized.form_id = sanitizeEntityId(normalized.form_id);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'field_id')) {
    normalized.field_id = sanitizeEntityId(normalized.field_id);
  }
  return normalized;
}

function normalizeEvent(event) {
  const scenario = event.scenario || event.name || 'unknown';
  const metrics = normalizeMetrics(event.metrics || Object.fromEntries(
    Object.entries(event).filter(([key]) => !['timestamp', 'legacy_perf_time', 'scenario', 'name', 'duration_ms', 'metrics', 'type'].includes(key))
  ));
  return {
    timestamp: new Date().toISOString(),
    scenario,
    duration_ms: Number.isFinite(event.duration_ms) ? event.duration_ms : 0,
    metrics,
  };
}

function recordPerfEvent(event) {
  if (!isPerfBaselineEnabled()) return null;
  const normalized = normalizeEvent(event);
  perfEvents.push(normalized);
  return normalized;
}

function markPerfStart(name, payload = {}) {
  if (!isPerfBaselineEnabled()) return null;
  perfStarts.set(name, { startedAt: performance.now(), metrics: { ...payload } });
  return null;
}

function markPerfEnd(name, payload = {}) {
  if (!isPerfBaselineEnabled()) return null;
  const endedAt = performance.now();
  const started = perfStarts.get(name);
  perfStarts.delete(name);
  const startedAt = typeof started === 'number' ? started : started?.startedAt;
  const startMetrics = typeof started === 'object' && started !== null ? started.metrics : {};
  return recordPerfEvent({
    scenario: name,
    duration_ms: Number.isFinite(startedAt) ? endedAt - startedAt : 0,
    metrics: { ...startMetrics, ...payload },
  });
}

function exportPerfEvents() {
  return perfEvents.map((event) => ({ ...event, metrics: { ...event.metrics } }));
}

function clearPerfEvents() {
  perfEvents.splice(0, perfEvents.length);
  perfStarts.clear();
  perfIdMap.clear();
  perfIdCounter = 0;
}

if (typeof window !== 'undefined' && isPerfBaselineEnabled()) {
  window[PERF_EXPORT_KEY] = exportPerfEvents;
}

export { clearPerfEvents, exportPerfEvents, isPerfBaselineEnabled, markPerfEnd, markPerfStart, recordPerfEvent };
