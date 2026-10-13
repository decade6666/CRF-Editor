# Changelog Structure Inventory (read-only scan)

> Task: `.trellis/tasks/10-08-docs-sync`
> Repo: `/home/decade/CRF-Editor`, git `main` @ `0daf58e`, scanned 2026-10-12.
> Scope: `.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`, `.context/history/archives/claudemd-changelog.md`.
> Method: line/byte/char counts, `^`-anchored grep, a Python line parser over the four `## Change Log` sections (entry = line matching `^- \`<date>\``), a normalizer that strips review-suffix markers (` 审查跟进` / ` 合入后复审跟进` / ` 合入后复核跟进` / ` 二次复审`), a prefix-containment probe, and 4-gram shingle Jaccard between same-key module and archive entries. No file outside `.trellis/tasks/10-08-docs-sync/research/` was written.

## 0. Ground truth

| File | Lines | Chars | Changelog section starts | Changelog section chars | Entries |
|---|---|---|---|---|---|
| `.claude/CLAUDE.md` | 224 | 36164 | line 154 (last line of file) | 10669 | 65 |
| `backend/.claude/CLAUDE.md` | 181 | 72982 | line 139 (last section) | 39785 | 42 |
| `frontend/.claude/CLAUDE.md` | 240 | 106153 | line 180 (last section) | 47720 | 59 |
| `.context/history/archives/claudemd-changelog.md` | 73 | 84089 | n/a (whole file is the archive) | 84089 | 64 |

Byte sizes differ from char sizes because the content is largely CJK: `.claude/CLAUDE.md` is 40921 bytes / 36164 chars; the archive is 127067 bytes / 84089 chars.

**The 40k budget is already exceeded under the measurement the project runbooks actually use.** The root file's own rule (line 98) and every archived task runbook (e.g. `.trellis/tasks/archive/2026-10/10-08-frontend-mount-tests/implement.md:78`, `…/10-08-designer-split/implement.md:230`) phrase the constraint as "under 40k chars (`wc -c`)" — and `wc -c` counts **bytes**. By that measure the root file is at **40921 / 40000 = 102 %**, i.e. over budget today. Counted as Unicode characters (`wc -m`) it is 36164 / 40000 = 90 %. Whichever measure the convergence work adopts, the discrepancy must be settled explicitly or the "keep it under 40k" gate will keep reporting contradictory results.

Entry-count method: a line counts as an entry when it matches `^- \`<YYYY-MM-DD>\``. Three backend and four frontend lines use the legacy `- \`2026-05-08 18:26:34\`` / `- \`2026-04-28 Tuesday 08:31:55 PDT\`` form (generation/scaffold refresh markers); they are counted separately below and are **not** task entries.

---

## A. The three CLAUDE.md changelogs

### A1. `.claude/CLAUDE.md` — root, `## Change Log` at line 154

| Property | Value |
|---|---|
| Entry lines | 158–224 (65 entries; entry run is contiguous apart from a blank line at 167) |
| Non-entry lines | 156 (the `> Single-line index only. …` rule line) and 167 (blank) |
| Format | One line per entry: `` - `<date>` (task `<slug>`): <one-to-three-sentence summary> `` — English and Chinese mixed |
| Mean entry length | 159.4 chars; max 742; min 34 |
| Length histogram | `<200`: 53, `200–399`: 6, `400–799`: 6 |
| Newest / oldest | 2026-10-12 / 2026-06-23 |
| Window or full history | **Window, by design.** Line 156 declares it a single-line index and points at the archive. The file's own `## Change Log` rule (line 98) repeats: "Keep `## Change Log` in this file as a one-line index only; full task narratives go to `.context/history/archives/claudemd-changelog.md`. This file must stay under the 40k-char context limit." |
| Section size share | 10669 / 36164 chars = **29.5 %** of the file; the 65 entry lines alone are 10363 chars |
| Anomalies | 6 entries are visibly truncated with a trailing `…` (lines 190, 211, 216, 219, 220, 221). Dates are not strictly descending: line 201 (`2026-08-17 admin-property-cards`) sits after the two `2026-08-12` entries. One task (`2026-10-08 template-field-source-form-oid`) has no archive counterpart at all (see D). |

