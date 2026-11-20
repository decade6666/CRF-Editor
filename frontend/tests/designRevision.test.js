import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readCoherentDesign, executeDesignMutation, assertSameDesignTarget, assertSameProjectDesignIdentity,
  createOwnDesignChain, applyOwnDesignWrite, advanceOwnSnapshot, upgradeOwnBaseline,
  isValidOwnTransition, recordOwnTransition, provenOwnCandidate,
} from '../src/composables/designRevision.js';

const envelope = (data, revision = '"base"') => ({ data, revision });

test('a recreated project cannot receive a reviewed old command even if every row ID and OID matches', () => {
  const original = `"crf-design-v1:p1:${'a'.repeat(32)}:r7"`;
  const recreated = `"crf-design-v1:p1:${'b'.repeat(32)}:r7"`;
  assert.throws(() => assertSameProjectDesignIdentity(original, recreated), (error) => error.code === 'TARGET_CHANGED');
  assert.doesNotThrow(() => assertSameProjectDesignIdentity(original, `"crf-design-v1:p1:${'a'.repeat(32)}:r999"`));
  assert.throws(() => assertSameProjectDesignIdentity(original, '"invalid-server-tag"'), (error) => error.code === 'TARGET_CHANGED');
});

const stale = () => Object.assign(new Error('设计已更新'), { status: 409, code: 'STALE_STATE' });

function command(overrides = {}) {
  return {
    method: 'put', url: '/api/forms/7', body: { name: 'local' },
    baseline: envelope({ name: 'base' }),
    readLatest: async () => envelope({ name: 'remote' }, '"reviewed"'),
    confirm: async () => {}, isCurrent: () => true,
    ...overrides,
  };
}

test('composed reads retry only reads until all bodies belong to exactly one revision', async () => {
  const calls = [];
  const apiClient = {
    cachedGetWithMetadata: async (url) => {
      calls.push(['cached', url]);
      return envelope(url, url === '/forms' ? '"a"' : '"b"');
    },
    getWithMetadata: async (url) => {
      calls.push(['fresh', url]);
      return envelope(url, '"coherent"');
    },
  };
  const result = await readCoherentDesign(['/forms', '/fields'], { apiClient });
  assert.deepEqual(result, envelope(['/forms', '/fields'], '"coherent"'));
  assert.deepEqual(calls, [['cached', '/forms'], ['cached', '/fields'], ['fresh', '/forms'], ['fresh', '/fields']]);
});

test('three incoherent read attempts fail without exposing a combined editable payload', async () => {
  let count = 0;
  const read = async () => envelope({ attempt: ++count }, `"${count}"`);
  await assert.rejects(readCoherentDesign(['/forms', '/fields'], {
    apiClient: { cachedGetWithMetadata: read, getWithMetadata: read },
  }), (error) => error.code === 'INCOHERENT_DESIGN');
  assert.equal(count, 6);
});

test('missing response metadata is not a silent unprotected fallback', async () => {
  await assert.rejects(readCoherentDesign(['/forms'], {
    apiClient: { cachedGetWithMetadata: async () => envelope([], null) },
  }), (error) => error.code === 'REVISION_UNAVAILABLE');
});

test('stale writes retain frozen original intent and use only the explicitly reviewed revision', async () => {
  const original = { name: 'local' };
  const writes = [];
  const reviews = [];
  const result = await executeDesignMutation(command({
    body: original,
    apiClient: { putWithMetadata: async (url, body, options) => {
      writes.push({ url, body, options });
      if (writes.length === 1) { original.name = 'later typing'; throw stale(); }
      return envelope({ name: body.name }, '"committed"');
    } },
    confirm: async (review) => { reviews.push(review); },
  }));
  assert.deepEqual(writes.map(({ body }) => body), [{ name: 'local' }, { name: 'local' }]);
  assert.deepEqual(writes.map(({ options }) => options.revision), ['"base"', '"reviewed"']);
  assert.equal(reviews.length, 1);
  assert.deepEqual(reviews[0].base, { name: 'base' });
  assert.deepEqual(reviews[0].local, { name: 'local' });
  assert.deepEqual(reviews[0].latest, { name: 'remote' });
  assert.deepEqual(result.before, { name: 'remote' });
});

test('cancelled review sends no overwrite and does not accept a new baseline or history entry', async () => {
  let writes = 0;
  let accepted = 0;
  await assert.rejects(executeDesignMutation(command({
    apiClient: { putWithMetadata: async () => { writes++; throw stale(); } },
    confirm: async () => { throw 'cancel'; },
    onAccepted: () => { accepted++; },
  })), (error) => error === 'cancel');
  assert.equal(writes, 1);
  assert.equal(accepted, 0);
});

