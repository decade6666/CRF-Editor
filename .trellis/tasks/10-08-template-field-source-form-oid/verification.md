# Verification Record — template-field-source-form-oid

All commands run from the isolated worktree
`/home/decade/CRF-Editor/.claude/worktrees/template-field-source-form-oid` unless noted.

## Environment

- Python `/home/decade/.venvs/crf-editor/bin/python` (3.10.21); node 24.14.1.
- All six proxy variables unset for every backend run; `CRF_DISABLE_BACKGROUND_JOBS=1`.
- Ignored worktree-local `config.yaml` (git-ignored, verified via `git check-ignore`) with absolute worktree-local `database/` + `uploads/` paths; `crf_editor.db` seeded via `/tmp/tfs-seed-db.py` (user id=1 + one owned project; no main-checkout data copied, no secrets printed).
- Main checkout untouched; the original main working tree retains only its pre-existing unrelated modifications.

## RED evidence (reproduced — original session logs were not persisted)

The interrupted session's RED output was not recoverable from `/tmp` (only the seed script
and the planning-time ranking simulation `/tmp/tfs-sim/` survived). RED was therefore
faithfully reproduced in an isolated snapshot: `/tmp/tfs-red` = `git archive HEAD`
(base `03a2c31`, pre-implementation) + only the new/updated test files copied in.
The real worktree was never rolled back.

Backend (`cd /tmp/tfs-red/backend`, venv python, proxies unset, background jobs disabled):

```
python -m pytest tests/test_template_field_index.py -q
5 failed, 13 passed
FAILED test_service_merges_identical_definitions_in_template_order      # sources lack form_code
FAILED test_service_library_only_definition_has_no_form_name            # form_code key missing
FAILED test_service_sources_carry_form_codes_and_blank_becomes_null     # feature absent
FAILED test_service_legacy_template_without_form_code_column            # feature absent
FAILED test_router_returns_200_for_regular_user_without_project         # response keys lack form_code
```

Frontend (`cd /tmp/tfs-red/frontend`):

```
node --test tests/templateFieldSearch.test.js
tests 45 / pass 25 / fail 20
```

All 20 failures are the new `rankTemplateFieldMatches` / inline-source / wiring cases
(base implementation lacks the wrapper, the form-code extractor, and the inline column).
**RED scope note**: the replay above reflects the 45-case intermediate test file (frontend
25 pass / 20 fail; backend replay already included the FK-safe legacy fixture, 5 failed /
13 passed). The final 48-case test file (after the check-phase +3 cases) was **not**
re-RED'd — these numbers must not be read as final-file RED evidence.

## GREEN evidence (worktree)

Backend (venv python, proxies unset, `CRF_DISABLE_BACKGROUND_JOBS=1`):

| Command | Result |
|---|---|
| `python -m pytest tests/test_template_field_index.py -q` | 18 passed |
| `python -m pytest -q` (full suite) | 986 passed, 4 xfailed, 0 failed (58.92s) |

Frontend:

| Command | Result |
|---|---|
| `node --test tests/templateFieldSearch.test.js tests/searchRanking.test.js tests/searchRankingWiring.test.js tests/clipboardCopy.test.js` | 74 pass, 0 fail (final 48-case file) |
| `node --test tests/*.test.js` (full suite) | 790 tests, 790 pass, 0 fail/cancelled/skipped (final) |
| `npm run lint -- --quiet` | 0 errors |
| `npm run build` | OK (built in 4.92s) |

Intermediate phase runs (historical, superseded by the final numbers above): targeted
71 pass and full 787 pass at the 45-case phase; targeted 68 / full 784 at the 42-case
phase.

Coverage:

| Scope | Result |
|---|---|
| `node --test --experimental-test-coverage --test-coverage-include=src/composables/templateFieldSearch.js tests/templateFieldSearch.test.js` | line 100.00% / branch 91.53% / functions 100.00% (final snapshot; the 45-case pre-refinement phase measured 85.96% branch) |
| Backend changed modules, stdlib `trace` statement coverage (no new dependencies; `pytest-cov` absent) | worktree: `src/routers/template_fields.py` 56 stmts **100%**, `src/services/template_field_index_service.py` 213 stmts **100%** |
| Same `trace` measurement on the clean base snapshot (same final test files) | base: router 55 stmts 100%, service 208 stmts 100% — **no decrease** (new code adds 1 + 5 statements, all covered) |

`trace` scope note: statement-line coverage of the two changed modules under the targeted
test file only — not branch coverage and not whole-repo coverage.

## Test-fix notes (test-only changes during verification; production code untouched)

