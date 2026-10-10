# Implementation plan

Executor: Sonnet after compaction. Every Bash call must include an explicit `cd /home/decade/CRF-Editor-designer-reference-preservation...` because the shell cwd resets to the main checkout. Read `prd.md`, `design.md`, and `research/*.md` first.

## 0. Gate and setup

- [ ] Confirm the user approved implementation. The planning turn did not start the task. Commit, merge, and push each require a separate explicit request.
- [ ] Check peers and state: `git worktree list`, `git -C /home/decade/CRF-Editor-designer-reference-preservation status --short` (only the untracked task dir expected), `git log --oneline -3 main`. If the branch or worktree is gone, stop and ask.
- [ ] Fast-forward the empty task branch: `cd /home/decade/CRF-Editor-designer-reference-preservation && git merge --ff-only main`. If `main` touched the target files again, re-locate anchors by symbol with `grep -n`.
- [ ] `cd /home/decade/CRF-Editor-designer-reference-preservation && python3 ./.trellis/scripts/task.py start .trellis/tasks/10-09-designer-reference-preservation`
- [ ] `cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && npm ci` (existing lockfile only; no manifest change).
- [ ] Baseline: run the targeted command in §5 (including `designerHistory.test.js`) and record the counts.

## 1. RED: behavioral tests first

Add or adjust tests. They must fail for the intended reason (assertion or missing export), not syntax:

- [ ] `tests/fieldDefinitionAutocomplete.test.js`: rewrite the case at 123-153 to editor-wins presentation, then add cases for (a) pending `large` / colors / bold preserved when they differ from the instance, and (b) `'default'` preserved (never `null`).
- [ ] `tests/fieldProfileCommands.test.js`:
  - persisted pure rebind with candidate snapshot → `operation: none`, `binding: existing(8)`; `resolveSharedWriteTarget` → `null`
  - persisted presentation-only with current snapshot → `none` + `keep`; target `null`
  - genuine rebind change → `update_shared(8)` with `is_multi_record` / `table_type` from the candidate snapshot; target `8`
  - genuine keep change → `update_shared(5)` with structural keys from the current snapshot
  - OID change still forks when snapshots are present
  - `normalizeDefinitionPayload`: `日期` `null` → default format; structural keys kept; `null` → `null`; non-unit type clears `unit_id`
  - draft attach with a normalized `日期` snapshot → no `definition_operation`
  - `buildFieldPropReplayCommand`: `shared` ± `definitionUpdated`; `rebind-undo` / `rebind-redo` ±; fork types unchanged; unknown type throws
- [ ] Run `cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && node --test tests/fieldDefinitionAutocomplete.test.js tests/fieldProfileCommands.test.js` and record the expected failures.

## 2. GREEN: composables

- [ ] Implement `design.md` → Composable changes in `fieldDefinitionAutocomplete.js` and `formDesignerPropertyEditor.js` (immutable returns; no `console.log`).
- [ ] Re-run the step 1 command until it passes. Rollback point A: composables plus their tests only.

## 3. Component wiring

- [ ] Apply `design.md` → Component changes 1-8 in `FormDesignerTab.vue`, editing by symbol. Item 8 and the `includesCurrentForm` options implement R5 (user-approved 2026-10-10).
- [ ] Update source-level tests that encode the old structure (inventory in `research/root-cause.md`) to assert the new structure without weakening intent:
  - `formDesignerPropertyEditor.runtime.test.js` 254-269 and `quickEditBehavior.test.js` 327-339: `resolveSharedWriteTarget(buildSelectedFieldCommandArgs(ff, snapshot))`, the confirm call and signature, the threshold expression
  - `formDesignerPropertyEditor.runtime.test.js` 278-291: `buildBindingProfileCommand(buildSelectedFieldCommandArgs(ff, editorState))`, the `definitionUpdated` flag passed to both replay builds, the replay builder imported (not defined locally)
  - `designerNewFieldDraft.test.js` 95-123: normalized candidate snapshot, the `{ includesCurrentForm: false }` confirm, the raw restore payload
  - New source assertions: `selectAutocompleteCandidate` reads pending inline/default from `editProp`, normalizes after hydration, and never assigns `labelOidSession` or `fieldPropBaseline`; `snapshotFieldPropState` carries the structural keys; `isRebind = command.binding.mode === 'existing'`
