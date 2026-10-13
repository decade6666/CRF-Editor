# Verification — docs-sync (R6 substitute)

Pure-documentation change: **no code tests were run as acceptance evidence**, per PRD R6. The
substitutes are size statistics, link/path existence checks, full-text greps, list reconciliation and
line-level diff review. The only executed test is `portDefaults.test.js` + `wordPageGeometry.test.js`
(the two frontend tests that read the edited documents); every other test in the repo is untouched by
this diff and was not run.

All commands were run from the worktree `/home/decade/CRF-Editor-docs-sync` (branch `docs/docs-sync`,
base `main` @ `0daf58e`) on 2026-10-13 (CST). Raw RED baseline: `research/baseline-0daf58e.md`.

## Haiku read-only review (parent §6 gate, frontend-facing diff)

A read-only Haiku agent reviewed the diff independently. Check 1 (broken pointers), 2 (dropped
frontend-facing content), 3 (README pair consistency) all **OK**; check 4 and 5 raised three LOW
findings:

| Finding | Handling |
|---|---|
| spec §9 said "eleven call sites in **five** components" while listing six | Fixed — "across six components". |
| spec Tests-Required table cited `tests/test_ordering.py` (never existed) | Fixed — replaced with the two real files (`test_order_service.py`, `test_phase0_ordering_contracts.py`) plus the real frontend guard `orderingStructure.test.js`. |
| same table cited `tests/App.test.js` (never existed) | Fixed — replaced with `appSettingsShell.test.js` + `useApiSessionRace.test.js`, which the spec's own §3 Validation row already named. |

After the fix the spec check reports **0 allowlisted tokens** (the two illustrative names no longer need
an allowlist entry), 368/368 in-scope tokens resolve.

## Independent adversarial verification (workflow `docsync-verify`, 5 agents, 60 checks)

A separate verification workflow ran five adversarial agents against the diff (each with its own
scripts — they were told **not** to trust the task's `/tmp/docsync-scan` probes). Result: 46 CONFIRMED,
5 REFUTED, 9 PARTIAL. Everything the lead's own probes assert was independently reproduced (index
reconciliation, fold verbatimness, spec anchors, README parity, D8 fix). The refuted/partial items and
their handling:

| Finding | Verdict | Handling |
|---|---|---|
| frontend `bypass sites` said **9** wrapped sites; real count is 11 (missed `OrganizationManagementView.vue` logo GET/PUT since 2026-08-14) | REFUTED | Fixed in `frontend/.claude/CLAUDE.md` (list completed, count removed — the full inventory is owned by cross-stack §9) **and** in the spec §9 rule 3 (`nine` → `eleven`, per-call-site wording + the missing component). Root cause of the miscount: the words "call sites" vs components. |
| backend `src/repositories/` description claimed a "field instances" repository (no such module) | REFUTED | Fixed — description now lists base/projects/field definitions/form fields. |
| root Git Workflow said the repo-root `.gitleaks.toml` was removed with the CI; it was removed then restored for the local pre-commit gate | PARTIAL | Fixed — the sentence now states removed-and-restored; verified `.gitleaks.toml` is live (1,411 B) and referenced by `.githooks/pre-commit`. |
| backend row `character weights and CJK extension range coverage share the same contract` was dropped with no spec replacement — the only genuine information loss | PARTIAL | Fixed on the spec side (the SSOT): §1 now states the code-point-driven classifier and that the two range tables are part of the contract, naming the two guard tests. |
| `/crf/assets/...` + `/crf/api/...` literal exemplars elsewhere unchanged (cosmetic spelling) | PARTIAL | Fixed — root §9 pointer carries the two exemplars again. |
| `Last updated:` stamps still dated 2026-10-10/11/12 after substantial 2026-10-13 edits | PARTIAL | Fixed — all three now `2026-10-13`. |
| §3.4 execution note says every execution-date stamp moves to 2026-10-13; design §2.1's "spec owns them verbatim" was claimed for the constant list (the spec renders them with spaces, `WEIGHT_CHINESE = 2`) | PARTIAL | Accepted: the values are spec-owned; the byte-exact token form is a cosmetic difference, recorded here. |
| design §0's "18 module entries (14,374 chars) with no archive record" figure does not reproduce from the diff data | REFUTED | Accepted as a **design-time figure error**, not a data defect: the independent agent re-derived the fold (101 entries, 0 unexplained losses) and both the lead's `verify_fold.py` and the agent's own script agree nothing was dropped. No file change; noted here for the record. |
| `modules[1].config_files` is a category selection, not an exhaustive frontend-root glob; `scan_summary` is scan-time metadata | PARTIAL | Accepted as designed — design §3.5 explicitly bounds `scan_summary`/coverage out of scope, and `config_files` is byte-untouched. |

