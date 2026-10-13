# Design — docs-sync

PRD: `prd.md`. Shared runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (parent §0–§8).
Evidence (all anchors re-verified on `main` @ `0daf58e`, 2026-10-12):

| File | Covers |
|---|---|
| `research/contract-duplication.md` | R1: spec section map, per-line SUBSET/UNIQUE/NO-SPEC dispositions for the three CLAUDE.md files |
| `research/counts-and-stale.md` | R2/R3/R5: ground-truth counts, path/command existence checks, README diff |
| `research/changelog-inventory.md` | R4: entry counts, module↔archive overlap, uniqueness analysis |

---

## 0. Re-baseline (main `0daf58e`) — deltas vs the PRD's planning-time facts

The PRD was written 2026-10-08 against `6580fc9`; the rest of the tree has since merged. Re-verified state:

| PRD claim (planning) | State on `0daf58e` | Consequence |
|---|---|---|
| `.claude/index.json` missing 1 router + 6 services, "各小节当前均有漏" | The named 7 gaps were already filled by later docs commits (`6cb035c` etc.). Remaining gap class: package markers (`__init__.py` ×5 in backend src packages) are absent from every list — the original generation excluded them. | R2's remaining work = `__init__.py` policy (D2) + sort fixes + timestamp/version |
| R7: 4 ordering inversions | `modules[0].tests` and `modules[1].components` were already fixed; **`modules[0].services`** (export_service before database_export_service) and **`modules[3].important_paths`** (service.template before env.example) remain. A new list `modules[0].commands` (added 2026-10-10) needs classification. | R7 exits the task with exactly 2 fixes + 1 classification |
| Root `.claude/CLAUDE.md` "26,266 chars, under 40k" | 36,164 chars / **40,921 bytes** — over the byte reading (`wc -c`) of its own 40k rule; the research flags the chars-vs-bytes ambiguity | R1+R3 shrink it to ≈33k bytes; report both measures |
| "backend/tests/ 65 files / frontend/tests/ 69 files" | 76 / 87 (both already correct in the CLAUDE.md files); **README.md:463 + README.en.md:463 still claim 63 files / 61 `test_*.py`** (stale, verified) | R5 fixes the READMEs |
| Contract duplication (root + 2 modules restate the spec) | Confirmed; every overlapping statement is a SUBSET (no CONFLICT); module narratives carry separately-owned implementation facts | R1 = reduction to pointers with a small keep-list (§2) |
| Changelog triplication | Confirmed. Module narratives are **independently written prose**, not copies: 4-gram Jaccard median 0.04–0.06 vs the archive; only 1 byte-identical pair. 18 module entries (14,374 chars) have no archive record; 30 key groups (21,076 chars) would lose detail if module logs were deleted without folding their text into the archive | R4 must **copy first, reduce second** (§4) — deleting module logs is not a dedup |
| Spec-internal defect | `cross-stack-contracts.md:62` says "see §12" for the format-option contract; that contract is §13 (`§12` = template field search) | D8 fixes the cross-reference only |

Also verified this session (by script, see `research/*.md` §notes): all 556 backticked paths in the five docs resolve except 13 historical/abbreviated ones (7 retired perf/CI artifacts in changelog prose, 1 abbreviated prose path, 5 `**` globs); all documented commands have live targets; the two READMEs are line-for-line parallel (24/24 code blocks translation-only diffs).

---

## 1. Decisions

