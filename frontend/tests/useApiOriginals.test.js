import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/composables/useApi.js';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
let storage;

beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  api.clearAllCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  api.clearAllCache();
});

test('original download returns uncached retained blob and checksum through the existing authenticated GET boundary', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    assert.equal(options.headers.Authorization, 'Bearer synthetic-browser-session');
    assert.equal(options.cache, 'no-store');
    return new Response('retained-original', { headers: { 'X-CRF-Original-SHA256': 'a'.repeat(64) } });
  };
  storage.set('crf_token', 'synthetic-browser-session');

  const first = await api.getOriginal('/api/admin/projects/1/design-baselines/id/originals/ecrf');
  const second = await api.getOriginal('/api/admin/projects/1/design-baselines/id/originals/ecrf');

  assert.equal(await first.blob.text(), 'retained-original');
  assert.equal(first.sha256, 'a'.repeat(64));
  assert.equal(second.blob.size, 17);
  assert.equal(calls, 2);
});

test('original download refuses a missing checksum rather than returning an unverified-success envelope', async () => {
  globalThis.fetch = async () => new Response('no checksum');
  await assert.rejects(api.getOriginal('/api/original'), (error) => error.code === 'BASELINE_INTEGRITY_FAILED');
});

test('original download preserves coded backend failure and never treats JSON error as a file', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: '原件校验失败', code: 'BASELINE_INTEGRITY_FAILED' }), { status: 500 });
  await assert.rejects(
    api.getOriginal('/api/original'),
    (error) => error.status === 500 && error.code === 'BASELINE_INTEGRITY_FAILED',
  );
});

test('explicit JSON delete sends the pair-loss confirmation and returns its cleanup result without changing legacy delete', async () => {
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    return new Response(JSON.stringify({ deleted: true, cleanup_complete: false }));
  };
  const result = await api.del('/api/archive', { data: { confirm_pair_loss: true }, withResponse: true });
  assert.deepEqual(result, { deleted: true, cleanup_complete: false });
  assert.equal(calls[0].body, '{"confirm_pair_loss":true}');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(await api.del('/api/legacy'), undefined);
  assert.equal(calls[1].body, undefined);
});
