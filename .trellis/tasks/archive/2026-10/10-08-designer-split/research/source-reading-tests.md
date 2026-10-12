# Research: tests that read FormDesignerTab.vue as source

- **Query**: Inventory the frontend tests that read `FormDesignerTab.vue` as text, identify which assertions target the regions moving to `DesignerWordPreview.vue` / the aCRF annotation component / preview CSS, and decide the per-file strategy (R6). Also assess the vitest mount infrastructure and the R2 (shared codelist dialog) delivery status.
- **Scope**: internal (frontend tests + components + archived task docs)
- **Date**: 2026-10-10
- **Snapshot**: `/tmp/designer-split-analysis/frontend/` (identical to `main` @ c40cb09). All line numbers below are against that snapshot.

---

## 0. Region map (FormDesignerTab.vue, 5985 lines)

| Region | Lines | Notes |
|---|---|---|
| Main-canvas preview block (`<div class="word-preview">` … ) | **3197–3799** | inside `.fd-canvas` (3196–3800); the surrounding `.fd-right` toolbar (3164–3195) **stays in the parent** |
| Fullscreen-dialog preview block (`<div class="designer-preview-pane">` … ) | **4020–4722** | inside the fullscreen `el-dialog`; header block (3802–3860) and editor card (4729+) **stay** |
| aCRF annotation markup | within both blocks: form overlay 3206–3230 / 4037–4062; field overlays 3274–3740 / 4116–4667 | `wp-acrf-annotation*`, `wp-acrf-annotation-reset`, `wp-acrf-annotation__text` |
| Preview / annotation / table-resize scoped CSS | **5625–5629** (grouped `min-height:0`), **5786–5985** (`.designer-preview-pane`, `-viewport`, `-stage`, `-page`, `.designer-scaled-word-page[.landscape]`, `.wp-form-title-row`, `.wp-acrf-annotation*`, `.col-resize-host`, `.resizer-handle`, `.snap-guide`, `.unified-table-host`, media 5980–5984) | also referenced from the narrow-screen media block 5517–5547 (`.designer-preview-pane` grouped rule at 5533–5546) |
| Scoped CSS that **stays** | `.fd-*`, `.designer-shell/fields-panel/editor-card/dialog-*`, `.pane-*-resizer`, `.fd-autocomplete-*`, `.choice-codelist-*`, `.ff-*`, `.color-*` (5333–5785) | not preview/annotation |
| Script region | 1–3087 | never moves (R5) |

Preview-block boundary evidence: 3197 `<div class="word-preview">`, 3199/4029 `'designer-scaled-word-page'`, 3203/4035 `class="wp-form-title-row"`, 3208/4040 `'wp-acrf-annotation'`, 4020 `class="designer-preview-pane"`, 4022 `class="designer-preview-viewport"`, 4023 `class="designer-preview-stage"`, 4024 `class="designer-preview-page"`.

---

## 1. Inventory — files that read FormDesignerTab.vue

`grep -rlF "FormDesignerTab.vue" tests/` → **27 files**. Three further files mention the bare string `FormDesignerTab` without reading the `.vue` path: `tests/component/CodelistQuickEditDialog.spec.js` (comment), `tests/component/DesignNotesDialog.spec.js` (comment), `tests/previewCellRender.test.js` (golden-ref comments) — **not affected**.

All 27 load the source with a local `readFileSync(...)` (there is **no shared read helper module** — see §2). Common var names: `formDesignerSource`, `formsSource`, `designerSource`, `source`, `src`.

Legend for the affected table: **A** = assertion targets a moving region; **O/P** = also order- or proximity-sensitive.

### 1a. Files WITH affected assertions (7 files, ~70 assertions)

