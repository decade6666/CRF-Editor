# Implement — docs-sync

Runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (parent; §0–§8 apply). Design (binding):
`design.md`. PRD: `prd.md`. Evidence: `research/*.md`. Nothing here authorizes commit / merge / push / installs;
each needs explicit user authorization (parent §0).

## Execution status

| Step | Status | Evidence |
|---|---|---|
| 0 | Done | worktree `/home/decade/CRF-Editor-docs-sync` @ `0daf58e`; baseline `research/baseline-0daf58e.md`; probes in `/tmp/docsync-scan/`; RED captured |
| 1 | Done (lead-verified) | index.json: 5 `__init__.py` + 2 re-sorts + version 1.4.3 / timestamp 2026-10-13; `reconcile_index.py` PASS (18 lists + 5 markers), `scan_order.py` PASS (4 documented exceptions), `json.tool` OK |
| 2 | Done (lead-verified) | three CLAUDE.md: contract bodies → pointers, counts dropped, Related File List → index.json pointer; root `wc -c` 40,921 → 33,986; contract-body grep = 0; path checker PASS |
| 3 | Done (lead-verified) | archive 74→187 lines; backend 42/42 + frontend 59/59 verbatim (2 byte-identical dupes); `verify_fold.py` PASS; header made count-free; modules now pointer-only |
| 4 | Done (lead-verified) | READMEs 463 count-free in both, 1 line each; `readme_parity.py` line count 522/522 + 24/24 code blocks + headings equal; `portDefaults.test.js` 4/4 pass |
| 5 | Done (lead) | `cross-stack-contracts.md:62` §12→§13 (anchor check PASS); `git-and-tooling-conventions.md` new §6 changelog-convergence (old §6 → §7) |
| 6 | Done | 5-agent adversarial workflow: 60 checks (46 CONFIRMED / 5 REFUTED / 9 PARTIAL); Haiku read-only review: 3 OK + 3 LOW, all fixed; 9 fixes applied total (bypass-site count in frontend+spec, repositories description, gitleaks sentence, CJK range clause, §9 exemplars, Last updated stamps, five/six components, two illustrative test paths); `verification.md` complete |

The lead records each row from its own runs and from agent reports. Agents never edit this table,
`verification.md`, or the PRD.

## Roles and dispatch (lead = orchestrator; probe agents read-only)

| Agent | Type / model | Writes |
|---|---|---|
| S0-baseline | `Bash` inline (lead) | nothing |
| S1-index, S2-contracts, S3-changelog, S4-counts-readme | `trellis-implement` — **one step at a time, one writer per file set** | the step's exact file list only |
| S1-check / S2-check / S3-check / S4-check | `trellis-check` | report; fixes only when the lead delegates them |
| S5-check | `trellis-check` (full-scope) | report |
| S5-review | `Agent` / haiku, read-only (frontend-facing diff review per parent §6) | report only |

File-scope partition (no two writers share a file):

- A: `.claude/index.json` (S1)
- B: `.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md` (S2)
- C: `.context/history/archives/claudemd-changelog.md` + the three Change Log sections of B (**runs after S2**, same files → same sole writer per step; C is S3, separate step, sequential)
- D: `README.md`, `README.en.md` (S4)
- E: `.trellis/spec/guides/*` (D8/D9 commit, separate `.trellis/` commit at the end)

Every dispatch prompt starts with `Active task: .trellis/tasks/10-08-docs-sync` and links `design.md` sections.
Worktree: `/home/decade/CRF-Editor-docs-sync`, branch `docs/docs-sync`, base `main` @ `0daf58e` (parent §2).

## Steps

### Step S0 — worktree + baseline (lead)

1. `git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-docs-sync -b docs/docs-sync main`
2. `python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-docs-sync` and `set-branch … docs/docs-sync` (from the main checkout).
3. Baseline evidence into the task dir (`research/baseline-0daf58e.md`): `wc -c/-m` of the 5 docs + archive;
   `python3 -m json.tool` on index.json; `git diff --check` clean; `node --test frontend/tests/portDefaults.test.js`
   (needs `npm ci` in the worktree — frontend untouched, but the run is the AC6-adjacent probe; if install is
   undesired, record as not-run with the reason).
4. Write the reusable probe scripts into `/tmp/docsync-scan/` (A3 exception, never committed):
   `reconcile_index.py`, `scan_order.py`, `check_doc_paths.py`, `readme_parity.py`, `fold_changelog.py`.
   Version them as the single source for every check below; each prints a PASS/FAIL summary and exits non-zero on FAIL.

### Step S1 — `.claude/index.json` (S1-index)

Do exactly `design.md` §3. RED-first discipline for a data file: before editing, run `reconcile_index.py` and
`scan_order.py` and capture the failing output as the RED evidence (missing `__init__.py` ×5, 2 ordering violations,
1 unclassified list). Apply the edits. Re-run both scripts + `python3 -m json.tool` → GREEN.
AC2 evidence: full per-list reconciliation table (listed == glob) with zero exceptions.
AC7 evidence: ordering scan PASS with the 4-entry exception table (entry_files ×2, scan_summary ×2, commands ×1 — D7).

