import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const formDesignerPath = path.resolve(currentDir, '../src/components/FormDesignerTab.vue');
const annotationComponentPath = path.resolve(currentDir, '../src/components/DesignerAcrfAnnotation.vue');
const wordPreviewPath = path.resolve(currentDir, '../src/components/DesignerWordPreview.vue');
const visitsTabPath = path.resolve(currentDir, '../src/components/VisitsTab.vue');
const visitPreviewDialogPath = path.resolve(currentDir, '../src/components/VisitFormPreviewDialog.vue');
const visitPreviewAnnotationPath = path.resolve(currentDir, '../src/composables/useVisitPreviewAnnotation.js');
const mainCssPath = path.resolve(currentDir, '../src/styles/main.css');
// form-title-oid-style：纸面标题表单 OID 徽章（FormPreviewOid.vue）与字段注记共用红框装饰令牌。
const formPreviewOidPath = path.resolve(currentDir, '../src/components/FormPreviewOid.vue');

const formDesignerSource = readFileSync(formDesignerPath, 'utf8');
// designer-split Step 1：aCRF 注释标记抽为 DesignerAcrfAnnotation.vue。注释相关 CSS / 重置按钮标记
// 现由该组件持有，源码断言改读组件文件；父组件调用点形状由 designerPreviewSplit.test.js 守卫。
const annotationComponentSource = readFileSync(annotationComponentPath, 'utf8');
// designer-split Step 2：两套 word-page 预览模板合并为 DesignerWordPreview.vue（父组件渲染两次）。
// word-page / 标题行 / 注释调用点 / 迁移后的预览 CSS 均改读该组件。
const wordPreviewSource = readFileSync(wordPreviewPath, 'utf8');
const visitsTabSource = readFileSync(visitsTabPath, 'utf8');
// visits-preview-split（2026-10-12）：预览弹窗自 VisitFormPreviewDialog.vue 持有，aCRF 注解胶水
// 迁入 useVisitPreviewAnnotation.js；viewport 相关的源码断言改读这两处（父组件只剩开关桥）。
const visitPreviewDialogSource = readFileSync(visitPreviewDialogPath, 'utf8');
const visitPreviewAnnotationSource = readFileSync(visitPreviewAnnotationPath, 'utf8');
const mainCssSource = readFileSync(mainCssPath, 'utf8');
const formPreviewOidSource = readFileSync(formPreviewOidPath, 'utf8');

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

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractRuleBodyByPattern(css, pattern, description) {
  const match = css.match(pattern);
  assert.ok(match, `${description} should exist`);
  return match[1];
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
    '',
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
    /<template #header="\{ titleId, titleClass \}">[\s\S]*?<div class="designer-dialog-header-main">[\s\S]*?<span :id="titleId" :class="\[titleClass, 'designer-dialog-title'\]">[\s\S]*?设计：[\s\S]*?data-test=\"designer-form-switch\"[\s\S]*?:model-value=\"selectedForm\?\.id(?: \?\? undefined)?\"[\s\S]*?<\/span>[\s\S]*?<el-switch[\s\S]*?v-if="editMode"[\s\S]*?v-model="viewMode"/,
  );
  assert.doesNotMatch(formDesignerSource, /:title="'设计：' \+ \(selectedForm\?\.name \|\| ''\)"/);
});