All fixes above were applied **after** the workflow ran; the full probe suite was re-run afterwards and
is green (see the AC sections below, re-verified at `git diff --stat` = 9 files, 222 insertions / 195
deletions).

## AC1 — contract bodies only in `cross-stack-contracts.md`

| Evidence | Result |
|---|---|
| `grep -n 'WEIGHT_CHINESE\|FILL_LINE_\|INLINE_HEADER_FLOOR\|AVAILABLE_CM\|max-width:10.0em\|annotation_positions' .claude/CLAUDE.md` | **0 hits** (was 13 contract bullets; only a historical `annotation_positions` changelog line remains) |
| Same grep on `backend/.claude/CLAUDE.md` | only the two surviving module-owned rows (`Column width planning … cross-stack §1` pointer + the untouched `snapToGrid`/`tcMar` row) |
| Root `## Cross-Stack Contracts` | 14 bullets, each `§N` + entry-point anchor pair + pointer to the spec (was 9,319 chars → ≈3.0k chars) |
| `check_doc_paths.py` over 5 docs | PASS — 678 in-scope tokens, 0 missing, 1 allowlisted |
| `check_doc_paths.py --spec` on the spec | PASS — `§12`→`§13` anchored check green; all 14 `### N.` headings present |
| Independent workflow agent (60 checks) | every root pointer's number **and topic** verified against its target section; no contract body class (constant lists, bypass enumerations, `sources[].form_code` shape, `include_unplaced` semantics) survives in the three CLAUDE.md files |
| `research/contract-duplication.md` §2 | every deleted statement is SUBSET (no CONFLICT existed); the keep-list survived (spot-checked: `useSortableTable.js` in the §2 pointer, `generatePlannerFixtures.mjs` in the §1 pointer) |

R1 drop ledger (deleted → where the surviving text is): every deleted line is recorded in
`research/contract-duplication.md` §2/§6; the module-owned rows that were **kept** because the spec
does not own them are listed there as UNIQUE/NO-SPEC. Two research-flagged UNIQUE fragments
(`FILL_LINE_MIN_CHARS=6`, `FILL_LINE_EPSILON=1e-9`) were dropped from the root file because the spec
owns them verbatim in §5 L415 and the new §1 pointer covers the whole planner contract — recorded
here so the reviewer can spot-check the boundary.

## AC2 — `.claude/index.json` lists == filesystem

`python3 /tmp/docsync-scan/reconcile_index.py .` → **PASS**, exit 0. 18 lists, no MISSING, no EXTRA:

| list | listed | actual |
|---|---|---|
| backend entry_files / infrastructure / api_routes / services / models / schemas / repositories / scripts / tests | 2 / 6 / 15 / 34 / 12 / 12 / 5 / 4 / 76 | same |
| frontend entry_files / components / composables / styles / config_files / scripts / tests | 2 / 21 / 36 / 1 / 3 / 1 / 87 | same |
| assets / deploy important_paths | 1 / 4 | same |

Five `__init__.py` package markers are asserted separately and listed in their package's array
(`backend/src/{routers,services,models,schemas,repositories}/__init__.py`). RED (pre-edit): 5 lists
short by exactly one marker each + 5 marker rows missing.

## AC7 / R7 — ordering + valid JSON

