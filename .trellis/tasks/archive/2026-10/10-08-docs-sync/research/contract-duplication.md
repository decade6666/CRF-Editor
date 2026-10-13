# Contract Duplication Inventory (docs-sync, 2026-10-12)

Repo: `/home/decade/CRF-Editor` @ git main `0daf58e`.
Scope: `.trellis/spec/guides/cross-stack-contracts.md` (SSOT target) vs the three `CLAUDE.md` files.
Read-only scan; no repo file outside this task directory was modified.

Files and sizes:

| File | Lines |
|------|-------|
| `.trellis/spec/guides/cross-stack-contracts.md` | 1094 |
| `.claude/CLAUDE.md` (root) | 224 |
| `backend/.claude/CLAUDE.md` | 181 |
| `frontend/.claude/CLAUDE.md` | 240 |

Classification key: **SUBSET** = fully covered by the spec (safe to delete, replace with summary+pointer); **UNIQUE** = contains facts absent from the spec; **CONFLICT** = contradicts the spec; **NO-SPEC** = cross-file/stack sync rule with no spec section (module-local; keep in the module doc).

---

## 1. Spec section map

Physical order is 1,2,3,4,5,6,9,7,8,10,11,12,13,14.

| § | Title | Lines | Topic | Contract ID | Spec starts at | §9 physically at |
|---|-------|-------|-------|-------------|----------------|------------------|
| 1 | Column Width Planning | 20–77 | width planner | `width-planning` | 20 | — |
| 2 | Two-Phase Ordering Algorithm | 79–129 | ordering | `ordering-algorithm` | 79 | — |
| 3 | Authentication Token Schema | 131–167 | auth token | `auth-token` | 131 | — |
| 4 | Word Import Screenshot Evidence Preview | 169–382 | docx screenshot | `docx-screenshot-evidence` | 169 | — |
| 4-ext | Managed Import Temporary Resources | 282–380 | temp resources | (extension of §4) | 282 | — |
| 5 | Word Preview / Export Strict Table-Field Parity | 384–489 | parity | `preview-export-parity` | 384 | — |
| 6 | aCRF Annotation Geometry | 491–573 | aCRF geometry | `acrf-annotation-geometry` | 491 | — |
| 9 | API Base Path (Subpath Deployment) | 575–593 | base path | `api-base-path` | 575 | before §7 |
| 7 | Form Paper Orientation | 595–647 | orientation | `form-paper-orientation` | 595 | after §9 |
| 8 | Checkbox Field Type | 649–735 | checkbox | `checkbox-field-type` | 649 | after §7 |
| 10 | OID / Identifier Charset Validation | 737–764 | OID charset | (none) | 737 | after §8 |
| 11 | Recycle-Bin Cleanup Policy | 766–807 | recycle bin | `recycle-bin-cleanup-policy` | 766 | after §10 |
| 12 | Template Field Search Index | 809–894 | template search | `template-field-search` | 809 | after §11 |
| 13 | Date/Time Format Options | 895–937 | date formats | `date-time-format-options` | 895 | before §14 |
| 14 | Reference-Aware Delete Guard | 939–980 | reference delete | `reference-delete-guard` | 939 | last numbered |

Intro / maintenance sections:

| Section | Lines | Role |
|---------|-------|------|
| `# Cross-Stack Contracts` + purpose header | 1–5 | title + purpose line |
| `## What is a Cross-Stack Contract?` | 7–16 | definition + key characteristics |
| `## Active Cross-Stack Contracts` | 18–19 | container heading |
| `## How to Maintain Cross-Stack Contracts` (`### Before Changing` 984–1006, `### After Changing` 1008–1012) | 982–1012 | search/read/test workflow |
| `## Adding New Cross-Stack Contracts` | 1016–1029 | new-contract checklist |
| `## Quick Reference` | 1031–1044 | 7-row table (Width Planning, Ordering, Auth Token, Preview/Export Parity, Form Paper Orientation, API Base Path, OID/Identifier Charset, Reference Delete Guard) |
| `## Common Mistakes` | 1046–1081 | one-side updates, single-stack tests, fixture format |
| `## Tests Required` | 1083–1094 | 6-row table (Width Planning, Ordering, Auth Token, Preview/Export Parity, Form Paper Orientation, Reference Delete Guard) |

Notes / defects inside the spec (out of scope but reported):

- Line 62 says "see §12 for the format-option contract"; the Date/Time Format Options section is **§13** (§12 is Template Field Search Index). Stale cross-reference.
- Lines 739–740 (leftover code fence) sit outside any code block after the §10 heading — the section opens with a bare `# Backend (...)` comment line, not a heading/intro sentence.
- Line 894 runs straight into `### 13.` (no blank line before the heading).
- The `Tests Required` table has no rows for §4, §6, §8, §9, §10, §11, §12, §13, §14.
- The Quick Reference table has no rows for Word Import Screenshot, aCRF Annotation, Checkbox, Recycle-Bin, Template Field Search, Date/Time Formats.

---

## 2. Root `.claude/CLAUDE.md` — contract passages

