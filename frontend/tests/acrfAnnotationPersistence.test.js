import test from 'node:test';
import assert from 'node:assert/strict';

import { CSS_PX_PER_01CM } from '../src/composables/acrfAnnotationGeometry.js';
import { useAcrfAnnotationDrag } from '../src/composables/useAcrfAnnotationDrag.js';
import { api } from '../src/composables/useApi.js';

function createWindowStub() {
  const listeners = new Map();
  return {
    listeners,
    window: {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    },
  };
}

function createLocalStorageStub() {
  return {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get() {
        return null;
      },
    },
    async text() {
      return JSON.stringify(data);
    },
  };
}

test('useAcrfAnnotationDrag persists vertical drag in 0.01cm units and sends merged PATCH payload', async () => {
  const windowStub = createWindowStub();
  global.window = windowStub.window;

  let currentPositions = { LBTESTCD: { y: 10 } };
  const patchCalls = [];
  const drag = useAcrfAnnotationDrag({
    apiClient: {
      async patch(url, data, options) {
        patchCalls.push({ url, data, options });
        return { id: 7, annotation_positions: data.annotation_positions };
      },
    },
    getCurrentPositions: () => currentPositions,
    applyOptimisticPositions: (_formId, positions) => {
      currentPositions = positions;
    },
  });

  drag.onAnnotationPointerDown(
    { formId: 7, projectId: 3, key: 'LBTESTCD' },
    {
      clientY: 100,
      pointerId: 1,
      currentTarget: { setPointerCapture() {} },
      preventDefault() {},
    },
  );

  windowStub.listeners.get('pointermove')({ clientY: 100 + CSS_PX_PER_01CM * 15 });
  windowStub.listeners.get('pointerup')();
  await drag.flushPending();

  assert.deepEqual(currentPositions, { LBTESTCD: { y: 25 } });
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0].url, '/api/forms/7');
  assert.deepEqual(patchCalls[0].data.annotation_positions, { LBTESTCD: { y: 25 } });
  assert.deepEqual(patchCalls[0].options.invalidate, ['/api/forms/7/fields', '/api/projects/3/forms']);

  delete global.window;
});

test('useAcrfAnnotationDrag reset deletes one key and debounce merges multiple pending edits', async () => {
  let currentPositions = {
    LBTESTCD: { y: 12 },
    VISDAT: { y: -8 },
  };
  const patchCalls = [];
  const drag = useAcrfAnnotationDrag({
    apiClient: {
      async patch(_url, data) {
        patchCalls.push(data);
        return { id: 7, annotation_positions: data.annotation_positions };
      },
    },
    getCurrentPositions: () => currentPositions,
    applyOptimisticPositions: (_formId, positions) => {
      currentPositions = positions;
    },
  });

  drag.resetAnnotationPosition({ formId: 7, projectId: 3, key: 'LBTESTCD' });
  drag.queueAnnotationPosition({ formId: 7, projectId: 3, key: 'VISDAT', deltaY01cm: -10 });
  await drag.flushPending();

  assert.equal(patchCalls.length, 1);
  assert.deepEqual(patchCalls[0].annotation_positions, {
    VISDAT: { y: -10 },
  });
});

test('useAcrfAnnotationDrag keeps pending saves isolated per form during fast switching', async () => {
  const positionsByForm = new Map([
    [7, { LBTESTCD: { y: 12 } }],
    [8, { VSORRES: { y: -6 } }],
  ]);
  const patchCalls = [];
  const drag = useAcrfAnnotationDrag({
    apiClient: {
      async patch(url, data) {
        patchCalls.push({ url, data });
        const formId = Number(url.split('/').pop());
        return { id: formId, annotation_positions: data.annotation_positions };
      },
    },
    getCurrentPositions: (formId) => positionsByForm.get(formId) || {},
    applyOptimisticPositions: (formId, positions) => {
      positionsByForm.set(formId, positions);
    },
  });

  drag.queueAnnotationPosition({ formId: 7, projectId: 3, key: 'LBTESTCD', deltaY01cm: 20 });
  drag.queueAnnotationPosition({ formId: 8, projectId: 3, key: 'VSORRES', deltaY01cm: -15 });
  await drag.flushPending();

  assert.deepEqual(
    patchCalls.map((call) => [call.url, call.data.annotation_positions]),
    [
      ['/api/forms/7', { LBTESTCD: { y: 20 } }],
      ['/api/forms/8', { VSORRES: { y: -15 } }],
    ],
  );
});

test('useAcrfAnnotationDrag can cancel an active drag before flush to avoid ghost saves', async () => {
  const windowStub = createWindowStub();
  global.window = windowStub.window;

  let currentPositions = { LBTESTCD: { y: 10 } };
  const patchCalls = [];
  const drag = useAcrfAnnotationDrag({
    apiClient: {
      async patch(url, data) {
        patchCalls.push({ url, data });
        return { id: 7, annotation_positions: data.annotation_positions };
      },
    },
    getCurrentPositions: () => currentPositions,
    applyOptimisticPositions: (_formId, positions) => {
      currentPositions = positions;
    },
  });

  drag.onAnnotationPointerDown(
    { formId: 7, projectId: 3, key: 'LBTESTCD' },
    {
      clientY: 100,
      pointerId: 1,
      currentTarget: { setPointerCapture() {} },
      preventDefault() {},
    },
  );

  windowStub.listeners.get('pointermove')({ clientY: 100 + CSS_PX_PER_01CM * 8 });
  const cancelled = drag.cancelActiveDrag();
  const flushSucceeded = await drag.flushPending();

  assert.equal(cancelled, true);
  assert.equal(flushSucceeded, true);
  assert.deepEqual(currentPositions, { LBTESTCD: { y: 10 } });
  assert.equal(patchCalls.length, 0);

  delete global.window;
});

test('useApi.patch can explicitly invalidate /forms cache and /fields cache after annotation save', async () => {
  const fetchCounts = new Map();
  global.localStorage = createLocalStorageStub();
  global.fetch = async (url, options = {}) => {
    fetchCounts.set(url, (fetchCounts.get(url) || 0) + 1);
    if (options.method === 'PATCH') {
      return jsonResponse({ id: 7, annotation_positions: { LBTESTCD: { y: 10 } } });
    }
    return jsonResponse({ url, count: fetchCounts.get(url) });
  };

  api.clearAllCache();

  await api.cachedGet('/api/forms/7/fields');
  await api.cachedGet('/api/projects/3/forms');
  assert.equal(fetchCounts.get('/api/forms/7/fields'), 1);
  assert.equal(fetchCounts.get('/api/projects/3/forms'), 1);

  await api.patch(
    '/api/forms/7',
    { annotation_positions: { LBTESTCD: { y: 10 } } },
    { invalidate: ['/api/forms/7/fields', '/api/projects/3/forms'] },
  );

  await api.cachedGet('/api/forms/7/fields');
  await api.cachedGet('/api/projects/3/forms');
  assert.equal(fetchCounts.get('/api/forms/7/fields'), 2);
  assert.equal(fetchCounts.get('/api/projects/3/forms'), 2);

  api.clearAllCache();
  delete global.fetch;
  delete global.localStorage;
});
