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
  getFormFieldStructurePreviewStyle,
  getFormFieldTextColorStyle,
  getFormFieldLabelPreviewStyle,
  isFormFieldLabelBold,
  getFormFieldLabelFontSizeStyle,
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
const simulatedCrfSource = readFileSync(
  path.resolve(currentDir, '../src/components/SimulatedCRFForm.vue'),
  'utf8',
);
const mainCssSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8');

test('SimulatedCRFForm drives label bold from shared helper and drops hardcoded font-weight', () => {
  // 标签单元格走共享标签样式 helper（label_bold/label_font_size），不再由 CSS 硬编码加粗
  assert.match(simulatedCrfSource, /getFormFieldLabelPreviewStyle/);
  assert.match(simulatedCrfSource, /includeBackground: false/);
  assert.match(simulatedCrfSource, /:style="getLabelCellStyle\(field\)"/);
  assert.doesNotMatch(simulatedCrfSource, /\.crf-label-only \{[^}]*font-weight: bold;[^}]*\}/s);
});

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
  assert.equal(getFormFieldPreviewStyle(field), 'background:#FFEEDD;color:#112233');
});

test('preview style falls back to unified structural gray matching Word export when no bg_color is set', () => {
  const field = createField({ text_color: '445566' });

  assert.equal(getFormFieldPreviewStyle(field, 'background:#D9D9D9;'), 'background:#D9D9D9;color:#445566');
});

test('structure preview style applies Word-export gray only to log rows by default', () => {
  const labelField = createField({ field_definition: { label: '结构标题', field_type: '标签' } });
  const logField = createField({ is_log_row: 1, field_definition: null });
  const styledLabelField = createField({
    bg_color: 'FFEEDD',
    field_definition: { label: '彩色标题', field_type: '标签' },
  });

  assert.equal(getFormFieldStructurePreviewStyle(labelField), 'color:#000000');
  assert.equal(
    getFormFieldStructurePreviewStyle(logField),
    'background:var(--preview-structure-bg);color:#000000',
  );
  assert.equal(getFormFieldStructurePreviewStyle(styledLabelField), 'background:#FFEEDD;color:#000000');
});

test('label bold defaults to true and only label_bold===0 disables it', () => {
  assert.equal(isFormFieldLabelBold(createField()), true);
  assert.equal(isFormFieldLabelBold(createField({ label_bold: 1 })), true);
  assert.equal(isFormFieldLabelBold(createField({ label_bold: null })), true);
  assert.equal(isFormFieldLabelBold(createField({ label_bold: 0 })), false);
});

test('label font size maps档位 to px, default档位无 font-size', () => {
  assert.equal(getFormFieldLabelFontSizeStyle(createField()), '');
  assert.equal(getFormFieldLabelFontSizeStyle(createField({ label_font_size: 'default' })), '');
  assert.equal(getFormFieldLabelFontSizeStyle(createField({ label_font_size: 'large' })), 'font-size:16px;');
  assert.equal(getFormFieldLabelFontSizeStyle(createField({ label_font_size: 'small' })), 'font-size:11px;');
});

