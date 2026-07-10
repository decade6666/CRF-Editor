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

  test('returns ratio ref and startResize', () => {
    assert.match(composableSource, /return \{ ratio, startResize \}/);
  });

  test('reads localStorage on init with clamp', () => {
    assert.match(composableSource, /readStoredRatio\(storageKey, defaultRatio, min, max\)/);
    assert.match(composableSource, /clampRatio/);
  });

  test('writes ratio changes to localStorage with try/catch', () => {
    assert.match(composableSource, /watch\(ratio/);
    assert.match(composableSource, /storage\.setItem\(storageKey/);
    assert.match(composableSource, /catch/);
  });

  test('startResize measures container height and clamps', () => {
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

  test('creates side split with 0.7 default (7:3 property:notes)', () => {
    assert.match(formDesignerSource, /usePaneSplit\('crf:designer:side-split', 0\.7\)/);
  });

  test('creates workspace split with 0.5 default (5:5 fields:preview)', () => {
    assert.match(formDesignerSource, /usePaneSplit\(\s*'crf:designer:workspace-split'/);
    assert.match(formDesignerSource, /0\.5/);
  });

  test('computes sideRows and workspaceRows from ratios', () => {
    assert.match(formDesignerSource, /sideRows = computed\(\(\) =>/);
    assert.match(formDesignerSource, /workspaceRows = computed\(\(\) =>/);
  });

  test('binds gridTemplateRows on designer-workspace', () => {
    assert.match(formDesignerSource, /class="designer-workspace"[\s\S]*?gridTemplateRows: workspaceRows/);
  });

  test('binds gridTemplateRows on designer-side-pane', () => {
    assert.match(formDesignerSource, /class="designer-side-pane"[\s\S]*?gridTemplateRows: sideRows/);
  });

  test('has workspace vertical resizer button', () => {
    assert.match(formDesignerSource, /class="pane-v-resizer"[\s\S]*?startWorkspaceResize/);
  });

  test('has side-pane vertical resizer button', () => {
    assert.match(formDesignerSource, /class="pane-v-resizer"[\s\S]*?startSideResize/);
  });

  test('resizers use <button> for accessibility', () => {
    const matches = formDesignerSource.match(/<button[\s\S]*?class="pane-v-resizer"/g);
    assert.ok(matches && matches.length >= 2, 'expected at least 2 pane-v-resizer buttons');
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
  test('OID form-item appears before 字段标签 form-item in non-log-row branch', () => {
    // In the v-else branch (non-log-row), OID should come first
    const editorSection = formDesignerSource.match(
      /<div v-else class="designer-editor-scroll">([\s\S]*?)<\/el-form>/,
    );
    assert.ok(editorSection, 'designer-editor-scroll section should exist');
    const content = editorSection[1];
    const oidIndex = content.indexOf('label="OID"');
    const labelIndex = content.indexOf('label="字段标签"');
    assert.ok(oidIndex >= 0, 'OID form-item should exist');
    assert.ok(labelIndex >= 0, '字段标签 form-item should exist');
    assert.ok(oidIndex < labelIndex, 'OID should appear before 字段标签');
  });
});

describe('FormDesignerTab R5: aCRF field library two-line layout', () => {
  test('fd-item has aCRF conditional class', () => {
    assert.match(formDesignerSource, /fd-item--acrf.*showAcrfAnnotations/);
  });

  test('aCRF branch wraps content in fd-item-content div', () => {
    assert.match(formDesignerSource, /class="fd-item-content"/);
  });

  test('aCRF branch has fd-item-lines with OID and label rows', () => {
    assert.match(formDesignerSource, /class="fd-item-lines"/);
    assert.match(formDesignerSource, /class="fd-item-oid"/);
    assert.match(formDesignerSource, /class="fd-item-label"/);
  });

  test('aCRF branch has fd-item-type for field type', () => {
    assert.match(formDesignerSource, /class="fd-item-type"/);
  });

  test('non-aCRF branch preserves single-line layout', () => {
    // The v-else template should still have the single-line label + type
    assert.match(
      formDesignerSource,
      /<template v-else>[\s\S]*?fd\.label[\s\S]*?fd\.field_type[\s\S]*?<\/template>/,
    );
  });
});

describe('FormDesignerTab R6: field library tooltips', () => {
  test('aCRF OID line has el-tooltip with variable_name', () => {
    assert.match(formDesignerSource, /el-tooltip[\s\S]*?:content="fd\.variable_name/);
  });

  test('aCRF label line has el-tooltip with fd.label', () => {
    assert.match(formDesignerSource, /el-tooltip[\s\S]*?:content="fd\.label"/);
  });

  test('non-aCRF single line has el-tooltip with fd.label', () => {
    // In the v-else branch
    assert.match(
      formDesignerSource,
      /<template v-else>[\s\S]*?el-tooltip[\s\S]*?:content="fd\.label"/,
    );
  });

  test('tooltips use :show-after="300"', () => {
    const matches = formDesignerSource.match(/:show-after="300"/g);
    assert.ok(matches && matches.length >= 3, 'expected at least 3 tooltip show-after bindings');
  });
});

describe('FormDesignerTab CSS: pane-v-resizer', () => {
  test('pane-v-resizer has row-resize cursor', () => {
    assert.match(formDesignerSource, /\.pane-v-resizer \{[\s\S]*?cursor: row-resize/);
  });

  test('pane-v-resizer has hover highlight', () => {
    assert.match(formDesignerSource, /\.pane-v-resizer:hover \{[\s\S]*?--color-primary-subtle/);
  });
});

describe('FormDesignerTab CSS: min-heights prevent collapse', () => {
  test('designer-notes-card has min-height', () => {
    assert.match(formDesignerSource, /\.designer-notes-card \{[\s\S]*?min-height: 120px/);
  });

  test('designer-workspace-bottom has min-height', () => {
    assert.match(formDesignerSource, /\.designer-workspace-bottom \{[\s\S]*?min-height: 200px/);
  });
});

describe('FormDesignerTab CSS: aCRF field library styles', () => {
  test('fd-item-content is flex with centered alignment', () => {
    assert.match(formDesignerSource, /\.fd-item-content \{[\s\S]*?display: flex/);
    assert.match(formDesignerSource, /\.fd-item-content \{[\s\S]*?align-items: center/);
  });

  test('fd-item-lines is column flex', () => {
    assert.match(formDesignerSource, /\.fd-item-lines \{[\s\S]*?flex-direction: column/);
  });

  test('fd-item-oid and fd-item-label have ellipsis', () => {
    assert.match(formDesignerSource, /\.fd-item-oid \{[\s\S]*?text-overflow: ellipsis/);
    assert.match(formDesignerSource, /\.fd-item-label \{[\s\S]*?text-overflow: ellipsis/);
  });

  test('fd-item-type is flex-shrink 0 and self-centered', () => {
    assert.match(formDesignerSource, /\.fd-item-type \{[\s\S]*?flex-shrink: 0/);
    assert.match(formDesignerSource, /\.fd-item-type \{[\s\S]*?align-self: center/);
  });
});
