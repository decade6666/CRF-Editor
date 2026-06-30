import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const formDesignerPath = path.resolve(currentDir, '../src/components/FormDesignerTab.vue');
const mainCssPath = path.resolve(currentDir, '../src/styles/main.css');

const formDesignerSource = readFileSync(formDesignerPath, 'utf8');
const mainCssSource = readFileSync(mainCssPath, 'utf8');

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function extractFunction(name) {
  const start = formDesignerSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} should exist`);

  const argsStart = formDesignerSource.indexOf('(', start);
  const argsEnd = formDesignerSource.indexOf(')', argsStart);
  const bodyStart = formDesignerSource.indexOf('{', argsEnd);
  assert.notEqual(bodyStart, -1, `function ${name} should have a body`);

  let depth = 0;
  let bodyEnd = -1;
  for (let index = bodyStart; index < formDesignerSource.length; index += 1) {
    const char = formDesignerSource[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        bodyEnd = index;
        break;
      }
    }
  }

  assert.notEqual(bodyEnd, -1, `function ${name} should close its body`);
  return {
    params: formDesignerSource.slice(argsStart + 1, argsEnd),
    body: formDesignerSource.slice(bodyStart + 1, bodyEnd),
  };
}

function compileFunction(name, dependencies = {}) {
  const { params, body } = extractFunction(name);
  const dependencyNames = Object.keys(dependencies);
  const dependencyValues = Object.values(dependencies);
  const factory = new Function(...dependencyNames, `return function ${name}(${params}) {${body}}`);
  return factory(...dependencyValues);
}

function extractRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

test('viewMode helpers normalize persisted state and annotation text contracts', () => {
  const normalizeStoredViewMode = compileFunction('normalizeStoredViewMode');
  const resolveInitialViewMode = compileFunction('resolveInitialViewMode', { normalizeStoredViewMode });
  const getFieldOidAnnotationText = compileFunction('getFieldOidAnnotationText');
  const getFormDomainAnnotationText = compileFunction('getFormDomainAnnotationText');

  assert.equal(normalizeStoredViewMode('aCRF'), 'aCRF');
  assert.equal(normalizeStoredViewMode('eCRF'), 'eCRF');
  assert.equal(normalizeStoredViewMode('bogus'), 'eCRF');
  assert.equal(normalizeStoredViewMode(null), 'eCRF');

  assert.equal(resolveInitialViewMode(false, 'aCRF'), 'eCRF');
  assert.equal(resolveInitialViewMode(true, 'aCRF'), 'aCRF');
  assert.equal(resolveInitialViewMode(true, 'bogus'), 'eCRF');

  assert.equal(
    getFieldOidAnnotationText({ field_definition: { field_type: '标签', variable_name: 'LEGACY_LABEL' } }),
    'LEGACY_LABEL',
  );
  assert.equal(getFieldOidAnnotationText({ field_definition: { variable_name: '  LBTESTCD  ' } }), 'LBTESTCD');
  assert.equal(getFieldOidAnnotationText({ field_definition: {} }), '');
  assert.equal(getFieldOidAnnotationText({ is_log_row: 1 }), '');

  assert.equal(getFormDomainAnnotationText({ domain: '' }), '');
  assert.equal(getFormDomainAnnotationText({ domain: '  LB ' }), 'LB');
});

test('two inline-prompt switches share one localStorage-backed viewMode and only appear in complete mode', () => {
  assert.match(formDesignerSource, /const VIEW_MODE_STORAGE_KEY = 'crf_view_mode';/);
  assert.match(
    formDesignerSource,
    /const viewMode = ref\(resolveInitialViewMode\(editMode\.value, readStoredViewMode\(\)\)\);/,
  );
  assert.match(
    formDesignerSource,
    /watch\(\s*viewMode,\s*\(nextMode\)\s*=>\s*\{[\s\S]*writeStoredViewMode\(normalizedMode\);[\s\S]*\}\s*\);/,
  );
  assert.match(
    formDesignerSource,
    /watch\(\s*editMode,\s*\(enabled\)\s*=>\s*\{[\s\S]*resolveInitialViewMode\(enabled, viewMode\.value\)[\s\S]*\}\s*\);/,
  );

  const switchPattern =
    /<el-switch[\s\S]*?v-model="viewMode"[\s\S]*?inline-prompt[\s\S]*?active-text="aCRF"[\s\S]*?inactive-text="eCRF"[\s\S]*?:active-value="'aCRF'"[\s\S]*?:inactive-value="'eCRF'"[\s\S]*?\/>/g;
  assert.equal(countMatches(formDesignerSource, switchPattern), 2);
  assert.match(
    formDesignerSource,
    /<el-button v-if="selectedForm"[\s\S]*?>设计表单<\/el-button>\s*<el-switch[\s\S]*?v-if="selectedForm && editMode"[\s\S]*?v-model="viewMode"/,
  );
  assert.match(
    formDesignerSource,
    /<template #header="\{ titleId, titleClass \}">[\s\S]*?<el-switch[\s\S]*?v-if="editMode"[\s\S]*?v-model="viewMode"/,
  );
  assert.doesNotMatch(formDesignerSource, /:title="'设计：' \+ \(selectedForm\?\.name \|\| ''\)"/);
});

test('aCRF annotations stay inside the two designer word pages and mirror the export anchor strategy', () => {
  assert.match(
    formDesignerSource,
    /const showAcrfAnnotations = computed\(\(\) => editMode\.value && viewMode\.value === 'aCRF'\);/,
  );
  assert.equal(
    countMatches(formDesignerSource, /class="wp-acrf-annotation wp-acrf-annotation--form"/g),
    2,
    'domain overlay should appear once per word-page template',
  );
  assert.match(
    formDesignerSource,
    /<div class="wp-form-title">\{\{ selectedForm\.name \}\}<\/div>[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(ff\)"[\s\S]*?class="wp-acrf-annotation wp-acrf-annotation--field"[\s\S]*?>[\s\S]*?\{\{ getFieldOidAnnotationText\(ff\) \}\}[\s\S]*?<\/span>/,
  );
  assert.match(
    formDesignerSource,
    /class="unified-value row-resize-anchor"[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(seg\.fields\[0\]\)"[\s\S]*?class="wp-acrf-annotation wp-acrf-annotation--field"[\s\S]*?>[\s\S]*?\{\{ getFieldOidAnnotationText\(seg\.fields\[0\]\) \}\}[\s\S]*?<\/span>/,
  );
  assert.match(
    formDesignerSource,
    /class="wp-inline-header row-resize-anchor"[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(ff\)"[\s\S]*?class="wp-acrf-annotation wp-acrf-annotation--field"[\s\S]*?>[\s\S]*?\{\{ getFieldOidAnnotationText\(ff\) \}\}[\s\S]*?<\/span>/,
  );
  assert.doesNotMatch(
    formDesignerSource,
    /v-for="\(row, ri\) in gv\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(gv\.fields\[ci\]\)/,
  );
  assert.doesNotMatch(
    formDesignerSource,
    /v-for="\(row, ri\) in seg\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(seg\.fields\[ci\]\)/,
  );
});

test('aCRF annotation styles stay absolute, non-interactive, and out of width-cache geometry', () => {
  assert.match(mainCssSource, /\.word-page \{[\s\S]*position: relative;[\s\S]*\}/);

  const annotationRule = extractRuleBody(formDesignerSource, '.wp-acrf-annotation');
  assert.ok(annotationRule, '.wp-acrf-annotation rule should exist in FormDesignerTab.vue');
  assert.match(annotationRule, /position:\s*absolute/);
  assert.match(annotationRule, /pointer-events:\s*none/);
  assert.match(annotationRule, /z-index:\s*1/);
  assert.match(annotationRule, /height:\s*0\.7cm/);
  assert.match(annotationRule, /max-width:\s*4\.6cm/);
  assert.match(annotationRule, /white-space:\s*nowrap/);
  assert.match(annotationRule, /text-overflow:\s*ellipsis/);

  const fieldRule = extractRuleBody(formDesignerSource, '.wp-acrf-annotation--field');
  assert.ok(fieldRule);
  assert.match(fieldRule, /top:\s*-0\.35cm/);

  const formRule = extractRuleBody(formDesignerSource, '.wp-acrf-annotation--form');
  assert.ok(formRule);
  assert.match(formRule, /top:\s*0\.35cm/);

  const getResizerSource = extractFunction('getResizer').body;
  const getRowResizerSource = extractFunction('getRowResizer').body;
  assert.match(getResizerSource, /const mapKey = `\$\{scope\}:\$\{kind\}:\$\{colCount\}:\$\{tableInstanceId\}`;/);
  assert.match(getRowResizerSource, /if \(!rowResizerCache\.has\(tableInstanceId\)\) \{/);
  assert.doesNotMatch(getResizerSource, /viewMode/);
  assert.doesNotMatch(getRowResizerSource, /viewMode/);
});

test('canvas and dialog headers keep titles accessible and resilient after adding the switch', () => {
  assert.match(
    formDesignerSource,
    /<span class="fd-canvas-form-title">\{\{ selectedForm\?\.name \|\| '未选择表单' \}\}<\/span>/,
  );
  assert.match(formDesignerSource, /<div class="fd-canvas-header-main">/);
  assert.match(formDesignerSource, /\.fd-canvas-header-main \{[\s\S]*min-width: 0;[\s\S]*\}/);
  assert.match(
    formDesignerSource,
    /\.fd-canvas-form-title \{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*\}/,
  );
  assert.match(
    formDesignerSource,
    /<template #header="\{ titleId, titleClass \}">[\s\S]*?<span :id="titleId" :class="\[titleClass, 'designer-dialog-title'\]">设计：\{\{ selectedForm\?\.name \|\| '' \}\}<\/span>/,
  );
  assert.match(formDesignerSource, /\.designer-dialog-header \{[\s\S]*padding-right: 32px;[\s\S]*\}/);
  assert.match(formDesignerSource, /\.designer-dialog-title \{[\s\S]*white-space: nowrap;[\s\S]*\}/);
});
