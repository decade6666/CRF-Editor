import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/composables/useApi.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_STORAGE = globalThis.localStorage;
const TAG = '"opaque-project-state:original"';
let requests;
let store;

function response(data, revision = TAG, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: revision ? { 'X-CRF-Design-Revision': revision } : {},
  });
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
    return response({ name: 'original' });
  };
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_STORAGE === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = ORIGINAL_STORAGE;
  api.clearAllCache();
});

test('metadata reads preserve an opaque tag together with the cached body for legacy and metadata callers', async () => {
  const envelope = await api.cachedGetWithMetadata('/api/projects/1/forms');
  assert.deepEqual(envelope, { data: { name: 'original' }, revision: TAG });
  assert.deepEqual(await api.cachedGet('/api/projects/1/forms'), envelope.data);
  assert.deepEqual(await api.cachedGetWithMetadata('/api/projects/1/forms'), envelope);
  assert.equal(requests.length, 1);
});

test('a metadata caller joining a legacy in-flight read gets that same body and revision', async () => {
  let finish;
  globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
  const legacy = api.cachedGet('/api/projects/1/forms');
  const metadata = api.cachedGetWithMetadata('/api/projects/1/forms');
  finish(response(['base']));
  assert.deepEqual(await legacy, ['base']);
  assert.deepEqual(await metadata, { data: ['base'], revision: TAG });
});

test('invalidation cannot pair an old response with a newer cache tag or remove a newer pending read', async () => {
  const resolvers = [];
  globalThis.fetch = () => new Promise((resolve) => resolvers.push(resolve));
  const old = api.cachedGetWithMetadata('/api/projects/1/forms');
  api.invalidateCache('/api/projects/1/forms');
  const fresh = api.cachedGetWithMetadata('/api/projects/1/forms');
  resolvers[0](response(['old']));
  await old;
  const joined = api.cachedGetWithMetadata('/api/projects/1/forms');
  assert.equal(resolvers.length, 2);
  resolvers[1](response(['fresh'], '"fresh"'));
  assert.deepEqual(await fresh, { data: ['fresh'], revision: '"fresh"' });
  assert.deepEqual(await joined, await fresh);
  assert.deepEqual(await api.cachedGet('/api/projects/1/forms'), ['fresh']);
});

for (const method of ['post', 'put', 'patch', 'del']) {
  test(`${method} metadata writes send exactly the loaded If-Match without extra reads and retain 204 metadata`, async () => {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return response(null, '"committed"', 204);
    };
    const result = method === 'del'
      ? await api.delWithMetadata('/api/form-fields/7', { revision: TAG })
      : await api[`${method}WithMetadata`]('/api/forms/7', { name: 'local' }, { revision: TAG });
    assert.deepEqual(result, { data: null, revision: '"committed"' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers['If-Match'], TAG);
    assert.equal(requests[0].options.method, method === 'del' ? 'DELETE' : method.toUpperCase());
  });
}

test('a protected write with no loaded revision fails before sending a request', async () => {
  await assert.rejects(api.putWithMetadata('/api/forms/7', { name: 'local' }), (error) =>
    error.code === 'PRECONDITION_REQUIRED');
  assert.equal(requests.length, 0);
});

test('safe backend conflict code and detail survive HTTP error parsing', async () => {
  globalThis.fetch = async () => response({ detail: '设计已更新，请核对后重试', code: 'STALE_STATE' }, null, 409);
  await assert.rejects(api.putWithMetadata('/api/forms/7', {}, { revision: TAG }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STALE_STATE');
    assert.equal(error.message, '设计已更新，请核对后重试');
    return true;
  });
});

test('a successful write missing metadata is reported as committed, never as safely retryable', async () => {
  globalThis.fetch = async () => response({ id: 7 }, null);
  await assert.rejects(api.putWithMetadata('/api/forms/7', {}, { revision: TAG }), (error) =>
    error.committed === true && error.code === 'REVISION_UNAVAILABLE');
});

test('a session change does not reuse the previous account cached body or tag', async () => {
  store.set('crf_token', 'session-a');
  await api.cachedGetWithMetadata('/api/projects/1/forms');
  store.set('crf_token', 'session-b');
  globalThis.fetch = async () => response(['session-b'], '"session-b-design"');
  assert.deepEqual(await api.cachedGetWithMetadata('/api/projects/1/forms'), {
    data: ['session-b'], revision: '"session-b-design"',
  });
});
