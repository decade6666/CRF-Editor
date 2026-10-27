import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INLINE_TABLE_LIMIT_MESSAGE,
  countInlineTableBlocks,
  isInlineTableCountAllowed,
} from '../src/composables/formFieldPresentation.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sharedCases = JSON.parse(
  readFileSync(path.resolve(currentDir, '../../backend/tests/fixtures/inline_table_block_cases.json'), 'utf8'),
);
const designerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8');

function createField(overrides = {}) {
  return {
    id: 1,
    order_index: 1,
    inline_mark: 0,
    is_log_row: 0,
    label_override: null,
    field_definition: { label: '字段', field_type: '文本' },
    ...overrides,
  };
}

function markersToFields(markers) {
  return markers.map((marker, index) =>
    createField({ id: index + 1, order_index: index + 1, inline_mark: marker }),
  );
}

// ── 共享用例表：计数与 R6 策略 ───────────────────────────────────────────

for (const sharedCase of sharedCases.count_cases) {
  test(`inline block count case: ${sharedCase.name}`, () => {
    const fields = markersToFields(sharedCase.markers);
    const before = [...fields];
    assert.equal(countInlineTableBlocks(fields), sharedCase.blocks, sharedCase.name);
    assert.deepEqual(fields, before, 'count helper must not mutate its input');
  });
}

for (const sharedCase of sharedCases.policy_cases) {
  test(`inline block policy case: ${sharedCase.name}`, () => {
    assert.equal(
      isInlineTableCountAllowed(sharedCase.before, sharedCase.after),
      sharedCase.allowed,
      sharedCase.name,
    );
  });
}

test('shared limit message matches the cross-stack fixture', () => {
  assert.equal(INLINE_TABLE_LIMIT_MESSAGE, sharedCases.limit_message);
});

// ── 排序语义：计数按 order_index/id 实际顺序，而非数组原序 ────────────────

test('count helper sorts by order before counting so raw append order cannot fake a second block', () => {
  // I1(1) 与 N2(2) 之间的相邻副本：数组原序 [I1, N2, 草案I(1.5)] 按 order 排序后仍是一块
  const fields = [
    createField({ id: 1, order_index: 1, inline_mark: 1 }),
    createField({ id: 2, order_index: 2, inline_mark: 0 }),
    createField({ id: '__draft__', order_index: 1.5, inline_mark: 1, __draft: true }),
  ];
  assert.equal(countInlineTableBlocks(fields), 1);
  // 真正被分隔的草案（order 2.5）在 I1 / N2 之后才是第二块
  const separated = [
    createField({ id: 1, order_index: 1, inline_mark: 1 }),
    createField({ id: 2, order_index: 2, inline_mark: 0 }),
    createField({ id: '__draft__', order_index: 2.5, inline_mark: 1, __draft: true }),
  ];
  assert.equal(countInlineTableBlocks(separated), 2);
});

test('count helper treats missing/null markers as ordinary rows', () => {
  const fields = [
    createField({ id: 1, inline_mark: 1 }),
    createField({ id: 2, inline_mark: null }),
    createField({ id: 3, inline_mark: undefined }),
    createField({ id: 4, inline_mark: 1 }),
  ];
  assert.equal(countInlineTableBlocks(fields), 2);
});

for (const fields of [undefined, null]) {
  test(`count helper treats ${fields} as an empty list`, () => {
    assert.equal(countInlineTableBlocks(fields), 0);
  });
}

test('count helper places missing order last and uses zero for missing numeric ids', () => {
  const fields = [
    createField({ id: 2, order_index: null, inline_mark: 1 }),
    createField({ id: null, order_index: undefined, inline_mark: 1 }),
    createField({ id: 1, order_index: 1, inline_mark: 0 }),
  ];
  assert.equal(countInlineTableBlocks(fields), 1);
});

test('count helper uses the same numeric id tie-breaker as persisted field order', () => {
  const fields = [
    createField({ id: 1, order_index: 1, inline_mark: 1 }),
    createField({ id: 2, order_index: 1, inline_mark: 1 }),
    createField({ id: 10, order_index: 1, inline_mark: 0 }),
  ];
  assert.equal(countInlineTableBlocks(fields), 1);
});

// ── 设计器接线（GREEN 行为）──────────────────────────────────────────────

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const bodyStart = source.indexOf('{', (asyncStart !== -1 ? asyncStart : start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }
  assert.fail(`${name} should have a complete body`);
}

