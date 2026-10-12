// designer-split Step 1+2 父/子接线守卫：aCRF 注释标记抽出为 DesignerAcrfAnnotation.vue（Step 1），
// 两套 word-page 预览模板合并为 DesignerWordPreview.vue（Step 2）。
// Step 2 后的最终归属：
//   - FormDesignerTab.vue 渲染 <DesignerWordPreview> 恰好两次（main / designer），
//     每次带同一份 previewHandlers（14 个闭包）与各自的模式数据 props；
//   - DesignerWordPreview.vue 持有唯一的 word-page 模板，内含 8 个 <DesignerAcrfAnnotation> 调用点
//     （form ×1、field ×5、inline-header ×2），并持有随模板迁移的预览 CSS；
//   - DesignerAcrfAnnotation.vue 持有注释层标记与 11 条注释 CSS；
//   - 父组件不再持有任何 word-page 模板标记或迁移后的预览 CSS。
//
// 接线断言按「实例切片」逐条校验：把每个 <DesignerWordPreview .../> 标签单独截出来，再在各自
// 标签内断言 v-bind 与 6 个 mode/data props，因此某个实例缺 prop / 用错数据源 / 用错 scope 时，
// 不能借另一个实例后面的属性蒙混过关。组件缺失时读文件降级为 null，让存在性断言先失败，
// 而不是抛出 ENOENT 导入错误。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const formDesignerPath = path.resolve(currentDir, '../src/components/FormDesignerTab.vue');
const wordPreviewPath = path.resolve(currentDir, '../src/components/DesignerWordPreview.vue');
const annotationComponentPath = path.resolve(currentDir, '../src/components/DesignerAcrfAnnotation.vue');
const mainCssPath = path.resolve(currentDir, '../src/styles/main.css');

