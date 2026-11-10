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

test('compare dialog renders the deterministic simulated preview with no AI surfaces', () => {
  // AI 复核移除：比较弹窗只剩确定性模拟预览，无建议状态、接受控件或专用事件。
  assert.match(compareSource, /<SimulatedCRFForm/);
  assert.match(compareSource, /@field-click="handleFieldClick"/);
  for (const forbidden of [
    'acceptedSuggestions',
    'aiReviewStatus',
    'aiReviewError',
    'toggle-suggestion',
    'toggle-form',
    'ai-review-card',
    'ai_suggestions',
    'view-mode="ai"',
    'AI 复核',
  ]) {
    assert.ok(!compareSource.includes(forbidden), `DocxCompareDialog should not contain ${forbidden}`);
  }
});

test('useWordImport keeps the wizard session machine without AI review state', () => {
  // 可见性 watcher：打开分支做整段会话重置（回到第 1 步），关闭分支只清对比数据；
  // immediate:true 让初始 true 也走打开重置。
  assert.match(wordImportSource, /watch\(\s*visible,[\s\S]*\{ immediate: true \}/);
  assert.match(
    wordImportSource,
    /function resetImportWordSession\(\) \{[\s\S]*importWordStep\.value = 1;[\s\S]*\}/,
  );
  assert.match(wordImportSource, /function handleDocxUploadSuccess\(response\) \{[\s\S]*replaceImportedFormsPreview\(response\.forms\);/);
  assert.match(wordImportSource, /function executeImportWord\(\) \{/);
  // AI 复核移除：无轮询状态、无接受覆盖、无 ai_overrides 载荷。
  for (const forbidden of [
    'ai-review/status',
    'ai_task_id',
    'ai_overrides',
    'acceptedAiOverrides',
    'ai_suggestions',
    'AI_REVIEW_POLL_INTERVAL_MS',
    'docxAiSuggestionOverrides',
  ]) {
    assert.ok(!wordImportSource.includes(forbidden), `useWordImport should not contain ${forbidden}`);
  }
  assert.doesNotMatch(wordImportSource, /setTimeout\(/);
});

test('WordImportDialog renders selection controls and binds the compare dialog without AI controls', () => {
  assert.match(wordImportDialogSource, /@click="toggleSelectAllImportWordForms"/);
  assert.match(wordImportDialogSource, /@click="openDocxCompare\(f\)"/);
  assert.match(wordImportDialogSource, /:all-forms-data="importedFormsPreview"/);
  for (const forbidden of [
    '全部表单：',
    '全接受',
    '全取消',
    'AI复核',
    'AI建议',
    'acceptedSuggestions',
    'toggle-suggestion',
    'toggle-form',
    'ai-review-status',
  ]) {
    assert.ok(!wordImportDialogSource.includes(forbidden), `WordImportDialog should not contain ${forbidden}`);
  }
});

test('App no longer owns the wizard state machine and keeps only the entry visibility ref', () => {
  assert.match(appSource, /const showImportWordDialog = ref\(false\);/);
  assert.match(appSource, /function openImportWordDialog\(\) \{\s*showImportWordDialog\.value = true;\s*\}/);
  assert.match(appSource, /<WordImportDialog[\s\S]*v-model="showImportWordDialog"/);
  for (const symbol of [
    'const importWordStep = ref(',
    'const tempDocxId = ref(',
    'function executeImportWord(',
    'function openDocxCompare(',
    "defineAsyncComponent(() => import('./components/DocxCompareDialog.vue'))",
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
