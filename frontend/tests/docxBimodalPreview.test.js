import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
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