1. `frontend/tests/templateFieldSearch.test.js` — the `fb1` assertion in
   "form OID query returns merged entries from every matching source form" expected `['1:12']`
   but the correct four-bucket result is `['1:12', '1:11']`: the shared ranker allows edit
   distance 1 for 3-character keywords, so `fb1` fuzzy-matches source code `FA1` (`fa1`→`fb1`,
   distance 1) and entry `1:11` legitimately lands in the form-weak group after the form-strong
   `FB1` hit. Corrected with an explanatory comment.
2. `backend/tests/test_template_field_index.py` `_drop_form_code_column` — the original
   rename-first rebuild left `form_field` / `field` / `visit_form` FKs pointing at the dropped
   `form_with_code` (verified empirically: `PRAGMA foreign_key_list` showed the dangling
   target). Fixed by setting `PRAGMA legacy_alter_table = ON` before the rename so references
   keep targeting `form`; the legacy test now also self-checks the fixture (no `code` column,
   FKs still target `form`, `PRAGMA foreign_key_check` empty).
3. Lead-requested test additions (`frontend/tests/templateFieldSearch.test.js`, +3 cases):
   field-weak + form-strong dual hit lands in group 2 exactly once (ahead of field-fuzzy);
   equal-rank ties within strong and weak groups preserve input order; typo candidates inside
   weak groups keep shared quality ordering (7-char keyword, edit distance 1 before 2).
4. Check-phase refinements by `trellis-check` (production-quality pass on the four files,
   reported by the lead): the new ranking arrays are built with filter construction instead
   of push, the private strong-match helper probes candidates directly via `.some` on the
   array, and 3 optional-source boundary test cases were added (45 → 48 cases; scoped branch
   coverage rose from 85.96% to 91.53%).

## Test-count deltas

- `backend/tests/test_template_field_index.py`: 16 → 18 cases
  (populated/NULL/blank OID multi-source + library-only + alias display; legacy
  missing-`form.code` column with an FK-safe rebuild and byte-identical source file;
  merged-source codes in the existing merge test; API serialization `form_code: string | null`
  incl. `LIB_ONLY` null).
- `frontend/tests/templateFieldSearch.test.js`: 28 → 48 cases (implement phase +14;
  lead-requested ranking cases +3; check-phase optional-source boundary cases +3), covering
  four priority groups; field-weak + form-strong dual hit in group 2 exactly once;
  exact-before-substring within strong groups; shared fuzzy quality within weak groups
  incl. typo-distance ordering; equal-rank tie stability; first-reference dedup; merged
  multi-source form hits with typo-tolerance-aware expectations; form-name/project-metadata
  exclusion; case/whitespace normalization; null/missing sources and codes and optional-source
  boundaries; blank keyword; no input mutation; shared-ranker composition source guard;
  inline source formatting + fallbacks; API shape guard; dialog wiring: wrapper usage,
  hint text, inline wrapping source column without popover/copy/count helper.

## Documentation synchronized

- `README.md` / `README.en.md`: 模板字段查询 / Template Field Search bullets now describe
  form-OID search, the four-group priority, and the inline source column (Chinese README
  Chinese; English README English — conventions preserved, no wholesale rewrites).
- Root `.claude/CLAUDE.md`: Core Capabilities bullet, template-search contract bullet
  (`sources[].form_code: string | null`, read-only `form.code` probing, four-group ranking),
  one-line Change Log entry.
- `backend/.claude/CLAUDE.md`: `template_field_index_service.py` service entry (form_code
  emission + blank cleanup + legacy null) and Change Log entry.
- `frontend/.claude/CLAUDE.md`: `templateFieldSearch.js` composable entry,
  `TemplateFieldSearchDialog.vue` component entry, `templateFieldSearch.test.js` testing-focus
  entry, Change Log entry.
- `.trellis/spec/guides/cross-stack-contracts.md` §12: response shape (`form_code`), purpose
  row, contract rules 3 (adds `form.code` probe), 4 (four-group search composition), 5
  (inline read-only source column replaces popover), plus the executable-contract sections —
  scope/trigger, GET + helper signatures, validation & error matrix (incl. missing-`code`
  read-only `NULL`), good/base/bad cases, wrong-vs-correct (merged single-rank call breaks
  group priority vs dual-domain composition), and test assertion points.
- `.trellis/spec/backend/database-guidelines.md`: optional legacy-column probe list gains
  `form.code`.
- `.trellis/spec/frontend/component-guidelines.md` (non-modal dialog scenario): new table row
  locking the inline read-only source column (wrapping, no truncation/popover/copy).
- `.claude/index.json`: checked — path-level scan index only; the six touched files are
  already listed, no behavioral text exists, so no change was required.
- `.context/current/branches/worktree-template-field-source-form-oid/session.log`: approach
  decision (previous session) + continuation entries (test-expectation fix; check-phase
  follow-ups).

## Browser validation (executed by the lead, AC6)

