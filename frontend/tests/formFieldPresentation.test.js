import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldTextColorStyle,
} from '../src/composables/formFieldPresentation.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const useCRFRendererSource = readFileSync(path.resolve(currentDir, '../src/composables/useCRFRenderer.js'), 'utf8');
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8');
const templatePreviewSource = readFileSync(
  path.resolve(currentDir, '../src/components/TemplatePreviewDialog.vue'),
  'utf8',
);
const visitsSource = readFileSync(
  path.resolve(currentDir, '../src/components/VisitsTab.vue'),
  'utf8',
);
const mainCssSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8');

function createField(overrides = {}) {
  return {
    id: 1,
    order_index: 1,
    inline_mark: 0,
    is_log_row: 0,
    label_override: null,
    bg_color: null,
    text_color: null,
    field_definition: {
      label: '默认标签',
      field_type: '文本',
    },
    ...overrides,
  };
}

test('list and preview labels both prefer label_override', () => {
  const field = createField({ label_override: '快捷编辑标签', text_color: '112233', bg_color: 'FFEEDD' });

  assert.equal(getFormFieldDisplayLabel(field), '快捷编辑标签');
  assert.equal(getFormFieldTextColorStyle(field), 'color:#112233');
  assert.equal(getFormFieldPreviewStyle(field), 'background:#FFEEDD40;color:#112233');
});

test('preview style falls back to unified structural gray with transparency when no bg_color is set', () => {
  const field = createField({ text_color: '445566' });

  assert.equal(getFormFieldPreviewStyle(field, 'background:#BFBFBF40;'), 'background:#BFBFBF40;color:#445566');
});

test('preview text defaults to true black when no custom text color is set', () => {
  const field = createField({ text_color: null });

  assert.equal(getFormFieldTextColorStyle(field), '');
  assert.equal(getFormFieldPreviewStyle(field), 'color:#000000');
});

test('preview style normalizes legacy hex color inputs while keeping invalid values rejected', () => {
  const legacyBgField = createField({ bg_color: '#112233', text_color: ' 112233 ' });
  const legacyTextField = createField({ bg_color: ' 112233 ', text_color: '#112233' });
  const invalidTextField = createField({ bg_color: null, text_color: 'zzzzzz' });

  assert.equal(getFormFieldPreviewStyle(legacyBgField), 'background:#11223340;color:#112233');
  assert.equal(getFormFieldPreviewStyle(legacyTextField), 'background:#11223340;color:#112233');
  assert.equal(getFormFieldPreviewStyle(invalidTextField), 'color:#000000');
});