test('another writer after confirmation requires a second distinct review, never automatic retry', async () => {
  const tags = [];
  let reviews = 0;
  let reads = 0;
  await executeDesignMutation(command({
    apiClient: { putWithMetadata: async (_url, _body, options) => {
      tags.push(options.revision);
      if (tags.length < 3) throw stale();
      return envelope({ name: 'local' }, '"done"');
    } },
    readLatest: async () => envelope({ name: `remote-${++reads}` }, `"review-${reads}"`),
    confirm: async () => { reviews++; assert.equal(tags.length, reviews); },
  }));
  assert.equal(reviews, 2);
  assert.deepEqual(tags, ['"base"', '"review-1"', '"review-2"']);
});

test('deleted or rebound targets cannot be recreated or redirected by a confirmed command', async () => {
  let confirmations = 0;
  let writes = 0;
  await assert.rejects(executeDesignMutation(command({
    apiClient: { putWithMetadata: async () => { writes++; throw stale(); } },
    validateLatest: () => { throw Object.assign(new Error('目标已更换'), { code: 'TARGET_CHANGED' }); },
    confirm: async () => { confirmations++; },
  })), (error) => error.code === 'TARGET_CHANGED');
  assert.equal(confirmations, 0);
  assert.equal(writes, 1);
});

test('a switched/disposed editing context cannot submit a late confirmation or update accepted state', async () => {
  let current = true;
  let writes = 0;
  let accepted = 0;
  await assert.rejects(executeDesignMutation(command({
    apiClient: { putWithMetadata: async () => { writes++; throw stale(); } },
    isCurrent: () => current,
    confirm: async () => { current = false; },
    onAccepted: () => { accepted++; },
  })), (error) => error.code === 'CONTEXT_CHANGED');
  assert.equal(writes, 1);
  assert.equal(accepted, 0);
});

test('ordinary 409 business conflicts, 428, and validation errors are never overwrite prompts', async () => {
  for (const error of [Object.assign(new Error('引用阻止'), { status: 409 }),
    Object.assign(new Error('请刷新客户端'), { status: 428, code: 'PRECONDITION_REQUIRED' }),
    Object.assign(new Error('校验失败'), { status: 422 })]) {
    let reads = 0;
    await assert.rejects(executeDesignMutation(command({
      apiClient: { putWithMetadata: async () => { throw error; } },
      readLatest: async () => { reads++; },
    })), (actual) => actual === error);
    assert.equal(reads, 0);
  }
});

test('a committed response followed by a context change is distinguishable from a rejected write', async () => {
  let current = true;
  await assert.rejects(executeDesignMutation(command({
    apiClient: { putWithMetadata: async () => { current = false; return envelope({ id: 7 }, '"done"'); } },
    isCurrent: () => current,
  })), (error) => error.committed === true && error.code === 'CONTEXT_CHANGED');
});

test('coherent snapshots never alias cached bodies, so optimistic view edits cannot pair with the old revision', async () => {
  const cache = { '/forms': envelope([{ id: 7, annotation_positions: null }], '"r1"') };
  const apiClient = { cachedGetWithMetadata: async (url) => cache[url] };
  const first = await readCoherentDesign(['/forms'], { apiClient });
  first.data[0][0].annotation_positions = { OPTIMISTIC: { y: 5 } };
  const second = await readCoherentDesign(['/forms'], { apiClient });
  assert.equal(second.revision, '"r1"');
  assert.equal(second.data[0][0].annotation_positions, null);
});

test('accepted writes expose the exact tag they were checked against, including after a reviewed retry', async () => {
  let attempt = 0;
  const apiClient = {
    putWithMetadata: async (_url, _body, { revision }) => {
      attempt += 1;
      if (attempt === 1) throw stale();
      return { data: { id: 7 }, revision: `"after-${revision}"` };
    },
  };
  const accepted = await executeDesignMutation(command({ apiClient }));
  assert.equal(accepted.baselineRevision, '"reviewed"');
  assert.equal(accepted.revision, '"after-"reviewed""');
});