#### `tests/acrfViewToggle.test.js` (reads via `formDesignerSource`, line 12) — A: ~20, O/P: 3
| Test line | Pattern (abbrev.) | Matched FDT lines |
|---|---|---|
| 200 | `countMatches(/'wp-acrf-annotation--form'/g) === 2` | 3209, 4041 |
| 204 | `countMatches(/class="wp-form-title-row"/g) === 2` | 3203, 4035 |
| 207 | `<div class="wp-form-title-row"> … selectedForm.name … getAnnotationStyle( … ANNOTATION_KIND_FORM` | 3203, 4035 |
| 211 | `class="unified-value row-resize-anchor" … showAcrfAnnotations … ANNOTATION_KIND_FIELD` | 3274, 4116 |
| 215 | `class="wp-inline-header row-resize-anchor" … ANNOTATION_KIND_INLINE_HEADER` | 3394, 3703, 4255, 4598 |
| 217–224 | `assert.doesNotMatch(...)` inlineRows-vs-annotation (2) | — |
| 275–303 | `extractRuleBody(fd, '.wp-acrf-annotation')` + `--interactive` + `.wp-form-title-row` + `.wp-acrf-annotation-reset`; `onAnnotationPointerDown`/`resetAnnotationPosition`/`class="wp-acrf-annotation-reset"` | CSS 5842/5875/5831/5878; markup 3224…; script 1549/1554 |
| 340–365 | `extractRuleBodyByPattern` for the three `wp-acrf-annotation-reset` disabled/reveal rules | CSS 5908–5921 |
| 305–310 | `extractFunction('getResizer'/'getRowResizer')` | script 1626 — **stays** |

#### `tests/formDesignerPreviewModel.test.js` (reads line 14) — A: 9, O/P: 2
| Line | Pattern | Matched FDT |
|---|---|---|
| 209/213 | `const renderGroupsView = computed(... buildPreviewGroupViewModels(renderGroups.value ...))` | script 1388 / 1489 — **stays** |
| 216 | `v-for="(gv, gi) in renderGroupsView"` | **3237** (main block) |
| 217 | `v-for="(gv, gi) in designerRenderGroupsView"` | **4075** (fullscreen block) |
| 219–225 | `v-for="seg in gv.segments"`, `:colspan="seg.mergeSpans[idx|ci]"`, `:colspan="gv.labelValueSpans.labelSpan|valueSpan"`, `v-for="(row, ri) in seg.inlineRows|gv.inlineRows"` | all inside **3197–3799 / 4020–4722** |

#### `tests/formFieldPresentation.test.js` (reads line 24) — A: ~18, O/P: 1
| Line | Pattern | Matched FDT |
|---|---|---|
| 310 | `/form-designer-word-page/` | 3199, 4028 |
| 398 | `class="wp-ctrl row-resize-anchor"` | 3459, 3624, 3758, 4324, 4506, 4661 |
| 409 | `wp-structure-label--multiline` | 3333, 3518, 4184, 4390 |
| 418/419 | `renderGroups.value.some(...)` / `designerRenderGroups.value.some(...)` | script 1356/1357, 1564/1567 — **stays** |
| 421 | `class="designer-preview-pane"` | 4020 |
| 423 | `assert.doesNotMatch(/designer-side-pane[\s\S]*designer-preview-pane/)` | proximity across two classes |
| 428 | `.designer-preview-pane { … grid-area: preview;` | CSS 5786 |
| 434 | `<span>实时预览</span>` | 4021 |
| 435 | `<div class="wp-form-title">{{ selectedForm.name }}</div>` | 3204, 4036 |
| 441/442/445 | `.designer-preview-viewport/-stage/-page { … }` | CSS 5799/5806/5811 |
| 449–454 | `.designer-scaled-word-page {…}` / `.landscape {…}` `match` + doesNotMatch `width:100%` | CSS 5818/5827 |
| 530/531/533 | `'form-designer-word-page'`, `'designer-scaled-word-page'`, `landscape: designerLandscapeMode` | 3199/4028/4029/4030 |
| 535 | `assert.doesNotMatch(/:class="\['word-page', { landscape: landscapeMode }\]"/)` | negative — stays valid |

#### `tests/orderingStructure.test.js` (reads line 12) — A: 5
| Line | Pattern | Matched FDT |
|---|---|---|
| 317 | `doesNotMatch(/class="fd-canvas designer-fields-panel"/)` | **stays** |
| 320 | `class="designer-preview-pane"` | 4020 |
| 393 | `function getResizer(kind, colCount, groupIndex, group, scope = 'main')` | script 1626 — **stays** |
| 397–400 | `getResizer('normal'\|'inline', …, 'main'\|'designer')` | main 3503/3689…; designer 4375/4581… |