`python3 /tmp/docsync-scan/scan_order.py .` → **PASS**, exit 0: 18 lists scanned, 0 unexplained
violations, 4 documented exceptions (`entry_files` ×2 main-entry-first, `commands` workflow order per
D7, `ignored_patterns` rule-category, `next_steps` priority — the scanner's exception table).

| Fix | Before | After |
|---|---|---|
| `modules[0].services` | `export_service.py` at 6, `database_export_service.py` at 7 | `database_export_service.py` at 4 (sorted) |
| `modules[3].important_paths` | `service.template`, `env.example`, … | `env.example`, `service.template`, `install-service.sh`, `nginx/…` |

`python3 -m json.tool .claude/index.json > /dev/null` → exit 0. `version` 1.4.2 → **1.4.3**,
`timestamp` → **2026-10-13** (design §3.4 execution note). Coverage/gaps/scan_summary untouched
(boundary recorded in design §3.5).

## AC3 — no hand-written file counts

`grep -nE '[0-9]+ (files|个)|\([0-9]+ (router|service|Vue|JS|files)|[0-9]+ lines\)'` over the five docs:

| File | Remaining hits | Classification |
|---|---|---|
| `.claude/CLAUDE.md` | 5 | all inside `## Change Log` historical entries — retained by D3 |
| `backend/.claude/CLAUDE.md` | 1 | template-import filename prose (`…_p0_upload.db`) — not a count |
| `frontend/.claude/CLAUDE.md` | 0 | — |
| `README.md` | 2 | `:500` ruff-format narrative (134 files, historical fact, correct); `:464` frontend bullet (see below) |
| `README.en.md` | 1 | `:500` same narrative |

Retained-number classification (D3): corpus counts removed (mermaid 9 labels, Module Index 2 cells,
backend Core Directories 6 parentheticals, frontend Core Directories 4 + 4 component line counts,
README 2 test sentences); retained = contract constants, historical changelog numbers, version pins
and thresholds (`40k`, `ruff==0.16.10`, JWT 60 min, `month=30`/`year=365`, page 21×29.7), the
frontend `## Testing Focus` per-file case counts (historical descriptors).

**README:464 note (lead decision):** the `frontend/tests/` bullet still names 87 / 74 / 12 / 10. The
number is currently correct and `research/counts-and-stale.md` flags the drift as the *backend* line
only; the lead additionally removed the counts from that bullet in both files (2 lines each), because
it is the same stale-count class the PRD targets and the sentence is rewritten cleanly. Recorded here
as a scope extension relative to D3's list.

## AC4 — changelog convergence, root budget

| Evidence | Result |
|---|---|
| `verify_fold.py . HEAD` | **PASS** — 42 backend + 59 frontend entries all present verbatim (2 deduplicated against pre-existing archive lines), archive 74 → 187 lines, archive prefix byte-identical, both provenance blocks present, both module sections reduced to a 4-line pointer |
| `git diff -U0 -- .context/history/archives/claudemd-changelog.md` | only lines 3–4 (header blockquote) changed; everything else is the appended tail |
| Archive header | stale "43 条，2026-06-23 → 2026-09-30" replaced with provenance (no hand-written count) |
| Module `## Change Log` | 0 entry lines left in either file |
| Root index | 65 → 66 lines; the pre-existing 2 root entries unchanged; new `2026-10-13 (task docs-sync)` line added, archive pointer count-free |
| Root size | `wc -c` **40,921 → 34,816** (< 40,000 ✓); `wc -m` 36,164 → 31,459 |

## AC5 — R5 sweep and cross-document agreement

- `check_doc_paths.py` over the five docs: PASS (normative sections; 175 changelog lines skipped as
  historical).
- Historical-only misses: 34, all inside changelog prose (retired perf/CI artifacts, deleted CI-gate
  test) — now living in the archive where history stays history.
- R5 sweep found and fixed four stale descriptions beyond the PRD's list: the frontend/spec
  `bypass sites` count (9 → 11), the backend `field instances` repository claim, the root
  `.gitleaks.toml` removed-with-CI sentence (it was restored), and the three `Last updated` stamps.
- README parity (`readme_parity.py`): 522 / 522 lines, 24 / 24 code blocks, identical heading
  structure, identical code (comments excluded) — the 5 numeric-token differences are pre-existing
  translation wording (`方式一` vs `Option 1`, `0 关闭保护，默认 24` vs `0 disables`), byte-identical
  before and after this change.
- Inventory now lives in exactly one machine-checkable place (`.claude/index.json`); both module docs
  point to it, and every dropped filename is recoverable from the same doc's prose or from index.json.

## Executed tests (AC6 note)

```
node --test frontend/tests/portDefaults.test.js     -> 4 pass / 0 fail   (reads README.md/README.en.md; 8888 contract only)
node --test frontend/tests/wordPageGeometry.test.js -> 7 pass / 0 fail   (names CLAUDE.md only in a comment)
```

**Not run:** the backend pytest suite and the frontend vitest/node:test suites as a whole. This diff
changes no executable file (`git diff --name-only` = 6 docs + 2 spec guides + 1 JSON); their results
cannot differ. The two probes above were run because they read the edited documents.

## Sizes (before → after, bytes)

| File | before | after |
|---|---:|---:|
| `.claude/CLAUDE.md` | 40,921 | 34,918 |
| `backend/.claude/CLAUDE.md` | 76,951 | 27,513 |
| `frontend/.claude/CLAUDE.md` | 118,735 | 56,297 |
| `.context/history/archives/claudemd-changelog.md` | 127,067 | 230,377 |
| `.claude/index.json` | 20,668 | 20,888 |
| README.md / README.en.md | 30,534 / 33,324 | 30,527 / 33,350 |

Total documentation bytes 448,200 → 433,870: the two module files shrink by ≈111 KB while the archive
grows by ≈103 KB — the narrative moved, it was not deleted (only 2 byte-identical lines were dropped).
(The `.claude/CLAUDE.md` / module byte figures above are the post-fix values; the root file remains
well under its 40k rule under both readings.)
