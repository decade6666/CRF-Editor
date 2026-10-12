// visits-preview-split 父/子接线守卫（2026-10-12，design.md §3.2，先例 designerPreviewSplit.test.js）：
//   - VisitsTab.vue 只保留开关桥（showFormPreview + formPreviewFormId + openFormPreview）
//     并在旧弹窗位置无条件渲染一个 <VisitFormPreviewDialog>；
//   - VisitFormPreviewDialog.vue 自持预览状态、moved 模板（pinned 调用形状）与 .wp-form-title-row 样式，
//     注解标记复用共享 DesignerAcrfAnnotation.vue（8 个调用点：form ×1 / field ×5 / inline-header ×2）；
//   - useVisitPreviewAnnotation.js 承接注解 target / 样式 / 拖拽持久化胶水（含 onPersisted 不可变合并）；
//   - 三个源文件与两个新测试文件都不含裸 fetch(（API 一律走 useApi.js 的 api）。
// 组件缺失时读文件降级为 null，让存在性断言先失败，而不是抛出 ENOENT 导入错误。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const visitsTabPath = path.resolve(currentDir, '../src/components/VisitsTab.vue');
const dialogPath = path.resolve(currentDir, '../src/components/VisitFormPreviewDialog.vue');
const annotationGluePath = path.resolve(currentDir, '../src/composables/useVisitPreviewAnnotation.js');
const specPath = path.resolve(currentDir, 'component/VisitFormPreviewDialog.spec.js');
const guardPath = path.resolve(currentDir, 'visitPreviewSplit.test.js');