test('the own-write chain reaches only through tags this host committed from; external tags stay unreachable', () => {
  const chain = createOwnDesignChain();
  chain.record('"r1"', '"r2"');
  chain.record('"r2"', '"r3"');
  assert.equal(chain.reaches('"r1"', '"r3"'), true);
  assert.equal(chain.reaches('"r2"', '"r2"'), true);
  assert.equal(chain.reaches('"r3"', '"r1"'), false);
  assert.equal(chain.reaches('"r0"', '"r3"'), false);
  assert.equal(chain.reaches('"r1"', '"r9"'), false);
  chain.reset();
  assert.equal(chain.reaches('"r1"', '"r3"'), false);
});

test('the own-write chain stays bounded and forgets the oldest transitions first', () => {
  const chain = createOwnDesignChain(2);
  chain.record('"r1"', '"r2"');
  chain.record('"r2"', '"r3"');
  chain.record('"r3"', '"r4"');
  assert.equal(chain.reaches('"r1"', '"r4"'), false);
  assert.equal(chain.reaches('"r2"', '"r4"'), true);
});

const formsData = () => ({
  projectId: 1, formId: null,
  forms: [{ id: 7, name: 'A', order_index: 1 }, { id: 8, name: 'B', order_index: 2 }, { id: 9, name: 'C', order_index: 3 }],
});
const order = (rows) => rows.map((row) => [row.id, row.order_index]);

test('exact own-write effects cover form updates, reorders and order compaction after deletes', () => {
  const updated = applyOwnDesignWrite(formsData(), { method: 'put', url: '/api/forms/8', result: { id: 8, name: 'B2', order_index: 2 } });
  assert.deepEqual(updated.forms.map((row) => row.name), ['A', 'B2', 'C']);
  assert.deepEqual(order(applyOwnDesignWrite(formsData(), { method: 'post', url: '/api/projects/1/forms/reorder', body: [9, 7, 8] }).forms),
    [[9, 1], [7, 2], [8, 3]]);
  assert.deepEqual(order(applyOwnDesignWrite(formsData(), { method: 'del', url: '/api/forms/7' }).forms), [[8, 1], [9, 2]]);
  assert.deepEqual(order(applyOwnDesignWrite(formsData(),
    { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [8] }, result: { deleted: 1 } }).forms), [[7, 1], [9, 2]]);
  const fields = { projectId: 1, formId: 7, forms: formsData().forms,
    fields: [{ id: 101, order_index: 1 }, { id: 102, order_index: 2 }] };
  assert.deepEqual(order(applyOwnDesignWrite(fields, { method: 'post', url: '/api/forms/7/fields/reorder', body: { ordered_ids: [102, 101] } }).fields),
    [[102, 1], [101, 2]]);
  const library = { projectId: 1, formId: null, definitions: [{ id: 201, order_index: 1 }, { id: 202, order_index: 2 }], codelists: [], units: [] };
  assert.deepEqual(order(applyOwnDesignWrite(library, { method: 'post', url: '/api/projects/1/field-definitions/reorder', body: [202, 201] }).definitions),
    [[202, 1], [201, 2]]);
  assert.deepEqual(applyOwnDesignWrite(formsData(), { method: 'put', url: '/api/form-fields/101/binding-profile', result: {} }), formsData());
});

test('own-write effects that cannot be derived exactly are unknown, so the snapshot is not advanced', () => {
  assert.equal(applyOwnDesignWrite(formsData(), { method: 'post', url: '/api/projects/1/forms/reorder', body: [7, 8] }), null);
  assert.equal(applyOwnDesignWrite(formsData(),
    { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [8, 99] }, result: { deleted: 1 } }), null);
  const legacy = formsData();
  legacy.forms[1].order_index = null;
  assert.equal(applyOwnDesignWrite(legacy, { method: 'del', url: '/api/forms/7' }), null);
  const fields = { projectId: 1, formId: 7, forms: formsData().forms, fields: [{ id: 101, order_index: 1 }] };
  assert.equal(applyOwnDesignWrite(fields, { method: 'put', url: '/api/form-fields/101/binding-profile', result: {} }), null);
  assert.equal(applyOwnDesignWrite(fields, { method: 'del', url: '/api/forms/7' }), null);
  assert.equal(applyOwnDesignWrite(formsData(), { method: 'post', url: '/api/projects/1/forms', result: { id: 10 } }), null);
});

