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

  test('pane-h-resizer has col-resize cursor and hover highlight', () => {
    assert.match(formDesignerSource, /\.pane-h-resizer \{[\s\S]*?cursor: col-resize/);
    assert.match(formDesignerSource, /\.pane-h-resizer:hover \{[\s\S]*?--color-primary-subtle/);
  });

  test('editor actions bar is fixed below the scrolling form', () => {
    assert.match(formDesignerSource, /\.designer-editor-actions \{[\s\S]*?border-top: 1px solid var\(--color-border\)/);
    assert.match(formDesignerSource, /\.designer-editor-scroll \{[\s\S]*?overflow-y: auto/);
  });

  test('notes card is replaced by the notes dialog entry', () => {
    assert.doesNotMatch(formDesignerSource, /designer-notes-card/);
    assert.match(formDesignerSource, /data-test="designer-notes-button"/);
    assert.match(formDesignerSource, /<DesignNotesDialog[\s\S]*?v-model="showNotesDialog"/);
  });
});
