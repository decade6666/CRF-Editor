# QA plan — visits-preview-split (task-local browser harness)

> 2026-10-12. Follow-on agent must turn this into `run_qa.sh` + `qa_driver.mjs` + `qa_compare.mjs`
> (copy-adapt from `.trellis/tasks/archive/2026-10/10-08-designer-split/research/qa/`; do NOT import or modify
> the archived files — they are task-local artifacts of another task).

## Environment (all verified 2026-10-12)

- Worktree under test: `/home/decade/CRF-Editor-visits-preview-split` (branch `refactor/visits-preview-split`).
- Baseline tree: `/home/decade/CRF-Editor` (main @ 0d111a1). NEVER modify it; never run a server from it on the
  QA ports (a dev server may already run there — leave it alone).
- Seed + credentials: reuse `/tmp/designer-split-qa/seed.db` and `/tmp/designer-split-qa/secrets.env`
  (mode 0600, exists; the archived harness generated it). Do NOT mint new credentials (memory:
  throwaway-credential-policy-block). If they are missing, stop and ask the user.
- Chrome: `/home/decade/.cache/browsers/chrome-headless-shell/linux-153.0.8010.47/chrome-headless-shell-linux64/chrome-headless-shell`
- Python: `env -u http_proxy … /home/decade/.venvs/crf-editor/bin/python` (proxy vars must be unset).
- Backend serving the built frontend: run from the seeded tree with `CRF_ENV=production`,
  `CRF_DATABASE_PATH=<run>/crf.db` (copy of seed.db), `CRF_STORAGE_UPLOAD_PATH=<run>/uploads`,
  `CRF_AUTH_SECRET_KEY` / `CRF_ADMIN_BOOTSTRAP_PASSWORD` from secrets.env, `CRF_SERVER_HOST=127.0.0.1`,
  dynamic port (start at 8911), `CRF_DISABLE_BACKGROUND_JOBS=1`. The backend serves `frontend/dist`, so the
  **frontend must be built in the tree under test** before the run (`npm run build`).

## Seed facts (from `/tmp/designer-split-qa/seed.db`, project "Export golden project")

- Regular user: `QA_USERNAME` / `QA_PASSWORD` from secrets.env (non-admin).
- Forms include: `legacy portrait` (portrait, annotation override `_form` + `GOLD_TEXT_UNIT`), `legacy
  force_landscape` (landscape), `mixed_landscape` (domain `VS`, overrides `_form` + `GOLD_MIXED_REG`), and more
  (6 forms total). annotation_positions on two forms; `design_notes` NOT seeded on any form.
- Visits: `筛选访视` = {legacy portrait(1), legacy force_landscape(2), mixed_landscape(3)};
  `治疗访视` = {legacy portrait(1), legacy temporary landscape(2), legacy force_portrait(3)}.
- `design_notes` gap: F1's notes symptom needs one form with notes. Options: (a) set it through the UI before
  capture — brittle; (b) DB-update the copied `crf.db` in the run dir after copying (e.g.
  `UPDATE form SET design_notes='QA 备注第一行\n第二行' WHERE name='legacy portrait'`) — do this identically in
  BOTH baseline and final runs so the diff stays comparable, and record it. Prefer (b).

## Runs

- `baseline` — build + serve the MAIN checkout tree? NO: never touch main. Instead take a scratch copy:
  `git -C /home/decade/CRF-Editor worktree add /tmp/visits-qa-baseline 0d111a1` (detached; delete it in the
  cleanup step; it is a throwaway outside the repo). Build + serve from there.
- `final` — build + serve `/home/decade/CRF-Editor-visits-preview-split`.
- Both: copy seed.db → `<run>/crf.db`, apply the same design_notes update, same viewport (1600×1800, DPR 1).

## Scenarios (per run; screenshots + DOM/network evidence)

Preconditions: log in as the QA user; switch to complete edit mode (设置 → 编辑模式) so aCRF and OID surfaces
are available; open 访视流程 top-level tab; switch to 列表 (single) view; select visit `筛选访视`.

1. `visit-preview-ecrf`: preview `legacy portrait` in eCRF (default) — screenshot `.el-dialog .word-page`.
2. `visit-preview-acrf`: same form in aCRF — screenshot (annotations visible: 3 annotation spans expected here:
   form + 2 field annotations if OIDs exist).
3. `visit-preview-landscape`: preview `legacy force_landscape` (aCRF off) — `.word-page` must carry the
   `landscape` class; screenshot + class assertion.
4. `visit-preview-notes`: preview the notes-seeded form — assert the 设计备注 aside is visible with the seeded
   text; screenshot.
5. `visit-preview-annotation-offset`: for `legacy portrait` (form override y=25), open the preview and assert the
   form annotation's `--acrf-annotation-top` equals the value the persisted override yields (compare against the
   `DesignerAcrfAnnotation` on the same page? no — compute from the DOM: baseline shows default; final must show
   the persisted position. This is a **declared D8 difference**).
6. `visit-preview-drag-persist`: drag the form annotation down ~12px in the visit preview; assert one PATCH
   `/api/forms/{id}` with `annotation_positions`; close and reopen the preview; assert the annotation renders at
   the persisted position (final) — record baseline behavior separately (does not persist into the reopened
   preview).
7. `visit-form-sequence-guard`: before/after the preview open+drag, assert the right-side visit-form table's
   序号 column values are unchanged (array equality from DOM text).

Console log: capture all console messages per run; final must have 0 errors (and the D6 `Loading` warning must
be absent in final, present-or-not in baseline — record).

## Evidence & comparison

- Store per-run artifacts under `/tmp/visits-preview-qa/<label>/` (screenshots, captures.json,
  behaviour.json, console.log, network summary, parity files if produced) and keep only small JPEG copies
  (< ~600K total) under `research/qa-visits/evidence/`.
- Comparison rule (design §4): every baseline/final difference must map to a declared D8 change (F1 surfaces +
  Loading spinner + aria-label). Any other pixel/text/behavior difference is a defect — stop and report.
- Parity: the visit preview JSON vs Word export via `backend/scripts/compare_word_table_parity.py` is OPTIONAL
  here (frontend-only diff; the harness would need preview-JSON extraction from the visit dialog). If not
  produced, record it as not-run with the reason — never fake it, never use `--allow-mismatch`.
- Cleanup: stop only the processes this harness started (process-group kill like the archived run_qa.sh), then
  `git worktree remove /tmp/visits-qa-baseline`; leave the main checkout and any pre-existing servers untouched.