### Step S2 — three CLAUDE.md contract reduction + counts (S2-contracts)

Do `design.md` §2 (R1 dispositions, D3 counts, D5 file-list tables, D6 module-doc count removals) — **except the
three `## Change Log` sections**, which stay byte-identical until S3. Checklist:

1. Root `## Cross-Stack Contracts` → pointer block (§2.1 draft; keep `useSortableTable.js`, fixture generator name).
2. Backend `## Import/Export…` rows 93–98 + Dev-Conventions 121–123 → pointers; keep 88–92, 99–101.
3. Frontend `## Preview Column Widths` 96–97/103–105 + `## Authentication…` 111–113 → pointers; keep 98–102.
4. D3 count removals in all three files.
5. Replace both `## Related File List` tables with the `.claude/index.json` pointer (D5).
6. Root L98 rule line: add "module-level CLAUDE.md files no longer keep their own Change Log" (ties into S3).
7. Do NOT touch: every NO-SPEC/must-keep passage listed in `design.md` §2.4.

Verification after the step: `grep` sweep for leftover contract bodies (AC1) — `WEIGHT_CHINESE`, `FILL_LINE_`,
`INLINE_HEADER_FLOOR`, `AVAILABLE_CM`, `max-width:10.0em`, `annotation_positions` must appear only in pointer lines
(root) or module-owned sections; `check_doc_paths.py` on the three files; `wc -c` root < 40000.
Keep a per-line "dropped → spec §N" ledger in the step report so the reviewer can spot-check each deletion.

### Step S3 — changelog fold (S3-changelog) — runs after S2

Do `design.md` §4.1–4.4 with `fold_changelog.py` (one writer: the archive + the three Change Log sections):
extract module entry lines verbatim → append to the archive under the new `## 模块级 Change Log 并入` section
(header + provenance + per-source blocks) → dedup only byte-identical lines with a note → update the archive header
lines 3–4 (drop the stale "43 条" claim) → replace the module `## Change Log` sections with the pointer paragraph →
extend the root L156 rule line to count-free wording.

Verification (`design.md` §7): `git diff --numstat` on the archive shows the original 73 lines untouched except
lines 3–4; per-line append check (each of the 99 expected line occurrences greppable as a substring, one line per
entry); root index entries unchanged; all three module sections now ≤ 3 lines.

### Step S4 — READMEs (S4-counts-readme)

Do `design.md` §5 README part + D3: rephrase `README.md:463–464` / `README.en.md:463–464` count-free **in both
files, semantically identical**. If S1–S3 produced no README-relevant change, this step is only the two sentences
(keep it minimal; no feature-prose rewrites). Verification: `readme_parity.py` (block pairs + numeric tokens) passes;
`node --test frontend/tests/portDefaults.test.js` still passes (only test reading the READMEs).

### Step S5 — spec cross-reference (lead, separate `.trellis/` commit)

D8: `cross-stack-contracts.md:62` "see §12" → "see §13". D9: add the changelog-convergence convention to
`git-and-tooling-conventions.md` (new short §: module CLAUDE.md files keep no Change Log; narrative goes to the
archive; root keeps the single-line index). These two `.trellis/` files are committed standalone (parent §2), never
mixed with the A–D commit.

### Step S6 — review gates, verification, report

1. `git -C "$WT" diff --check` clean; full `git diff` read by the lead (every hunk).
2. Dispatch `trellis-check` on the full diff; fix findings via the sole writer for the affected step.
3. Run the `code-review` skill on the diff (docs-only diff: focus = deletion safety vs design.md keep-lists,
   AC-by-AC evidence).
4. Haiku read-only review (`Agent`, model haiku) on the diff — frontend-facing docs changed; report only.
5. Complete `verification.md`: AC1–AC7 with command output, the D3 retained-number classification, the R1 drop
   ledger, **Not run** section (no code tests; the portDefaults probe run or its not-run reason), and byte/char size
   of the root file under both measures.
6. Report per parent §8, then stop for authorization (commit / merge / push are separately authorized).

## Commit plan (only after user authorization; parent §2)

1. Code-docs commit A: `.claude/index.json` + 3 CLAUDE.md + READMEs — `docs(docs): 收敛跨栈契约单一来源并清理过时计数`.
2. `.trellis/` commit B: spec cross-ref + convention + task archive/journal — `docs(spec): …`.
3. Merge `docs/docs-sync` → `main` locally (only if main moved: `git merge main` first, rerun §7 checks), remove
   worktree, delete branch, push (separate authorization).

## Rollback points

- Before S2 edit: `git stash` not needed — all edits land in the worktree; per-step `git diff > /tmp/docsync-<step>.patch`
  before the next step starts (recoverable revert artifact).
- Archive fold (S3) is the highest-risk step: keep a pre-edit copy `/tmp/docsync-scan/archive.before.md`
  (byte-identical check via `sha256sum`) until the final report.
