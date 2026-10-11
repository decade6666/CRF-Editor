// designer-split Step 1 父组件接线守卫：aCRF 注释标记抽出为 DesignerAcrfAnnotation.vue 后，
// 这里守卫「16 个调用点 + 调用点形状 + 重置按钮标记与全部注释 CSS 存放在组件内」。
// 逐块校验调用点，保留每个站点的 seg.fields[0] / ff 实参与 ANNOTATION_KIND_* 常量。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const formDesignerPath = path.resolve(currentDir, '../src/components/FormDesignerTab.vue');
const annotationComponentPath = path.resolve(currentDir, '../src/components/DesignerAcrfAnnotation.vue');

const formDesignerSource = readFileSync(formDesignerPath, 'utf8');

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

// 每个站点 = 一个自闭合的 <DesignerAcrfAnnotation .../>；slice 到 '/>' 为止。
function extractAnnotationCallSites(source) {
  const sites = [];
  const openTag = '<DesignerAcrfAnnotation';
  let index = source.indexOf(openTag);
  while (index !== -1) {
    const end = source.indexOf('/>', index);
    assert.notEqual(end, -1, 'DesignerAcrfAnnotation call site should self-close');
    sites.push(source.slice(index, end + 2));
    index = source.indexOf(openTag, end + 2);
  }
  return sites;
}

// 注释层 CSS 选择器清单：组件 scoped 样式表中每条规则的选择器书写形式（含双选择器规则的续行文本）。
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

test('annotation component exists and the parent imports it', () => {
  assert.ok(
    existsSync(annotationComponentPath),
    'DesignerAcrfAnnotation.vue should exist (aCRF annotation markup extracted in Step 1)',
  );
  assert.match(formDesignerSource, /import DesignerAcrfAnnotation from '\.\/DesignerAcrfAnnotation\.vue';/);
});

test('the parent renders exactly 16 annotation call sites (form x2, field x10, inline-header x4)', () => {
  const sites = extractAnnotationCallSites(formDesignerSource);
  assert.equal(sites.length, 16, 'one call site per former inline annotation span');

  assert.equal(sites.filter((site) => site.includes('kind="form"')).length, 2);
  assert.equal(sites.filter((site) => site.includes('kind="field"')).length, 10);
  assert.equal(sites.filter((site) => site.includes('kind="inline-header"')).length, 4);

  assert.equal(countMatches(formDesignerSource, /kind="form"/g), 2);
  assert.equal(countMatches(formDesignerSource, /kind="field"/g), 10);
  assert.equal(countMatches(formDesignerSource, /kind="inline-header"/g), 4);
});

test('every call site keeps its host binding, kind constant, handlers and v-if guard', () => {
  const sites = extractAnnotationCallSites(formDesignerSource);

  for (const site of sites) {
    assert.match(site, /v-if="showAcrfAnnotations && /, 'text guard stays at the call site');
    assert.match(site, /:text="/);
    assert.match(site, /:interactive="isAnnotationDraggable\(/);
    assert.match(site, /:has-override="hasAnnotationOverrideForTarget\(/);
    assert.match(site, /:annotation-style="\s*getAnnotationStyle\(/);
    assert.match(site, /@pointerdown="\s*\(event\) => onAnnotationPointerDown\(/);
    assert.match(site, /@reset="resetAnnotationPosition\(/);
  }

  // 每个站点的目标实参：表单级 2、seg.fields[0] 4（unified value x2、full_row x2）、ff 10。
  assert.equal(sites.filter((site) => site.includes('getFormAnnotationTarget(selectedForm)')).length, 2);
  assert.equal(sites.filter((site) => site.includes('getFieldAnnotationTarget(seg.fields[0])')).length, 4);
  assert.equal(sites.filter((site) => site.includes('getFieldAnnotationTarget(ff)')).length, 10);

  // 常量与站点一一对应，且文本与目标取自同一实参表达式。
  assert.equal(countMatches(formDesignerSource, /ANNOTATION_KIND_FORM,/g), 2 + 1, '2 sites + import');
  assert.equal(countMatches(formDesignerSource, /ANNOTATION_KIND_FIELD,/g), 10 + 1, '10 sites + import');
  assert.equal(countMatches(formDesignerSource, /ANNOTATION_KIND_INLINE_HEADER,/g), 4 + 1, '4 sites + import');
  for (const site of sites) {
    const textArg = site.match(/:text="([^"]+)"/)[1];
    const styleTextArg = site.match(/:annotation-style="\s*getAnnotationStyle\(\s*([^,\n]+),/)[1];
    assert.equal(styleTextArg, textArg, 'annotation-style should reuse the :text expression');
  }
});

test('the parent no longer holds annotation markup, reset button or annotation CSS', () => {
  assert.doesNotMatch(formDesignerSource, /wp-acrf-annotation/);
  assert.doesNotMatch(formDesignerSource, /class="wp-acrf-annotation-reset"/);
});

test('the annotation component holds the reset button markup and every moved CSS rule', () => {
  assert.ok(existsSync(annotationComponentPath), 'DesignerAcrfAnnotation.vue should exist');
  const annotationSource = readFileSync(annotationComponentPath, 'utf8');

  assert.match(annotationSource, /class="wp-acrf-annotation-reset"/);
  // aria-label 文本由组件按 kind 派生（挂载测试断言实际渲染值），此处守卫组件持有两段文案。
  assert.match(annotationSource, /重置表单 domain 标注位置/);
  assert.match(annotationSource, /重置字段标注位置/);
  assert.match(annotationSource, /<style scoped>/);

  for (const selector of ANNOTATION_CSS_SELECTORS) {
    assert.ok(annotationSource.includes(selector), `DesignerAcrfAnnotation.vue should own the moved rule: ${selector}`);
  }
});

test('.wp-form-title-row rules stay in the parent (not annotation-owned in Step 1)', () => {
  assert.match(formDesignerSource, /\.wp-form-title-row \{/);
  assert.match(formDesignerSource, /\.wp-form-title-row \.wp-form-title \{/);
});