test('label preview style combines bold + font-size + color, structure variant included', () => {
  // 默认：加粗、无字号、默认黑字
  assert.equal(getFormFieldLabelPreviewStyle(createField()), 'font-weight:bold;color:#000000');
  // 关闭加粗 + 大字号 + 文字色
  assert.equal(
    getFormFieldLabelPreviewStyle(createField({ label_bold: 0, label_font_size: 'large', text_color: '112233' })),
    'font-weight:normal;font-size:16px;color:#112233',
  );
  // 结构标签（日志行）走 structure 灰底
  assert.equal(
    getFormFieldLabelPreviewStyle(createField({ is_log_row: 1, field_definition: null }), { structure: true }),
    'font-weight:bold;background:var(--preview-structure-bg);color:#000000',
  );
  // 可复用同一 helper 只输出字重/字号/文字色，供保留组件自有底色的表格单元格使用
  assert.equal(
    getFormFieldLabelPreviewStyle(createField({ label_font_size: 'small', bg_color: 'FFEEDD' }), {
      includeBackground: false,
    }),
    'font-weight:bold;font-size:11px;',
  );
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

  assert.equal(getFormFieldPreviewStyle(legacyBgField), 'background:#112233;color:#112233');
  assert.equal(getFormFieldPreviewStyle(legacyTextField), 'background:#112233;color:#112233');
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
  assert.match(formDesignerSource, /<el-form-item label="字段标签">/);
  assert.doesNotMatch(formDesignerSource, /<el-form-item label="变量标签"/);
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
  assert.match(formDesignerSource, /label="默认值\/覆盖"/);
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
  assert.match(mainCssSource, /--preview-structure-bg: #D9D9D9;/);
  assert.match(
    mainCssSource,
    /\.word-page \.wp-inline-header \{ background: var\(--preview-structure-bg\); font-weight: bold; text-align: center; \}/,
  );
  assert.match(mainCssSource, /\.word-page \.wp-label \{ font-weight: bold; background: transparent; \}/);
  assert.match(mainCssSource, /\.word-page \.wp-ctrl \{ font-family: 'SimSun', serif; color: #000;[\s\S]*\}/);
  assert.match(mainCssSource, /\.word-page \.unified-label \{ font-weight: bold; background: transparent; \}/);
  assert.match(mainCssSource, /\.word-page \.unified-value \{ font-family: 'SimSun', serif; color: #000; \}/);
  // 设计器、访视预览、模板预览统一改走标签样式聚合 helper（内部仍复用 structure 灰底逻辑）
  assert.match(formDesignerSource, /getFormFieldLabelPreviewStyle/);
  assert.match(visitsSource, /getFormFieldLabelPreviewStyle/);
  assert.match(templatePreviewSource, /getFormFieldLabelPreviewStyle/);
  // 访视预览不应再残留硬编码的 font-weight:bold 标签样式（应由 label_bold 驱动）
  assert.doesNotMatch(visitsSource, /'font-weight:bold;' \+ getFormFieldStructurePreviewStyle/);
  assert.match(mainCssSource, /#D9D9D9/);
});

test('preview choice labels may wrap inside a single long option without overflowing', () => {
  assert.match(useCRFRendererSource, /'choice-group choice-group--vertical' : 'choice-group'/);
  assert.match(useCRFRendererSource, /class="choice-atom"/);
  assert.match(useCRFRendererSource, /class="choice-label/);
  assert.doesNotMatch(useCRFRendererSource, /class="choice-atom" style="[^"]*white-space:nowrap/);
  assert.match(mainCssSource, /\.word-page \.wp-ctrl \{[\s\S]*word-break: break-word;[\s\S]*\}/);
  assert.match(mainCssSource, /\.word-page \.choice-atom \{[^}]*display: inline-flex;[^}]*max-width: 100%;[^}]*white-space: normal;[^}]*\}/s);
  assert.match(mainCssSource, /\.word-page \.choice-label \{[^}]*overflow-wrap: anywhere;[^}]*\}/s);
});

test('choice marker stays on first line and labels never overflow the cell border', () => {
  // 回归③：marker 顶对齐，标签换行成多行时 ○/□ 留在第一行而非掉到末行
  assert.match(mainCssSource, /\.word-page \.choice-atom \{[^}]*align-items: flex-start;[^}]*\}/s);
  // 回归（溢出）：对齐用 min-width 上限扣除 marker 宽度，避免 marker+label 越过右框线
  assert.match(
    mainCssSource,
    /\.word-page \.choice-label--aligned \{[^}]*min-width: min\(var\(--choice-label-min\), calc\(100% - 1\.25em\)\);[^}]*\}/s,
  )
  // 尾部填写线仍底对齐
  assert.match(mainCssSource, /\.word-page \.choice-atom \.fill-line \{[^}]*align-self: flex-end;[^}]*\}/s);
  // 回归②：横向分隔符为可断空格（非 &nbsp;），配合 choice-group 的 word-spacing 留白
  assert.match(useCRFRendererSource, /const separator = vertical \? '' : ' '/);
  assert.doesNotMatch(useCRFRendererSource, /const separator = vertical \? '<br>' : '&nbsp;&nbsp;'/);
  assert.match(mainCssSource, /\.word-page \.choice-group \{[^}]*word-spacing: 0\.5em;[^}]*\}/s);
});