#### `tests/paneSplit.test.js` (reads line 9) — A: ~10, O/P: 4
| Line | Pattern | Matched FDT |
|---|---|---|
| 213 | `.designer-preview-pane { … grid-area: preview` | CSS 5786 |
| 241–243 | extracts **all** `@media (max-width: 1100px)` blocks and reduces `formDesignerSource` → `wideSource` | CSS 5517, 5980 |
| 247, 249–255 | `.fd-canvas designer-fields-panel` neg; `.designer-fields-panel` rule | **stays** |
| 271–275 | `ruleBlock(wideSource, '.designer-preview-pane')` borders | CSS 5786 |
| 285 | `.designer-preview-pane` border-radius | CSS 5786 |
| 305/307/309 | `mediaSource` `.designer-preview-pane` border-left / border-top:none | CSS 5533–5546, 5980 |
| 312–317 | `lastIndexOf('.designer-preview-pane {')` vs `indexOf('border-top: none')` | CSS 5786 vs 5980 |
| 290–301, 319–330 | resizer / editor-actions rules | **stay** |

#### `tests/quickEditBehavior.test.js` (reads line 8) — A: 4, O/P: 1
| Line | Pattern | Matched FDT |
|---|---|---|
| 17 | `class="designer-preview-pane"` | 4020 |
| 18 | `doesNotMatch(/designer-side-pane[\s\S]*designer-preview-pane/)` | proximity |
| 20 | `@dblclick="openQuickEdit(ff)"` | 3329, 3397…, 4180, 4258… |
| 21 | `@dblclick="openQuickEdit(seg.fields[ci])"` alt | 3462, 4327… |
| 75–76 | `refreshDesignerPreviewOverrides` / `refreshPreviewOverrideState(renderGroupsView…)` | script 1676/1688 — **stays** |
| 88–90 | `.choice-codelist-row/-select/-actions` | script/template 4874 — **stays** |

#### `tests/rowHeightResize.test.js` (reads via `previewComponents` list, line 185) — A: 4 (×2 loop)
| Line | Pattern | Matched FDT |
|---|---|---|
| 207 | `class="wp-label row-resize-anchor"` | 3617, 4497 |
| 208 | `class="unified-label row-resize-anchor"` | 3257, 4099 |
| 211–214 | `doesNotMatch` the four "last-column only" guards | negative — stays valid |
| 188–198 | `main.css` hover guideline | `main.css` — **not affected** |

### 1b. Files with ZERO affected assertions (20 files)

`checkboxFieldType.test.js`, `columnWidthPlanning.test.js`, `dateTimeHourFormat.test.js`, `dbTypeFieldTypeWiring.test.js`, `designerFieldCopy.test.js`, `designerHistory.test.js`, `designerLabelOid.test.js`, `designerNewFieldDraft.test.js`, `editModeHiddenIdentifiers.test.js`, `fieldDefinitionAutocomplete.test.js`, `formDesignerAuxiliaryData.test.js`, `formDesignerFormPropertyEditor.test.js`, `formDesignerPropertyEditor.runtime.test.js`, `listActionsIconify.test.js`, `ordinalQuickEditWiring.test.js`, `projectDeleteConfirmation.test.js`, `referenceDeleteWiring.test.js`, `searchRankingWiring.test.js`, `templateFieldSearch.test.js`, `toolbarPaneAlignment.test.js`.

Notes on the non-obvious ones:
- `listActionsIconify.test.js:33–38` slices between `class="fd-formlist"` (3090) and the next `openDesigner` — the **outer** toolbar region, which stays.
- `formDesignerFormPropertyEditor.test.js:188,208` target `.fd-canvas-list` / `DESIGNER_BLANK_EXCLUDE_SELECTOR` (script 720–739) — stays.
- `templateFieldSearch.test.js:610–620` `assertInOrder` targets the **fullscreen header** (3802–3860), not the preview block (4020+) — stays.
- `columnWidthPlanning.test.js:226,1103–1104` assert `renderFallback: renderCtrlTextHtml,` (script 1370) and `migrateLegacyColumnWidthKey(` (1633) — stays; its `.resizer-handle`/`.col-resize-host` hits (424/439) are a JS harness stub, not source reads.
- `previewCellRender.test.js` mentions FormDesignerTab only in comments; it imports `previewCellRender.js` — zero coupling.