test('a snapshot advances only from the exact tag the accepted write was checked against', () => {
  const snapshot = { revision: '"r1"', data: formsData() };
  const direct = advanceOwnSnapshot(snapshot,
    { baselineRevision: '"r1"', revision: '"r2"', data: { id: 7, name: 'A2', order_index: 1 } },
    { method: 'put', url: '/api/forms/7' });
  assert.equal(direct.revision, '"r2"');
  assert.equal(direct.data.forms[0].name, 'A2');
  assert.equal(snapshot.data.forms[0].name, 'A');
  const reviewed = advanceOwnSnapshot(snapshot,
    { baselineRevision: '"r5"', revision: '"r6"', reviewed: true, before: { forms: [] }, data: { id: 7, name: 'A3' } },
    { method: 'put', url: '/api/forms/7' });
  assert.equal(reviewed, snapshot);
  const unknown = advanceOwnSnapshot(snapshot, { baselineRevision: '"r1"', revision: '"r2"', data: { id: 10 } },
    { method: 'post', url: '/api/projects/1/forms' });
  assert.equal(unknown, snapshot);
});

test('old baselines are replaced only by same-project snapshots reachable through own accepted writes', () => {
  const chain = createOwnDesignChain();
  chain.record('"r1"', '"r2"');
  const head = { revision: '"r2"', data: { projectId: 1, formId: 7, forms: [], fields: [] } };
  const old = { revision: '"r1"', data: { projectId: 1, formId: 7, forms: [], fields: [] } };
  const upgraded = upgradeOwnBaseline(old, [head], chain);
  assert.deepEqual(upgraded, head);
  assert.notEqual(upgraded, head);
  assert.equal(upgradeOwnBaseline(old, [{ ...head, revision: '"r9"' }], chain), old);
  assert.equal(upgradeOwnBaseline(old, [{ ...head, data: { ...head.data, projectId: 2 } }], chain), old);
  assert.equal(upgradeOwnBaseline(old, [{ ...head, data: { ...head.data, formId: 8 } }], chain), old);
  assert.deepEqual(upgradeOwnBaseline({ revision: '"r2"', data: null }, [head], chain), head);
  assert.equal(upgradeOwnBaseline(head, [head], chain), head);
});

// F1 过渡证据：只有服务器证明的 前标签→后标签 边、且两端同属一个项目身份时才可记入本页写入链；
// 完整一致候选只有恰好停在已确认的后标签、且旧宿主标签沿写入链可达时才允许安装。
test('transition edges are recorded only for valid same-project before/after pairs', () => {
  const identity = `"crf-design-v1:p1:${'c'.repeat(32)}:r5"`;
  const next = `"crf-design-v1:p1:${'c'.repeat(32)}:r6"`;
  const other = `"crf-design-v1:p2:${'d'.repeat(32)}:r6"`;
  assert.equal(isValidOwnTransition(1, { projectId: 1, beforeRevision: identity, revision: next }), true);
  assert.equal(isValidOwnTransition(1, { projectId: 1, beforeRevision: identity, revision: other }), false);
  assert.equal(isValidOwnTransition(2, { projectId: 2, beforeRevision: identity, revision: next }), false);
  assert.equal(isValidOwnTransition(1, { projectId: 1, beforeRevision: identity, revision: identity }), false);
  assert.equal(isValidOwnTransition(1, { projectId: 1, beforeRevision: identity, revision: null }), false);
  assert.equal(isValidOwnTransition(1, null), false);
  const chain = createOwnDesignChain();
  assert.equal(recordOwnTransition(chain, 1, { projectId: 1, beforeRevision: identity, revision: next }), true);
  assert.equal(chain.reaches(identity, next), true);
  assert.equal(recordOwnTransition(chain, 1, { projectId: 1, beforeRevision: identity, revision: other }), false);
  assert.equal(chain.reaches(identity, other), false);
});

test('a coherent candidate installs only at the exact acknowledged tag reachable from the host tag', () => {
  const chain = createOwnDesignChain();
  chain.record('"r1"', '"r2"');
  assert.equal(provenOwnCandidate(chain, { fromRevision: '"r1"', candidateRevision: '"r2"' }), true);
  assert.equal(provenOwnCandidate(chain, { fromRevision: '"r1"', candidateRevision: '"r3"' }), false);
  assert.equal(provenOwnCandidate(chain, { fromRevision: '"r0"', candidateRevision: '"r2"' }), false);
  assert.equal(provenOwnCandidate(chain, { fromRevision: '"r2"', candidateRevision: '"r2"' }), true);
  assert.equal(provenOwnCandidate(chain, { fromRevision: '"r2"', candidateRevision: null }), false);
  chain.record('"r3"', '"r9"');
  assert.equal(provenOwnCandidate(chain, { fromRevision: '"r1"', candidateRevision: '"r9"' }), false);
});
