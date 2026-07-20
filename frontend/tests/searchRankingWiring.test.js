import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isVisibleInFieldLibrary } from '../src/composables/fieldDefinitionVisibility.js';

const root = resolve(import.meta.dirname, '..');

function readSource(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

const SEARCH_COMPONENTS = [
  'src/components/CodelistsTab.vue',
  'src/components/FieldsTab.vue',
  'src/components/FormDesignerTab.vue',
  'src/components/UnitsTab.vue',
  'src/components/VisitsTab.vue',
];

test('search components import the shared ranked fuzzy search helper', () => {
  for (const file of SEARCH_COMPONENTS) {
    const source = readSource(file);
    assert.match(source, /import \{ rankFuzzyMatches \} from ['"]\.\.\/composables\/searchRanking['"]/);
  }
});

test('field library visibility helper hides label and log-row definitions', () => {
  assert.equal(isVisibleInFieldLibrary({ field_type: '文本' }), true);
  assert.equal(isVisibleInFieldLibrary({ field_type: '标签' }), false);
  assert.equal(isVisibleInFieldLibrary({ field_type: '日志行' }), false);
  assert.equal(isVisibleInFieldLibrary(null), false);
});

test('search components route filtered lists through rankFuzzyMatches', () => {
  const expectations = [
    ['src/components/CodelistsTab.vue', /rankFuzzyMatches\(codelists\.value, searchCl\.value/, /rankFuzzyMatches\(selected\.value\?\.options \|\| \[\], searchOpt\.value/],
    ['src/components/FieldsTab.vue', /rankFuzzyMatches\(visibleDefinitions, searchField\.value/],
    ['src/components/FormDesignerTab.vue', /rankFuzzyMatches\(orderedForms\.value, searchForm\.value/, /rankFuzzyMatches\(fieldDefs\.value\.filter\(isVisibleInFieldLibrary\), fieldSearch\.value/],
    ['src/components/UnitsTab.vue', /rankFuzzyMatches\(orderedUnits, searchUnit\.value/],
    ['src/components/VisitsTab.vue', /rankFuzzyMatches\(visits\.value, searchVisit\.value/],
  ];

  for (const [file, ...patterns] of expectations) {
    const source = readSource(file);
    for (const pattern of patterns) assert.match(source, pattern);
  }
});

test('codelist option search uses ranked data instead of v-show substring filtering', () => {
  const source = readSource('src/components/CodelistsTab.vue');

  assert.match(source, /<el-table[\s\S]*:data="visibleOptions"[\s\S]*border/);
  assert.match(source, /function optionSearchTexts\(option\) \{/);
  assert.match(source, /`\$\{option\.code \?\? ''\}\$\{option\.decode \?\? ''\}`/);
  assert.equal(source.includes('v-show="!searchOpt.trim()'), false);
});

test('unit search preserves code and symbol concatenation matching', () => {
  const source = readSource('src/components/UnitsTab.vue');

  assert.match(source, /function unitSearchTexts\(unit\) \{/);
  assert.match(source, /`\$\{unit\.code \?\? ''\}\$\{unit\.symbol \?\? ''\}`/);
  assert.match(source, /rankFuzzyMatches\(orderedUnits, searchUnit\.value, unitSearchTexts\)/);
});