- **D1 — R1 scope is normative contract statements.** Reduction applies to: root `## Cross-Stack Contracts` (L108–122); backend `## Import/Export and Column Width Contracts` sync-restatements + the 3 Development-Conventions sync bullets (L121–123); frontend `## Preview Column Widths` contract lines (L96–97, L103–105) and `## Authentication and Admin Interaction` session-scoping lines (L111–113). Retained: product-feature summaries (root Core Capabilities), module file-location prose (Key Entry Points, Router/Service Overview, Key Components and Flows), frontend-local rules with no spec section (localStorage keys L100–102, UI style contracts L92, `crf_edit_mode`/`crf_view_mode` L86), and backend-owned implementation notes (TOC mechanics, snapToGrid, export error semantics, template-import OID, form-copy contract — none of these are in the spec, so they are not restatements). **The spec receives zero content additions** (PRD: 不改契约正文语义); only the D8 cross-reference fix.
- **D2 — index.json lists match the filesystem exactly, including package markers.** Add the 5 missing `backend/src/{routers,services,models,schemas,repositories}/__init__.py` entries (they carry real content: `models/__init__.py` defines `Base`, `schemas/__init__.py` defines `BatchDeleteRequest`). Consequence: the "14 router modules" style counts in module docs go away under R3 anyway, so no count contradiction arises. This makes AC2's "一一对应" hold with no exclusion rule.
- **D3 — R3 removal set (counts).** Remove: corpus counts (mermaid labels `(14)`…, root Module Index "Tests" cells, module Core Directories parentheticals `(14 router modules)` / `(76 files: 74 …)` / `(21 Vue components)` / `(36 JS modules)` / `(1 script)`, README test-file counts) and current-state line counts in component descriptions (`552 lines`, `796 lines`, `577 lines`, `133 lines`). Keep: contract constants/values (they move to the spec with R1), historical numbers inside narrative/changelog text (being archived), per-file case counts in `## Testing Focus` (historical descriptors of the task that introduced them — removing them is not a file count and would churn the whole section), version pins and thresholds (`40k`, `vitest@5.0.3`, JWT 60 min, `month=30`/`year=365`, page 21×29.7). The boundary is stated in the verification report.
- **D4 — The archive is the only narrative store; module Change Logs become pointer-only.** "只保留近期条目或链接" is resolved to *link only*: a recent-window copy would re-create the duplication R4 removes. All backend (42 lines) and frontend (59 lines) Change Log lines are folded verbatim into `.context/history/archives/claudemd-changelog.md` **before** the sections are replaced; dedup drops only byte-identical lines (verified: 1 pair, plus the duplicated scaffold marker), with a note.
- **D5 — Related File List tables are replaced by a pointer to `.claude/index.json`.** The tables are a second, hand-maintained copy of index.json's lists and already drifted (11 omissions verified). Options considered: (a) complete the tables — rejected: keeps two maintenance points, the drift class the PRD names ("模块清单漂移"); (b) delete the duplicated tables and point at the authoritative machine-checkable index — chosen. Verified no unique name is lost: every filename dropped from a table also appears in the same module doc's prose (`Core Directories`, `Router/Service Overview`, `Key Components and Flows`, `Testing Focus`) or in index.json, which R2 makes exact.
- **D6 — R2/R7 exact fixes.** `modules[0].services`: move `database_export_service.py` to its sorted position (after `await_drain.py`). `modules[3].important_paths`: swap to `crf-editor.env.example`, `crf-editor.service.template`, `install-service.sh`, `nginx/…`. Re-sorting is done by script from the filesystem, then verified by the AC7 scanner.
- **D7 — R7 classification of `modules[0].commands`** (added after planning by the `reference-delete-guard` follow-up): workflow order (`ruff format .` → `ruff format --check .` → `git config blame…`), documented as an intentional exception alongside `next_steps` (priority order) and `entry_files` (main entry first). The scanner's exception table carries the rationale.
- **D8 — spec touch = one cross-reference fix.** `cross-stack-contracts.md:62` "see §12" → "see §13". No other spec edit (its cosmetic defects — missing blank line before §13, sparse Quick-Reference/Tests-Required tables — are recorded as out-of-scope observations, not fixed).
- **D9 — new convention recorded in `.trellis/spec/guides/git-and-tooling-conventions.md`** (Trellis step 3.3): changelog convergence rule (narratives → archive; root keeps the single-line index; module docs keep pointers only). Separate spec commit.
- **D10 — READMEs stay semantically identical.** L463/L464 rephrased count-free in both files. Verified no test reads the changed sentences: only `frontend/tests/portDefaults.test.js` reads README.md/README.en.md, and only for the 8888 port contract.

---

## 2. R1 — per-file dispositions and replacement drafts

### 2.1 Root `.claude/CLAUDE.md` `## Cross-Stack Contracts` (L108–122, 9,319 chars)

Replace with a pointer block (~1.3k chars). Draft (file names trimmed to the anchor pair per contract; final text may drop/keep as noted):