test('preview groups switch to inline when inline_mark changes', () => {
  const groups = buildFormDesignerRenderGroups([
    createField({ id: 1, order_index: 1, inline_mark: 0, label_override: '普通字段' }),
    createField({ id: 2, order_index: 2, inline_mark: 1, label_override: '快捷编辑标签' }),
    createField({ id: 3, order_index: 3, inline_mark: 1, field_definition: { label: '同组字段', field_type: '文本' } }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].type, 'normal');
  assert.equal(groups[1].type, 'inline');
  assert.deepEqual(groups[1].fields.map(getFormFieldDisplayLabel), ['快捷编辑标签', '同组字段']);
});

test('mixed wide inline and regular fields keep segmented groups before component-level unified rendering', () => {
  const groups = buildFormDesignerRenderGroups([
    createField({ id: 1, order_index: 1, inline_mark: 0, label_override: '普通字段' }),
    ...Array.from({ length: 5 }, (_, idx) =>
      createField({
        id: idx + 2,
        order_index: idx + 2,
        inline_mark: 1,
        label_override: `表格字段${idx + 1}`,
      }),
    ),
    createField({ id: 7, order_index: 7, inline_mark: 0, label_override: '尾部字段' }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.type),
    ['normal', 'inline', 'normal'],
  );
  assert.equal(groups[1].fields.length, 5);
});

test('export segments keep updated quick edit fields in order', () => {
  const segments = buildFormDesignerUnifiedSegments([
    createField({
      id: 2,
      order_index: 2,
      inline_mark: 1,
      label_override: '快捷编辑标签',
      bg_color: 'FFEEDD',
      text_color: '112233',
    }),
    createField({ id: 1, order_index: 1, inline_mark: 0, field_definition: { label: '普通字段', field_type: '文本' } }),
    createField({ id: 3, order_index: 3, inline_mark: 0, field_definition: { label: '尾部字段', field_type: '文本' } }),
  ]);

  assert.deepEqual(
    segments.map((segment) => segment.type),
    ['regular_field', 'inline_block', 'regular_field'],
  );
  assert.equal(getFormFieldDisplayLabel(segments[1].fields[0]), '快捷编辑标签');
  assert.equal(segments[1].fields[0].inline_mark, 1);
  assert.equal(segments[1].fields[0].bg_color, 'FFEEDD');
  assert.equal(segments[1].fields[0].text_color, '112233');
});

test('quick edit fields are subset of form field instance properties', () => {
  assert.match(formDesignerSource, /Object\.assign\(quickEditProp, \{/);
  assert.match(formDesignerSource, /label: getFormFieldDisplayLabel\(ff\) \|\| ''/);
  assert.match(formDesignerSource, /field_type: ff\.field_definition\?\.field_type \|\| ''/);
  assert.match(formDesignerSource, /bg_color: ff\.bg_color \|\| ''/);
  assert.match(formDesignerSource, /text_color: ff\.text_color \|\| ''/);
  assert.match(formDesignerSource, /inline_mark: !!ff\.inline_mark/);
  assert.match(formDesignerSource, /default_value: ff\.default_value \|\| ''/);
  assert.match(
    formDesignerSource,
    /const supportsDefaultValue = isDefaultValueSupported\(quickEditProp\.field_type, Boolean\(quickEditProp\.inline_mark\)\)/,
  );
  assert.match(formDesignerSource, /const normalizedDefaultValue = supportsDefaultValue/);
  assert.match(
    formDesignerSource,
    /normalizeDefaultValue\(quickEditProp\.default_value, !quickEditProp\.inline_mark\)/,
  );
  assert.match(formDesignerSource, /: '';/);
  assert.match(formDesignerSource, /default_value: normalizedDefaultValue \|\| null/);
  assert.match(formDesignerSource, /<el-form-item label="变量标签">/);
  assert.match(formDesignerSource, /v-model="quickEditProp\.label"/);
  assert.match(formDesignerSource, /quickEditProp\.field_type === '标签' \? 'textarea' : 'text'/);
  assert.match(
    formDesignerSource,
    /:autosize="quickEditProp\.field_type === '标签' \? \{ minRows: 2, maxRows: 4 \} : undefined"/,
  );
  assert.match(
    formDesignerSource,
    /isDefaultValueSupported\(quickEditProp\.field_type, Boolean\(quickEditProp\.inline_mark\)\)/,
  );
  assert.match(formDesignerSource, /label="默认值"/);
  assert.match(formDesignerSource, /v-model="quickEditProp\.default_value"/);
  assert.match(formDesignerSource, /quickEditProp\.inline_mark \? 'textarea' : 'text'/);
  assert.match(formDesignerSource, /quickEditProp\.inline_mark \? \{ minRows: 1, maxRows: 3 \} : undefined/);
  assert.match(formDesignerSource, /<el-form-item label="底纹颜色">/);
  assert.match(formDesignerSource, /<el-form-item label="文字颜色">/);
  assert.match(
    formDesignerSource,
    /<el-form-item v-if="quickEditProp\.field_type !== '标签' && quickEditProp\.field_type !== '日志行'" label="布局">[\s\S]*?<el-checkbox v-model="quickEditProp\.inline_mark">横向显示<\/el-checkbox>[\s\S]*?<\/el-form-item>/,
  );
  assert.equal(formDesignerSource.includes('default_value: quickEditProp'), false);
  assert.equal(formDesignerSource.includes('variable_name: quickEditProp'), false);
  assert.equal(formDesignerSource.includes('codelist_id: quickEditProp'), false);
  assert.equal(formDesignerSource.includes('unit_id: quickEditProp'), false);
});

test('preview structural colors are unified across designer and template preview paths', () => {
  assert.match(formDesignerSource, /form-designer-word-page/);
  assert.match(mainCssSource, /--preview-structure-bg: #BFBFBF40;/);
  assert.match(
    mainCssSource,
    /\.word-page \.wp-inline-header \{ background: var\(--preview-structure-bg\); font-weight: bold; text-align: center; \}/,
  );
  assert.match(mainCssSource, /\.word-page \.wp-label \{ font-weight: bold; background: transparent; \}/);
  assert.match(mainCssSource, /\.word-page \.wp-ctrl \{ font-family: 'SimSun', serif; color: #000;[\s\S]*\}/);
  assert.match(mainCssSource, /\.word-page \.unified-label \{ font-weight: bold; background: transparent; \}/);
  assert.match(mainCssSource, /\.word-page \.unified-value \{ font-family: 'SimSun', serif; color: #000; \}/);
  assert.match(formDesignerSource, /background:var\(--preview-structure-bg\);/);
  assert.match(templatePreviewSource, /background:var\(--preview-structure-bg\);/);
  assert.match(templatePreviewSource, /\.wp-inline-header \{\s*background: var\(--preview-structure-bg\);/s);
  assert.doesNotMatch(mainCssSource, /#fafafa|#f5f5f5|#d9d9d9/);
});

test('preview choice labels may wrap inside a single long option without overflowing', () => {
  assert.match(useCRFRendererSource, /class="choice-group"/);
  assert.match(useCRFRendererSource, /class="choice-atom"/);
  assert.match(useCRFRendererSource, /class="choice-label/);
  assert.doesNotMatch(useCRFRendererSource, /class="choice-atom" style="[^"]*white-space:nowrap/);
  assert.match(mainCssSource, /\.word-page \.wp-ctrl \{[\s\S]*word-break: break-word;[\s\S]*\}/);
  assert.match(mainCssSource, /\.word-page \.choice-atom \{[^}]*display: inline-flex;[^}]*max-width: 100%;[^}]*white-space: normal;[^}]*\}/s);
  assert.match(mainCssSource, /\.word-page \.choice-label \{[^}]*overflow-wrap: anywhere;[^}]*\}/s);
});

test('designer and visits Word previews both expose row height resize handles', () => {
  assert.match(formDesignerSource, /class="wp-ctrl row-resize-anchor"/);
  assert.match(visitsSource, /useRowResize/);
  assert.match(visitsSource, /function getPreviewRowResizer/);
  assert.match(visitsSource, /class="wp-ctrl row-resize-anchor"/);
  assert.match(visitsSource, /class="row-resizer-handle"/);
  assert.match(visitsSource, /onResizeStart\(getNormalRowKey\(ff\)/);
  assert.match(visitsSource, /onResizeStart\(getUnifiedRegularRowKey\(seg\.fields\[0\]\)/);
  assert.match(mainCssSource, /\.word-page \.row-resizer-handle \{/);
});

test('label preview rows preserve multiline text through dedicated class', () => {
  assert.match(formDesignerSource, /wp-structure-label--multiline/);
  assert.match(templatePreviewSource, /wp-structure-label--multiline/);
  assert.match(
    mainCssSource,
    /\.word-page \.wp-structure-label--multiline \{ white-space: pre-wrap; overflow-wrap: anywhere; \}/,
  );
});

test('designer preview uses full-width static layout without scale logic', () => {
  assert.match(formDesignerSource, /renderGroups\.value\.some\(\(g\) => g\.type === 'unified' \|\| \(g\.type === 'inline' && g\.fields\.length > 4\)\)/);
  assert.match(formDesignerSource, /designerRenderGroups\.value\.some\(\(g\) => g\.type === 'unified' \|\| \(g\.type === 'inline' && g\.fields\.length > 4\)\)/);
  assert.match(formDesignerSource, /class="designer-workspace-bottom"[\s\S]*class="designer-preview-pane"/);
  assert.doesNotMatch(formDesignerSource, /class="designer-side-pane"[\s\S]*class="designer-preview-pane"/);
  assert.match(
    formDesignerSource,
    /\.designer-shell \{[\s\S]*grid-template-rows: minmax\(0, 1fr\);[\s\S]*overflow: hidden;/,
  );
  assert.match(formDesignerSource, /\.designer-workspace-bottom \{[\s\S]*display: flex;[\s\S]*overflow: hidden;/);
  assert.match(formDesignerSource, /\.designer-preview-pane \{[\s\S]*flex: 1;/);
  assert.doesNotMatch(formDesignerSource, /const previewScale = ref\(1\)/);
  assert.doesNotMatch(formDesignerSource, /Math\.min\(availableWidth \/ pageWidth, availableHeight \/ pageHeight, 1\)/);
  assert.doesNotMatch(formDesignerSource, /ref="previewViewportRef"/);
  assert.doesNotMatch(formDesignerSource, /ref="previewPageRef"/);
  assert.doesNotMatch(formDesignerSource, /translateX\(-50%\) scale/);
  assert.match(formDesignerSource, /<span>实时预览<\/span>/);
  assert.match(formDesignerSource, /<div class="wp-form-title">\{\{ selectedForm\.name \}\}<\/div>/);
  assert.match(visitsSource, /<div class="wp-form-title">\{\{ formPreviewTitle \}\}<\/div>/);
  assert.doesNotMatch(formDesignerSource, /<aside v-if="designerHasPreviewNotes" class="wp-notes">/);
});

test('designer preview page keeps A4 geometry and stretches the stage container', () => {
  assert.match(formDesignerSource, /\.designer-preview-viewport \{[\s\S]*overflow: auto;[\s\S]*padding: 0;/);
  assert.match(formDesignerSource, /\.designer-preview-stage \{[\s\S]*width: 100%;[\s\S]*min-height: 100%;/);
  assert.match(
    formDesignerSource,
    /\.designer-preview-page \{[\s\S]*position: static;[\s\S]*width: 100%;[\s\S]*min-height: 100%;[\s\S]*transform: none;/,
  );
  // 全屏对话框里的 word-page 保持 A4 几何（21cm × 29.7cm），由 wordPageGeometry.test.js 维护强契约；
  // 这里只断言两条不可回退的负向约束：横纵向不再强制 width:100% 抹平差异。
  const scaledBlock = formDesignerSource.match(/\.designer-scaled-word-page \{([^}]+)\}/)
  assert.ok(scaledBlock, '.designer-scaled-word-page rule should exist')
  assert.doesNotMatch(scaledBlock[1], /(^|\n)\s*width:\s*100%/, '.designer-scaled-word-page must not force width:100% (use A4 geometry)')
  const landscapeBlock = formDesignerSource.match(/\.designer-scaled-word-page\.landscape \{([^}]+)\}/)
  assert.ok(landscapeBlock, '.designer-scaled-word-page.landscape rule should exist')
  assert.doesNotMatch(landscapeBlock[1], /(^|\n)\s*width:\s*100%/, '.designer-scaled-word-page.landscape must not force width:100% (use A4 landscape geometry)')
});


test('notes autosave failures keep main preview on persisted notes', () => {
  assert.match(
    formDesignerSource,
    /const previewDesignNotesText = computed\(\(\) => String\(selectedForm\.value\?\.design_notes \?\? ''\)\)/,
  );
  assert.match(formDesignerSource, /const headerDesignNotesSummary = computed\(\(\) => \{/);
  assert.match(formDesignerSource, /let notesPendingSave = null/);
  assert.match(formDesignerSource, /let notesSavePromise = null/);
  assert.match(formDesignerSource, /function buildDesignNotesSaveSnapshot\(/);
  assert.match(formDesignerSource, /async function persistDesignNotesSnapshot\(snapshot\)/);
  assert.match(
    formDesignerSource,
    /async function flushDesignNotesSave\(snapshot = buildDesignNotesSaveSnapshot\(\)\)/,
  );
  assert.match(
    formDesignerSource,
    /while \(notesPendingSave\) \{[\s\S]*await persistDesignNotesSnapshot\(queuedSave\)/s,
  );
  assert.match(formDesignerSource, /if \(!notesPendingSave\) notesPendingSave = queuedSave/);
  assert.match(formDesignerSource, /ElMessage\.error\(`设计备注保存失败：\$\{e\.message\}`\)/);
  assert.match(
    formDesignerSource,
    /async function selectForm\(nextForm\) \{[\s\S]*await flushDesignNotesSave\(buildDesignNotesSaveSnapshot\(\{ form: currentForm \}\)\)[\s\S]*formsTableRef\.value\?\.setCurrentRow\(currentForm\)/s,
  );
  assert.match(
    formDesignerSource,
    /const flushSnapshot = buildDesignNotesSaveSnapshot\(\{ projectId: previousProjectId \}\)/,
  );
  assert.match(formDesignerSource, /@current-change="selectForm"/);
  assert.match(
    formDesignerSource,
    /class="designer-side-pane"[\s\S]*class="designer-editor-card"[\s\S]*class="designer-notes-card"/,
  );
  assert.match(
    formDesignerSource,
    /\.designer-library-pane \{[\s\S]*min-height: 0;[\s\S]*height: 100%;[\s\S]*overflow: hidden;/,
  );
  assert.match(formDesignerSource, /\.fd-library \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
  assert.match(formDesignerSource, /\.fd-library-list \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/);
  assert.match(formDesignerSource, /<div class="designer-notes-editor">/);
  assert.match(formDesignerSource, /v-model="formDesignNotes"/);
  assert.match(formDesignerSource, /class="designer-notes-input"/);
  assert.match(formDesignerSource, /@input="onNotesInput"/);
  assert.match(formDesignerSource, /<div :class="\['word-page', \{ landscape: landscapeMode \}\]">/);
  assert.match(formDesignerSource, /'form-designer-word-page'/);
  assert.match(formDesignerSource, /'designer-scaled-word-page'/);
  assert.match(formDesignerSource, /landscape: designerLandscapeMode/);
  assert.doesNotMatch(formDesignerSource, /<aside v-if="designerHasPreviewNotes" class="wp-notes">/);
});

test('form designer surfaces header notes summary and paper orientation controls', () => {
  assert.match(formDesignerSource, /const HEADER_NOTES_MAX_LENGTH = 20/);
  assert.match(formDesignerSource, /const headerDesignNotesSummary = computed\(\(\) => \{/);
  assert.match(formDesignerSource, /raw\.length > HEADER_NOTES_MAX_LENGTH/);
  assert.match(formDesignerSource, /data-test="canvas-notes-summary"/);
  assert.match(formDesignerSource, /data-test="designer-canvas-notes-summary"/);
  assert.match(formDesignerSource, /const LEGACY_FORCE_LANDSCAPE_KEY = 'crf_forceLandscape'/);
  assert.match(formDesignerSource, /const LEGACY_FORCE_LANDSCAPE_MIGRATED_KEY = 'crf_forceLandscape_migrated_v1'/);
  assert.match(formDesignerSource, /async function migrateLegacyForceLandscape\(projectId\)/);
  assert.match(
    formDesignerSource,
    /const selectedFormPaperOrientation = computed\(\(\) => selectedForm\.value\?\.paper_orientation \|\| 'auto'\)/,
  );
  assert.match(formDesignerSource, /function resolveLandscape\(orientation, autoFlag\)/);
  assert.match(formDesignerSource, /paper_orientation: editFormPaperOrientation\.value/);
  assert.match(formDesignerSource, /data-test="edit-form-paper-orientation"/);
  assert.match(formDesignerSource, /<el-radio label="auto">自动<\/el-radio>/);
  assert.match(formDesignerSource, /<el-radio label="landscape">横向<\/el-radio>/);
  assert.match(formDesignerSource, /<el-radio label="portrait">纵向<\/el-radio>/);
});

test('template preview escapes default values before sending them to v-html', () => {
  assert.match(templatePreviewSource, /toHtml/);
  assert.match(templatePreviewSource, /return toHtml\(normalizeDefaultValue\(defaultValue, false\)\)/);
});
