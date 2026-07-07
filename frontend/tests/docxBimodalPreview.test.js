import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8');
const compareSource = readFileSync(path.resolve(currentDir, '../src/components/DocxCompareDialog.vue'), 'utf8');
const screenshotSource = readFileSync(path.resolve(currentDir, '../src/components/DocxScreenshotPanel.vue'), 'utf8');

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

test('App wires accepted AI overrides through the compare dialog and execute payload', () => {
  assert.match(appSource, /const acceptedAiOverrides = ref\(\{\}\);/);
  assert.match(appSource, /watch\(showImportWordDialog, \(visible\) => \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*\}\);/);
  assert.match(appSource, /function openImportWordDialog\(\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*\}/);
  assert.match(appSource, /function goBackToImportWordStep1\(\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*\}/);
  assert.match(appSource, /function handleDocxUploadSuccess\(response\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*replaceImportedFormsPreview\(response\.forms\);/);
  assert.match(appSource, /acceptedAiOverrides\.value = reconcileAcceptedOverrides\(nextForms, acceptedAiOverrides\.value\);/);
  assert.match(appSource, /const aiOverrides = buildAiOverridesPayload\(/);
  assert.match(appSource, /payload\.ai_overrides = aiOverrides;/);
  assert.match(appSource, /全部表单：/);
  assert.match(appSource, /全接受/);
  assert.match(appSource, /@click="clearAllAiSuggestions"/);
  assert.match(appSource, /function clearAllAiSuggestions\(\) \{[\s\S]*resetAcceptedAiOverrides\(\);[\s\S]*\}/);
  assert.match(appSource, /:accepted-suggestions="compareFormAcceptedSuggestions"/);
  assert.match(appSource, /@toggle-suggestion="toggleAiSuggestionAcceptance"/);
  assert.match(appSource, /@toggle-form="toggleAiSuggestionsForForm"/);
});
