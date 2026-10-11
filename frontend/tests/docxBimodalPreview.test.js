import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8');
const compareSource = readFileSync(path.resolve(currentDir, '../src/components/DocxCompareDialog.vue'), 'utf8');
const screenshotSource = readFileSync(path.resolve(currentDir, '../src/components/DocxScreenshotPanel.vue'), 'utf8');
const wordImportSource = readFileSync(path.resolve(currentDir, '../src/composables/useWordImport.js'), 'utf8');
const wordImportDialogSource = readFileSync(
  path.resolve(currentDir, '../src/components/WordImportDialog.vue'),
  'utf8',
);
const designerFormSelectionSource = readFileSync(
  path.resolve(currentDir, '../src/composables/useDesignerFormSelection.js'),
  'utf8',
);

test('docx compare dialog always renders the left screenshot panel', () => {
  assert.match(compareSource, /<div class="compare-panel compare-left">/);
  assert.match(compareSource, /<DocxScreenshotPanel/);
  assert.doesNotMatch(compareSource, /ENABLE_LEFT_PREVIEW/);
});

test('screenshot panel shows a gentle hint instead of forcing fallback navigation', () => {
  assert.match(
    screenshotSource,
    /<div v-if="locateHint" class="locate-hint" aria-live="polite">\{\{ locateHint \}\}<\/div>/,
  );
  assert.match(screenshotSource, /const locateHint = ref\(''\)/);
  assert.match(screenshotSource, /showLocateHint\('未定位到原文页'\)/);
  assert.doesNotMatch(screenshotSource, /targetPage = range\[0\]/);
});

test('screenshot panel clears stale state when resetting preview context', () => {
  assert.match(
    screenshotSource,
    /function reset\(\) \{[\s\S]*clearLocateHint\(\)[\s\S]*fieldPages\.value = \{\}[\s\S]*pageRefs\.value = \{\}[\s\S]*highlightPage\.value = null[\s\S]*retryCount = 0[\s\S]*\}/,
  );
  assert.match(screenshotSource, /function showLocateHint\(message\) \{[\s\S]*hintTimer = setTimeout\(/);
});

test('screenshot panel encodes tempId when building page image urls', () => {
  assert.match(screenshotSource, /encodeURIComponent\(props\.tempId\)/);
});

test('screenshot panel removes temporary console debugging noise', () => {
  assert.doesNotMatch(screenshotSource, /console\.log\(/);
  assert.doesNotMatch(screenshotSource, /console\.warn\(/);
});

test('docx compare dialog previews only the accepted AI suggestion subset and exposes accept controls', () => {
  assert.match(compareSource, /acceptedSuggestions: \{ type: Array, default: \(\) => \[\] \}/);
  assert.match(compareSource, /defineEmits\(\['update:modelValue', 'toggle-suggestion', 'toggle-form'\]\)/);
  assert.match(compareSource, /<el-checkbox[\s\S]*本表单全接受/);
  assert.match(compareSource, /@click="clearFormAcceptance"/);
  assert.match(compareSource, /function clearFormAcceptance\(\) \{[\s\S]*accepted: false[\s\S]*\}/);
  assert.match(compareSource, /@change="toggleSuggestion\(item, \$event\)"/);
  assert.match(compareSource, /:ai-suggestions="acceptedSuggestions"/);
  assert.match(compareSource, /view-mode="ai"/);
  assert.doesNotMatch(compareSource, /view-mode="direct"/);
});

test('useWordImport wires accepted AI overrides through reconcile, step resets and the execute payload', () => {
  assert.match(wordImportSource, /const acceptedAiOverrides = ref\(\{\}\);/);
  // 可见性 watcher：打开分支做整段会话重置（回到第 1 步），关闭分支只清对比数据与已接受建议；
  // immediate:true 让初始 true 也走打开重置（R6：初始 false 走幂等的关闭分支）。
  assert.match(wordImportSource, /watch\(\s*visible,[\s\S]*\{ immediate: true \}/);
  assert.match(
    wordImportSource,
    /function resetImportWordSession\(\) \{[\s\S]*importWordStep\.value = 1;[\s\S]*resetAcceptedAiOverrides\(\);\s*\}/,
  );
  assert.match(wordImportSource, /resetAcceptedAiOverrides\(\);\s*\},\s*\{ immediate: true \}/);
  assert.match(wordImportSource, /function goBackToImportWordStep1\(\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*\}/);
  assert.match(
    wordImportSource,
    /function handleDocxUploadSuccess\(response\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*replaceImportedFormsPreview\(response\.forms\);/,
  );
  assert.match(wordImportSource, /\.acceptedAiOverrides\.value = reconcileAcceptedOverrides\(nextForms, [\w.]*acceptedAiOverrides\.value\);/);
  assert.match(wordImportSource, /const aiOverrides = buildAiOverridesPayload\(/);
  assert.match(wordImportSource, /payload\.ai_overrides = aiOverrides;/);
  assert.match(wordImportSource, /function clearAllAiSuggestions\(\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*\}/);
});

test('WordImportDialog renders the AI acceptance controls and binds the compare dialog', () => {
  assert.match(wordImportDialogSource, /全部表单：/);
  assert.match(wordImportDialogSource, /全接受/);
  assert.match(wordImportDialogSource, /@click="clearAllAiSuggestions"/);
  assert.match(wordImportDialogSource, /:accepted-suggestions="compareFormAcceptedSuggestions"/);
  assert.match(wordImportDialogSource, /@toggle-suggestion="toggleAiSuggestionAcceptance"/);
  assert.match(wordImportDialogSource, /@toggle-form="toggleAiSuggestionsForForm"/);
});

test('App no longer owns the wizard state machine and keeps only the entry visibility ref', () => {
  assert.match(appSource, /const showImportWordDialog = ref\(false\);/);
  assert.match(appSource, /function openImportWordDialog\(\) \{\s*showImportWordDialog\.value = true;\s*\}/);
  assert.match(appSource, /<WordImportDialog[\s\S]*v-model="showImportWordDialog"/);
  for (const symbol of [
    'const importWordStep = ref(',
    'const tempDocxId = ref(',
    'const acceptedAiOverrides = ref(',
    'function executeImportWord(',
    'function openDocxCompare(',
    'defineAsyncComponent(() => import(\'./components/DocxCompareDialog.vue\'))',
  ]) {
    assert.ok(!appSource.includes(symbol), `App.vue should not own ${symbol}`);
  }
  assert.doesNotMatch(appSource, /\btries\b/);
  assert.doesNotMatch(appSource, /setTimeout\(r,\s*50\)/);
});

test('extracted wizard owners never bypass useApi with a bare fetch', () => {
  for (const [name, source] of [
    ['useWordImport.js', wordImportSource],
    ['WordImportDialog.vue', wordImportDialogSource],
    ['useDesignerFormSelection.js', designerFormSelectionSource],
  ]) {
    assert.doesNotMatch(source, /\bfetch\(/, `${name} should not contain a bare fetch(`);
  }
});