### A2. `backend/.claude/CLAUDE.md` — `## Change Log` at line 139

| Property | Value |
|---|---|
| Entry lines | 140–181, contiguous (42 entries, no blank lines anywhere in the section) |
| Non-entry lines | none inside the section |
| Format | One line per entry, but **full narrative** — root-cause, file lists, test deltas, verification numbers. Much longer than the root index. |
| Mean entry length | 945.9 chars; max 2561; min 170 |
| Length histogram | `>=3200`: 1, `1600–3199`: 3, `800–1599`: 16, `400–799`: 13, `200–399`: 7, `<200`: 2 |
| Newest / oldest | 2026-10-10 / 2026-05-08 (last three lines, 178/180/181, are legacy timestamped refresh markers down to `2026-04-27`) |
| Window or full history | **Full history.** It reaches back to 2026-05-08 and carries the 2026-04 scaffold markers — it has never been pruned or archived. |
| Section size share | 39785 / 72982 chars = **54.5 %** of the file (the changelog is longer than all other sections combined) |
| Anomalies | `2026-05-08 18:26:34`, `2026-04-28 Tuesday 08:31:55 PDT`, `2026-04-27 Monday 05:45:45 PDT` are not task entries. Dates out of order around 2026-08-04 → 2026-07-14 → 2026-07-12 → 2026-07-05 → 2026-07-04 → 2026-07-02 → 2026-06-30 → … → 2026-06-14 → 2026-05-08 → 2026-04-28 → 2026-04-27 (only the 2026-04 tail is chronological; the body is descending with two legacy-marker intrusions). |

### A3. `frontend/.claude/CLAUDE.md` — `## Change Log` at line 180

| Property | Value |
|---|---|
| Entry lines | 181–240, with one blank line at 217 (59 entries) |
| Non-entry lines | line 217 (blank) |
| Format | Same as backend: one line per entry, full narrative (root cause, files, test counts, verification). Mixed English/Chinese. |
| Mean entry length | 807.6 chars; max 2018; min 155 |
| Length histogram | `1600–3199`: 4, `800–1599`: 17, `400–799`: 31, `200–399`: 3, `<200`: 4 |
| Newest / oldest | 2026-10-12 / 2026-05-08 (legacy markers at 235/236/238/239 down to `2026-04-27`) |
| Window or full history | **Full history.** |
| Section size share | 47720 / 106153 chars = **45.0 %** of the file |
| Anomalies | The very last line (240) is an out-of-order `2026-08-16 ui-consistency-fixes` appended after the 2026-04 scaffold markers — it was inserted at the tail instead of in date order. Four legacy timestamped refresh markers. Blank line at 217 splits the entry run. |

### A4. Format comparison across the three

| Aspect | root | backend | frontend |
|---|---|---|---|
| Entry shape | one-line index | full narrative | full narrative |
| Declared scope | index only, narrative → archive | no declared scope; historically the module narrative store | no declared scope |
| Mean chars/entry | 159 | 946 | 808 |
| History depth | 2026-06-23 onward | 2026-05-08 onward (+ 2026-04 markers) | 2026-05-08 onward (+ 2026-04 markers) |
| Truncated entries (`…`) | 6 | 0 | 0 |
| Section-overlap with archive | 60 / 61 keys already in archive | see C | see C |

Two entries are byte-identical across files: `frontend` line 198 == archive line 23 (`2026-08-27 selection-checkbox-center`, 535 chars, 4-gram Jaccard 1.000), and `backend` line 181 == `frontend` line 239 (the `2026-04-27 Initial generation` scaffold marker).

---

## B. The archive `.context/history/archives/claudemd-changelog.md`