test('designer imports the shared count/policy helpers and limit message', () => {
  assert.match(
    designerSource,
    /import \{[^}]*INLINE_TABLE_LIMIT_MESSAGE[^}]*countInlineTableBlocks[^}]*isInlineTableCountAllowed[^}]*\} from '\.\.\/composables\/formFieldPresentation';/s,
  );
});

test('row inline toggle rejects a layout-changing toggle before any request', () => {
  const body = functionBody(designerSource, 'toggleInline');
  const checkIdx = body.indexOf('INLINE_TABLE_LIMIT_MESSAGE');
  const putIdx = body.indexOf('api.put(');
  assert.ok(checkIdx > -1, 'toggleInline 应引用横向表格限制提示');
  assert.ok(putIdx > -1, 'toggleInline 应保留既有 PUT');
  assert.ok(checkIdx < putIdx, '拒绝必须发生在写请求之前');
});

test('quick edit rejects an extra block, keeps the dialog open and restores only the marker', () => {
  const body = functionBody(designerSource, 'saveQuickEdit');
  assert.match(body, /INLINE_TABLE_LIMIT_MESSAGE/);
  assert.doesNotMatch(body, /showQuickEdit\.value = true/);
  assert.match(body, /quickEditProp\.inline_mark = /);
});

test('reorder preflight rejects a splitting move before optimistic state and shows the specific reason', () => {
  const body = functionBody(designerSource, 'persistFieldReorder');
  const checkIdx = body.indexOf('INLINE_TABLE_LIMIT_MESSAGE');
  const optimisticIdx = body.indexOf('formFields.value = normalized');
  assert.ok(checkIdx > -1 && optimisticIdx > -1);
  assert.ok(checkIdx < optimisticIdx, '预检必须先于乐观替换');
  // 业务拒绝分支：精确还原旧数组，保留既有「排序保存失败，已恢复」给无关失败
  assert.match(body, /formFields\.value = previousFields/);
  assert.match(designerSource, /排序保存失败，已恢复/);
});

test('main preview groups the order-sorted projection so a valid adjacent copy shows one block', () => {
  assert.match(
    designerSource,
    /const renderGroups = computed\(\(\) => buildFormDesignerRenderGroups\(sortFormFieldsByOrder\(formFields\.value\)\)\);/,
  );
});

test('draft save rechecks the intended final layout before dispatch and keeps the draft on rejection', () => {
  const body = functionBody(designerSource, 'saveDraftField');
  const checkIdx = body.indexOf('INLINE_TABLE_LIMIT_MESSAGE');
  const postIdx = body.indexOf("api.post(`/api/forms/${formId}/field-profile`");
  assert.ok(checkIdx > -1 && postIdx > -1);
  assert.ok(checkIdx < postIdx, '草稿保存预检必须先于请求');
});

test('persisted property save rechecks the final normalized marker before dispatch', () => {
  const body = functionBody(designerSource, 'saveFieldProp');
  const checkIdx = body.indexOf('INLINE_TABLE_LIMIT_MESSAGE');
  const putIdx = body.indexOf('api.put(`/api/form-fields/${propEditFieldId}/binding-profile`');
  assert.ok(checkIdx > -1 && putIdx > -1);
  assert.ok(checkIdx < putIdx);
});

test('single delete undo restores through one atomic request without the multi-request fallback', () => {
  const source = designerSource;
  const body = functionBody(source, 'recreateFieldFromSnapshot');
  assert.match(body, /restoreFieldsFromSnapshots\(formId, \[snapshot\]\)/);
  assert.doesNotMatch(body, /field-definitions`/);
  assert.doesNotMatch(source, /status !== 404/);
  const helperBody = functionBody(source, 'restoreFieldsFromSnapshots');
  assert.match(helperBody, /restore-batch/);
  assert.match(helperBody, /items:\s*snapshots\.map/);
});

test('batch delete undo submits all snapshots in one restore-batch request and remaps only after success', () => {
  const body = functionBody(designerSource, 'batchDelete');
  assert.match(body, /restoreFieldsFromSnapshots\(formId, snapshots\.map\(\(\{ snapshot \}\) => snapshot\)\)/);
  assert.doesNotMatch(body, /for \(let i = 0;[\s\S]*?recreateFieldFromSnapshot/);
  // 先整批请求成功，再逐条 remapId（请求在 remap 之前）
  const restoreIdx = body.indexOf('restoreFieldsFromSnapshots(formId, snapshots.map(({ snapshot }) => snapshot))');
  const remapIdx = body.indexOf('remapId(');
  assert.ok(restoreIdx > -1 && remapIdx > -1 && remapIdx > restoreIdx);
});
