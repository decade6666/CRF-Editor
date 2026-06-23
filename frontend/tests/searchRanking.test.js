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