- [ ] Keep green: `designerHistory.test.js:341`, `designerLabelOid.test.js` (416-479, 534-560), and `paneSplit.test.js:183` (renaming its title is optional). Rollback point B.

## 4. Full validation

- [ ] Targeted suites, then `npm test` (node:test plus vitest), `npm run lint`, `npm run build`.
- [ ] Coverage: rerun the baseline coverage command (`research/verification-baseline.md`) with the added test files. Line coverage must not fall below 95.20 / 97.40, and the new branches must be hit.
- [ ] Optional backend contract sanity (backend unchanged): run `backend/tests/test_field_profile.py` with `~/.venvs/crf-editor/bin/python` and the proxies unset (see the backend-test-environment memory).

## 5. Commands

```bash
cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && node --test tests/fieldDefinitionAutocomplete.test.js tests/fieldProfileCommands.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/quickEditBehavior.test.js tests/designerNewFieldDraft.test.js tests/designerLabelOid.test.js tests/designerHistory.test.js tests/designerFieldCopy.test.js tests/paneSplit.test.js
cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && npm test && npm run lint && npm run build
cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && node --experimental-test-coverage --test-coverage-include='src/composables/fieldDefinitionAutocomplete.js' --test-coverage-include='src/composables/formDesignerPropertyEditor.js' --test tests/formDesignerPropertyEditor.runtime.test.js tests/designerNewFieldDraft.test.js tests/fieldProfileCommands.test.js tests/fieldDefinitionAutocomplete.test.js tests/designerLabelOid.test.js
```

## 6. Browser validation (isolated data only)

Follow the browser-e2e-recipe memory: worktree `frontend` build, throwaway backend with `CRF_DATABASE_PATH` / upload path under a new `/tmp` dir, production mode, background jobs off, a regular user (admins land on the admin view), and the WSL chrome-headless-shell on 9222, touching only your own page. Seed through the API: forms A / B / C; definition LIB used in A and B; LIB1 used only in A; a `日期` definition. Record request bodies and `GET` definitions before and after each scenario.

- [ ] S1 (draft): in C, create a new field, set 标签字号 大, type an OID, pick LIB. 大 stays; Save shows no 影响提醒; the body has no `definition_operation`; after reload, LIB and A/B are unchanged and the field shows 大.
- [ ] S2 (persisted, default size): pick LIB for an existing C field. The radio shows 默认; Save shows no 影响提醒; `operation: none`, `binding: existing`.
- [ ] S3: a field bound to LIB (shared): change only the font size, then Save. No 影响提醒; `none` + `keep`.
- [ ] S4: pick LIB, then edit 字段标签. Save shows the impact list (A、B); cancel sends no request and stays dirty; confirm sends `update_shared` and A/B show the new label.
- [ ] S5 (R5): pick LIB1, edit 字段标签. A confirmation appears listing A.
- [ ] S6: undo/redo after S2 restores the original binding and presentation; LIB is unchanged.
- [ ] S7: pick LIB, then switch the type to 标签. The save forks; LIB is unchanged.
- [ ] Clean up the throwaway backend, browser page, and temp dir you created.

## 7. Review, docs, wrap-up

- [ ] Code review of the actual diff, plus a read-only Haiku sub-agent review of the frontend diff. Fix findings and re-run §5.
- [ ] Docs and spec (Phase 3.3): update the `frontend/.claude/CLAUDE.md` FormDesignerTab bullets (candidate pick semantics, single-decision impact target, replay mirror) and the Testing Focus; add one line to the root `.claude/CLAUDE.md` change log; add contract rows near the designer autocomplete table in `.trellis/spec/frontend/component-guidelines.md`. Log the decision in `/home/decade/CRF-Editor/.context/current/branches/fix/designer-reference-preservation/session.log`.
- [ ] Before any commit: reconcile `git status` against your own inventory (shared-worktree-injection-guard memory). Report run / failed / not-run results. Then wait for the user's explicit commit request. Suggested code commit: `fix(designer): 引用字段库字段时保留实例样式并仅在共享定义实际变化时确认`. Trellis files go in a separate `chore(task)` commit; merge into `main`, remove the worktree, and delete the branch only when requested.

## Risk notes

- `FormDesignerTab.vue` exceeds 5,000 lines: edit by symbol, keep the diff local, and do not touch the delete-form region.
- Source-regex tests are brittle: change each assertion to the new structure in the same step as the code.
- Never weaken assertions to go green. If a behavioral test conflicts with the PRD, stop and report it.
