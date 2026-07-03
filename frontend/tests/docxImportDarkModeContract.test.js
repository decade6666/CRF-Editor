import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const simulatedCrfSource = readFileSync(
  path.resolve(currentDir, '../src/components/SimulatedCRFForm.vue'),
  'utf8',
);
const compareSource = readFileSync(path.resolve(currentDir, '../src/components/DocxCompareDialog.vue'), 'utf8');
const screenshotSource = readFileSync(path.resolve(currentDir, '../src/components/DocxScreenshotPanel.vue'), 'utf8');

test('SimulatedCRFForm keeps component-local white paper tokens in all themes', () => {
  assert.match(simulatedCrfSource, /--crf-paper-bg:\s*#fff;/);
  assert.match(simulatedCrfSource, /--crf-paper-text:\s*#1a1a1a;/);
  assert.match(simulatedCrfSource, /--crf-paper-border:\s*#d4d4d4;/);
  assert.match(simulatedCrfSource, /--crf-paper-hover:\s*#f0f9ff;/);
  assert.match(simulatedCrfSource, /--crf-paper-structure-bg:\s*#fafafa;/);
  assert.match(simulatedCrfSource, /\.crf-form-wrap\s*\{[\s\S]*background:\s*var\(--crf-paper-bg\);/);
  assert.match(simulatedCrfSource, /\.crf-form-wrap\s*\{[\s\S]*color:\s*var\(--crf-paper-text\);/);
  assert.match(simulatedCrfSource, /\.crf-table\s*\{[\s\S]*border:\s*1px solid var\(--crf-paper-border\);/);
  assert.match(simulatedCrfSource, /\.field-row:hover\s*\{[\s\S]*var\(--crf-paper-hover\)/);
});

test('DocxCompareDialog applies the dark canvas only around the simulated paper preview', () => {
  const leftPanelStart = compareSource.indexOf('<div class="compare-panel compare-left">');
  const rightPanelStart = compareSource.indexOf('<div class="compare-panel compare-right">');
  assert.ok(leftPanelStart > -1);
  assert.ok(rightPanelStart > leftPanelStart);

  const leftPanelSource = compareSource.slice(leftPanelStart, rightPanelStart);
  const rightPanelSource = compareSource.slice(rightPanelStart, compareSource.indexOf('<template #footer>'));
  assert.match(rightPanelSource, /<div class="panel-body panel-body-scroll preview-paper-canvas">[\s\S]*<SimulatedCRFForm/);
  assert.doesNotMatch(leftPanelSource, /preview-paper-canvas/);
  assert.match(compareSource, /\.preview-paper-canvas\s*\{[\s\S]*background:\s*var\(--color-bg-hover\);/);
  assert.match(
    compareSource,
    /:global\(html\[data-theme='dark'\]\) \.preview-paper-canvas\s*\{[\s\S]*background:\s*var\(--color-bg-body\);/,
  );
});

test('DocxScreenshotPanel uses neutral rendering copy without MS Word guidance', () => {
  assert.match(screenshotSource, /正在渲染原始文档/);
  assert.match(screenshotSource, /请确认文档渲染环境可用后重试/);
  assert.doesNotMatch(screenshotSource, /MS Word/);
  assert.doesNotMatch(screenshotSource, /正在调用 Word 渲染原始文档/);
  assert.doesNotMatch(screenshotSource, /请确认已安装 MS Word/);
});

test('DocxScreenshotPanel loads screenshot pages with auth header via blob url', () => {
  // 截图页端点需 JWT 鉴权，<img> 请求不带 Authorization 头会 401；
  // 必须用带鉴权头的 fetch 拉取 blob，再以 objectURL 绑定到 <img>。
  assert.match(screenshotSource, /getAuthHeaders/);
  assert.match(screenshotSource, /createObjectURL/);
  assert.match(screenshotSource, /revokeObjectURL/);
  assert.match(screenshotSource, /:src="pageBlobUrls\[p\]"/);
  // 不得再把裸 URL 直接绑定到 <img src>
  assert.doesNotMatch(screenshotSource, /:src="pageUrl\(p\)"/);
});
