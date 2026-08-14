import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFuzzyMatches, normalizeSearchText } from '../src/composables/searchRanking.js';

test('normalizeSearchText trims and lowercases search text', () => {
  assert.equal(normalizeSearchText('  ABC 中文  '), 'abc 中文');
});

test('rankFuzzyMatches returns original items when keyword is blank', () => {
  const items = [{ name: 'Beta' }, { name: 'Alpha' }];

  assert.deepEqual(rankFuzzyMatches(items, ' ', (item) => [item.name]), items);
});

test('rankFuzzyMatches puts exact matches before partial matches', () => {
  const items = [
    { name: 'Alpha Beta' },
    { name: 'Beta' },
    { name: 'Beta Gamma' },
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'beta', (item) => [item.name]).map((item) => item.name),
    ['Beta', 'Alpha Beta', 'Beta Gamma'],
  );
});

test('rankFuzzyMatches sorts partial matches by matched text length', () => {
  const items = [
    { code: 'FORM_LONG', name: 'AlphaBetaGamma' },
    { code: 'FORM_SHORT', name: 'AlphaBeta' },
    { code: 'FORM_EXACT', name: 'Alpha' },
    { code: 'FORM_MID', name: 'AlphaBetaX' },
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'alpha', (item) => [item.name]).map((item) => item.code),
    ['FORM_EXACT', 'FORM_SHORT', 'FORM_MID', 'FORM_LONG'],
  );
});

test('rankFuzzyMatches uses the shortest matching field for multi-field items', () => {
  const items = [
    { code: 'LONG', label: 'prefix-alpha-suffix', description: 'AlphaBetaGamma' },
    { code: 'SHORT', label: 'AlphaBeta', description: 'prefix-alpha-suffix' },
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'alpha', (item) => [item.label, item.description]).map((item) => item.code),
    ['SHORT', 'LONG'],
  );
});

test('rankFuzzyMatches keeps stable input order for equal rank and length', () => {
  const items = [
    { id: 1, label: 'Alpha 1' },
    { id: 2, label: 'Alpha 2' },
    { id: 3, label: 'Alpha 3' },
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'alpha', (item) => [item.label]).map((item) => item.id),
    [1, 2, 3],
  );
});

test('rankFuzzyMatches ignores nullish candidate text and filters non-matches', () => {
  const items = [
    { id: 1, label: null },
    { id: 2, label: 'Beta' },
    { id: 3, label: undefined },
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'beta', (item) => [item.label]).map((item) => item.id),
    [2],
  );
});

// ── 升级契约：精确 > 连续包含 > 有序子序列 > 受限编辑距离 ─────────

test('tier ordering: exact > substring > subsequence > edit distance', () => {
  const items = [
    { id: 1, label: 'axbycz' }, // 'xyz' 有序子序列（x@1 y@3 z@5）
    { id: 2, label: 'xzz' },    // 编辑距离 1（z→y 替换）
    { id: 3, label: 'xxyz' },   // 连续包含
    { id: 4, label: 'xyz' },    // 精确
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'xyz', (item) => [item.label]).map((item) => item.id),
    [4, 3, 1, 2],
  );
});

test('subsequence matches order by shorter span then earlier start', () => {
  const items = [
    { id: 1, label: 'xabyz' },  // span 5 start 0
    { id: 2, label: 'xabycz' }, // span 6 start 0
    { id: 3, label: 'axbcyz' }, // span 5 start 1
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'xyz', (item) => [item.label]).map((item) => item.id),
    [1, 3, 2],
  );
});

test('edit distance is disabled for 1-2 char keywords', () => {
  const items = [{ id: 1, label: 'xz' }];

  assert.deepEqual(rankFuzzyMatches(items, 'xy', (item) => [item.label]), []);
});

test('3-5 char keywords tolerate at most 1 edit', () => {
  const items = [
    { id: 1, label: 'axcd' }, // 存在窗口 d=1 → 命中
    { id: 2, label: 'axcz' }, // 所有窗口 d≥2 → 拒绝
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'abcd', (item) => [item.label]).map((item) => item.id),
    [1],
  );
});

test('6+ char keywords: at most 2 edits with 0.7 relevance floor', () => {
  const items = [
    { id: 1, label: 'abcxef' },  // k=6, d=1 → 命中
    { id: 2, label: 'abcxez' },  // k=6, d=2 → 相似度 0.667 < 0.7 → 拒绝
    { id: 3, label: 'abcxezg' }, // k=7, d=2 → 相似度 0.714 ≥ 0.7 → 命中
    { id: 4, label: 'abcxzyf' }, // d=3 → 超上限 → 拒绝
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'abcdef', (item) => [item.label]).map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    rankFuzzyMatches(items, 'abcdefg', (item) => [item.label]).map((item) => item.id),
    [1, 3],
  );
});

test('edit matches order by lower distance then earlier window start', () => {
  const items = [
    { id: 1, label: 'qxzz' }, // 窗口 xzz 位于 start 1，d=1
    { id: 2, label: 'xzz' },  // 窗口 xzz 位于 start 0，d=1
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'xyz', (item) => [item.label]).map((item) => item.id),
    [2, 1],
  );
});

test('best tier wins across multiple candidate texts', () => {
  const items = [
    { id: 1, label: 'xyz', code: 'xzz' },      // 候选精确 → tier 0
    { id: 2, label: 'abxyz', code: 'zzz' },    // 候选包含 → tier 1
    { id: 3, label: 'qwerty', code: 'xbycz' }, // 候选子序列 → tier 2
    { id: 4, label: 'qwerty', code: 'xzz' },   // 候选编辑距离 → tier 3
  ];

  assert.deepEqual(
    rankFuzzyMatches(items, 'xyz', (item) => [item.label, item.code]).map((item) => item.id),
    [1, 2, 3, 4],
  );
});