function readSourceOrNull(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

const formDesignerSource = readSourceOrNull(formDesignerPath) ?? '';
const wordPreviewSource = readSourceOrNull(wordPreviewPath);
const wordPreviewCode = wordPreviewSource ?? '';
const annotationSource = readSourceOrNull(annotationComponentPath) ?? '';
const mainCssSource = readSourceOrNull(mainCssPath) ?? '';

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

// 两个预览实例各自必须满足的契约：scope 值、v-bind、5 个 mode/data props，
// 以及「不得引用另一个实例数据源」的反向集合（错 dataset / 错 scope 会被逐实例捕获）。
const PREVIEW_INSTANCE_CONTRACTS = [
  {
    scope: 'main',
    bindings: [
      ':selected-form="selectedForm"',
      ':groups-view="renderGroupsView"',
      ':landscape-mode="landscapeMode"',
      ':no-fields="!formFields.length"',
      ':show-acrf-annotations="showAcrfAnnotations"',
    ],
    absent: [
      ':groups-view="designerRenderGroupsView"',
      ':landscape-mode="designerLandscapeMode"',
      ':no-fields="!designerPreviewFields.length"',
      'scope="designer"',
    ],
  },
  {
    scope: 'designer',
    bindings: [
      ':selected-form="selectedForm"',
      ':groups-view="designerRenderGroupsView"',
      ':landscape-mode="designerLandscapeMode"',
      ':no-fields="!designerPreviewFields.length"',
      ':show-acrf-annotations="showAcrfAnnotations"',
    ],
    absent: [
      ':groups-view="renderGroupsView"',
      ':landscape-mode="landscapeMode"',
      ':no-fields="!formFields.length"',
      'scope="main"',
    ],
  },
];

function assertPreviewInstanceContract(instance, contract) {
  assert.match(instance, new RegExp(`\\bscope="${contract.scope}"`), `${contract.scope}: scope prop`);
  assert.equal(
    countMatches(instance, /\bscope="/g),
    1,
    `${contract.scope} instance should declare exactly one scope attribute`,
  );
  assert.equal(
    countMatches(instance, /v-bind="previewHandlers"/g),
    1,
    `${contract.scope} instance should bind previewHandlers exactly once`,
  );
  for (const binding of contract.bindings) {
    assert.ok(instance.includes(binding), `${contract.scope} instance should bind ${binding}`);
  }
  for (const binding of contract.absent) {
    assert.ok(!instance.includes(binding), `${contract.scope} instance should not bind ${binding}`);
  }
}

// 注释层 CSS 选择器清单（组件 scoped 样式表中每条规则的选择器书写形式，含双选择器规则的续行文本）。
const ANNOTATION_CSS_SELECTORS = [
  '.wp-acrf-annotation {',
  '.wp-acrf-annotation__text {',
  '.wp-acrf-annotation--interactive {',
  '.wp-acrf-annotation-reset {',
  '.wp-acrf-annotation:hover .wp-acrf-annotation-reset,',
  '.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset {',
  '.wp-acrf-annotation-reset:hover:not(:disabled),',
  '.wp-acrf-annotation-reset:focus-visible:not(:disabled) {',
  '.wp-acrf-annotation-reset:disabled {',
  '.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled,',
  '.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled {',
  '.wp-acrf-annotation--inline-header {',
];

// 随预览模板迁移到 DesignerWordPreview 的 scoped 规则（design.md §3.4）。
const MOVED_PREVIEW_CSS_SELECTORS = [
  '.designer-scaled-word-page {',
  '.designer-scaled-word-page.landscape {',
  '.wp-form-title-row {',
  '.wp-form-title-row .wp-form-title {',
  '.col-resize-host {',
  '.col-resize-host > table,',
  '.resizer-handle {',
  '.resizer-handle::after {',
  '.resizer-handle:hover::after,',
  '.snap-guide {',
];

// previewHandlers 必须暴露的 14 个闭包（design.md §3.3）。
const PREVIEW_HANDLERS = [
  'getResizer',
  'getRowResizer',
  'renderCellHtml',
  'normalFillChars',
  'openQuickEdit',
  'getFormDomainAnnotationText',
  'getFieldOidAnnotationText',
  'getFormAnnotationTarget',
  'getFieldAnnotationTarget',
  'isAnnotationDraggable',
  'hasAnnotationOverrideForTarget',
  'getAnnotationStyle',
  'onAnnotationPointerDown',
  'resetAnnotationPosition',
];

test('both preview components exist and the parent imports DesignerWordPreview', () => {
  assert.ok(existsSync(wordPreviewPath), 'DesignerWordPreview.vue should exist (two previews merged in Step 2)');
  assert.notEqual(wordPreviewSource, null, 'DesignerWordPreview.vue should be readable as source text');
  assert.ok(existsSync(annotationComponentPath), 'DesignerAcrfAnnotation.vue should exist (Step 1)');
  assert.match(formDesignerSource, /import DesignerWordPreview from '\.\/DesignerWordPreview\.vue';/);
  assert.match(wordPreviewCode, /import DesignerAcrfAnnotation from '\.\/DesignerAcrfAnnotation\.vue';/);
});

test('the parent renders DesignerWordPreview exactly twice, one per preview mode', () => {
  assert.equal(countMatches(formDesignerSource, /<DesignerWordPreview\b/g), 2, 'one instance per preview mode');

  const instances = extractSelfClosingInstances(formDesignerSource, 'DesignerWordPreview');
  assert.equal(instances.length, 2);
  assert.equal(
    instances.filter((instance) => instance.includes('scope="main"')).length,
    1,
    'exactly one main-canvas instance',
  );
  assert.equal(
    instances.filter((instance) => instance.includes('scope="designer"')).length,
    1,
    'exactly one fullscreen instance',
  );
});

test('each DesignerWordPreview instance owns its declared props, checked inside its own tag', () => {
  const instances = extractSelfClosingInstances(formDesignerSource, 'DesignerWordPreview');
  assert.equal(instances.length, 2, 'expected two instances to check');

  for (const contract of PREVIEW_INSTANCE_CONTRACTS) {
    const matching = instances.filter((instance) => instance.includes(`scope="${contract.scope}"`));
    assert.equal(matching.length, 1, `expected exactly one ${contract.scope} instance`);
    assertPreviewInstanceContract(matching[0], contract);
  }
});

test('the parent builds previewHandlers with all 14 parent-owned closures', () => {
  const handlerBlock = formDesignerSource.match(/const previewHandlers = \{([\s\S]*?)\};/);
  assert.ok(handlerBlock, 'previewHandlers object should exist in the parent');
  for (const name of PREVIEW_HANDLERS) {
    assert.match(
      handlerBlock[1],
      new RegExp(`\\b${name},`),
      `previewHandlers should expose ${name} (state/caches stay in the parent)`,
    );
  }
  assert.equal(countMatches(handlerBlock[1], /^\s+[A-Za-z]+,/gm), PREVIEW_HANDLERS.length);
});

test('the child renders exactly 8 annotation call sites (form x1, field x5, inline-header x2)', () => {
  const sites = extractSelfClosingInstances(wordPreviewCode, 'DesignerAcrfAnnotation');
  assert.equal(sites.length, 8, 'one call site per former inline annotation span in the merged template');

  assert.equal(sites.filter((site) => site.includes('kind="form"')).length, 1);
  assert.equal(sites.filter((site) => site.includes('kind="field"')).length, 5);
  assert.equal(sites.filter((site) => site.includes('kind="inline-header"')).length, 2);

  assert.equal(countMatches(wordPreviewCode, /kind="form"/g), 1);
  assert.equal(countMatches(wordPreviewCode, /kind="field"/g), 5);
  assert.equal(countMatches(wordPreviewCode, /kind="inline-header"/g), 2);
});

test('every child annotation call site keeps its host binding, kind constant, handlers and v-if guard', () => {
  const sites = extractSelfClosingInstances(wordPreviewCode, 'DesignerAcrfAnnotation');

  for (const site of sites) {
    assert.match(site, /v-if="showAcrfAnnotations && /, 'text guard stays at the call site');
    assert.match(site, /:text="/);
    assert.match(site, /:interactive="isAnnotationDraggable\(/);
    assert.match(site, /:has-override="hasAnnotationOverrideForTarget\(/);
    assert.match(site, /:annotation-style="\s*getAnnotationStyle\(/);
    assert.match(site, /@pointerdown="\s*\(event\) => onAnnotationPointerDown\(/);
    assert.match(site, /@reset="resetAnnotationPosition\(/);
  }

  // 每个站点的目标实参：表单级 1、seg.fields[0] 2（unified value + full_row）、ff 5。
  assert.equal(sites.filter((site) => site.includes('getFormAnnotationTarget(selectedForm)')).length, 1);
  assert.equal(sites.filter((site) => site.includes('getFieldAnnotationTarget(seg.fields[0])')).length, 2);
  assert.equal(sites.filter((site) => site.includes('getFieldAnnotationTarget(ff)')).length, 5);

  // 常量与站点一一对应，且文本与目标取自同一实参表达式。
  assert.equal(countMatches(wordPreviewCode, /ANNOTATION_KIND_FORM,/g), 1 + 1, '1 site + import');
  assert.equal(countMatches(wordPreviewCode, /ANNOTATION_KIND_FIELD,/g), 5 + 1, '5 sites + import');
  assert.equal(countMatches(wordPreviewCode, /ANNOTATION_KIND_INLINE_HEADER,/g), 2 + 1, '2 sites + import');
  for (const site of sites) {
    const textArg = site.match(/:text="([^"]+)"/)[1];
    const styleTextArg = site.match(/:annotation-style="\s*getAnnotationStyle\(\s*([^,\n]+),/)[1];
    assert.equal(styleTextArg, textArg, 'annotation-style should reuse the :text expression');
  }
});

test('the parent no longer holds preview markup, annotation markup, reset button or moved CSS', () => {
  assert.doesNotMatch(formDesignerSource, /wp-acrf-annotation/);
  assert.doesNotMatch(formDesignerSource, /class="wp-acrf-annotation-reset"/);
  // 迁移到子组件的 word-page 模板标记
  assert.doesNotMatch(formDesignerSource, /class="wp-form-title-row"/);
  assert.doesNotMatch(formDesignerSource, /class="wp-form-title"/);
  assert.doesNotMatch(formDesignerSource, /class="col-resize-host/);
  assert.doesNotMatch(formDesignerSource, /class="resizer-handle"/);
  assert.doesNotMatch(formDesignerSource, /class="snap-guide"/);
  // 迁移到子组件的 scoped CSS 规则
  for (const selector of MOVED_PREVIEW_CSS_SELECTORS) {
    assert.ok(
      !formDesignerSource.includes(`\n${selector}`),
      `FormDesignerTab.vue should no longer own the moved preview rule: ${selector}`,
    );
  }
  // 死类已随迁移删除
  assert.doesNotMatch(formDesignerSource, /unified-table-host/);
});

test('the word preview component holds the merged template, the moved CSS rules and the two pure helpers', () => {
  assert.ok(existsSync(wordPreviewPath), 'DesignerWordPreview.vue should exist');
  assert.match(wordPreviewCode, /'form-designer-word-page'/);
  assert.match(wordPreviewCode, /'designer-scaled-word-page'/);
  assert.match(wordPreviewCode, /landscape: landscapeMode/);
  assert.match(wordPreviewCode, /<style scoped>/);
  // 模板专用纯函数随模板迁移（父组件不再定义）
  assert.match(wordPreviewCode, /function cumRatio\(/);
  assert.match(wordPreviewCode, /function getRowHeightStyle\(/);
  assert.doesNotMatch(formDesignerSource, /function cumRatio\(/);
  assert.doesNotMatch(formDesignerSource, /function getRowHeightStyle\(/);

  for (const selector of MOVED_PREVIEW_CSS_SELECTORS) {
    assert.ok(wordPreviewCode.includes(selector), `DesignerWordPreview.vue should own the moved rule: ${selector}`);
  }
});

test('the annotation component holds the reset button markup and every moved CSS rule', () => {
  assert.ok(existsSync(annotationComponentPath), 'DesignerAcrfAnnotation.vue should exist');
  assert.match(annotationSource, /class="wp-acrf-annotation-reset"/);
  // aria-label 文本由组件按 kind 派生（挂载测试断言实际渲染值），此处守卫组件持有两段文案。
  assert.match(annotationSource, /重置表单 domain 标注位置/);
  assert.match(annotationSource, /重置字段标注位置/);
  assert.match(annotationSource, /<style scoped>/);

  for (const selector of ANNOTATION_CSS_SELECTORS) {
    assert.ok(annotationSource.includes(selector), `DesignerAcrfAnnotation.vue should own the moved rule: ${selector}`);
  }
});

test('main.css keeps the preview/export parity title rule', () => {
  assert.match(mainCssSource, /\.word-page \.wp-form-title \{[\s\S]*?text-align: left/);
});