| Property | Value |
|---|---|
| Physical layout | **73 lines total, 84089 chars.** Line 1 = H1 title; lines 3–4 = a two-line blockquote header; line 5 blank; lines 6–73 = 64 entries, each one giant physical line; line 64 is an orphan continuation paragraph (see below). |
| Heading structure | **One heading only**: `# CRF Editor — CLAUDE.md Change Log 归档`. There are **no `##` sections, no `---` separators, no per-date headers, no task-slug subheadings.** |
| Entry format | A full narrative with `**bold**` markers, still forced onto one physical line: `` - `<date>` (task `<slug>`): <full narrative> `` — same shape as the root index but 1.5–30× longer. Mean 1304 chars/entry. |
| Line-length histogram | `<500`: 18, `500–999`: 31, `1k–2k`: 9, `2k–5k`: 15. Max 4523 chars (line 63, `small-defects`); min 231 (line 41). |
| Entry count | 64 (43 entries at creation in `9075ac4`, 2026-10-08; 21 appended since) |
| Newest / oldest by line position | lines 6–56 are a descending block `2026-10-11 → 2026-06-23`; line 57 starts a **second** block `2026-10-08 → 2026-10-12` (ascending) appended after the original migration |
| Actual date range | 2026-06-23 → 2026-10-12 |
| Non-entry lines | 3: the two blockquote lines (3–4) and line 64, an untitled continuation paragraph ("最终验证（审查整改后）：后端全量 1038 passed …") belonging to the `2026-10-08 small-defects` entry on line 63. Line 64 is the only place in the file where an entry's evidence is split across two physical lines, which breaks any per-line entry parser. |
| Ordering | Two blocks, each internally near-sorted but with local inversions (line 33 `2026-08-17 admin-property-cards` after line 32 `2026-08-12`; the whole 57–73 block restarts at 2026-10-08 after line 56's 2026-06-23). |
| Header claim vs reality | Lines 3–4 still say "归档时间：2026-10-08 … 43 条，2026-06-23 → 2026-09-30". The real state is **64 entries, window 2026-06-23 → 2026-10-12**. The header is stale on both count and end date. |
| Trailing `…` | None: all 10 archive lines that contain `…` are *interior* ellipses inside prose, not truncation markers. |

---

## C. Overlap: module logs vs root vs archive

Method: key = (`date`, task-slug) after normalizing review-suffix markers in `(task …)` (e.g. `` (task `reference-delete-guard` 审查跟进) `` and `` (task `reference-delete-guard` review follow-up) `` both reduce to `2026-10-10 reference-delete-guard`). Multiplicity is preserved: two same-date/same-task entries are two keys' worth of occurrences. `archive_line` = the physical line in the archive holding the counterpart.

### C1. `backend/.claude/CLAUDE.md` — 42 section lines = 39 dated entries (36 keys) + 3 legacy markers → 27 key matches, 10 lines with no archive counterpart

| date | task (as written) | in root? | in archive? | archive line |
|---|---|---|---|---|
| 2026-10-10 | `backend-dedup` | YES | YES | 7 |
| 2026-10-10 | `temp-resource-lifecycle` | – | **–** | — |
| 2026-10-10 | `export-layer-cleanup` | YES | YES | 71 |
| 2026-10-10 | `reference-delete-guard` review follow-up | YES | YES | 10 |
| 2026-10-09 | `reference-delete-guard` | YES | YES | 12 |
| 2026-10-09 | `legacy-cleanup` | YES | YES | 69 |
| 2026-10-09 | `test-config-isolation` | YES | YES | 68 |
| 2026-10-08 | `small-defects` | YES | YES | 63 |
| 2026-10-08 | `test-isolation` | YES | YES | 62 |
| 2026-10-08 | `template-field-source-form-oid` | YES | **–** | — |
| 2026-10-08 | `docx-temp-ownership` | YES | YES | 60 |
| 2026-10-08 | `docx-screenshot-render-backend` | YES | YES | 59 |
| 2026-09-30 | `date-time-hour-format` | YES | YES | 14 |
| 2026-09-30 | `template-field-search` | YES | YES | 16 |
| 2026-09-29 | `auto-merge-after-checks` | YES | YES | 19 |
| 2026-09-29 | `designer-label-oid`, post-merge review follow-up | YES | YES | 20 |
| 2026-09-29 | `designer-label-oid` | YES | YES | 21 |
| 2026-08-28 | `designer-copy-field-draft` | YES | YES | 22 |
| 2026-08-12 | `admin-recycle-cleanup` | YES | YES | 35 |
| 2026-08-06 | `codelist-option-oid-free` | YES | YES | 36 |
| 2026-08-06 | `template-import-oid-preserve` | YES | YES | 37 |
| 2026-08-05 | `log-row-readonly-drop-trailing-underscore` | YES | YES | 39 |
| 2026-08-04 | `systemd-deployment` | YES | YES | 42 |
| 2026-07-14 | `07-14-checkbox-default-check` | YES | YES | 44 |
| 2026-07-14 | `07-14-crf-editor-batch-fixes` | YES | YES | 45 |
| 2026-07-12 | `07-12-checkbox-field-type` | YES | YES | 47 |
| 2026-07-05 | `07-05-docx-ai-suggestion-accept` | YES | YES | 48 |
| 2026-07-04 | (no task) ×2 | YES | YES (1 of 2) | 49 |
| 2026-07-02 | (no task) | – | **–** | — |
| 2026-06-30 | (no task) | YES | YES | 50, 51 |
| 2026-06-29 | (no task) | YES | YES | 52 |
| 2026-06-21 | (no task) | – | **–** | — |
| 2026-06-18 | (no task) | – | **–** | — |
| 2026-06-16 | `06-16-word-export-toc-autofill` | – | **–** | — |
| 2026-06-16 | `06-16-word-vchoice-option-gap` | – | **–** | — |
| 2026-06-14 | (no task) ×2 | – | **–** | — |
| 2026-05-08 | (no task) | – | **–** | — |
| 2026-05-08 18:26:34 / 2026-04-28 / 2026-04-27 | legacy refresh markers | – | – | — |

**Backend entries that exist ONLY in the module log (10 lines, 7482 line-chars — must be moved into the archive before any deletion):**

| line | chars | date | task | subject |
|---|---|---|---|---|
| 141 | 659 | 2026-10-10 | `temp-resource-lifecycle` | leaf services `temp_paths.py` / `upload_streaming.py` / `await_drain.py`, 0600 temp-file streaming, threadpool, 5 new test modules, 1072 passed / 84 % |
| 149 | 1400 | 2026-10-08 | `template-field-source-form-oid` | `TemplateFieldSource.form_code`, `_clean_optional`, legacy-column probe, `test_template_field_index.py` 16→18 |
| 169 | 1002 | 2026-07-02 | (no task) | AI 测试连接 false negatives: `follow_redirects=True`, masked-key restore in `routers/settings.py` |
| 172 | 276 | 2026-06-21 | (no task) | Word export TOC non-empty fallback page numbers |
| 173 | 417 | 2026-06-18 | (no task) | doc sync: services 13→14 (`toc_pagination.py`) |
| 174 | 2286 | 2026-06-16 | `06-16-word-export-toc-autofill` | hybrid pre-rendered TOC (`_add_toc_placeholder` / `_add_toc_heading` / `_populate_toc`) |
| 175 | 616 | 2026-06-16 | `06-16-word-vchoice-option-gap` | `docGrid` snap-to-grid option gap, `_disable_snap_to_grid` |
| 176 | 320 | 2026-06-14 | (no task) | Word export row height `EXACTLY` → `AT_LEAST` 1cm |
| 177 | 336 | 2026-06-14 | (no task) | doc sync: services 12→13 (`word_table_parity.py`) |
| 179 | 170 | 2026-05-08 | (no task) | `form.paper_orientation` field + migration + export override |

**Backend entries present in the archive but with LESS detail than the module log (8 keys, 2080 excess chars).** The archive is not strictly a superset; in these cases the module narrative adds material the archive lacks:

| key | module chars | archive chars | delta |
|---|---|---|---|
| 2026-07-04 (no task) | 1376 (2 lines) | 808 (1 line) | +568 |
| 2026-09-30 `date-time-hour-format` | 1860 | 1453 | +407 |
| 2026-07-05 `07-05-docx-ai-suggestion-accept` | 985 | 696 | +289 |
| 2026-09-29 `designer-label-oid` | 1248 | 978 | +270 |
| 2026-08-05 `log-row-readonly-drop-trailing-underscore` | 868 | 655 | +213 |
| 2026-08-12 `admin-recycle-cleanup` | 1072 | 876 | +196 |
| 2026-08-06 `codelist-option-oid-free` | 652 | 555 | +97 |
| 2026-10-10 `reference-delete-guard` | 802 | 762 | +40 |

### C2. `frontend/.claude/CLAUDE.md` — 59 section lines = 55 dated entries (51 keys) + 4 legacy markers → 43 key matches, 8 lines with no archive counterpart

| date | task (as written) | in root? | in archive? | archive line |
|---|---|---|---|---|
| 2026-10-12 | `visits-preview-split` | YES | YES | 73 |
| 2026-10-11 | `designer-split` | YES | YES | 6 |
| 2026-10-11 | `app-word-import-split` | YES | YES | 72 |
| 2026-10-10 | `designer-reference-preservation` | YES | YES | 8 |
| 2026-10-10 | `reference-delete-guard` review follow-up | YES | YES | 10 |
| 2026-10-09 | `reference-delete-guard` | YES | YES | 12 |
| 2026-10-09 | `legacy-cleanup` | YES | YES | 69 |
| 2026-10-09 | `frontend-mount-tests` 合入后复审跟进 | YES | YES | 66 |
| 2026-10-09 | `frontend-mount-tests` | YES | YES | 65 |
| 2026-10-08 | `small-defects` | YES | YES | 63 |
| 2026-10-08 | `template-field-source-form-oid` | YES | **–** | — |
| 2026-09-30 | `date-time-hour-format` | YES | YES | 14 |
| 2026-09-30 | `template-field-search` | YES | YES | 16 |
| 2026-09-29 | `designer-autocomplete-candidates` | YES | YES | 18 |
| 2026-09-29 | `designer-label-oid`, post-merge review follow-up | YES | YES | 20 |
| 2026-09-29 | `designer-label-oid` | YES | YES | 21 |
| 2026-08-28 | `designer-copy-field-draft` | YES | YES | 22 |
| 2026-08-27 | `selection-checkbox-center` | YES | YES (byte-identical) | 23 |
| 2026-08-17 | `admin-align-designer-border` | YES | YES | 24 |
| 2026-08-17 | `admin-property-cards` | YES | YES | 33 |
| 2026-08-14 | `designer-panel-draft-fix` | YES | YES | 25 |
| 2026-08-14 | `visit-flow-workspace` | YES | YES | 26 |
| 2026-08-14 | `toolbar-pane-alignment` | YES | YES | 27 |
| 2026-08-14 | `admin-organization-management` | YES | YES | 28 |
| 2026-08-13 | `global-search-list-actions` | YES | YES | 29 |
| 2026-08-13 | `designer-notes-chip-capsule` | YES | YES | 30 |
| 2026-08-12 | `designer-notes-chip-contrast` | YES | YES | 31 |
| 2026-08-12 | `fix-pr67-notes-chip-layout` | YES | YES | 32 |
| 2026-08-12 | `designer-header-notes-linebreak` | YES | YES | 34 |
| 2026-08-12 | `admin-recycle-cleanup` | YES | YES | 35 |
| 2026-08-06 | `codelist-option-oid-free` | YES | YES | 36 |
| 2026-08-06 | `frontend-base-path` | YES | YES | 38 |
| 2026-08-05 | `log-row-readonly-drop-trailing-underscore` | YES | YES | 39 |
| 2026-08-04 | `fix/designer-prop-actions-inline` | YES | YES | 40 |
| 2026-08-04 | `fix/designer-log-row-prop-actions` | YES | YES | 41 |
| 2026-07-15 | `07-15-designer-form-switch-inline-props` | YES | YES | 43 |
| 2026-07-14 | `07-14-checkbox-default-check` | YES | YES | 44 |
| 2026-07-14 | `07-14-designer-history-busy-residual` | – | **–** | — |
| 2026-07-14 | `07-14-crf-editor-batch-fixes` | YES | YES | 45 |
| 2026-07-13 | `07-13-designer-field-copy` | YES | YES | 46 |
| 2026-07-12 | `07-12-checkbox-field-type` | YES | YES | 47 |
| 2026-07-05 | `07-05-docx-ai-suggestion-accept` | YES | YES | 48 |
| 2026-06-30 | (no task) | YES | YES | 50, 51 |
| 2026-06-29 | (no task) ×2 | YES | YES (1 of 2) | 52 |
| 2026-06-25 | (no task) | YES | YES | 53 |
| 2026-06-24 | (no task) | YES | YES | 54 |
| 2026-06-23 | (no task) ×2 | YES | YES | 55, 56 |
| 2026-06-18 | (no task) | – | **–** | — |
| 2026-06-15 | `06-15-designer-new-field-draft` | – | **–** | — |
| 2026-06-15 | `06-15-designer-undo-redo-20` | – | **–** | — |
| 2026-06-14 | (no task) | – | **–** | — |
| 2026-05-08 | (no task) | – | **–** | — |
| 2026-08-16 | `ui-consistency-fixes` | – | **–** | — |
| 2026-05-12 / 2026-05-08 18:26:34 / 2026-04-28 / 2026-04-27 | legacy refresh markers | – | – | — |

**Frontend entries that exist ONLY in the module log (8 lines, 6892 chars):**

| line | chars | date | task | subject |
|---|---|---|---|---|
| 191 | 2018 | 2026-10-08 | `template-field-source-form-oid` | `templateFieldFormCodes` + `rankTemplateFieldMatches` four-group ranking, `formatTemplateFieldSource` |
| 219 | 481 | 2026-07-14 | `07-14-designer-history-busy-residual` | surgical port of residual busy/session races; frontend suite 490 passed |
| 231 | 351 | 2026-06-18 | (no task) | doc sync: tests 28→30 (`editModeHiddenIdentifiers.test.js`, `tableHeaderStyle.test.js`) |
| 232 | 1229 | 2026-06-15 | `06-15-designer-new-field-draft` | new fields as local `__draft__` state, `saveDraftField` persistence |
| 233 | 932 | 2026-06-15 | `06-15-designer-undo-redo-20` | `useDesignerHistory.js`, 20-step dual stack, 6 action types, Ctrl+Z/Y |
| 234 | 449 | 2026-06-14 | (no task) | doc sync: components 12→13, composables 11→14, tests 22→26 |
| 237 | 192 | 2026-05-08 | (no task) | FormDesignerTab note display + `paper_orientation` control |
| 240 | 1240 | 2026-08-16 | `ui-consistency-fixes` | admin/user UI consistency pass + draft-save defect fix |

**Frontend entries present in the archive but with LESS detail than the module log (22 keys, 4622 excess chars).** Top offenders:

| key | module chars | archive chars | delta |
|---|---|---|---|
| 2026-08-14 `designer-panel-draft-fix` | 1164 | 463 | +701 |
| 2026-08-17 `admin-property-cards` | 1268 | 709 | +559 |
| 2026-07-05 `07-05-docx-ai-suggestion-accept` | 1158 | 696 | +462 |
| 2026-08-05 `log-row-readonly-drop-trailing-underscore` | 1035 | 655 | +380 |
| 2026-09-29 `designer-label-oid` | 1346 | 978 | +368 |
| 2026-07-15 `07-15-designer-form-switch-inline-props` | 729 | 411 | +318 |
| 2026-09-29 `designer-autocomplete-candidates` | 1380 | 1080 | +300 |
| (15 more, deltas 40–184) | | | |

### C3. Overlap summary

| Relationship | Count |
|---|---|
| Backend entries whose key is already in the archive | 27 of 36 keys / 32 of 42 lines |
| Backend lines with NO archive counterpart | 10 lines (7482 line-chars) |
| Backend keys where the module narrative is LONGER than the archive entry | 8 of 27 matched keys (2080 excess chars) |
| Frontend entries whose key is already in the archive | 43 of 51 keys / 48 of 59 lines |
| Frontend lines with NO archive counterpart | 8 lines (6892 line-chars) |
| Frontend keys where the module narrative is LONGER than the archive entry | 22 of 43 matched keys (4622 excess chars) |
| **Total module-only content that must be moved before deletion** | **18 lines, 14374 line-chars** |
| **Total extra detail at risk from simply deleting the module logs** | **21076 chars over 30 key groups** |

Textual overlap between a module entry and its same-key archive entry is **low**: 4-gram shingle Jaccard median is 0.002 (root vs archive), 0.041 (backend vs archive), 0.060 (frontend vs archive). Only one pair (2026-08-27 `selection-checkbox-center`) is byte-identical. In other words, **the module logs and the archive are independently written prose about the same events, not copies of each other.** Deleting a module log is not a deduplication — it discards distinct content. A convergence plan must therefore copy the module narratives into the archive first, not merely verify key presence.

---

## D. Root changelog completeness

| Check | Result |
|---|---|
| Root entry count | **65** dated entries (61 distinct date+task keys; 4 keys carry two same-date entries: 2026-10-09 `frontend-mount-tests`, 2026-09-29 `designer-label-oid`, 2026-06-30 and 2026-06-23 without a task). All 65 lines are standard `- \`<date>\`` entries — the root section has no legacy timestamped markers. |
| Root entries absent from the archive | **1** — `2026-10-08 (task \`template-field-source-form-oid\`)`, root line 177: "模板字段查询来源列内联化（表单OID+名称多行只读）+ 表单 OID 搜索…". Confirmed substring-absent: `form_code` and `template-field-source-form-oid` both return 0 matches anywhere in the archive. |
| Root entries with an archive counterpart | 60 keys (64 lines) → archive lines 6–73 |
| Direction reversed (archive-only keys) | **0** — every archive key exists in the root index. The archive has no orphan entries. |
| Truncated root index lines | 6 (lines 190, 211, 216, 219, 220, 221) end with `…`; the corresponding archive entries are complete, so the truncation is index-only and no narrative is lost. |
| Prefix relationship | 43 of the root's 65 entries are a **verbatim prefix** of their archive counterpart (the older migration-style index lines, 2026-06-23 → 2026-07-04 and 2026-09-30 `imported-log-row-label`). The remaining 22 index lines (2026-08-04 onward) are independently paraphrased. |

**Root-only entry to migrate into the archive:** `2026-10-08 template-field-source-form-oid` (line 177). Note it is also one of the 30 key groups where the backend and frontend module logs carry the detailed narrative — so the fix is to lift the **module** entries (backend line 149 = 1400 chars, frontend line 191 = 2018 chars) into the archive as the full record, and keep the root one-liner as the index.

---

## 5. Structural findings relevant to convergence

1. **The archive is a flat append-only line file.** No `##` sections, no per-date grouping, no task-slug anchors. 64 entries in 73 lines. Any tooling that wants to address a single entry must address a single physical line (except line 63/64, where `small-defects`'s closing evidence paragraph is a separate line — the only split entry in the file).
2. **The archive's own header is stale**: it claims 43 entries ending 2026-09-30; actual is 64 entries ending 2026-10-12.
3. **The archive is not sorted**: lines 6–56 descend 2026-10-11 → 2026-06-23 (with two local inversions), then line 57 restarts at 2026-10-08 and ascends to 2026-10-12. New entries are appended at the tail.
4. **The root index is 29.5 % of a file that is already at or over its stated 40k limit.** Measured as bytes (`wc -c`, the measure the runbooks quote) the file is **40921 bytes = 102 % of budget — over it today**; measured as Unicode characters (`wc -m`) it is 36164 = 90 %. The contradiction between the rule's word "chars" and the runbooks' `wc -c` must be resolved as part of convergence, because the root file cannot grow further under either reading. This is the pressure that created the archive in the first place (`9075ac4 docs(claude): compact root CLAUDE.md change log into archive`).
5. **The two module logs are the real bloat**: the changelog section is 54.5 % of `backend/.claude/CLAUDE.md` (72982 chars total) and 45.0 % of `frontend/.claude/CLAUDE.md` (106153 chars total). Neither module file states a size limit; only the root file does.
6. **No file references the archive for reading purposes except as a write target:** the only mentions of `claudemd-changelog.md` in the repo are (a) the root file's line 156 rule and line 98 rule, and (b) `.trellis/tasks/**` runbook instructions telling authors to append there. Nothing parses or renders it, so its internal structure is currently unconstrained — restructuring it is cheap.
7. **Three distinct changelog genres coexist**, which any single-storage design must either unify or explicitly keep separate:
   - *task narratives* (root index, backend/frontend module logs, archive) — 2026-06-23 onward, date+task keyed;
   - *generation/scan markers* (`2026-04-27 Initial generation`, `2026-04-28 Full scan refresh`, `2026-05-08/12 Incremental scan refresh`) — backend lines 178/180/181, frontend lines 235/236/238/239, timestamped (not date-only), no task slug;
   - *doc-sync bookkeeping* entries that report only file/count deltas (e.g. backend 173/177, frontend 231/234), which have no root or archive counterpart.

## 6. Commands used

```bash
wc -lc .claude/CLAUDE.md backend/.claude/CLAUDE.md frontend/.claude/CLAUDE.md .context/history/archives/claudemd-changelog.md
grep -n '^## \|^# ' <each file>                       # section boundaries
grep -c '^- `' <each file>                            # entry counts
awk '{print NR": "length($0)}' <archive>              # per-line length histogram
grep -n '^---\|^===\|^#' <archive>                    # heading/separator census
git log --oneline --diff-filter=A -- <archive>        # creation commit 9075ac4
python3 -I <parser/compare/probe/textsim scripts>     # /tmp/cl-inv/*.py, not committed
grep -c 'form_code\|temp-resource-lifecycle\|ui-consistency-fixes\|designer-history-busy-residual' <archive>   # all 0
```

## Digest

- Root `## Change Log` (line 154): 65 single-line index entries, 2026-06-23 → 2026-10-12, 10669 chars (29.5 % of a 36164-char file), 6 truncated with `…`, 1 entry with no archive counterpart (`2026-10-08 template-field-source-form-oid`).
- `backend/.claude/CLAUDE.md` (line 139): 42 section lines (39 dated entries + 3 legacy timestamped markers), 2026-05-08 → 2026-10-10 plus a 2026-04 scaffold tail, 39785 chars (54.5 % of file). 10 entries (7482 chars) exist nowhere else.
- `frontend/.claude/CLAUDE.md` (line 180): 59 section lines (55 dated entries + 4 legacy timestamped markers), 2026-05-08 → 2026-10-12 plus a 2026-04 scaffold tail and one out-of-order 2026-08-16 tail entry, 47720 chars (45.0 % of file). 8 entries (6892 chars) exist nowhere else.
- Archive: flat file, 73 lines / 84089 chars / 64 one-line entries, **one** heading, no date or task sections, two unsorted blocks (descending 2026-10-11→2026-06-23 then ascending 2026-10-08→2026-10-12), one split entry at lines 63–64, stale header claiming 43 entries / 2026-09-30.
- Overlap: backend 27/36 keys and frontend 43/51 keys already have archive entries, but the prose is largely **independent** (median 4-gram Jaccard 0.04–0.06 against the archive; only one byte-identical pair). 18 module entries (14374 chars) have no archive record at all, and 30 key groups (21076 chars total) would lose detail if the module logs were deleted without first folding their text in.
- Root direction is clean: 0 archive-only keys; exactly 1 root-only key.
- The root file is already at 40921 bytes / 36164 chars, i.e. over the `wc -c` reading of its own 40k rule.