test('vertical choice options render as spaced block atoms mirroring Word paragraph gap', () => {
  // 纵向：分组带 choice-group--vertical 修饰类，每个选项块级独占一行
  assert.match(useCRFRendererSource, /vertical \? 'choice-group choice-group--vertical' : 'choice-group'/);
  // 块级布局：纵向组 display:block，choice-atom 改为块级 flex
  assert.match(mainCssSource, /\.word-page \.choice-group--vertical \{[^}]*display: block;[^}]*\}/s);
  assert.match(mainCssSource, /\.word-page \.choice-group--vertical \.choice-atom \{[^}]*display: flex;[^}]*\}/s);
  // 选项之间用 margin-top: 3pt 留白，与 Word 导出 VERTICAL_OPTION_GAP_PT=3 同值
  assert.match(
    mainCssSource,
    /\.word-page \.choice-group--vertical \.choice-atom \+ \.choice-atom \{[^}]*margin-top: 3pt;[^}]*\}/s,
  );
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


test('template preview page uses designer A4 geometry for wide inline groups', () => {
  assert.match(templatePreviewSource, /width="95vw"/);
  assert.match(templatePreviewSource, /class="import-preview-dialog"/);
  assert.match(
    templatePreviewSource,
    /\.import-preview-dialog \{[\s\S]*height: 95vh;[\s\S]*max-height: 95vh;/,
  );
  assert.match(
    templatePreviewSource,
    /\.import-preview-dialog \.el-dialog__body \{[\s\S]*overflow: auto;/,
  );
  assert.match(templatePreviewSource, /'designer-scaled-word-page'/);
  assert.match(templatePreviewSource, /landscape: previewLandscapeMode/);
  assert.match(templatePreviewSource, /const previewNeedsLandscape = computed/);
  assert.match(templatePreviewSource, /const previewLandscapeMode = computed/);
  assert.match(templatePreviewSource, /\.preview-left-scroll \{[\s\S]*overflow: auto;/);
  assert.match(
    templatePreviewSource,
    /\.preview-left \.designer-scaled-word-page \{[\s\S]*width: 21cm;[\s\S]*max-width: none;/,
  );
  assert.match(
    templatePreviewSource,
    /\.preview-left \.designer-scaled-word-page\.landscape \{[\s\S]*width: 29\.7cm;/,
  );
});

test('template preview keeps multiline inline default values as multiple rows', () => {
  assert.match(templatePreviewSource, /normalizeDefaultValue\(defaultValue\)\.split\('\\n'\)/);
  assert.doesNotMatch(templatePreviewSource, /normalizeDefaultValue\(defaultValue, true\)\.split\('\\n'\)/);
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
  // 行内预览与模态设计器预览统一使用 A4 缩放几何（form-designer-word-page + designer-scaled-word-page）
  assert.match(formDesignerSource, /'form-designer-word-page'/);
  assert.match(formDesignerSource, /'designer-scaled-word-page'/);
  assert.match(formDesignerSource, /landscape: landscapeMode/);
  assert.match(formDesignerSource, /landscape: designerLandscapeMode/);
  // 行内预览不再使用裸 .word-page（不带 A4 缩放类）的旧绑定
  assert.doesNotMatch(formDesignerSource, /:class="\['word-page', \{ landscape: landscapeMode \}\]"/);
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
