import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const formDesignerPath = path.resolve(currentDir, '../src/components/FormDesignerTab.vue');
const visitsTabPath = path.resolve(currentDir, '../src/components/VisitsTab.vue');
const mainCssPath = path.resolve(currentDir, '../src/styles/main.css');

const formDesignerSource = readFileSync(formDesignerPath, 'utf8');
const visitsTabSource = readFileSync(visitsTabPath, 'utf8');
const mainCssSource = readFileSync(mainCssPath, 'utf8');

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function extractFunction(name, source = formDesignerSource) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} should exist`);

  const argsStart = source.indexOf('(', start);
  const argsEnd = source.indexOf(')', argsStart);
  const bodyStart = source.indexOf('{', argsEnd);
  assert.notEqual(bodyStart, -1, `function ${name} should have a body`);

  let depth = 0;
  let bodyEnd = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
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
    params: source.slice(argsStart + 1, argsEnd),
    body: source.slice(bodyStart + 1, bodyEnd),
  };
}

function compileFunction(name, dependencies = {}, source = formDesignerSource) {
  const { params, body } = extractFunction(name, source);
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
  assert.match(
    formDesignerSource,
    /const annotationFlushSucceeded = await flushAnnotationPositionSave\(\{ cancelActiveDrag: true \}\);[\s\S]*?if \(!annotationFlushSucceeded && currentForm\?\.id\) \{[\s\S]*?formsTableRef\.value\?\.setCurrentRow\(currentForm\);[\s\S]*?return;[\s\S]*?\}/,
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
    /<template #header="\{ titleId, titleClass \}">[\s\S]*?<div class="designer-dialog-header-main">[\s\S]*?<span :id="titleId" :class="\[titleClass, 'designer-dialog-title'\]">设计：\{\{ selectedForm\?\.name \|\| '' \}\}<\/span>[\s\S]*?<el-switch[\s\S]*?v-if="editMode"[\s\S]*?v-model="viewMode"/,
  );
  assert.doesNotMatch(formDesignerSource, /:title="'设计：' \+ \(selectedForm\?\.name \|\| ''\)"/);
});

test('VisitsTab preview shares the same persisted viewMode and reuses the annotation drag wiring', () => {
  const normalizeStoredViewMode = compileFunction('normalizeStoredViewMode', {}, visitsTabSource);
  const resolveInitialViewMode = compileFunction(
    'resolveInitialViewMode',
    { normalizeStoredViewMode },
    visitsTabSource,
  );
  const getFieldOidAnnotationText = compileFunction('getFieldOidAnnotationText', {}, visitsTabSource);
  const getFormDomainAnnotationText = compileFunction('getFormDomainAnnotationText', {}, visitsTabSource);

  assert.equal(normalizeStoredViewMode('aCRF'), 'aCRF');
  assert.equal(normalizeStoredViewMode('bogus'), 'eCRF');
  assert.equal(resolveInitialViewMode(false, 'aCRF'), 'eCRF');
  assert.equal(resolveInitialViewMode(true, 'aCRF'), 'aCRF');
  assert.equal(getFieldOidAnnotationText({ field_definition: { variable_name: '  LBTESTCD  ' } }), 'LBTESTCD');
  assert.equal(getFieldOidAnnotationText({ field_definition: {} }), '');
  assert.equal(getFormDomainAnnotationText({ domain: '  LB ' }), 'LB');
  assert.equal(getFormDomainAnnotationText({ domain: '' }), '');

  assert.match(visitsTabSource, /const VIEW_MODE_STORAGE_KEY = 'crf_view_mode'/);
  assert.match(
    visitsTabSource,
    /const viewMode = ref\(resolveInitialViewMode\(editMode\.value, readStoredViewMode\(\)\)\)/,
  );
  assert.match(
    visitsTabSource,
    /watch\(\s*viewMode,\s*\(nextMode\)\s*=>\s*\{[\s\S]*writeStoredViewMode\(normalizedMode\)[\s\S]*\}\s*\)/,
  );
  assert.match(
    visitsTabSource,
    /watch\(\s*editMode,\s*\(enabled\)\s*=>\s*\{[\s\S]*resolveInitialViewMode\(enabled, viewMode\.value\)[\s\S]*\}\s*\)/,
  );
  assert.match(
    visitsTabSource,
    /const showAcrfAnnotations = computed\(\(\) => editMode\.value && viewMode\.value === 'aCRF'\)/,
  );
  assert.match(visitsTabSource, /const annotationDrag = useAcrfAnnotationDrag\(/);
  assert.match(visitsTabSource, /getCurrentPositions: \(formId\) => getFormAnnotationPositions\(formId\)/);
  assert.match(
    visitsTabSource,
    /applyOptimisticPositions: \(formId, annotationPositions\) => applyFormAnnotationPositions\(formId, annotationPositions\)/,
  );
  assert.match(
    visitsTabSource,
    /watch\(\s*\(\)\s*=>\s*props\.projectId,\s*async \(newProjectId, previousProjectId\) => \{[\s\S]*?await flushAnnotationPositionSave\(\{ cancelActiveDrag: true \}\)[\s\S]*?showFormPreview\.value = false[\s\S]*?resetFormPreviewState\(\{ skipAnnotationCleanup: true \}\)[\s\S]*?await load\(\)[\s\S]*?\},\s*\)/,
  );
  assert.match(
    visitsTabSource,
    /function resetFormPreviewState\(\{ skipAnnotationCleanup = false \} = \{\}\) \{[\s\S]*?if \(!skipAnnotationCleanup\) \{[\s\S]*?annotationDrag\.cancelActiveDrag\(\)[\s\S]*?void flushAnnotationPositionSave\(\)[\s\S]*?\}[\s\S]*?\}/,
  );

  const switchPattern =
    /<el-switch[\s\S]*?v-model="viewMode"[\s\S]*?inline-prompt[\s\S]*?active-text="aCRF"[\s\S]*?inactive-text="eCRF"[\s\S]*?:active-value="'aCRF'"[\s\S]*?:inactive-value="'eCRF'"[\s\S]*?\/>/g;
  assert.equal(countMatches(visitsTabSource, switchPattern), 1);
  assert.match(
    visitsTabSource,
    /<template #header>[\s\S]*?<el-switch[\s\S]*?v-if="editMode"[\s\S]*?v-model="viewMode"/,
  );
});

test('aCRF annotations stay inside the two designer word pages and mirror the export anchor strategy', () => {
  assert.match(
    formDesignerSource,
    /const showAcrfAnnotations = computed\(\(\) => editMode\.value && viewMode\.value === 'aCRF'\);/,
  );
  assert.equal(
    countMatches(formDesignerSource, /'wp-acrf-annotation--form'/g),
    2,
    'domain overlay should appear once per word-page template',
  );
  assert.equal(countMatches(formDesignerSource, /class="wp-form-title-row"/g), 2);
  assert.match(
    formDesignerSource,
    /<div class="wp-form-title-row">[\s\S]*?<div class="wp-form-title">\{\{ selectedForm\.name \}\}<\/div>[\s\S]*?getAnnotationStyle\([\s\S]*?ANNOTATION_KIND_FORM/,
  );
  assert.match(
    formDesignerSource,
    /class="unified-value row-resize-anchor"[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(seg\.fields\[0\]\)"[\s\S]*?getAnnotationStyle\([\s\S]*?ANNOTATION_KIND_FIELD/,
  );
  assert.match(
    formDesignerSource,
    /class="wp-inline-header row-resize-anchor"[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(ff\)"[\s\S]*?ANNOTATION_KIND_INLINE_HEADER/,
  );
  assert.doesNotMatch(
    formDesignerSource,
    /v-for="\(row, ri\) in gv\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(gv\.fields\[ci\]\)/,
  );
  assert.doesNotMatch(
    formDesignerSource,
    /v-for="\(row, ri\) in seg\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(seg\.fields\[ci\]\)/,
  );
  assert.match(formDesignerSource, /useAcrfAnnotationDrag/);
});

test('VisitsTab aCRF annotations stay inside the preview word page and keep the same anchor strategy', () => {
  assert.equal(
    countMatches(visitsTabSource, /'wp-acrf-annotation--form'/g),
    1,
    'visit preview should render one form-domain overlay per word-page template',
  );
  assert.equal(countMatches(visitsTabSource, /class="wp-form-title-row"/g), 1);
  assert.match(
    visitsTabSource,
    /<div class="wp-form-title-row">[\s\S]*?<div class="wp-form-title">\{\{ formPreviewTitle \}\}<\/div>[\s\S]*?getAnnotationStyle\([\s\S]*?ANNOTATION_KIND_FORM/,
  );
  assert.match(
    visitsTabSource,
    /class="unified-value row-resize-anchor"[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(seg\.fields\[0\]\)"[\s\S]*?getAnnotationStyle\([\s\S]*?ANNOTATION_KIND_FIELD/,
  );
  assert.match(
    visitsTabSource,
    /class="wp-inline-header row-resize-anchor"[\s\S]*?<span[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(ff\)"[\s\S]*?ANNOTATION_KIND_INLINE_HEADER/,
  );
  assert.doesNotMatch(
    visitsTabSource,
    /v-for="\(row, ri\) in gv\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(gv\.fields\[ci\]\)/,
  );
  assert.doesNotMatch(
    visitsTabSource,
    /v-for="\(row, ri\) in seg\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(seg\.fields\[ci\]\)/,
  );
  assert.match(visitsTabSource, /onAnnotationPointerDown/);
  assert.match(visitsTabSource, /resetAnnotationPosition/);
  assert.match(visitsTabSource, /class="wp-acrf-annotation-reset"/);
});

test('aCRF annotation styles stay absolute, draggable in edit mode, and out of width-cache geometry', () => {
  assert.match(mainCssSource, /\.word-page \{[\s\S]*position: relative;[\s\S]*\}/);

  const annotationRule = extractRuleBody(formDesignerSource, '.wp-acrf-annotation');
  assert.ok(annotationRule, '.wp-acrf-annotation rule should exist in FormDesignerTab.vue');
  assert.match(annotationRule, /position:\s*absolute/);
  assert.match(annotationRule, /top:\s*var\(--acrf-annotation-top\)/);
  assert.match(annotationRule, /width:\s*var\(--acrf-annotation-width\)/);
  assert.match(annotationRule, /height:\s*var\(--acrf-annotation-height\)/);
  assert.match(annotationRule, /border:\s*var\(--acrf-annotation-border-width\) solid #c00000/i);
  assert.match(annotationRule, /background:\s*#fff2f2/i);
  assert.match(annotationRule, /color:\s*#c00000/i);
  assert.match(annotationRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(annotationRule, /pointer-events:\s*none/);

  const interactiveRule = extractRuleBody(formDesignerSource, '.wp-acrf-annotation--interactive');
  assert.ok(interactiveRule);
  assert.match(interactiveRule, /cursor:\s*ns-resize/);

  const titleRowRule = extractRuleBody(formDesignerSource, '.wp-form-title-row');
  assert.ok(titleRowRule);
  assert.match(titleRowRule, /position:\s*relative/);
  assert.match(titleRowRule, /padding-right:\s*4\.8cm/);

  const resetRule = extractRuleBody(formDesignerSource, '.wp-acrf-annotation-reset');
  assert.ok(resetRule);
  assert.match(resetRule, /position:\s*absolute/);
  assert.match(resetRule, /border:\s*1px solid #c00000/i);

  assert.match(formDesignerSource, /onAnnotationPointerDown/);
  assert.match(formDesignerSource, /resetAnnotationPosition/);
  assert.match(formDesignerSource, /class="wp-acrf-annotation-reset"/);

  const getResizerSource = extractFunction('getResizer').body;
  const getRowResizerSource = extractFunction('getRowResizer').body;
  assert.match(getResizerSource, /const mapKey = `\$\{scope\}:\$\{kind\}:\$\{colCount\}:\$\{tableInstanceId\}`;/);
  assert.match(getRowResizerSource, /if \(!rowResizerCache\.has\(tableInstanceId\)\) \{/);
  assert.doesNotMatch(getResizerSource, /viewMode/);
  assert.doesNotMatch(getRowResizerSource, /viewMode/);
});

test('VisitsTab preview annotation styles stay absolute and draggable without entering table text geometry', () => {
  const annotationRule = extractRuleBody(visitsTabSource, '.wp-acrf-annotation');
  assert.ok(annotationRule, '.wp-acrf-annotation rule should exist in VisitsTab.vue');
  assert.match(annotationRule, /position:\s*absolute/);
  assert.match(annotationRule, /top:\s*var\(--acrf-annotation-top\)/);
  assert.match(annotationRule, /width:\s*var\(--acrf-annotation-width\)/);
  assert.match(annotationRule, /height:\s*var\(--acrf-annotation-height\)/);
  assert.match(annotationRule, /border:\s*var\(--acrf-annotation-border-width\) solid #c00000/i);
  assert.match(annotationRule, /background:\s*#fff2f2/i);
  assert.match(annotationRule, /color:\s*#c00000/i);
  assert.doesNotMatch(annotationRule, /pointer-events:\s*none/);

  const interactiveRule = extractRuleBody(visitsTabSource, '.wp-acrf-annotation--interactive');
  assert.ok(interactiveRule);
  assert.match(interactiveRule, /cursor:\s*ns-resize/);

  const titleRowRule = extractRuleBody(visitsTabSource, '.wp-form-title-row');
  assert.ok(titleRowRule);
  assert.match(titleRowRule, /position:\s*relative/);
  assert.match(titleRowRule, /padding-right:\s*4\.8cm/);

  const resetRule = extractRuleBody(visitsTabSource, '.wp-acrf-annotation-reset');
  assert.ok(resetRule);
  assert.match(resetRule, /position:\s*absolute/);
  assert.match(resetRule, /border:\s*1px solid #c00000/i);
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
    /<template #header="\{ titleId, titleClass \}">[\s\S]*?<div class="designer-dialog-header-main">[\s\S]*?<span :id="titleId" :class="\[titleClass, 'designer-dialog-title'\]">设计：\{\{ selectedForm\?\.name \|\| '' \}\}<\/span>[\s\S]*?<el-switch[\s\S]*?v-model="viewMode"/,
  );
  assert.match(formDesignerSource, /\.designer-dialog-header \{[\s\S]*padding-right: 32px;[\s\S]*\}/);
  assert.match(formDesignerSource, /\.designer-dialog-header-main \{[\s\S]*gap: 8px;[\s\S]*max-width: 100%;[\s\S]*\}/);
  assert.match(formDesignerSource, /\.designer-dialog-title \{[\s\S]*flex: 0 1 auto;[\s\S]*white-space: nowrap;[\s\S]*\}/);
});