| Lines | Section | Topic | Spec § | Verdict |
|-------|---------|-------|--------|---------|
| 109 | Cross-Stack Contracts | column width planner constants + fixture regeneration | §1 | SUBSET |
| 110 | Cross-Stack Contracts | `planner_cases.json` single source + both tests | §1 | SUBSET |
| 111 | Cross-Stack Contracts | checkbox field | §8 | SUBSET |
| 112 | Cross-Stack Contracts | ordering | §2 | SUBSET (2 additions) |
| 113 | Cross-Stack Contracts | auth token + session-scoped write-back | §3 r4–5 (pointer already inline) | SUBSET |
| 114 | Cross-Stack Contracts | form paper orientation | §7 | SUBSET |
| 115 | Cross-Stack Contracts | Word screenshot evidence | §4 | SUBSET (1 addition) |
| 116 | Cross-Stack Contracts | strict parity (`.wp-form-title`, comparator) | §5 (pointer) | SUBSET (1 addition) |
| 117 | Cross-Stack Contracts | aCRF geometry + persistence | §6 (pointer) | SUBSET |
| 118 | Cross-Stack Contracts | API base path / subpath | §9 | SUBSET |
| 119 | Cross-Stack Contracts | recycle-bin cleanup | §11 (pointer) | SUBSET |
| 120 | Cross-Stack Contracts | date/time format options | §13 (pointer) | SUBSET |
| 121 | Cross-Stack Contracts | template field search | §12 (pointer) | SUBSET |
| 122 | Cross-Stack Contracts | reference-aware delete | §14 (pointer) | SUBSET |
| 44 | Core Capabilities | checkbox `✔` fallback, codelist-free | §8 | SUBSET |
| 45 | Core Capabilities | drag ordering + ordinal quick edit | §2 (partial) | NO-SPEC (ordinal quick edit + list inventory absent from spec) |
| 47 | Core Capabilities | recycle-bin estimated size / policy / preview | §11 | SUBSET |
| 51 | Core Capabilities | template field search four-group ranking | §12 | SUBSET |
| 52 | Core Capabilities | reference-aware deletion + unplaced preflight | §14 | SUBSET |
| 53 | Core Capabilities | designer preview split, aCRF drag | §5/§6 | SUBSET |
| 94 | Development Conventions | frontend reuse constraints | §1,§2,§12 | NO-SPEC (module-wide reuse list; ~half is not contract) |
| 96 | Development Conventions | doc-sync duty (README/CLAUDE.md/index.json) | — | NO-SPEC |
| 101–106 | Security and Deployment | production env, JWT TTL, rate limit, Logo formats, `template_path`, admin bootstrap | — | NO-SPEC (auth-adjacent; not in the cross-stack spec) |
| 125–128 | Testing Strategy | backend/hermetic suite, frontend dual suites, no browser E2E | — | NO-SPEC (test-infra, not contract) |
| 131 | AI Usage Guide | auth/JWT/admin/rate-limit sync file list | §3 + backend/`auth-security.md` | SUBSET (superset of §3's file list) |
| 132 | AI Usage Guide | import/export + Word preview sync file list | §4/§5 | SUBSET |
| 133 | AI Usage Guide | column width sync file list | §1 | SUBSET |
| 134 | AI Usage Guide | project isolation / permission guard file list | — | NO-SPEC (points at backend tests; no cross-stack contract section) |

Root-level UNIQUE fragments (facts absent from the spec):

- L109: `FILL_LINE_MIN_CHARS=6` and `FILL_LINE_EPSILON=1e-9` are listed among the "Shared constants" alongside the planner weights. In the spec they appear only inside §5's fill-line rule (L415/L449), not in §1's shared-constant block.
- L109: regenerating fixtures "via `frontend/scripts/generatePlannerFixtures.mjs`" is stated in §1's checklist (L73) — covered, no delta.
- L112: "and the frontend `frontend/src/composables/useOrderableList.js` / `useSortableTable.js`" — the spec §2 lists only `useOrderableList.js` (L85). `useSortableTable.js` is not in the spec's ordering contract.
- L115: the frontend file set for the Word-screenshot contract omits `WordImportDialog.vue` / `useWordImport.js`, which the spec §4 (L175) does list. Root list is a **narrower** (older) file set, not an extra fact.
- L116: only `.wp-form-title { text-align: left }` plus the comparator CLI names; the spec §5 owns the full parity rule set.

---

## 3. `backend/.claude/CLAUDE.md` — contract passages

| Lines | Section | Topic | Spec § | Verdict |
|-------|---------|-------|--------|---------|
| 24 | Core Directories | reference endpoints `include_unplaced`, owner-before-lookup | §14 | SUBSET |
| 37 | Router Overview | codelists/units reference endpoints + `include_unplaced` | §14 | SUBSET |
| 41 | Router Overview | `template_fields.py` read-only index + path-free errors | §12 | SUBSET |
| 42 | Service Overview | auth service (JWT version, reserved admin) | §3 (payload only) | NO-SPEC (version-invalidation/admin bootstrap not in §3) |
| 45 | Service Overview | docx temp ids, owned filenames, streaming, draining | §4 r6–8 + ext | SUBSET |
| 46 | Service Overview | template index service internals | §12 (contract) | SUBSET (contract) / NO-SPEC (internals: raw `text()` reads, no ORM, no long `IN` lists — absent from the spec) |
| 47 | Service Overview | export service internals (option labels, structure rows, dispatch) | §5 (behavior) | SUBSET (contract) / NO-SPEC (internals: `_render_control_into_cell`, `_render_mixed_landscape_form`, `_fill_structure_row_cell` are absent from the spec — verified by grep) |
| 48 | Service Overview | database export module | — | NO-SPEC |
| 49 | Service Overview | `project_size_service` + `ROW_OVERHEAD_BYTES` | §11 r6 | SUBSET (contract) / NO-SPEC (logo byte accounting, per-table aggregation) |
| 50 | Service Overview | `project_purge_service` + Logo deletion policy | — | NO-SPEC (spec has no Logo-file lifecycle rule) |
| 51 | Service Overview | recycle-bin cleanup service | §11 | SUBSET |
| 52 | Service Overview | `width_planning.py` shares fixture contract | §1 | SUBSET |
| 53 | Service Overview | `word_table_parity.py` | §5 | SUBSET |
| 54 | Service Overview | `toc_pagination.py` LibreOffice/pypdf fallback | — | NO-SPEC |
| 55 | Service Overview | `order_service.py` internals (order/sequence families) | §2 (algorithm only) | NO-SPEC for the `sequence` family |
| 56 | Service Overview | `unique_name.py` copy-name ladder | §10 (only `_IMP` inside the label-prefix rule, L761) | NO-SPEC (the `_copy` / `(副本)` / `(恢复)` / `_导入` / `（导入）` ladders) |
| 57 | Service Overview | `admin_bootstrap_service.py` | — | NO-SPEC |
| 58 | Service Overview | `project_clone_service.py` Logo linkage | §6/§7 (clone listed) | NO-SPEC (Logo linkage) |
| 59 | Service Overview | `form_field_copy.py` copy contract | — | NO-SPEC |
| 60 | Service Overview | docx screenshot service + startup self-check | §4 r5 | SUBSET |
| 61 | Service Overview | `ai_review_service.py` | §8 (VALID_FIELD_TYPES rule) | SUBSET (only the type-list part) |
| 63 | Service Overview | `field_definition_reference_service.py` | §14 r1 | SUBSET |
| 64 | Service Overview | `field_rendering.py` | §1/§5/§8/§13 | SUBSET |
| 68 | Database and Compatibility | migrations backfill list + `_backfill_null_order` | — | NO-SPEC |
| 69 | Database and Compatibility | `deleted_at` naive-local cutoff | §11 (policy only) | NO-SPEC |
| 70 | Database and Compatibility | background-job Session rules | §11 (background loop exists) | NO-SPEC |
| 71 | Database and Compatibility | `form_field` canonical column rebuild | — | NO-SPEC |
| 72 | Database and Compatibility | `annotation_positions` shared validation | §6 | SUBSET |
| 73 | Database and Compatibility | entry-point error mapping | — | NO-SPEC |
| 76–80 | Security Behavior | production docs/secret/TTL/rate-limit/admin bootstrap/users | §3 (TTL not in spec) | NO-SPEC |
| 81 | Security Behavior | option mutations owner/membership checks + `test_codelist_option_authorization.py` | §14 r6 (concept) | SUBSET (test file name is a root-clause fact) |
| 82 | Security Behavior | Logo bitmap-only | — | NO-SPEC |
| 83 | Security Behavior | temp-upload ownership, expiry, `.db` fixed stem | §4 r6–8 + ext | SUBSET |
| 84 | Security Behavior | `template_path` whitelist, legacy template probing, template search read-only | §12 r1/r3 | SUBSET (whitelist/`auto` fallback in §7 L611 + §12) |
| 85 | Security Behavior | unhandled-exception logging contract | — | NO-SPEC |
| 88 | Import/Export and Column Width Contracts | row height / line spacing constants | §5 (geometry row) | SUBSET |
| 89 | Import/Export and Column Width Contracts | TOC hybrid pre-render + `TOC1/2/3` styles | — | NO-SPEC |
| 90 | Import/Export and Column Width Contracts | baked TOC page numbers | — | NO-SPEC |
| 91 | Import/Export and Column Width Contracts | `_has_field_codes` TOC interference | §5 (extraction) | SUBSET (the helper name is not in the spec) |
| 92 | Import/Export and Column Width Contracts | `snapToGrid=0`, `VERTICAL_OPTION_GAP_PT`, `tcMar`, marker font | §5 | SUBSET (only the 3pt gap value is in §5) |
| 93 | Import/Export and Column Width Contracts | `_build_form_table` content-driven widths | §1/§5 | SUBSET |
| 94 | Import/Export and Column Width Contracts | `available_cm=14.66` + shared weights | §1 | SUBSET |
| 95 | Import/Export and Column Width Contracts | `INLINE_HEADER_FLOOR` semantics | §1 | SUBSET |
| 96 | Import/Export and Column Width Contracts | fixture + authoritative generator + both tests | §1 | SUBSET |
| 97 | Import/Export and Column Width Contracts | strict parity inputs/outputs | §5 | SUBSET |
| 98 | Import/Export and Column Width Contracts | checkbox `复选` | §8 | SUBSET |
| 99 | Import/Export and Column Width Contracts | template import OID preservation + reuse branches | — | NO-SPEC |
| 100 | Import/Export and Column Width Contracts | export error semantics (`ExportError`, `EXPORT_DATA_INCOMPATIBLE`) | §6 (invalid JSON fails closed) | NO-SPEC for the HTTP-400 code |
| 101 | Import/Export and Column Width Contracts | form copy preserves instance attributes | — | NO-SPEC |
| 121 | Development Conventions | paper-orientation sync file list | §7 | SUBSET |
| 122 | Development Conventions | `annotation_positions` sync file list + tests | §6 | SUBSET |
| 123 | Development Conventions | checkbox sync list | §8 | SUBSET |
| 124–125 | Development Conventions | security/import-export doc sync duty | — | NO-SPEC |

Backend UNIQUE fragments (facts absent from the spec):

- L46 (template index internals): "whole-table raw `text()` reads are filtered in Python (no ORM, no long `IN` lists)" — the spec §12 describes the response/index semantics and the legacy-column probes (r3) but not this read strategy.
- L81: `tests/test_codelist_option_authorization.py` — spec §14 r6 tells the reader to see `auth-security.md`; this file name appears in **neither** the spec nor the quick reference.
- L92: `w:snapToGrid=0` via `export_service._disable_snap_to_grid`, the `w:docGrid type=lines linePitch=312` (15.6pt) mechanism, `_render_vertical_choices` writing a `w:tcMar` top/bottom cell margin (`CELL_VPAD_PT`≈6.37pt → 127 twips), and the requirement that `docGrid` / vertical-option-spacing changes sync the `snapToGrid` assertions in `test_export_unified.py` / `test_export_paper_orientation.py`. §5 carries only "vertical-choice inter-option gap `VERTICAL_OPTION_GAP_PT = 3`" plus the preview margin mirror.
- L89: TOC hybrid pre-render mechanics — first entry merged into the field start (`begin → instrText → separate`), last entry merged into the outer `end`, SimSun via `_apply_raw_run_font`, `_ensure_toc_styles` idempotent `TOC1/2/3` injection.
- L90: `export_project_to_word(bake_toc_page_numbers=True)` → `_bake_toc_page_numbers` → `toc_pagination.py` LibreOffice→PDF→`pypdf` outline; non-empty fallback page numbers; `test_export_toc_bakes_real_page_numbers_with_libreoffice` skip behaviour.
- L99: template import OID contract — `import_service.py` copies source `code` verbatim (whitespace-stripped) for form/codelist/unit, mints `generate_code(PREFIX)` only when empty, dedupes with the `_IMP` ladder (`_resolve_import_code` / `_make_unique_code`); no charset re-validation on import (`OID_PATTERN` only at Create/Update schema boundaries); the unit/codelist reuse branches must not overwrite the target's OID.
- L100: `ExportService.export_project_to_word` re-raises `ExportError` (never `return False`); `routers/export.py::export_word` deletes the temp `.docx` and re-raises with a warning log; `main.py`'s `export_error_handler` returns HTTP 400 `{detail, code}` (e.g. `EXPORT_DATA_INCOMPATIBLE`); other failures stay 500 with the generic message; the frontend renders the backend `detail`.
- L101: form copy shares `services/form_field_copy.py::copy_form_field`; `COPIED_ATTRS` derived from `FormField` columns minus `CALLER_SUPPLIED_ATTRS` / `NEVER_COPIED_ATTRS`; a new `form_field` column must stay covered (guarded by `tests/test_form_copy.py`).
- L93: `_build_form_table` calls `width_planning.plan_normal_table_width(fields, available_cm=14.66)`; §5 mentions the helper names `compute_fill_line_char_count` / `computeFillLineCharCount` but not `plan_normal_table_width` or `_build_form_table`.
- L59: `form_field_copy.py` / `COPIED_ATTRS` (see L101).
- L56: the non-`_IMP` copy-name ladders (`_copy`, `(副本)`, `(恢复)`, `_导入`, `（导入）`).
- L90 / L89: also absent from the spec's Quick Reference and Tests Required tables.

---

## 4. `frontend/.claude/CLAUDE.md` — contract passages

| Lines | Section | Topic | Spec § | Verdict |
|-------|---------|-------|--------|---------|
| 20 | Key Entry Points | `acrfAnnotationGeometry.js` mirrors backend export constants + `posOffset = default + Δy` | §6 | SUBSET |
| 21 | Key Entry Points | `useAcrfAnnotationDrag.js` shared drag/PATCH queue | §6 | SUBSET |
| 22 | Key Entry Points | `useVisitPreviewAnnotation.js` per-invocation glue | §6 | SUBSET |
| 23 | Key Entry Points | `useCRFRenderer.js` + checkbox control text | §1/§5/§8 | SUBSET |
| 25 | Key Entry Points | `previewCellRender.js` shared pure helpers + `visitPreviewLandscape.js` reuse | §5 | NO-SPEC (module inventory; `previewCellRender.js` absent from spec) |
| 26 | Key Entry Points | `searchRanking.js` fuzzy tiers | §12 composition only | NO-SPEC (the tier/edit-distance lattice itself) |
| 27 | Key Entry Points | `useOrdinalQuickEdit.js` | §2 partial | NO-SPEC |
| 28 | Key Entry Points | `useColumnResize.js` **including** `buildColumnWidthStorageKey` / `parseColumnWidthStorageKey` / `isValidColumnWidthOverrideArray` / `migrateLegacyColumnWidthKey` and `collectColumnWidthOverrides` | §1 (weights/fixture only) | NO-SPEC |
| 29 | Key Entry Points | `useRowResize.js` | §5 (row height value only) | NO-SPEC |
| 34 | Key Entry Points | `templateFieldSearch.js` helpers + 50/page pitch | §12 | SUBSET |
| 35 | Key Entry Points | `clipboardCopy.js` single clipboard owner | §12 r5 | SUBSET |
| 40 | Core Directories | `oidValidation.js` covers form/field/codelist, NOT option codes | §10 | SUBSET |
| 75 | Development Conventions | subpath deployment: `VITE_BASE_PATH`, `apiUrl()` at 6 fetch boundaries, cache keys raw, 9 wrapped sites, `basePathDeployment.test.js`, desktop root build | §9 | SUBSET |
| 78 | Development Conventions | checkbox outside `isChoiceField()`, `□checkbox_label`, `✔` fallback, no aCRF option annotation | §8 | SUBSET |
| 79 | Development Conventions | ordering reuse + `排序保存失败，已恢复` recovery text | §2 (algorithm) | NO-SPEC (the recovery message + ordinal-jump filter semantics) |
| 80 | Development Conventions | fuzzy search reuses `searchRanking.js`, legacy concatenated candidates (unit `code + symbol`, option `code + decode`) | §12 (shared ranker) | NO-SPEC |
| 86 | Development Conventions | global `editMode` + shared `crf_view_mode` preview toggle | §5/§6/§7 (view mode) | NO-SPEC (the `crf_edit_mode` / `crf_view_mode` keys and brief/full rules) |
| 90 | Development Conventions | `paper_orientation` uses `selectedFormPaperOrientation` + `resolveLandscape`; legacy `crf_forceLandscape` migrated once | §7 | SUBSET |
| 92 | Development Conventions | Element Plus header/selection centering contract | — | NO-SPEC (UI style contract) |
| 96–97 | Preview Column Widths | planner entry points + full shared constant list | §1 | SUBSET (see UNIQUE note) |
| 98–99 | Preview Column Widths | `useColumnResize` / `useRowResize` wiring | §1/§5 | NO-SPEC |
| 100 | Preview Column Widths | `crf:designer:col-widths:<form_id>:<table_instance_id>`; current `kind:fieldIds=` vs legacy `<groupIndex>-<kind>-<colCount>`; designer writes, `TemplatePreviewDialog` / `VisitFormPreviewDialog` read, export collector reads without modifying | — | NO-SPEC |
| 101 | Preview Column Widths | `crf:designer:row-heights:<form_id>:<table_instance_id>`; designer + visit preview share read/write | — | NO-SPEC |
| 102 | Preview Column Widths | corrupt cached widths → content-driven fallback | — | NO-SPEC |
| 103 | Preview Column Widths | fixture generator + both tests | §1 | SUBSET |
| 104 | Preview Column Widths | checkbox `✔` fallback used by width planning | §8 | SUBSET |
| 105 | Preview Column Widths | `.wp-form-title` must keep `text-align: left` | §5 | SUBSET |
| 110 | Authentication and Admin | password change validated with backend `auth.py`, `auth_service.py`, `rate_limit.py` | §3 (token only) | NO-SPEC |
| 111 | Authentication and Admin | 401 handling centralized in `useApi.js` | §3 r4 | SUBSET |
| 112 | Authentication and Admin | `SessionTimer` decodes `exp` for display only; renew reuses `/api/auth/me` + `X-Refreshed-Token` | §3 r7/r8 | SUBSET |
| 113 | Authentication and Admin | **session-scoped token write-back and 401** | §3 r4–5 (pointer inline) | SUBSET |
| 116–130 | Testing Focus | mount-test infra, per-file coverage descriptions | — | NO-SPEC (test doc) |
| 131–168 | Testing Focus | per-test-file contract notes (incl. `columnWidthPlanning`, `wordPageGeometry`, `formFieldPresentation`, `visitPreviewSplit`, `checkboxFieldType`, `templateFieldSearch`, `acrfAnnotation*`) | §1/§5/§6/§8/§12 | SUBSET (test inventory; keep as module tests list) |

Frontend UNIQUE fragments (facts absent from the spec):

- L97: lists `FILL_LINE_MIN_CHARS=6`, `FILL_LINE_EPSILON=1e-9` as **shared planner constants** (same delta as root L109); also states "width-aware preview callers pass the computed full-cell underscore count to text fill-lines" — §1 has no such sentence (it is in §5 L415).
- L113: verbatim restatement of §3 r4–5, including the enumerated bypass sites ("Word export download, project Logo, screenshot pages, login") and the two guarding test files `tests/useApiSessionRace.test.js` + `tests/appSettingsShell.test.js`. §3 r5 lists the bypass sites but names no frontend test file; a deleted paragraph would remove the test mapping.
- L105: adds "changing it back to `center` or introducing `margin: 0 auto` that causes block centering is forbidden" to the `.wp-form-title` rule (§5 L427 says left-aligned + locked by CSS geometry tests).
- L40: `oidValidation.js` covers form / field / codelist identifiers, **codelist option codes are free-form and not covered**; §10 states the same in prose (L742–751) but this is the frontend-side file binding.
- L100: the localStorage key grammars (`crf:designer:col-widths:<form_id>:<table_instance_id>`, current `kind:fieldIds=<ordered-field-ids>` vs legacy `<groupIndex>-<kind>-<colCount>`, `crf:designer:row-heights:…`), the who-writes/who-reads matrix, and `collectColumnWidthOverrides` living in `useColumnResize.js` — none of this is in the spec.
- L86: the `crf_edit_mode` / `crf_view_mode` persistence keys, brief-mode hiding of advanced identifiers, and the reset-to-project-information rule on leaving full mode.
- L92: Element Plus table header fill `--color-primary-subtle`, `--color-text-primary`, centered headers, fixed-column white-fallback overrides, and the centered selection column (`display:flex` + `justify-content:center` + zero horizontal padding) with the VisitsTab visit-form list staying on bordered `el-table`.
- L79: drag-sort and ordinal-jump "filter-disabled" semantics plus the shared `排序保存失败，已恢复` restore message.

---

## 5. Spec ↔ doc line mapping

| Spec § | Root lines | Backend lines | Frontend lines |
|--------|-----------|---------------|----------------|
| §1 Column Width Planning | 109, 110, 133; 44 (adjacent) | 52, 93, 94, 95, 96 | 23, 96, 97, 98, 103, 104 |
| §2 Two-Phase Ordering | 112; 45 | 55 | 27, 79 |
| §3 Auth Token | 113, 131; 102 (TTL) | 42, 78 | 111, 112, 113 |
| §4 Word Import Screenshot | 115, 132 | 46 (index), 60, 83 | (only via 132's file list) |
| §4-ext Temp Resources | — | 45, 83 | — |
| §5 Preview/Export Parity | 116, 132 | 47, 53, 91 (TOC), 92 (gap), 97, 98, 100, 101 | 25, 104, 105, 99 (row resize) |
| §6 aCRF Geometry | 117 | 72, 122 | 20, 21, 22, 86 |
| §7 Paper Orientation | 114 | 121 | 90 |
| §8 Checkbox | 111; 44 | 98, 123 | 23, 78, 104, 165 |
| §9 API Base Path | 118 | — | 75 |
| §10 OID Charset | — | — | 40 |
| §11 Recycle Bin | 119; 47 | 49, 51 | (AdminView/byteSize via 119) |
| §12 Template Field Search | 121; 51 | 41, 46 | 34, 35 |
| §13 Date/Time Formats | 120 | 54 (placeholder weights live in `field_rendering`) | (via 120) |
| §14 Reference Delete | 122; 52 | 24, 37, 63, 81 | (via 122) |

---

## 6. No-spec-section cross-stack claims (quoted, with file:line)

These are cross-file/stack sync rules with no §-owner in the spec. Keep them in the module docs (or add new spec sections if they are judged contract-grade).

Root `.claude/CLAUDE.md`:

1. L45: "Drag ordering plus ordinal quick edit for ordered frontend lists such as dictionaries, options, units, fields, visits, visit-form relations, and designer form lists" (§2 covers the reorder algorithm only).
2. L94: "Frontend reuse constraints: APIs go uniformly through `useApi.js`; field rendering goes uniformly through `useCRFRenderer.js`; field display attributes and preview display logic go uniformly through `formFieldPresentation.js`; user-facing fuzzy search ordering goes uniformly through `searchRanking.js`; ordinal jump sorting goes uniformly through `useOrdinalQuickEdit.js` alongside `useSortableTable.js` / `useOrderableList.js`."
3. L96: "When features, commands, or test entry points change, synchronously update `README.md`, `README.en.md`, the module-level `CLAUDE.md`, and `.claude/index.json`."
4. L101–L106 (Security and Deployment Constraints): production `CRF_*` env preference; `CRF_ENV=production` ⇒ docs disabled + `CRF_AUTH_SECRET_KEY` required + JWT TTL ≤ 60 min; single-node in-memory rate limiting (not multi-instance safe); bitmap-only Logos (historical SVG/XML rejected); `template_path` whitelist + `.db`; reserved-admin auto create/repair on empty production DB plus post-go-live audit.
5. L125–L128 (Testing Strategy): hermetic backend suite (`conftest.py` path/config redirects, `test_test_environment_isolation.py`, coverage statistics-only) and the two disjoint frontend suites (node:test source contracts vs vitest mount tests, `vueWarnGate.js`), plus "No browser-level E2E suite was found in this scan".
6. L134: permission-boundary file list `dependencies.py`, `routers/codelists.py`, `test_isolation.py`, `test_subresource_isolation.py`, `test_permission_guards.py`, `test_codelist_option_authorization.py`.

Backend `.claude/CLAUDE.md`:

7. L69: "`project.deleted_at` is written with naive local `datetime.now()` and the recycle-bin cleanup cutoff must use the same naive-local convention; comparing against an aware UTC datetime will shift the effective cutoff by the local UTC offset."
8. L70: "Background jobs must not reuse `get_session()` / `get_read_session()` request-scoped dependencies; they must build their own `Session(get_engine())`, and the recycle-bin hard-delete loop commits one project at a time…"
9. L89 + L90 (TOC hybrid pre-render + baked page numbers, quoted in §3 UNIQUE above).
10. L92 (first half): "Vertical single-choice/multiple-choice option paragraphs must write `w:snapToGrid=0` via `export_service._disable_snap_to_grid`… Any change to `docGrid` / vertical option spacing must synchronize the `snapToGrid` assertions in `test_export_unified.py` and `test_export_paper_orientation.py`."
11. L99: "Template import OID contract: `import_service.py` copies the source `code` verbatim (whitespace-stripped) for form / codelist / unit, mints `generate_code(PREFIX)` only when the source is empty, and dedupes colliding OIDs inside the target project with the `_IMP` ladder… No charset re-validation on import — `OID_PATTERN` applies only at Create/Update schema boundaries… The unit/codelist **reuse** branches (symbol match; name + option signature match) must never overwrite the target's existing OID."
12. L100: "Word export error semantics: `ExportService.export_project_to_word` re-raises `ExportError` (never `return False`)… so `main.py`'s `export_error_handler` answers HTTP 400 with `{detail, code}` (e.g. `EXPORT_DATA_INCOMPATIBLE` for invalid aCRF `annotation_positions`). Other export failures stay 500…; the frontend already renders the backend `detail`, and no specific export error may be swallowed into the generic failure path again."
13. L101: "Form copy must preserve field-instance display attributes: project clone, template import, and `POST /api/forms/{form_id}/copy` share `services/form_field_copy.py::copy_form_field`…, every other column (including `bg_color` / `text_color` / `label_bold` / `label_font_size`) is copied from the model column list, and a new `form_field` column must stay covered by `COPIED_ATTRS` (guarded by `tests/test_form_copy.py`)."
14. L81: reference-endpoint ownership rule + "Regressions in `tests/test_codelist_option_authorization.py` cover foreign-owner 403/no change and owner status-code compatibility."
15. L88: "Word export table row height uses `FORM_TABLE_ROW_HEIGHT_CM = 1` as the `AT_LEAST` lower bound; cell paragraphs use `SINGLE_LINE_HEIGHT_PT = 15.6` fixed line spacing and `CELL_VPAD_PT` top/bottom spacing…" (constant names absent from §5, which states the values only).
16. L57: `admin_bootstrap_service.py` wiring (`init_db()` call order between `_ensure_form_field_rowid_compatibility` and `_move_orphan_projects_to_recycle_bin`).
17. L56: `unique_name.py::first_free_name` + the per-caller suffix templates.

Frontend `.claude/CLAUDE.md`:

18. L79: "Ordering interactions should preferably reuse `useOrderableList.js`, `useSortableTable.js`, and `useOrdinalQuickEdit.js`; drag sorting and direct ordinal jumps must keep filter-disabled behavior and the shared `排序保存失败，已恢复` recovery semantics aligned."
19. L80: "User-facing fuzzy search boxes should reuse `searchRanking.js`; components pass the base ordered list and candidate text extractor, and must preserve legacy concatenated candidates where previous behavior matched combined fields such as unit `code + symbol` or option `code + decode`."
20. L86: "`App.vue` provides global `editMode` (persistence key `crf_edit_mode`)… `FormDesignerTab.vue` and `VisitsTab.vue` share a persisted preview-only `viewMode` (`crf_view_mode`)…"
21. L92: "Global Element Plus table headers uniformly use `--color-primary-subtle` fill, `--color-text-primary` text color, and center alignment; fixed column headers need to override the white-background fallback of `.el-table-fixed-column--left/right` and `.el-table__fixed-right-patch`. Selection-column body cells are the intentional exception… Option lists and the VisitsTab visit-form list should stay on bordered `el-table` headers instead of custom handwritten header rows so styling does not drift."
22. L100: "localStorage key: `crf:designer:col-widths:<form_id>:<table_instance_id>`; current instance IDs use `kind:fieldIds=<ordered-field-ids>`, while legacy `<groupIndex>-<kind>-<colCount>` values are copied to the current key on first designer access. The designer writes it; `TemplatePreviewDialog` / `VisitFormPreviewDialog` read it, and the Word export collector reads valid overrides without modifying storage."
23. L101: "Row height localStorage key: `crf:designer:row-heights:<form_id>:<table_instance_id>`; the designer and visit preview share read/write semantics."
24. L102: "If reading cached column widths fails (non-array / element out of bounds / sum not equal to 1), fall back to content-driven defaults."
25. L110: "Regular-user password change belongs to the authentication chain and needs to be validated in sync with backend `auth.py`, `auth_service.py`, and `rate_limit.py`."
26. L113: session-scoped token write-back + 401 restatement, incl. the bypass-site enumeration and the guarding test files (see §4 UNIQUE).
27. L88: `resolveFieldPropLeave` three-state leave strategy across window close / field switch / form switch / project switch.
28. L15–L18, L51–L56: module restructuring notes (`WordImportDialog.vue`, `useWordImport.js`, `useDesignerFormSelection.js`, `VisitsTab.vue` bridge, `VisitFormPreviewDialog.vue`, `DesignerWordPreview.vue`, `DesignerAcrfAnnotation.vue`) — parent/child ownership facts that §5/§6 reference but the frontend doc owns in detail.

---

## 7. Per-topic verdict roll-up

| Topic | Verdict | Locations |
|-------|---------|-----------|
| Column width planner constants | SUBSET (+UNIQUE: `FILL_LINE_MIN_CHARS`, `FILL_LINE_EPSILON` listed as planner constants) | spec §1 L30–76; root L109–L110, L133; backend L52, L93–L96; frontend L96–L97, L103 |
| Planner fixture single source | SUBSET | spec §1 L66/L73; root L110; backend L96; frontend L103 |
| Ordering two-phase | SUBSET (+UNIQUE: `useSortableTable.js`, quick-edit lists, recovery text) | spec §2 L79–129; root L45, L94, L112; backend L55; frontend L27, L79 |
| Auth token schema + session scoping | SUBSET (+UNIQUE: guarding test names at frontend L113) | spec §3 L131–167; root L113, L131; backend L42, L78; frontend L110–L113 |
| Word screenshot evidence | SUBSET (root L115 has a stale, narrower file list) | spec §4 L169–281; root L115, L132; backend L46, L60, L83 |
| Temp-resource lifecycle | SUBSET | spec §4-ext L282–380; backend L45, L83 |
| Preview/export parity | SUBSET (+UNIQUE: `snapToGrid`/`docGrid`/`tcMar`, TOC itemization, export error codes, form-copy contract) | spec §5 L384–489; root L116, L132; backend L47, L53, L88–L101; frontend L25, L99, L104–L105 |
| aCRF annotation geometry | SUBSET | spec §6 L491–573; root L117; backend L72, L122; frontend L20–L22, L86 |
| Paper orientation | SUBSET | spec §7 L595–647; root L114; backend L121; frontend L90 |
| Checkbox field type | SUBSET | spec §8 L649–735; root L44, L111; backend L98, L123; frontend L23, L78, L104 |
| API base path | SUBSET | spec §9 L575–593; root L118; frontend L75 |
| OID charset validation | SUBSET (spec-only in the docs; frontend L40 binds the module) | spec §10 L737–764; frontend L40; (root L134 references option-authorization tests) |
| Recycle-bin cleanup policy | SUBSET | spec §11 L766–807; root L47, L119; backend L49, L51 |
| Template field search | SUBSET | spec §12 L809–894; root L51, L121; backend L41, L46; frontend L34–L35 |
| Date/time format options | SUBSET | spec §13 L895–937; root L120; backend L54, L152 (changelog) |
| Reference-aware delete | SUBSET | spec §14 L939–980; root L52, L122; backend L24, L37, L63, L81 |
| Column/row resize storage + export collector | NO-SPEC | frontend L28–L29, L98–L102 |
| TOC pre-render + baked page numbers | NO-SPEC | backend L89–L90 |
| Template-import OID preservation | NO-SPEC | backend L99, L160 (changelog) |
| Export error semantics | NO-SPEC | backend L100; root L173 (changelog) |
| Form copy attribute preservation | NO-SPEC | backend L101 |
| Copy-name ladders | NO-SPEC | backend L56 |
| Element Plus table header/selection styling | NO-SPEC | frontend L92 |
| editMode / crf_view_mode keys | NO-SPEC | frontend L86 |
| Fuzzy-search ranker + legacy concatenated candidates | NO-SPEC | frontend L26, L80 |
| Ordinal quick edit | NO-SPEC | root L45; frontend L27, L79 |
| Security/deployment constraints | NO-SPEC | root L101–L106; backend L76–L85 |
| Test infrastructure | NO-SPEC | root L125–L128; backend L29, L137; frontend L116–L168 |

No CONFLICT-classified passage was found: every overlapping CLAUDE.md statement agrees with the spec. The only spec-internal defect is the stale "see §12" cross-reference at spec L62, which should point to §13.

---

## 8. Deletion-safety summary for the follow-up edit pass

Safe to reduce to a one-line summary + `§` pointer (pure SUBSET, no fact loss):

- Root `## Cross-Stack Contracts` L109–L122 → one summary line per contract with § pointers; keep only the UNIQUE deltas noted in §2 (or move them into the spec first).
- Backend `## Import/Export and Column Width Contracts` L88, L91–L98, L121–L123 → pointer + backend-owned implementation names that the spec does not carry.
- Frontend `## Preview Column Widths` L96–L97, L103–L105 and `## Authentication and Admin Interaction` L111–L113 → pointer; migrate the UNIQUE fragments from §4 first.

Must be preserved (cannot be dropped by the reduction):

- Root: L109 (`FILL_LINE_MIN_CHARS` / `FILL_LINE_EPSILON` as planner constants), L112 (`useSortableTable.js`), L101–L106, L125–L128, L134.
- Backend: L45, L83 (temp-resource detail), L81 (test file), L88–L92, L99–L101.
- Frontend: L28–L29, L100–L102 (storage keys + writer/reader matrix), L86, L92, L113 (test file names), L97 delta, L105 delta.