Real throwaway backend (temporary DB/uploads, port 8921) with a 61-entry template spanning
two pages; all checks passed:

- Source OIDs/names directly visible without clicking; a 2-source field shows both lines
  inline; no source popover remains.
- Search `DM`: exact ordering returns 6 entries, no duplicates (four-group priority);
  `VS` returns WEIGHT/HEIGHT; alias filtering reaches `BRTHDT`; form-name/project metadata
  does not create hits.
- Missing-OID form renders name-only; library-only shows `仅字段库`.
- Copy AGE cell → paste (Ctrl+V) yields `AGE`; dialog reopen keeps the `WEIGHT` keyword and
  results; the clear icon restores all 61 entries at 50 per page; refresh succeeds.
- 1450px light and dark themes + 600px narrow viewport: a long source wraps to 3 fully
  readable lines; console shows no errors or warnings.

Screenshots: `/tmp/crf-tfs-live-kgCTRzqh/browser-light-dm.png`,
`/tmp/crf-tfs-live-kgCTRzqh/browser-dark-sources-visible.png`,
`/tmp/crf-tfs-live-kgCTRzqh/browser-narrow-long-sources.png`.

Final-build supplement: reloaded the actual app with cache bypass after the final build;
its loaded asset `/assets/index-BG2BlfWG.js` matches `frontend/dist/index.html`. Searching
` DM ` and then `DM` again returned exactly `DM -> DDMHNO -> AGE -> SEX -> D_X_M -> ZZZ`,
with six unique entries and inline source text. Project-name query `标准eCRF演示模板`
and source-form-name query `体格检查` both returned zero rows, as required. The final
light-theme screenshot was saved to `/tmp/crf-tfs-live-kgCTRzqh/browser-final-build-dm.png`
and visually inspected. Final console inspection also found no errors/warnings.

Automation corrections (no application-code changes): a WEIGHT assertion originally
counted all source nodes instead of the WEIGHT row; HEIGHT is a legitimate lower-priority
typo-tolerant hit, and the corrected row-specific assertion passed. The temporary fixture
manifest was corrected accordingly. MCP filling an empty string did not propagate the
Vue model update; using the actual clear icon restored the 61-entry result and refresh
passed. An unintended empty New Project dialog from a coordinate click was canceled
without saving; subsequent control actions used exact DOM targets.

Not performed (do not claim): native touch interaction; 10+-source performance measurement.
The regular-user session was bootstrapped with a temporary JWT rather than testing the
login form; all app and template data belonged to the isolated temporary fixture.

## Review outcomes

- Lead cross-layer diff review of the four production files: no implementation errors found.
- Sonnet `trellis-check`: passed; included the test-side refinements recorded above
  (filter-construction arrays, `.some`-based strong helper, +3 optional-source boundary
  cases). Backend numbers unchanged by the check phase (18 targeted / 986 + 4 xfailed /
  trace two modules 100%).
- Haiku read-only frontend review: passed, no confirmed defects; the final small-diff
  review also confirmed unchanged public APIs, four-group ordering, first-reference
  deduplication and blank-search behavior after the immutable-array refinement.

## Not run / limitations

- Native touch interaction, 10+-source performance measurements, and browser login-form
  validation were not run. The final-build `DM` check was run and passed.
- **Backend module coverage**: `pytest-cov` absent (installation needs approval); measured
  instead with the stdlib `trace` module — statement-line coverage of the two changed
  modules only (100% each, worktree and base), not branch/repo-wide coverage. Frontend
  changed-logic coverage is 100% line / 100% functions / 91.53% branch (final snapshot).
- The RED evidence above is a reproduction on a base snapshot, not the interrupted session's
  original log (which was not persisted); the replay used the 45-case intermediate test
  file — the final 48-case file was not re-RED'd.
- At implementation signoff, no commits/merges/pushes/cleanup had been performed. The user
  subsequently authorized separate code/Trellis commits, local main merge and own-task
  worktree/branch cleanup. Remote push remains unauthorized; Git completion is recorded below.

## Status summary

Final snapshot: implementation + tests GREEN across all feasible regressions (backend 18
targeted / 986 + 4 xfailed; frontend 74 targeted / 790 full; lint 0 errors; build OK);
frontend scoped coverage 100% line / 91.53% branch / 100% functions; backend trace
statement coverage 100% on both changed modules (no decrease vs base). Lead-executed
browser validation and the final-build DM check passed. Lead cross-layer review,
`trellis-check`, and both Haiku frontend review passes completed without confirmed
remaining defects. Implementation acceptance criteria AC1–AC7 are satisfied within the
explicitly recorded verification scope. Local Git completion is authorized; remaining
steps are separate commits, integration/reverification against latest main, local main
merge and own-task cleanup. Remote push/deployment is not authorized or performed.