---

## 2. Existing shared test helpers

There is **no `tests/helpers/` module**. Every file re-declares its own helper. The helpers that matter for this task:

| Helper | Declared in (re-declared per file) | Purpose |
|---|---|---|
| `extractRuleBody(css, selector)` | `acrfViewToggle.test.js:58`; `formFieldPresentation.test.js`; `wordPageGeometry.test.js`; `tableHeaderStyle.test.js`; `formDesignerPropertyEditor.runtime.test.js`; others | `css.match(new RegExp(selector + '\\s*\\{([^}]*)\\}'))` — **first** match |
| `extractRuleBodyByPattern(css, regex, desc)` | `acrfViewToggle.test.js:64` | first `regex` match body |
| `ruleBlock(source, selector)` | `paneSplit.test.js:232` | `source.lastIndexOf(selector + ' {')` → **last** match |
| `extractFunction(name, source)` / `compileFunction` | `acrfViewToggle.test.js:20/50`; `designerLabelOid.test.js:24`; `formDesignerFormPropertyEditor.test.js:12`; `orderingStructure.test.js:17`; `referenceDeleteWiring.test.js:25`; `designerHistory.test.js:53`; `designerFieldCopy.test.js:15` | brace-depth slice of a script function |
| `functionBody` / `fnBody` | `formDesignerPropertyEditor.runtime.test.js:44`; `designerNewFieldDraft.test.js:10`; `designerFieldCopy.test.js:15` | regex/brace slice |
| `countMatches(source, pattern)` | `acrfViewToggle.test.js:16`; `formFieldPresentation.test.js:39`; `ordinalQuickEditWiring.test.js:14` | `[...source.matchAll(p)].length` |
| `assertInOrder(source, regexes)` | `templateFieldSearch.test.js:27` | cursor scan — order-sensitive |
| `scopedSource(file)` | `listActionsIconify.test.js:31` | slice between two anchors for the outer toolbar |
| `mediaBlocks` reduction | `paneSplit.test.js:241–243` | strips all `@media (max-width:1100px)` blocks |

**Implication**: a fix must either (a) re-point each file's own path variable, or (b) introduce one shared helper (e.g. `tests/helpers/designerSource.js`) that concatenates `FormDesignerTab.vue` + `DesignerWordPreview.vue` + the annotation component and export it — but 27 files each re-declare their reader, so a shared helper is a new module all of them must opt into.

---

## 3. Strategy per affected file

Recommended default for the 7 affected files: **(a) re-point the assertion to the new file**, because the child components own the moved markup/CSS verbatim; add **(c) vitest mount tests** only for the guarantees that become meaningless once the text is split (the "rendered twice" and per-mode prop contract). A shared helper (b) is **not** recommended as the primary fix: it keeps giant source-text tests alive and cannot express "rendered twice with different props".

| File | Recommendation | Notes |
|---|---|---|
| `acrfViewToggle.test.js` | **(a)+(c)** | Re-point the annotation-markup + annotation-CSS asserts (200–224, 275–303, 340–365) to the new `AcrfAnnotation*.vue` / `DesignerWordPreview.vue`. The two `countMatches === 2` (200, 204) **become meaningless** — see §3b. |
| `formDesignerPreviewModel.test.js` | **(a)** | 216/217/219–225 re-point to `DesignerWordPreview.vue` (the two `v-for`s now sit in one child). 209/213 stay in the parent. |
| `formFieldPresentation.test.js` | **(a)** | 310/398/409/421/434/435/530/531/533/535 → child template; 428/441/442/445/449–454 → child scoped CSS. 418/419 stay. Drop 423 (see §3b). |
| `orderingStructure.test.js` | **(a)** | 320 + 397–400 → child. 317/393 stay. |
| `paneSplit.test.js` | **(a)** | 213/271–275/285/305–309/315 → child CSS. 241–243's `wideSource` reduction and 290–330 stay in the parent. **The lastIndexOf/indexOf cascade assert (312–317) must be re-evaluated** — after extraction the `.designer-preview-pane` base rule and its `border-top:none` override may live in different files (see §3b). |
| `quickEditBehavior.test.js` | **(a)+(c)** | 17/20/21 → child. Drop 18 (see §3b). 75–90 stay. |
| `rowHeightResize.test.js` | **(a)** | 207/208 → child; the `previewComponents` list (185) gains the new component path. |

