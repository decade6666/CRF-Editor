import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/composables/useApi.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_STORAGE = globalThis.localStorage;
const BEFORE_TAG = '"crf-design-v1:p1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:r3"';
const AFTER_TAG = '"crf-design-v1:p1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:r4"';
let requests;
let store;

function respond(data, headers = {}, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

beforeEach(() => {
  requests = [];
  store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  api.clearAllCache();
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return respond({ id: 9 }, { 'X-CRF-Design-Before-Revision': BEFORE_TAG, 'X-CRF-Design-Revision': AFTER_TAG }, 201);
  };
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_STORAGE === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = ORIGINAL_STORAGE;
  api.clearAllCache();
});

test('transition POST returns body and proven before/after tags from one response without If-Match', async () => {
  const result = await api.postWithTransitionMetadata('/api/projects/1/codelists', { name: '快速字典' });
  assert.deepEqual(result, { data: { id: 9 }, beforeRevision: BEFORE_TAG, revision: AFTER_TAG });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers['If-Match'], undefined);
  assert.deepEqual(JSON.parse(requests[0].options.body), { name: '快速字典' });
});

test('a legacy server without transition headers stays a business success with no chain edge', async () => {
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return respond({ id: 9 });
  };
  const result = await api.postWithTransitionMetadata('/api/projects/1/units', { symbol: 'kg' });
  assert.deepEqual(result, { data: { id: 9 }, beforeRevision: null, revision: null });
});

test('a committed but unreadable transition POST reports committed, never retryable', async () => {
  globalThis.fetch = async () => new Response('not-json', {
    status: 201,
    headers: { 'X-CRF-Design-Before-Revision': BEFORE_TAG, 'X-CRF-Design-Revision': AFTER_TAG },
  });
  await assert.rejects(api.postWithTransitionMetadata('/api/projects/1/codelists', { name: 'x' }), (error) => {
    assert.equal(error.committed, true);
    assert.ok(!(error.code === 'STALE_STATE'));
    return true;
  });
});

test('a 204 transition response keeps its null body with the tag pair', async () => {
  globalThis.fetch = async () => new Response(null, {
    status: 204,
    headers: { 'X-CRF-Design-Before-Revision': BEFORE_TAG, 'X-CRF-Design-Revision': AFTER_TAG },
  });
  const result = await api.postWithTransitionMetadata('/api/forms/7/copy', {});
  assert.deepEqual(result, { data: null, beforeRevision: BEFORE_TAG, revision: AFTER_TAG });
});

test('strict core metadata POST still requires a loaded revision and one If-Match header', async () => {
  await assert.rejects(api.postWithMetadata('/api/projects/1/field-definitions', {}), (error) =>
    error.code === 'PRECONDITION_REQUIRED');
  assert.equal(requests.length, 0);
});