```markdown
## Cross-Stack Contracts

> Contract bodies (rules, constants, fixtures, sync file lists) live only in
> `.trellis/spec/guides/cross-stack-contracts.md`. The lines below are pointers — do not restate details here.

- §1 Column width planning — `backend/src/services/width_planning.py` ↔ `frontend/src/composables/useCRFRenderer.js`; shared fixture `backend/tests/fixtures/planner_cases.json` (generator `frontend/scripts/generatePlannerFixtures.mjs`).
- §2 Two-phase ordering — `backend/src/services/order_service.py` ↔ `frontend/src/composables/useOrderableList.js` / `useSortableTable.js`.
- §3 Authentication token schema (incl. rules 4–5 session-scoped token write-back / 401) — `auth_service.py`, `dependencies.py` ↔ `useApi.js`, `App.vue`, `LoginView.vue`.
- §4 Word import screenshot evidence + temp-resource lifecycle — `routers/import_docx.py`, `docx_screenshot_service.py` ↔ `DocxCompareDialog.vue`, `DocxScreenshotPanel.vue`, `WordImportDialog.vue`.
- §5 Word preview / export strict table-field parity — `word_table_parity.py`, `scripts/compare_word_table_parity.py` ↔ `main.css` (`.wp-form-title`).
- §6 aCRF annotation geometry & persistence — `acrfAnnotationGeometry.js`, `useAcrfAnnotationDrag.js` + designer/visits preview chain ↔ `schemas/form.py`, `export_service.py`, `forms.py`, clone/import services.
- §7 Form paper orientation — `models/form.py` + schema/migration/copy/import/export ↔ `FormDesignerTab.vue`.
- §8 Checkbox field type (`复选`) — model/schema/migration/rendering/imports ↔ `FieldsTab.vue`, `FormDesignerTab.vue`, `useCRFRenderer.js`.
- §9 API base path (subpath deployment) — `vite.config.js`, `apiUrl()` bypass sites; backend zero-aware; nginx strips the prefix.
- §10 OID / identifier charset — `schemas/_common.py` ↔ `oidValidation.js`.
- §11 Recycle-bin cleanup policy — `config.py`, `routers/admin.py`, `project_size_service.py`, `recycle_bin_cleanup_service.py`, `background_jobs.py` ↔ `AdminView.vue`, `byteSize.js`.
- §12 Template field search index — `routers/template_fields.py`, `template_field_index_service.py` ↔ `templateFieldSearch.js`, `TemplateFieldSearchDialog.vue`.
- §13 Date/time format options — `dateFormatOptions.js` (single option source) ↔ `database.py`, `field_rendering.py`, `docx_import_service.py`, `useCRFRenderer.js`.
- §14 Reference-aware delete guard — `field_definition_reference_service.py`, `codelists.py`, `units.py` ↔ `referenceDeleteGuard.js`.
```