### 3b. Assertions that become meaningless after extraction, and their replacement guarantee

| Becomes meaningless | Why | Equivalent guarantee |
|---|---|---|
| `acrfViewToggle.test.js:200` `countMatches(/'wp-acrf-annotation--form'/g) === 2` ("appears once per word-page template") | only **one** template remains in the child (rendered twice) | mount the parent and assert it renders `<DesignerWordPreview` **twice** (main + fullscreen) with the expected `mode`/`landscape`/`viewMode` props; separately assert the child template contains `'wp-acrf-annotation--form'` **once** |
| `acrfViewToggle.test.js:204` `countMatches(/class="wp-form-title-row"/g) === 2` | same | as above |
| `formDesignerPreviewModel.test.js:216/217` (`renderGroupsView` vs `designerRenderGroupsView` both present) | both `v-for`s collapse into one child template | parent renders the child twice with the two view-model props; child asserts the two `v-for` sources |
| `formFieldPresentation.test.js:423` and `quickEditBehavior.test.js:18` `doesNotMatch(/designer-side-pane[\s\S]*designer-preview-pane/)` | the two class names no longer co-exist in one file, so the proximity `doesNotMatch` is trivially true | assert the parent does not render a `designer-side-pane` wrapper around the child (mount test) |
| `paneSplit.test.js:312–317` (order of `.designer-preview-pane {` vs `border-top: none`) | the base rule and the media override may be split across files | keep the two rules **together in the child's scoped CSS** and re-point the assert; or drop the cascade assert if both rules are moved verbatim |

### 3c. Order/proximity-sensitive assertions (break even if the text survives in a concatenated bundle)

Count: **~12** across 5 files:
- `acrfViewToggle.test.js`: 200, 204 (cross-block counts); 340–365 `extractRuleBodyByPattern` (needs the rule inside the file it reads).
- `paneSplit.test.js`: 241–243 (`wideSource` reduction assumes the rules are in the same file), 271–275 / 285 (`ruleBlock` uses `lastIndexOf`), 305–309 (`mediaSource`), **312–317** (explicit order across two anchors).
- `quickEditBehavior.test.js:18` and `formFieldPresentation.test.js:423` (proximity `doesNotMatch`).
- `formDesignerPreviewModel.test.js:216/217` (implicit "both templates present" count).

A concatenated-bundle helper (option b) would fix the presence asserts but **not** these — they need re-pointing (a) or a mount test (c).

---

## 4. Vitest mount infrastructure

### 4a. What exists

- `frontend/vitest.config.js`: `defineConfig` from `vitest/config`; `plugins: [vue()]` only; `environment: 'happy-dom'`; `include: ['tests/component/**/*.spec.js']`; `setupFiles: ['tests/component/setup.js']`. It does **not** inherit `vite.config.js` and defines **no `@` alias**.
- `tests/component/setup.js`:
  - `config.global.plugins = [[ElementPlus, { locale: zhCn }]]` (same specifiers as `src/main.js`; **no Element Plus CSS** — vitest turns CSS into empty modules, so no layout in happy-dom).
  - `config.global.config.warnHandler = collectVueWarning`.
  - `afterEach` order (registered → reverse execution): gate `assertNoVueWarnings` → restore (`useRealTimers`, `restoreAllMocks`, `localStorage.clear`, reset `document.body`) → `enableAutoUnmount(afterEach)`. Effective order: unmount → restore → gate.
  - `beforeEach`: `resetVueWarnings()`, `spyConsoleVueWarnings()`, and no-op `vi.spyOn(ElMessage, 'success'|'error'|'warning'|'info')`.