test('visits preview dialog shares the same persisted viewMode and reuses the annotation drag wiring', () => {
  // visits-preview-split：预览状态（含 viewMode 与注解拖拽）自 VisitsTab 迁入 VisitFormPreviewDialog.vue，
  // 拖拽胶水（useAcrfAnnotationDrag 实例与两个位置回调绑定）迁入 useVisitPreviewAnnotation.js。
  const normalizeStoredViewMode = compileFunction('normalizeStoredViewMode', {}, visitPreviewDialogSource);
  const resolveInitialViewMode = compileFunction(
    'resolveInitialViewMode',
    { normalizeStoredViewMode },
    visitPreviewDialogSource,
  );
  const getFieldOidAnnotationText = compileFunction('getFieldOidAnnotationText', {}, visitPreviewDialogSource);
  const getFormDomainAnnotationText = compileFunction('getFormDomainAnnotationText', {}, visitPreviewDialogSource);

  assert.equal(normalizeStoredViewMode('aCRF'), 'aCRF');
  assert.equal(normalizeStoredViewMode('bogus'), 'eCRF');
  assert.equal(resolveInitialViewMode(false, 'aCRF'), 'eCRF');
  assert.equal(resolveInitialViewMode(true, 'aCRF'), 'aCRF');
  assert.equal(
    getFieldOidAnnotationText({ field_definition: { field_type: '标签', variable_name: 'LEGACY_LABEL' } }),
    '',
  );
  assert.equal(getFieldOidAnnotationText({ field_definition: { variable_name: '  LBTESTCD  ' } }), 'LBTESTCD');
  assert.equal(getFieldOidAnnotationText({ field_definition: {} }), '');
  assert.equal(getFormDomainAnnotationText({ domain: '  LB ' }), 'LB');
  assert.equal(getFormDomainAnnotationText({ domain: '' }), '');

  assert.match(visitPreviewDialogSource, /const VIEW_MODE_STORAGE_KEY = 'crf_view_mode'/);
  assert.match(
    visitPreviewDialogSource,
    /const viewMode = ref\(resolveInitialViewMode\(editMode\.value, readStoredViewMode\(\)\)\)/,
  );
  assert.match(
    visitPreviewDialogSource,
    /watch\(\s*viewMode,\s*\(nextMode\)\s*=>\s*\{[\s\S]*writeStoredViewMode\(normalizedMode\)[\s\S]*\}\s*\)/,
  );
  assert.match(
    visitPreviewDialogSource,
    /watch\(\s*editMode,\s*\(enabled\)\s*=>\s*\{[\s\S]*resolveInitialViewMode\(enabled, viewMode\.value\)[\s\S]*\}\s*\)/,
  );
  assert.match(
    visitPreviewDialogSource,
    /const showAcrfAnnotations = computed\(\(\) => editMode\.value && viewMode\.value === 'aCRF'\)/,
  );
  // 拖拽胶水归 useVisitPreviewAnnotation.js：实例建立 + 两个位置回调仍绑定到弹窗自己的位置读写。
  assert.match(visitPreviewAnnotationSource, /const annotationDrag = useAcrfAnnotationDrag\(/);
  assert.match(
    visitPreviewAnnotationSource,
    /getCurrentPositions: \(targetFormId\) => getFormAnnotationPositions\(targetFormId\)/,
  );
  assert.match(
    visitPreviewAnnotationSource,
    /applyOptimisticPositions: \(targetFormId, annotationPositions\) =>\s*applyFormAnnotationPositions\(targetFormId, annotationPositions\)/,
  );
  // 项目切换：父组件关弹窗并清 id，弹窗自身取消活动拖拽并冲掉排队 PATCH（快照自带旧 projectId/formId）。
  assert.match(
    visitsTabSource,
    /watch\(\s*\(\)\s*=>\s*props\.projectId,\s*async \(newProjectId, previousProjectId\) => \{[\s\S]*?showFormPreview\.value = false[\s\S]*?formPreviewFormId\.value = null[\s\S]*?await load\(\)[\s\S]*?\},\s*\)/,
  );
  assert.match(
    visitPreviewDialogSource,
    /watch\(\s*\(\)\s*=>\s*props\.projectId,[\s\S]*?await flushAnnotationPositionSave\(\{ cancelActiveDrag: true \}\)/,
  );
  assert.match(
    visitPreviewDialogSource,
    /function resetPreviewState\(\) \{[\s\S]*?cancelActiveDrag\(\)[\s\S]*?void flushAnnotationPositionSave\(\)[\s\S]*?\}/,
  );

  const switchPattern =
    /<el-switch[\s\S]*?v-model="viewMode"[\s\S]*?inline-prompt[\s\S]*?active-text="aCRF"[\s\S]*?inactive-text="eCRF"[\s\S]*?:active-value="'aCRF'"[\s\S]*?:inactive-value="'eCRF'"[\s\S]*?\/>/g;
  assert.equal(countMatches(visitPreviewDialogSource, switchPattern), 1);
  assert.match(
    visitPreviewDialogSource,
    /<template #header>[\s\S]*?<el-switch[\s\S]*?v-if="editMode"[\s\S]*?v-model="viewMode"/,
  );
});

test('aCRF annotations stay inside the two designer word pages and mirror the export anchor strategy', () => {
  assert.match(
    formDesignerSource,
    /const showAcrfAnnotations = computed\(\(\) => editMode\.value && viewMode\.value === 'aCRF'\);/,
  );
  // 注释标记本身已迁入 DesignerAcrfAnnotation.vue（Step 1），模板已合并入 DesignerWordPreview.vue（Step 2）：
  // 类名计数改读组件源码；父组件渲染两次由 designerPreviewSplit.test.js 守卫。
  assert.equal(
    countMatches(annotationComponentSource, /'wp-acrf-annotation--form'/g),
    1,
    'annotation component should render one form-domain overlay class per instance',
  );
  assert.equal(
    countMatches(wordPreviewSource, /class="wp-form-title-row"/g),
    1,
    'merged preview template should hold exactly one title row (rendered twice by the parent)',
  );
  assert.match(
    wordPreviewSource,
    /<div class="wp-form-title-row">[\s\S]*?<div class="wp-form-title">\{\{ selectedForm\.name \}\}<\/div>[\s\S]*?getAnnotationStyle\([\s\S]*?ANNOTATION_KIND_FORM/,
  );
  assert.match(
    wordPreviewSource,
    /class="unified-value row-resize-anchor"[\s\S]*?<DesignerAcrfAnnotation[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(seg\.fields\[0\]\)"[\s\S]*?ANNOTATION_KIND_FIELD/,
  );
  assert.match(
    wordPreviewSource,
    /class="wp-inline-header row-resize-anchor"[\s\S]*?<DesignerAcrfAnnotation[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(ff\)"[\s\S]*?ANNOTATION_KIND_INLINE_HEADER/,
  );
  assert.doesNotMatch(
    wordPreviewSource,
    /v-for="\(row, ri\) in gv\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(gv\.fields\[ci\]\)/,
  );
  assert.doesNotMatch(
    wordPreviewSource,
    /v-for="\(row, ri\) in seg\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(seg\.fields\[ci\]\)/,
  );
  assert.match(formDesignerSource, /useAcrfAnnotationDrag/);
});

test('visit preview dialog keeps aCRF annotations inside the word page with the same anchor strategy', () => {
  // 标记本身是共享的 DesignerAcrfAnnotation（上方 designer 用例已锁类名计数与样式）；
  // 此处锁弹窗侧的调用点：标题行注释、unified 值格字段注释、inline 表头注释与模板级负向。
  assert.equal(countMatches(visitPreviewDialogSource, /class="wp-form-title-row"/g), 1);
  assert.match(
    visitPreviewDialogSource,
    /<div class="wp-form-title-row">[\s\S]*?<div class="wp-form-title">\{\{ formPreviewTitle \}\}<\/div>[\s\S]*?getAnnotationStyle\([\s\S]*?ANNOTATION_KIND_FORM/,
  );
  assert.match(
    visitPreviewDialogSource,
    /class="unified-value row-resize-anchor"[\s\S]*?<DesignerAcrfAnnotation[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(seg\.fields\[0\]\)"[\s\S]*?ANNOTATION_KIND_FIELD/,
  );
  assert.match(
    visitPreviewDialogSource,
    /class="wp-inline-header row-resize-anchor"[\s\S]*?<DesignerAcrfAnnotation[\s\S]*?v-if="showAcrfAnnotations && getFieldOidAnnotationText\(ff\)"[\s\S]*?ANNOTATION_KIND_INLINE_HEADER/,
  );
  assert.doesNotMatch(
    visitPreviewDialogSource,
    /v-for="\(row, ri\) in gv\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(gv\.fields\[ci\]\)/,
  );
  assert.doesNotMatch(
    visitPreviewDialogSource,
    /v-for="\(row, ri\) in seg\.inlineRows"[\s\S]*?getFieldOidAnnotationText\(seg\.fields\[ci\]\)/,
  );
  // 拖拽接线：调用点上抛事件，门禁/几何/持久化走 useVisitPreviewAnnotation。
  assert.match(visitPreviewDialogSource, /onAnnotationPointerDown/);
  assert.match(visitPreviewDialogSource, /resetAnnotationPosition/);
  assert.match(visitPreviewAnnotationSource, /hasAnnotationOverrideForTarget/);
  assert.match(visitPreviewAnnotationSource, /buildAnnotationStyle\(\{/);
  assert.match(visitPreviewAnnotationSource, /readAnnotationDelta01Cm\(getFormAnnotationPositions/);
});

test('designer field list hides label-field tooltip but keeps the variable-name slot in aCRF mode', () => {
  assert.match(
    formDesignerSource,
    /<template v-if="showAcrfAnnotations"[\s\S]*?<el-tooltip\s+v-if="ff\.field_definition\?\.field_type !== '标签'"[\s\S]*?<span class="ff-var-name">\{\{ ff\.field_definition\?\.variable_name \|\| '' \}\}<\/span/,
  );
  assert.match(formDesignerSource, /<span v-else class="ff-var-name" aria-hidden="true"><\/span><\/template/);
  assert.doesNotMatch(
    formDesignerSource,
    /<el-tooltip\s+v-if="showAcrfAnnotations && ff\.field_definition\?\.field_type !== '标签'"/,
  );
});

test('aCRF annotation styles stay absolute, draggable in edit mode, and out of width-cache geometry', () => {
  assert.match(mainCssSource, /\.word-page \{[\s\S]*position: relative;[\s\S]*\}/);

  const annotationRule = extractRuleBody(annotationComponentSource, '.wp-acrf-annotation');
  assert.ok(annotationRule, '.wp-acrf-annotation rule should exist in DesignerAcrfAnnotation.vue');
  assert.match(annotationRule, /position:\s*absolute/);
  assert.match(annotationRule, /top:\s*var\(--acrf-annotation-top\)/);
  assert.match(annotationRule, /width:\s*var\(--acrf-annotation-width\)/);
  assert.match(annotationRule, /height:\s*var\(--acrf-annotation-height\)/);
  assert.match(annotationRule, /border:\s*var\(--acrf-annotation-border-width\) solid #c00000/i);
  // 底色半透明（任务 acrf-annotation-space）：背景消费几何模块的 rgba 变量，文字保持不透明红色。
  assert.match(annotationRule, /background:\s*var\(--acrf-annotation-background\)/);
  assert.match(annotationRule, /color:\s*#c00000/i);
  assert.match(annotationRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(annotationRule, /pointer-events:\s*none/);

  const interactiveRule = extractRuleBody(annotationComponentSource, '.wp-acrf-annotation--interactive');
  assert.ok(interactiveRule);
  assert.match(interactiveRule, /cursor:\s*ns-resize/);

  // .wp-form-title-row 随预览模板迁移到 DesignerWordPreview（Step 2）。
  const titleRowRule = extractRuleBody(wordPreviewSource, '.wp-form-title-row');
  assert.ok(titleRowRule);
  assert.match(titleRowRule, /position:\s*relative/);
  assert.match(titleRowRule, /padding-right:\s*4\.8cm/);

  const resetRule = extractRuleBody(annotationComponentSource, '.wp-acrf-annotation-reset');
  assert.ok(resetRule);
  assert.match(resetRule, /position:\s*absolute/);
  assert.match(resetRule, /border:\s*1px solid #c00000/i);

  // 拖拽连线仍在父组件；重置按钮标记已迁入组件。
  assert.match(formDesignerSource, /onAnnotationPointerDown/);
  assert.match(formDesignerSource, /resetAnnotationPosition/);
  assert.match(annotationComponentSource, /class="wp-acrf-annotation-reset"/);

  const getResizerSource = extractFunction('getResizer').body;
  const getRowResizerSource = extractFunction('getRowResizer').body;
  assert.match(getResizerSource, /const mapKey = `\$\{scope\}:\$\{kind\}:\$\{colCount\}:\$\{tableInstanceId\}`;/);
  assert.match(getRowResizerSource, /if \(!rowResizerCache\.has\(tableInstanceId\)\) \{/);
  assert.doesNotMatch(getResizerSource, /viewMode/);
  assert.doesNotMatch(getRowResizerSource, /viewMode/);
});

test('visit preview annotation styles come from the shared component and stay out of table text geometry', () => {
  // visits-preview-split：访视预览的注解标记改用共享 DesignerAcrfAnnotation.vue，
  // 该组件与设计器共用同一批 CSS（规则体断言在上一用例已覆盖；此处按站点复验归属不丢失）。
  assert.match(visitPreviewDialogSource, /import DesignerAcrfAnnotation from '\.\/DesignerAcrfAnnotation\.vue'/);
  const annotationRule = extractRuleBody(annotationComponentSource, '.wp-acrf-annotation');
  assert.ok(annotationRule, '.wp-acrf-annotation rule should exist in the shared component');
  assert.match(annotationRule, /position:\s*absolute/);
  assert.match(annotationRule, /top:\s*var\(--acrf-annotation-top\)/);
  assert.match(annotationRule, /width:\s*var\(--acrf-annotation-width\)/);
  assert.match(annotationRule, /height:\s*var\(--acrf-annotation-height\)/);
  assert.match(annotationRule, /border:\s*var\(--acrf-annotation-border-width\) solid #c00000/i);
  assert.match(annotationRule, /background:\s*var\(--acrf-annotation-background\)/);
  assert.match(annotationRule, /color:\s*#c00000/i);
  assert.doesNotMatch(annotationRule, /pointer-events:\s*none/);

  const interactiveRule = extractRuleBody(annotationComponentSource, '.wp-acrf-annotation--interactive');
  assert.ok(interactiveRule);
  assert.match(interactiveRule, /cursor:\s*ns-resize/);

  // 弹窗仍持有标题行规则（迁移到弹窗的 scoped 样式，随模板一起搬走）。
  const titleRowRule = extractRuleBody(visitPreviewDialogSource, '.wp-form-title-row');
  assert.ok(titleRowRule);
  assert.match(titleRowRule, /position:\s*relative/);
  assert.match(titleRowRule, /padding-right:\s*4\.8cm/);
});

test('form title OID badge renders the value only and reuses field-annotation decoration without annotation behavior', () => {
  // form-title-oid-style（2026-10-15）：纸面标题表单 OID 去前缀，并与字段 OID 注记共用红框装饰。
  // 模板契约：只插值 displayCode，不拼接展示前缀；装饰变量取自共享 buildAnnotationStyle。
  assert.match(formPreviewOidSource, /class="wp-form-oid"[^>]*>\{\{\s*displayCode\s*\}\}/);
  assert.doesNotMatch(formPreviewOidSource, /OID:\s*\{\{/, 'badge must not add a presentation prefix');
  assert.match(formPreviewOidSource, /buildAnnotationStyle\(\{/);

  // 源码注释会解释「为什么不设 nowrap」，先剥离 CSS 注释再提取规则体，负向断言只看真实声明。
  const oidRule = extractRuleBody(stripCssComments(formPreviewOidSource), '.wp-form-oid');
  assert.ok(oidRule, '.wp-form-oid rule should exist in FormPreviewOid.vue');
  // 红框装饰与 .wp-acrf-annotation 同源：边框宽度/内边距/底色走同一批几何变量，圆角/文字色同值。
  assert.match(oidRule, /border:\s*var\(--acrf-annotation-border-width\) solid #c00000/i);
  assert.match(oidRule, /border-radius:\s*2px/);
  assert.match(oidRule, /padding:\s*var\(--acrf-annotation-padding-y\)\s+var\(--acrf-annotation-padding-x\)/);
  assert.match(oidRule, /background:\s*var\(--acrf-annotation-background\)/);
  assert.match(oidRule, /color:\s*#c00000/i);
  // 边框与内边距计入宽度预算（宿主 flex 行内受可用宽度约束）。
  assert.match(oidRule, /box-sizing:\s*border-box/);
  // 标题徽章不是注记标记：保持文档流内容尺寸与软换行，不引入绝对定位/nowrap/省略号。
  assert.doesNotMatch(oidRule, /position:\s*absolute/);
  assert.doesNotMatch(oidRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(oidRule, /text-overflow:\s*ellipsis/);
  // 不复用注记根类/组件行为：无 wp-acrf-annotation 类、无重置按钮、无事件上抛。
  assert.doesNotMatch(formPreviewOidSource, /wp-acrf-annotation/);
  assert.doesNotMatch(formPreviewOidSource, /wp-acrf-annotation-reset/);
  assert.doesNotMatch(formPreviewOidSource, /defineEmits/);
});

test('aCRF reset button stays hidden while disabled until hover/focus-within reveals its muted state', () => {
  // visits-preview-split（design §3.3）：VisitsTab 臂删除——重置按钮标记与这批 CSS 规则
  // 现由组件树中唯一的所有者 DesignerAcrfAnnotation.vue 持有（访视预览经共享组件渲染同一批规则），
  // 「弹窗不复制注解 CSS」的负向守卫在 visitPreviewSplit.test.js。
  for (const [label, source] of [['DesignerAcrfAnnotation.vue', annotationComponentSource]]) {
    const disabledRule = extractRuleBodyByPattern(
      source,
      /(?:^|\n)\.wp-acrf-annotation-reset:disabled\s*\{([^}]*)\}/m,
      `${label} disabled reset rule`,
    );
    assert.doesNotMatch(disabledRule, /opacity\s*:/, `${label} disabled reset rule should not force opacity`);

    const disabledRevealRule = extractRuleBodyByPattern(
      source,
      /(?:^|\n)\.wp-acrf-annotation:hover \.wp-acrf-annotation-reset:disabled,\s*\n\.wp-acrf-annotation:focus-within \.wp-acrf-annotation-reset:disabled\s*\{([^}]*)\}/m,
      `${label} disabled reveal rule`,
    );
    assert.match(disabledRevealRule, /opacity:\s*0\.45/, `${label} disabled reveal rule should dim on hover`);

    const revealRule = extractRuleBodyByPattern(
      source,
      /(?:^|\n)\.wp-acrf-annotation:hover \.wp-acrf-annotation-reset,\s*\n\.wp-acrf-annotation:focus-within \.wp-acrf-annotation-reset\s*\{([^}]*)\}/m,
      `${label} base reveal rule`,
    );
    assert.match(revealRule, /opacity:\s*1/, `${label} base reveal rule should keep enabled resets visible`);
  }
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
    /<template #header="\{ titleId, titleClass \}">[\s\S]*?<div class="designer-dialog-header-main">[\s\S]*?<span :id="titleId" :class="\[titleClass, 'designer-dialog-title'\]">[\s\S]*?设计：[\s\S]*?data-test=\"designer-form-switch\"[\s\S]*?:model-value=\"selectedForm\?\.id(?: \?\? undefined)?\"[\s\S]*?<\/span>[\s\S]*?<el-switch[\s\S]*?v-model="viewMode"/,
  );
  assert.match(formDesignerSource, /\.designer-dialog-header \{[\s\S]*padding-right: 32px;[\s\S]*\}/);
  assert.match(formDesignerSource, /\.designer-dialog-header-main \{[\s\S]*gap: 8px;[\s\S]*max-width: 100%;[\s\S]*\}/);
  assert.match(formDesignerSource, /\.designer-dialog-title \{[\s\S]*flex: 0 1 auto;[\s\S]*white-space: nowrap;[\s\S]*\}/);
});


test('visit preview dialog merges drag saves into its own form state without touching parent collections', () => {
  // visits-preview-split（design §3.3 DELETE/REPLACE）：mergeFormIntoState 与四份集合副本已随拆分删除。
  // 被删断言保护的真实行为（aCRF 拖动保存回写 {id, annotation_positions} 后不得覆盖集合字段）改由行为
  // 断言承担：弹窗级 PATCH 用例（tests/component/VisitFormPreviewDialog.spec.js「拖拽 → PATCH」）
  // 断言两处缓存失效 + onPersisted 合并进弹窗自持 form；「无集合回写」的负向守卫
  // （无 mergeFormIntoState / getFormStateById / formPreviewForm）在 tests/visitPreviewSplit.test.js。
  assert.match(
    visitPreviewAnnotationSource,
    /onPersisted: \(updatedForm\) => \{[\s\S]*?formState\.value = \{ \.\.\.form, \.\.\.updatedForm \}/,
    'drag save must merge the PATCH response into the dialog-owned form ref as a new object',
  );
  assert.doesNotMatch(
    visitPreviewAnnotationSource,
    /visitForms|allForms|matrixData/,
    'annotation glue must not touch the parent visit/forms collections',
  );
});