Facts from the old lines that are **kept** (either covered by the spec anyway, per `research/contract-duplication.md` §2, or folded into the drafts above): fixture generator name (§1), `useSortableTable.js` (§2 — absent from the spec's file row, kept in the pointer), §3/§5/§6/§11/§12/§13/§14 already ended in `§`-pointers. Facts dropped because the spec owns them verbatim: all constant lists, `max-width:10.0em`, the 9-bypass-site enumeration, `sources[].form_code` shape, `include_unplaced` semantics.

### 2.2 Backend `.claude/CLAUDE.md`

- `## Import/Export and Column Width Contracts` (L87–101): replace the pure-restatement rows **L93–L98** with one compact pointer line (`Column width planning (constants, fixture generator, fill-line rules): cross-stack §1; strict preview/export parity: cross-stack §5; checkbox 复选: cross-stack §8; the backend entry points are width_planning.plan_normal_table_width / compute_fill_line_char_count and word_table_parity.py.`). Keep L88–L92 (row-height constants, TOC hybrid pre-render, baked page numbers, `_has_field_codes`, `snapToGrid`/`tcMar` mechanism — none in the spec) and L99–L101 (template-import OID contract, export error semantics, form-copy contract — none in the spec).
- `## Development Conventions` L121–L123: replace the three long sync checklists with pointer lines (`paper_orientation → cross-stack §7`, `annotation_positions → §6`, `checkbox 复选 → §8`) — the checklists themselves are subset per research; the spec owns the file sets.
- `## Core Directories` L24–L30: drop counts per D3; keep the descriptions and the model class enumeration.
- `## Related File List` (L127–137): replace the table with `> Complete file inventory (authoritative): `.claude/index.json`.` (D5). The `Tests (new/recent)` row goes with it (a recency list that ages; index.json carries the full test list).
- `## Change Log` (L139–181): fold into the archive, then replace with the pointer paragraph (§4 draft).

### 2.3 Frontend `.claude/CLAUDE.md`

- `## Preview Column Widths (Content-Driven)` L96–97 → one pointer line to cross-stack §1 (planner entry-point names kept). L98–102 (resize wiring, localStorage key grammars, fallback rule) **kept** — no spec section owns them. L103 → pointer (§1 fixture). L104 → pointer (§8 checkbox). L105 → `- .wp-form-title must stay text-align: left`（pointer to §5 + `wordPageGeometry.test.js`）. L51/52/55/56 line counts dropped (D3).
- `## Authentication and Admin Interaction` L111–113 → one pointer line (`401 handling centralized in useApi.js; session-scoped token write-back and 401 (rules 4–5) — cross-stack §3. Guarded by tests/useApiSessionRace.test.js / tests/appSettingsShell.test.js.`). L108–L110 and L112's SessionTimer/`/api/auth/me` sentence collapse into it; L108–L109 (routing, admin shell) stay.
- `## Core Directories` L39–L43: drop counts per D3.
- `## Related File List` (L171–178): pointer to `.claude/index.json` (D5).
- `## Change Log` (L180–240): fold + pointer (§4).

### 2.4 Kept-as-is (verified, listed so the reviewer can spot-check)

Root Core Capabilities / Security / Testing Strategy / AI Usage Guide / Git Workflow; backend Security Behavior / Database and Compatibility / Service Overview / Router Overview; frontend Key Entry Points / Key Components and Flows / Development Conventions / Testing Focus. All are NO-SPEC or module-owned prose; `research/contract-duplication.md` §6 lists them with rationale.

---

## 3. R2 / R7 — index.json exact edits

1. Insert `__init__.py` into the five backend package lists (sorted position: `_` sorts before letters, so first in each list).
2. Move `backend/src/services/database_export_service.py` from position 7 to position 5 (after `await_drain.py`).
3. Reorder `modules[3].important_paths` → `crf-editor.env.example`, `crf-editor.service.template`, `install-service.sh`, `nginx/crf-editor.conf.example`.
4. `version` 1.4.2 → 1.4.3; `timestamp` → `2026-10-12`.
   **Execution note (2026-10-13):** this design was written 2026-10-12; execution started 2026-10-13.
   All execution-date stamps use **`2026-10-13`** instead of `2026-10-12` (index.json `timestamp`, the
   archive fold-section header, the module pointer paragraphs, the root/doc-sync changelog entries).
   Writing the design-date would re-introduce exactly the stale-metadata class this task removes.
5. Untouched: coverage blocks, `gaps`, `scan_summary` (scan metadata about the original generation; not part of R2's list/timestamp/version scope — recorded as an explicit boundary).
6. Verification: AC7 scanner (all string arrays, exception table) + `python3 -m json.tool` + filesystem reconciliation script (AC2 evidence).

---

## 4. R4 — changelog convergence mechanics

1. **Extract** the `## Change Log` entry lines from `backend/.claude/CLAUDE.md` (42 lines, 39,785 chars incl. rules) and `frontend/.claude/CLAUDE.md` (59 lines, 47,720 chars). Entry lines = lines starting with `- \``, including the legacy timestamped scaffold markers.
2. **Fold into the archive** as a new trailing section (original 73 lines untouched except the header):
   `## 模块级 Change Log 并入（2026-10-12，task docs-sync）` + a provenance note + `### 来源：backend/.claude/CLAUDE.md` and `### 来源：frontend/.claude/CLAUDE.md` blocks with the entries **verbatim, in source order, one per line**. Dedup: drop frontend lines byte-identical to an already-present line (1 known pair: `2026-08-27 selection-checkbox-center`; the `2026-04-27 Initial generation` marker appears in both module logs) and leave a one-line note per drop.
3. **Update the archive header** (lines 3–4): remove the stale "43 条，2026-06-23 → 2026-09-30" claim; state provenance (root index + module logs folded 2026-10-12) without a hand-written count (D3 spirit).
4. **Replace module Change Log sections** with a pointer paragraph, e.g.:
   `## Change Log` / `> 本文件不再维护独立变更日志（2026-10-12 全体并入归档）。完整任务叙事：.context/history/archives/claudemd-changelog.md；单行索引：根 .claude/CLAUDE.md。新任务叙事只写入归档。`
5. **Root doc**: update the L156 rule line ("archived 2026-10-08, 43 entries" → count-free) and extend the L98 Dev-Conventions rule with "module-level CLAUDE.md files no longer keep their own Change Log".
6. Append this task's own entry (docs-sync) to the archive + one index line to the root Change Log, per the new convention.
7. **Byte-level safety**: implement the archive edit with a temporary script (`/tmp`, A3 exception) that reads the original, writes header + append; verify with `git diff --numstat` that the archive's earlier lines are unchanged except the 2 header lines, and grep that every module entry line's text exists in the new file (count equality: 42+59−2 dups = 99 line occurrences added).

Root Change Log entries are **not** trimmed (its own rule says single-line index; 29.5% of the file is acceptable once the contract section shrinks).

---

## 5. R3 — count inventory (ground truth in `research/counts-and-stale.md` §1)

Removal list per D3: root mermaid 9 labels + Module Index 2 cells; backend Core Directories 6 parentheticals; frontend Core Directories 4 parentheticals + 4 component line-counts; README.md/en 2 count sentences. Everything else listed in the research as "OK" is already correct and stops being hand-written anyway (the contract lines that carried planner counts become pointers). Post-edit sweep: `grep -nE '[0-9]+ (files|个)' ` on the five docs must return only the retained classes (D3), each listed in verification.

## 6. R5 — final sweep

After R1–R4 land: re-run the path-existence checker over the five docs (expect only the 7 historical changelog paths → they move into the archive where history stays history; the abbreviated `backend/auth-security.md` reference disappears with the R1 rewrite); re-run the command-target checks; re-run the README line-diff (must stay translation-only); confirm the three CLAUDE.md + index.json + READMEs agree (each file-count claim gone; inventory lives in exactly one machine-checkable place).

## 7. Verification plan (R6 substitute) and AC mapping

| Check | Command (evidence into `verification.md`) | AC |
|---|---|---|
| JSON valid | `python3 -m json.tool .claude/index.json > /dev/null` | AC7 |
| Lists = filesystem | one-off `reconcile_index.py` (per list: listed == dir glob), output table | AC2 |
| Ordering scan | one-off `scan_order.py` over every string array + exception table with rationale | AC7 |
| Links resolve | one-off `check_doc_paths.py` over 5 docs (backticked paths + `§N` targets against `grep '^### '` of the spec) | AC1/AC5 |
| No contract bodies remain | `grep -n 'WEIGHT_CHINESE\|FILL_LINE_\|annotation_positions\|INLINE_HEADER_FLOOR'` on the 3 CLAUDE.md → only pointer lines | AC1 |
| Root size | `wc -c` / `wc -m` < 40000 | AC4 |
| Archive integrity | line-count + per-entry substring equality + `git diff --numstat` on the archive | AC4 |
| Counts sweep | `grep -nE '[0-9]+ (files|个)'` on 5 docs, each hit classified | AC3 |
| README parity | line-for-line diff script (block pairs + numeric tokens) | AC5 |
| Diff review | read every hunk (`git diff`) | all |
| Optional extra | `node --test frontend/tests/portDefaults.test.js` (the only test that reads READMEs) — beyond the AC6 substitution, run because README text is edited | AC6 |

AC6 note: no other code tests will be run; the report will state this explicitly.

## 8. Risks and rollback

- **Information loss during R1/R4** — mitigated by the keep-lists (§2) and verbatim-first folding (§4.2); rollback = `git checkout -- <file>` (all edits are in the worktree; main checkout untouched).
- **Giant-line archive edits** — do not hand-edit via Edit on 4.5k-char lines; use the temporary script + line-level verification (§4.7).
- **Over-deletion in module docs** — D5/D4 are the two boldest moves; both are called out here for the review gate. If the reviewer prefers, D5 degrades to "complete the tables" and D4 to "keep a recent window" without affecting other steps.
- No code, no tests, no build artifacts are touched; the only executable risk is the temporary scripts, which live in `/tmp` and are not committed.

## 9. Out of scope

Code/tests; spec contract semantics (only D8); the spec's internal cosmetic defects; `.context/prefs/coding-style.md`'s 4 one-line contract reminders (abbreviated triggers, not bodies — boundary recorded); `AGENTS.md`, `.trellis/.template-hashes.json`, `.codex/config.toml`; `index.json` coverage/scan_summary numbers; README feature prose (only the count sentences change).