function readSourceOrNull(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

const visitsTabSource = readSourceOrNull(visitsTabPath) ?? '';
const dialogSource = readSourceOrNull(dialogPath);
const dialogCode = dialogSource ?? '';
const annotationGlueSource = readSourceOrNull(annotationGluePath) ?? '';
const specSource = readSourceOrNull(specPath) ?? '';
const guardSource = readSourceOrNull(guardPath) ?? '';

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

// 每个调用点 = 一个自闭合标签；slice 到 '/>' 为止。
function extractSelfClosingInstances(source, tagName) {
  const openTag = `<${tagName}`;
  const instances = [];
  let index = source.indexOf(openTag);
  while (index !== -1) {
    const end = source.indexOf('/>', index);
    assert.notEqual(end, -1, `${tagName} instance should self-close`);
    instances.push(source.slice(index, end + 2));
    index = source.indexOf(openTag, end + 2);
  }
  return instances;
}

// VisitsTab 不再持有的预览符号（全部随拆分迁入弹窗 / 注解胶水 / 共享组件）。
// 标识符用词边界匹配，避免 formPreviewForm 命中 formPreviewFormId 这类合法残留。
const VISITS_TAB_ABSENT_IDENTIFIERS = [
  'mergeFormIntoState',
  'getFormStateById',
  'applyFormAnnotationPositions',
  'formPreviewForm',
  'formPreviewTitle',
  'viewMode',
  'VIEW_MODE_STORAGE_KEY',
  'useAcrfAnnotationDrag',
  'resetFormPreviewState',
];

const VISITS_TAB_ABSENT_TEXT = ['wp-acrf-annotation', '设计备注', 'word-page'];

test('both preview split files exist and the parent imports the dialog', () => {
  assert.ok(existsSync(dialogPath), 'VisitFormPreviewDialog.vue should exist (preview split)');
  assert.notEqual(dialogSource, null, 'VisitFormPreviewDialog.vue should be readable as source text');
  assert.match(dialogCode, /import DesignerAcrfAnnotation from '\.\/DesignerAcrfAnnotation\.vue';/);
  assert.match(visitsTabSource, /import VisitFormPreviewDialog from '\.\/VisitFormPreviewDialog\.vue'/);
});

test('the parent renders exactly one dialog instance with v-model and both id props inside its own tag', () => {
  assert.equal(
    countMatches(visitsTabSource, /<VisitFormPreviewDialog\b/g),
    1,
    'exactly one dialog instance in VisitsTab',
  );

  const instances = extractSelfClosingInstances(visitsTabSource, 'VisitFormPreviewDialog');
  assert.equal(instances.length, 1);
  const instance = instances[0];
  assert.match(instance, /\bv-model="showFormPreview"/, 'visibility bridge stays parent-owned');
  assert.match(instance, /:project-id="projectId"/);
  assert.match(instance, /:form-id="formPreviewFormId"/);
  // 打开入口保留：先备好表单 id 上下文再打开
  assert.match(
    visitsTabSource,
    /function openFormPreview\(form\) \{\s*formPreviewFormId\.value = form\.id\s*showFormPreview\.value = true\s*\}/,
  );
});

test('VisitsTab no longer holds any preview symbol (state, template or annotation glue)', () => {
  for (const symbol of VISITS_TAB_ABSENT_IDENTIFIERS) {
    assert.doesNotMatch(
      visitsTabSource,
      new RegExp(`\\b${symbol}\\b`),
      `VisitsTab.vue should no longer contain "${symbol}" (moved to VisitFormPreviewDialog.vue / useVisitPreviewAnnotation.js)`,
    );
  }
  for (const text of VISITS_TAB_ABSENT_TEXT) {
    assert.ok(
      !visitsTabSource.includes(text),
      `VisitsTab.vue should no longer contain "${text}" (moved to VisitFormPreviewDialog.vue)`,
    );
  }
});

test('the dialog owns the moved title-row selector and the icons it renders', () => {
  assert.match(dialogCode, /<div class="wp-form-title-row">/);
  assert.match(dialogCode, /\.wp-form-title-row \{/, 'moved scoped CSS rule should live in the dialog');
  assert.match(dialogCode, /import \{ Loading \} from '@element-plus\/icons-vue';/);
});

test('the dialog holds no annotation CSS (the shared component is the single owner)', () => {
  assert.doesNotMatch(dialogCode, /\.wp-acrf-annotation/);
});

test('the dialog renders exactly 8 annotation call sites (form x1, field x5, inline-header x2)', () => {
  const sites = extractSelfClosingInstances(dialogCode, 'DesignerAcrfAnnotation');
  assert.equal(sites.length, 8, 'one call site per former inline annotation span');

  assert.equal(sites.filter((site) => site.includes('kind="form"')).length, 1);
  assert.equal(sites.filter((site) => site.includes('kind="field"')).length, 5);
  assert.equal(sites.filter((site) => site.includes('kind="inline-header"')).length, 2);

  for (const site of sites) {
    assert.match(site, /v-if="showAcrfAnnotations && /, 'text guard stays at the call site');
    assert.match(site, /:text="/);
    assert.match(site, /:interactive="isAnnotationDraggable\(/);
    assert.match(site, /:has-override="hasAnnotationOverrideForTarget\(/);
    assert.match(site, /:annotation-style="\s*getAnnotationStyle\(/);
    assert.match(site, /@pointerdown="\s*\(event\) => onAnnotationPointerDown\(/);
    assert.match(site, /@reset="resetAnnotationPosition\(/);
  }
});

test('the dialog template keeps the pinned call shapes consumed by the source guards', () => {
  assert.match(dialogCode, /v-for="\(gv, gi\) in previewGroupsView"/);
  assert.match(dialogCode, /renderCellHtml\(ff, normalFillChars\(gv, gi\)\)/);
  assert.match(dialogCode, /'word-page',\s*'word-page--a4'/, 'A4 class adjacency must be preserved');
  // 模板不得逐单元格重建 segments / inlineRows（视图模型负责预计算）
  assert.doesNotMatch(dialogCode, /v-for="seg in buildFormDesignerUnifiedSegments\(group\.fields\)"/);
  assert.doesNotMatch(dialogCode, /computeMergeSpans\(group\.colCount, seg\.fields\.length\)\[/);
  assert.doesNotMatch(dialogCode, /computeLabelValueSpans\(group\.colCount\)/);
  assert.doesNotMatch(dialogCode, /v-for="\(row, ri\) in getInlineRows\(/);
});

test('the annotation glue composable owns the drag wiring and immutable persistence merge', () => {
  assert.match(annotationGlueSource, /export function useVisitPreviewAnnotation\(/);
  assert.match(annotationGlueSource, /const annotationDrag = useAcrfAnnotationDrag\(/);
  assert.match(
    annotationGlueSource,
    /getCurrentPositions: \(targetFormId\) => getFormAnnotationPositions\(targetFormId\)/,
  );
  // F2 回归守卫：projectId 必须以 ref 注入并按取用现读，两个 target 构造器都 stamp 活值
  // （旧实现按值捕获，程序化换项目后失效的仍是旧项目的 forms）。
  assert.match(dialogCode, /projectId: toRef\(props, 'projectId'\)/);
  assert.match(annotationGlueSource, /const currentProjectId = \(\) => projectId\?\.value \?\? null;/);
  assert.equal(
    countMatches(annotationGlueSource, /projectId: currentProjectId\(\),/g),
    2,
    'both annotation target builders must stamp the live project id',
  );
  assert.match(
    annotationGlueSource,
    /onPersisted: \(updatedForm\) => \{[\s\S]*?formState\.value = \{ \.\.\.form, \.\.\.updatedForm \}/,
    'onPersisted must merge as a new object (never mutate the cached form)',
  );
  assert.match(annotationGlueSource, /onError: \(error, snapshot\) => onError\?\.\(error, snapshot\)/);
  // 弹窗注入的 onError 保留今天的 toast + 两处缓存失效 + 自身重解析
  assert.match(dialogCode, /aCRF 标注位置保存失败：\$\{error\.message\}/);
  assert.match(dialogCode, /api\.invalidateCache\(`\/api\/projects\/\$\{snapshot\.projectId\}\/forms`\)/);
  assert.match(dialogCode, /api\.invalidateCache\(`\/api\/forms\/\$\{snapshot\.formId\}\/fields`\)/);
  assert.match(dialogCode, /if \(props\.modelValue && props\.formId != null\) void loadPreviewForm\(\);/);
});

test('no new source or test file bypasses useApi with a bare fetch call', () => {
  // 拼接构造，避免守卫把自身的字面量当命中。
  const bareFetch = `fet${'ch'}(`;
  for (const [label, source] of [
    ['VisitFormPreviewDialog.vue', dialogCode],
    ['useVisitPreviewAnnotation.js', annotationGlueSource],
    ['VisitsTab.vue', visitsTabSource],
    ['VisitFormPreviewDialog.spec.js', specSource],
    ['visitPreviewSplit.test.js', guardSource.replace(/\/\/ .*/g, '')],
  ]) {
    assert.ok(!source.includes(bareFetch), `${label} should route every request through useApi.js`);
  }
});