- `tests/component/vueWarnGate.js`: two-channel collection — app-level `warnHandler` **and** a `console.warn` spy for `[Vue warn]`-prefixed messages. **Any Vue warning (including during unmount) fails the test.** Self-tested by `vueWarnGate.spec.js`.
- Existing specs: `CodelistQuickEditDialog.spec.js` (23 cases incl. 3 race cases), `DesignNotesDialog.spec.js` (4), `SessionTimer.spec.js`, `elementPlusEnvironment.spec.js` (el-table/el-select/el-tooltip smoke, **no polyfills needed**), `vueWarnGate.spec.js`.
- `package.json`: `"test": "node --test tests/*.test.js && vitest run"`, `"test:component": "vitest run"`; pinned `vitest@5.0.3`, `@vue/test-utils@2.5.1`, `happy-dom@20.14.5`.

### 4b. `useApi` / Element Plus handling in mount tests

- `useApi`: spy on the **real exported `api` object** — `import { api } from '../../src/composables/useApi.js'; vi.spyOn(api, 'put')`. Do **not** `vi.mock` the module (spying an ESM namespace export fails). Install spies **before** `mount()` (composables can capture `api.*` at setup time). `CodelistQuickEditDialog.spec.js:71` is the worked example.
- Element Plus: globally registered; components resolve as `el-*`. `ElMessageBox.confirm` is **not** globally stubbed — specs call `vi.spyOn(ElMessageBox, 'confirm')` themselves.
- Teleport: do **not** stub (`stubs:{teleport:true}` renders empty in VTU 2.5); let real teleport run and query via `new DOMWrapper(document.body)` (`DesignNotesDialog.spec.js:18`).
- Slots: prefer template-compiled slots (SFC or `template:` strings) over `h()` render-function slots — el-select reads its default slot outside render and warns otherwise.

### 4c. What a new `DesignerWordPreview.spec.js` / annotation spec needs

- **Props fixtures**: build from `formDesignerPreviewModel.js` (`buildGroupViewModel` / `buildPreviewGroupViewModels` take a `helpers` object with `buildSegments`/`getInlineRows`/`computeMergeSpans`/`computeLabelValueSpans`/`getInlineFillChars`) and from `formFieldPresentation.js` (`buildFormDesignerUnifiedSegments`, `getFormFieldLabelPreviewStyle`, `getFormFieldPreviewStyle`). `previewCellRender.test.js` already carries a reusable fixture set (`textDef`, `choiceDef`, `dateDef`, `unifiedFields`, …) that can be lifted.
- **Stubs**: none required for Element Plus (globally registered). The child must be given the annotation-drag surface as props/handlers (or a stub) so it mounts without the parent's `useAcrfAnnotationDrag` state — otherwise the drag composable would need `api`/localStorage spies.
- **Vue-warning gate implications**: any warning fails the test. el-select/el-table/el-tooltip mount warning-free (proven by `elementPlusEnvironment.spec.js`); avoid `h()` slots, and supply **every** required prop (the child, like `CodelistQuickEditDialog`, likely makes props required). Any new `defineProps` without `required`/`default` that the child dereferences will warn.
- **Parent-side contract test** (replacing the "rendered twice" source asserts): mount `FormDesignerTab` is heavy — prefer a lightweight mount of just the region, or keep a thin source assert on the parent that it renders `<DesignerWordPreview` twice with `mode="main"`/`mode="designer"` (or the chosen prop names) **plus** a mount test of the child itself.

### 4d. Testing rules from `.trellis/spec/frontend/quality-guidelines.md` that bind this task

- "Component Mount Tests … **the tool of record for refactoring giant components** (form designer / visits preview / App + Word import splits): **source-text tests cannot prove behavior survives a split**." — this is the governing rule for R6.
- Standalone `vitest.config.js` must mirror any compile-time plugin `vite.config.js` gains (currently only `@vitejs/plugin-vue`).
- `tests/component/**/*.spec.js` only; never name a mount test `*.test.js`; never put node:test files under `tests/component/`.
- Any Vue warning fails a test; fix the root cause, never silence.
- Add DOM polyfills only when a spec proves an API missing, with a comment naming the component + API.
- Test toolchain versions are exact-pinned; upgrades are a separately approved change.
- Checklist: `npm test` (both suites) + `npm run lint` + `npm run format` + `npm run build` all green.

---

## 5. R2 status check — shared codelist quick add/edit dialog

