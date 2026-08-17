import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const composablePath = resolve(import.meta.dirname, '../src/composables/usePaneSplit.js');
const composableSource = readFileSync(composablePath, 'utf8');
const formDesignerPath = resolve(import.meta.dirname, '../src/components/FormDesignerTab.vue');
const formDesignerSource = readFileSync(formDesignerPath, 'utf8');

// ===== usePaneSplit composable 纯行为 =====

describe('usePaneSplit composable', () => {
  test('exports usePaneSplit function', () => {
    assert.match(composableSource, /export function usePaneSplit\(storageKey, defaultRatio/);
  });

  test('accepts min/max options with defaults', () => {
    assert.match(composableSource, /min = 0\.12/);
    assert.match(composableSource, /max = 0\.88/);
  });

  test('supports horizontal axis option', () => {
    assert.match(composableSource, /axis = 'vertical'/);
    assert.match(composableSource, /isHorizontal/);
    assert.match(composableSource, /isHorizontal \? event\.clientX : event\.clientY/);
    assert.match(composableSource, /isHorizontal \? rect\.width : rect\.height/);
  });

  test('returns ratio ref and startResize', () => {
    assert.match(composableSource, /return \{ ratio, startResize \}/);
  });

  test('reads localStorage on init with clamp', () => {
    assert.match(composableSource, /readStoredRatio\(storageKey, defaultRatio, min, max\)/);
    assert.match(composableSource, /clampRatio/);
  });

  test('missing or empty stored value falls back to default, not min', () => {
    // Number(null) === 0 会被当成合法存储值夹取到 min；必须先判空再转换
    assert.match(composableSource, /const raw = storage\.getItem\(storageKey\)/);
    assert.match(composableSource, /if \(raw === null \|\| raw === ''\) return clampRatio\(defaultRatio, min, max\)/);
  });

  test('writes ratio changes to localStorage with try/catch', () => {
    assert.match(composableSource, /watch\(ratio/);
    assert.match(composableSource, /storage\.setItem\(storageKey/);
    assert.match(composableSource, /catch/);
  });

  test('startResize measures container and clamps', () => {
    assert.match(composableSource, /parentElement/);
    assert.match(composableSource, /getBoundingClientRect/);
    assert.match(composableSource, /clampRatio\(startRatio \+/);
  });

  test('sets userSelect none during drag and restores', () => {
    assert.match(composableSource, /userSelect = 'none'/);
    assert.match(composableSource, /userSelect = previousUserSelect/);
  });

  test('clampRatio returns min for non-finite values', () => {
    assert.match(composableSource, /Number\.isFinite\(value\)/);
    assert.match(composableSource, /return min/);
  });

  test('uses window.localStorage not globalThis', () => {
    assert.match(composableSource, /window\.localStorage/);
    assert.doesNotMatch(composableSource, /globalThis/);
  });
});

// ===== FormDesignerTab wiring =====

describe('FormDesignerTab pane split wiring', () => {
  test('imports usePaneSplit', () => {
    assert.match(formDesignerSource, /import \{ usePaneSplit \} from '\.\.\/composables\/usePaneSplit'/);
  });

  test('creates main horizontal split with 0.38 default (38/62 left:preview)', () => {
    assert.match(formDesignerSource, /usePaneSplit\(\s*'crf:designer:main-split'/);
    assert.match(formDesignerSource, /axis: 'horizontal'/);
    assert.match(formDesignerSource, /0\.38/);
  });

  test('creates left vertical split with 0.5 default (5:5 fields:properties)', () => {
    assert.match(formDesignerSource, /usePaneSplit\(\s*'crf:designer:left-split'/);
    assert.match(formDesignerSource, /0\.5/);
  });

  test('exposes split ratios as CSS variables on designer-shell', () => {
    assert.match(formDesignerSource, /--main-first/);
    assert.match(formDesignerSource, /--main-second/);
    assert.match(formDesignerSource, /--left-first/);
    assert.match(formDesignerSource, /--left-second/);
    assert.match(
      formDesignerSource,
      /class="designer-shell"[\s\S]*?\{ \.\.\.mainSplitStyle, \.\.\.leftSplitStyle \}/,
    );
  });

  test('has left vertical resizer bound to startLeftSplitResize', () => {
    assert.match(formDesignerSource, /class="pane-v-resizer designer-left-resizer"[\s\S]*?startLeftSplitResize/);
  });

  test('has main horizontal resizer bound to startMainSplitResize', () => {
    assert.match(formDesignerSource, /class="pane-h-resizer"[\s\S]*?startMainSplitResize/);
  });

  test('resizers use <button> for accessibility', () => {
    assert.match(formDesignerSource, /<button[\s\S]*?class="pane-v-resizer/);
    assert.match(formDesignerSource, /<button[\s\S]*?class="pane-h-resizer"/);
  });

  test('field library pane and its width controls are removed', () => {
    assert.doesNotMatch(formDesignerSource, /designer-library-pane/);
    assert.doesNotMatch(formDesignerSource, /fd-panel-resizer/);
    assert.doesNotMatch(formDesignerSource, /crf_libraryWidth/);
  });
});

describe('FormDesignerTab R3: checkbox value binding', () => {
  test('uses :value instead of :label for ff.id', () => {
    assert.match(formDesignerSource, /:value="ff\.id"/);
    assert.doesNotMatch(formDesignerSource, /:label="ff\.id"/);
  });

  test('checkbox has empty span slot to prevent label rendering', () => {
    assert.match(formDesignerSource, /:value="ff\.id"[\s\S]*?><span><\/span><\/el-checkbox/);
  });

  test('preserves _displayOrder ordinal cell', () => {
    assert.match(formDesignerSource, /class="ordinal-cell"[\s\S]*?ff\._displayOrder/);
  });
});

describe('FormDesignerTab R2: OID before label in property editor', () => {
  test('OID autocomplete appears before 字段标签 form-item in non-log-row branch', () => {
    const editorSection = formDesignerSource.match(
      /data-test="designer-field-property-form"([\s\S]*?)<\/el-form>/,
    );
    assert.ok(editorSection, 'designer-editor-scroll section should exist');
    const content = editorSection[1];
    const oidIndex = content.indexOf('label="OID"');
    const labelIndex = content.indexOf('label="字段标签"');
    assert.ok(oidIndex >= 0, 'OID form-item should exist');
    assert.ok(labelIndex >= 0, '字段标签 form-item should exist');
    assert.ok(oidIndex < labelIndex, 'OID should appear before 字段标签');
  });

  test('OID input is an el-autocomplete with trigger-on-focus=false', () => {
    assert.match(
      formDesignerSource,
      /data-test="designer-field-oid-autocomplete"[\s\S]*?fetch-suggestions="fetchFieldDefSuggestions"[\s\S]*?:trigger-on-focus="false"/,
    );
  });

  test('字段标签 input is an el-autocomplete except for 标签 textarea branch', () => {
    assert.match(
      formDesignerSource,
      /<el-autocomplete[\s\S]*?:fetch-suggestions="fetchFieldDefSuggestions"[\s\S]*?data-test="designer-field-label-autocomplete"/,
    );
    assert.match(formDesignerSource, /:trigger-on-focus="false"/);
    assert.match(
      formDesignerSource,
      /v-if="editProp\.field_type === '标签'"[\s\S]*?type="textarea"/,
    );
  });
});

describe('FormDesignerTab R5: autocomplete candidates replace field library', () => {
  test('candidate item shows OID, label, type and states', () => {
    assert.match(formDesignerSource, /class="fd-autocomplete-oid"/);
    assert.match(formDesignerSource, /class="fd-autocomplete-label"/);
    assert.match(formDesignerSource, /class="fd-autocomplete-type"/);
    assert.match(formDesignerSource, /class="fd-autocomplete-state"/);
  });

  test('added candidates are marked aria-disabled', () => {
    assert.match(formDesignerSource, /:aria-disabled="item\.state === CANDIDATE_STATE_ADDED"/);
  });

  test('candidate selection discards edits via selectAutocompleteCandidate', () => {
    assert.match(formDesignerSource, /@select="selectAutocompleteCandidate"/);
  });

  test('old field library UI is removed', () => {
    assert.doesNotMatch(formDesignerSource, /fd-library/);
    assert.doesNotMatch(formDesignerSource, /filteredFieldDefs/);
    assert.doesNotMatch(formDesignerSource, /designer-field-library-add/);
  });

  test('tooltips use :show-after="300"', () => {
    const matches = formDesignerSource.match(/:show-after="300"/g);
    assert.ok(matches && matches.length >= 3, 'expected at least 3 tooltip show-after bindings');
  });
});

describe('FormDesignerTab CSS: two-pane layout', () => {
  test('designer-shell is a grid with main/left split variables and grid areas', () => {
    assert.match(formDesignerSource, /\.designer-shell \{[\s\S]*?display: grid/);
    assert.match(formDesignerSource, /\.designer-shell \{[\s\S]*?var\(--main-first/);
    assert.match(formDesignerSource, /\.designer-shell \{[\s\S]*?var\(--left-first/);
    assert.match(formDesignerSource, /grid-template-areas/);
  });

  test('grid areas place fields/editor left and preview right', () => {
    assert.match(formDesignerSource, /'fields hresizer preview'/);
    assert.match(formDesignerSource, /'lresizer hresizer preview'/);
    assert.match(formDesignerSource, /'editor hresizer preview'/);
    assert.match(formDesignerSource, /\.designer-fields-panel \{[\s\S]*?grid-area: fields/);
    assert.match(formDesignerSource, /\.designer-editor-card \{[\s\S]*?grid-area: editor/);
    assert.match(formDesignerSource, /\.designer-preview-pane \{[\s\S]*?grid-area: preview/);
  });

  test('narrow screens stack vertically and hide horizontal resizer', () => {
    assert.match(formDesignerSource, /@media \(max-width: 1100px\)/);
    assert.match(formDesignerSource, /\.pane-h-resizer \{\s*display: none/);
  });

  test('pane-v-resizer has row-resize cursor', () => {
    assert.match(formDesignerSource, /\.pane-v-resizer \{[\s\S]*?cursor: row-resize/);
  });

  // 取最后一个匹配块：grid-area 简写规则在前，完整卡片规则在后
  function ruleBlock(source, selector) {
    const start = source.lastIndexOf(selector + ' {');
    if (start === -1) return '';
    const open = source.indexOf('{', start);
    const close = source.indexOf('}', open);
    return source.slice(open, close);
  }

  // 宽屏主样式 = 完整 scoped 样式剔除全部 ≤1100px 媒体块（卡片规则位于媒体块之后）
  const mediaBlocks = [...formDesignerSource.matchAll(/@media \(max-width: 1100px\) \{([\s\S]*?)\n\}/g)].map((m) => m[0]);
  const mediaSource = mediaBlocks.join('\n');
  const wideSource = mediaBlocks.reduce((acc, block) => acc.replace(block, ''), formDesignerSource);

  test('three panes only keep outer borders; inner edges rely on the resizer line', () => {
    // 字段面板仅保留外缘（上、左），面向 resizer 的右/下边框移除
    const fieldsRule = ruleBlock(wideSource, '.designer-fields-panel');
    assert.match(fieldsRule, /border-top: 1px solid var\(--color-border\)/);
    assert.match(fieldsRule, /border-left: 1px solid var\(--color-border\)/);
    assert.doesNotMatch(fieldsRule, /border-right/);
    assert.doesNotMatch(fieldsRule, /border-bottom/);
    // 属性编辑卡片：仅保留外缘（左、下），面向 resizer 的上/右边框移除
    const editorRule = ruleBlock(wideSource, '.designer-editor-card');
    assert.match(editorRule, /border-left: 1px solid var\(--color-border\)/);
    assert.match(editorRule, /border-bottom: 1px solid var\(--color-border\)/);
    assert.doesNotMatch(editorRule, /border-top/);
    assert.doesNotMatch(editorRule, /border-right/);
    // 预览面板：仅保留外缘（上、右、下），面向 resizer 的左边框移除
    const previewRule = ruleBlock(wideSource, '.designer-preview-pane');
    assert.match(previewRule, /border-top: 1px solid var\(--color-border\)/);
    assert.match(previewRule, /border-right: 1px solid var\(--color-border\)/);
    assert.match(previewRule, /border-bottom: 1px solid var\(--color-border\)/);
    assert.doesNotMatch(previewRule, /border-left/);
  });

  test('panes carry no box-shadow and round only their outer corners (single visual divider)', () => {
    // 阴影光晕 + 内缘圆角会让相邻面板看起来有第二条线
    for (const ruleName of ['.designer-fields-panel', '.designer-editor-card', '.designer-preview-pane']) {
      assert.doesNotMatch(ruleBlock(wideSource, ruleName), /box-shadow/);
    }
    assert.match(ruleBlock(wideSource, '.designer-fields-panel'), /border-radius: var\(--radius-md\) 0 0 0/);
    assert.match(ruleBlock(wideSource, '.designer-editor-card'), /border-radius: 0 0 0 var\(--radius-md\)/);
    assert.match(ruleBlock(wideSource, '.designer-preview-pane'), /border-radius: 0 var\(--radius-md\) var\(--radius-md\) 0/);
    // 堆叠整列布局下无圆角需求
    assert.match(mediaSource, /\.designer-fields-panel,\s*\n\s*\.designer-editor-card,\s*\n\s*\.designer-preview-pane \{\s*\n\s*border-radius: 0/);
  });

  test('resizer strips draw the single 1px divider via ::before pseudo element', () => {
    assert.match(ruleBlock(wideSource, '.pane-h-resizer'), /position: relative/);
    assert.match(ruleBlock(wideSource, '.pane-v-resizer'), /position: relative/);
    const vLine = ruleBlock(wideSource, '.pane-v-resizer::before');
    const hLine = ruleBlock(wideSource, '.pane-h-resizer::before');
    assert.match(vLine, /content: ''/);
    assert.match(vLine, /height: 1px/);
    assert.match(vLine, /var\(--color-border\)/);
    assert.match(hLine, /content: ''/);
    assert.match(hLine, /width: 1px/);
    assert.match(hLine, /var\(--color-border\)/);
  });

  test('narrow stacked layout restores outer edges that become visible page edges', () => {
    // 堆叠时 fields 右侧 / editor 右侧 / preview 左侧都变成页面外缘 → 恢复边框
    assert.match(mediaSource, /\.designer-fields-panel \{[\s\S]*?border-right: 1px solid var\(--color-border\)/);
    assert.match(mediaSource, /\.designer-editor-card \{[\s\S]*?border-right: 1px solid var\(--color-border\)/);
    assert.match(mediaSource, /\.designer-preview-pane \{[\s\S]*?border-left: 1px solid var\(--color-border\)/);
    // preview 顶部与 editor 底边相邻 → 去掉自身顶边框，避免双线（独立媒体块，位于基础规则之后）
    assert.match(mediaSource, /\.designer-preview-pane \{[\s\S]*?border-top: none/);
  });

  test('stacked preview border-top override must come after the base preview rule (cascade order)', () => {
    // 同特异性下后声明者胜：border-top: none 若位于 .designer-preview-pane 基础规则之前会被其 1px 边框覆盖 → 双线
    const noneIdx = formDesignerSource.indexOf('border-top: none');
    const baseRuleStart = formDesignerSource.lastIndexOf('.designer-preview-pane {');
    assert.ok(noneIdx > baseRuleStart, `border-top: none (${noneIdx}) should appear after base rule (${baseRuleStart})`);
  });

  test('pane-h-resizer has col-resize cursor and hover highlight', () => {
    assert.match(formDesignerSource, /\.pane-h-resizer \{[\s\S]*?cursor: col-resize/);
    assert.match(formDesignerSource, /\.pane-h-resizer:hover \{[\s\S]*?--color-primary-subtle/);
  });

  test('editor actions bar is fixed below the scrolling form without a separator line', () => {
    const actionsRule = formDesignerSource.match(/\.designer-editor-actions \{([\s\S]*?)\}/)?.[1] || '';
    assert.doesNotMatch(actionsRule, /border-top/);
    assert.match(actionsRule, /flex-shrink:\s*0/);
    assert.match(formDesignerSource, /\.designer-editor-scroll \{[\s\S]*?overflow-y: auto/);
    // 全屏弹窗 body 底部留白：属性卡底边不被窗口边缘裁切
    assert.match(formDesignerSource, /\.designer-dialog \.el-dialog__body \{[\s\S]*?padding: 0 0 12px[\s\S]*?box-sizing: border-box/);
  });

  test('notes card is replaced by the notes dialog entry', () => {
    assert.doesNotMatch(formDesignerSource, /designer-notes-card/);
    assert.match(formDesignerSource, /data-test="designer-notes-button"/);
    assert.match(formDesignerSource, /<DesignNotesDialog[\s\S]*?v-model="showNotesDialog"/);
  });
});