**Verdict: R2 is fully delivered.** The dialog is a single component reused by both hosts; AC2 (immediate field-library refresh after a designer save) is satisfied.

### 5a. Evidence — current code

**`CodelistQuickEditDialog.vue`** (285 lines): the only implementation. Both cache invalidations live inside it (`invalidateCache` for `/codelists` **and** `/field-definitions` at lines 134–135); the host `afterChange` is awaited before close on the success and edit-failure paths (lines 171, 215, 227). Props parameterize the two hosts: `addTitle`, `showCodeColumn`, `codePlaceholder`, `decodePlaceholder`, `normalizeDraftBeforeSubmit`, `addSuccessMessage` (lines 21–30).

**`FormDesignerTab.vue`**:
- import line **47**;
- state **2844–2846** (`showQuickAddCodelist`, `showQuickEditCodelist`, `quickEditCodelistId`); openers **2847–2855**;
- `afterCodelistDialogChange` **2856–2869** — on `'add'`: `await loadCodelists()` (2857) + bind `editProp.codelist_id = codelist.id` (2859); on `'save'`: `invalidateCache('/api/forms/{id}/fields')` + `await loadFormFields()` + conditional `selectField(updated)` (2862–2867); **`refreshKey.value++` (2868)**;
- markup **5272–5292** (two instances: `add` with `add-title="新增选项"` + `:normalize-draft-before-submit="true"`; `edit`);
- trigger buttons **4894 / 4906**.

**`FieldsTab.vue`**: import **17**; state/openers **209–222**; `afterCodelistDialogChange` **227–233** (`await load()` + `refreshKey.value++` + `'add'` rebind); markup **363–380** (two instances with `:show-code-column="editMode"` + `add-success-message="新增成功"`).

### 5b. How AC2 (immediate field-library refresh) is met in the designer

The designer's left field-library panel is fed by `fieldDefs` (`FormDesignerTab.vue:196`; consumed at 1274/2190/2629 via `isVisibleInFieldLibrary`). `afterCodelistDialogChange` bumps `refreshKey` (2868); the `refreshKey` watcher (432–440) calls `loadFieldDefs()` when `designerAuxiliaryLoaded.value` is true. Because the dialog has already invalidated `/field-definitions` (dialog line 135), `loadFieldDefs()` (342–347) performs a fresh `cachedGet`, so the new dictionary name appears immediately (was ≤30 s stale before R3). This matches the archived `implement.md` "Erratum (2026-10-10)" and the `prd.md` Evidence row.

### 5c. Remaining duplication / open items

- **Expected host wiring, not duplication**: each host keeps its own pair of visibility refs, two openers, and a thin `afterChange`. `openQuickEditCodelist` guards are near-identical (`FormDesignerTab.vue:2850–2855` vs `FieldsTab.vue:217–222`) — a small, deliberate per-host guard, not dialog UI.
- **No duplicated dialog UI/logic remains**: neither host contains `codelist-option-add-row`, `normalizeQuickOptions`, or the option table any more (verified by grep).
- **Host-specific parameterization** (correct, not duplication): designer passes `normalize-draft-before-submit` + empty placeholders + `add-title`; FieldsTab passes `show-code-column` + `add-success-message`.
- Nothing from R2/AC2 is outstanding for `designer-split`. R2's remaining dialog tests are already converted: `quickEditBehavior.test.js:244–271` keep only host-wiring guards with justification comments; the body asserts live in `CodelistQuickEditDialog.spec.js`.

---

## 6. Caveats / Not Found

- No `tests/helpers/` shared module exists; a combined-source helper would be a **new** file every reader opts into (27 re-declared readers).
- `tests/acrfAnnotationGeometry.test.js` and `tests/acrfAnnotationPersistence.test.js` do **not** read `FormDesignerTab.vue` (0 references) — they are not in scope, but they are the existing behavioral tests for the annotation composables the new component will consume.
- The exact split of the `.designer-preview-pane` base rule (5786) vs its narrow-screen override (5980) across parent/child is a design decision; `paneSplit.test.js:312–317` depends on both living in one file today.
- No test suite was executed (snapshot has no `node_modules`); all findings are static source/text analysis.
