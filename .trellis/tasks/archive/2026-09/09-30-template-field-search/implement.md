# Implementation Plan: Template Field Search

Read order: `prd.md` (requirements + AC IDs) → `design.md` (contracts) → this file. Specs/research to load: `implement.jsonl`.

## 0. Environment (done once at activation)

- Worktree + branch (repo convention: sibling dir `/home/decade/CRF-Editor-<slug>`):
  ```bash
  git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-template-field-search -b feat/template-field-search main
  mv /home/decade/CRF-Editor/.trellis/tasks/09-30-template-field-search /home/decade/CRF-Editor-template-field-search/.trellis/tasks/
  cd /home/decade/CRF-Editor-template-field-search
  python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/09-30-template-field-search feat/template-field-search
  python3 ./.trellis/scripts/task.py start .trellis/tasks/09-30-template-field-search
  ```
  All paths below are relative to the worktree root. Never edit `/home/decade/CRF-Editor` (main) or `/home/decade/CRF-Editor-log-row-label` (another task).
- Backend Python: `/home/decade/.venvs/crf-editor/bin/python` (FastAPI 0.110.3, SQLAlchemy 2.0.54, SQLite 3.53.1). System `python3` has no backend deps.
- Run pytest with proxy variables unset (a local SOCKS proxy breaks `test_ai_review_service`):
  `env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy <venv-python> -m pytest …`
- Full backend suite needs a worktree-root `config.yaml` and a seeded `backend/crf_editor.db` exactly like CI (`.github/workflows/ci.yml:42-97`). Both are gitignored; never commit them.
- Frontend: `cd frontend && npm ci` (no `node_modules` in the worktree yet). Do NOT run `npm run format` (it rewrites unrelated files).

## 1. Backend tests first (RED) — `backend/tests/test_template_field_index.py`

Reuse patterns, do not copy blindly: service-level template builder `build_template_db` and whitelist fixture `import_service_config` (`backend/tests/test_import_service.py:27-36`, `backend/tests/test_import_service.py:156-223`); router-level dual `get_config` monkeypatch (`backend/tests/test_phase0_ordering_contracts.py:169-273`); `seed_user` / `login_as` / `auth_headers` (`backend/tests/helpers.py`). Build a local seeded template with: two active projects + one soft-deleted project; forms with explicit `order_index`; a numeric field with digits + unit; a date field without `date_format`; a single-choice field with a codelist of ≥2 ordered options; a checkbox field with empty `checkbox_label`; a `标签` field; a log row; a `label_override`; a library-only definition; one definition duplicated identically in both active projects; one same-label/different-OID pair.

Service cases (one behavior each):
- [ ] returns OID/label/type/digits/unit/date/checkbox attributes and codelist name + ordered options (AC1, AC2)
- [ ] excludes `标签` definitions and log rows (AC8)
- [ ] excludes definitions of soft-deleted projects (AC8)
- [ ] merges identical definitions across projects with sources in template order (AC8, AC3)
- [ ] keeps same-label rows separate when OID or format differs (AC8)
- [ ] library-only definition yields a source with `form_name=None` (AC3)
- [ ] `label_override` becomes `display_label` and `label_aliases` (distinct, excludes values equal to label) (AC7)
- [ ] entry order = project id → form order → field order, library-only after (AC7)
- [ ] legacy template without `project.deleted_at`, `form_field.label_override`, `field_definition.checkbox_label` still works (drop the columns with `ALTER TABLE … DROP COLUMN` on the built file; SQLite 3.53 supports it) (AC9)
- [ ] template file bytes are identical before and after the call (AC9)

Router cases:
- [ ] 200 for a regular user who owns no project; payload matches the schema (AC4)
- [ ] 401 without token (AC4)
- [ ] 400 with 「未配置模板库…」 when `template_path` is empty (AC11)
- [ ] 404 when the file is missing; body does not contain the path (AC11)
- [ ] 400 for a non-`.db` or out-of-whitelist path; body does not contain the path (AC11)
- [ ] 400 with `code == "TEMPLATE_INCOMPATIBLE"` for a template missing a required column (AC11)

Run: `cd backend && <pytest cmd> tests/test_template_field_index.py -q` → expect failures (module missing).

## 2. Backend implementation (GREEN)

- [ ] `backend/src/services/template_field_index_service.py` per `design.md` §2.2 (loader + builder split, functions < 50 lines, raw `text()` SQL, whole-table reads, optional-column probes, `finally: session.close()`).
- [ ] `backend/src/routers/template_fields.py` per `design.md` §2.1 (response models, `get_current_user`, error mapping, reuse `_compatibility_error` from `src.routers.import_template`, `logger.warning` for path details, `logger.exception` for 500).
- [ ] Register: `backend/main.py:33` import list + `app.include_router(template_fields.router, prefix="/api")` near `backend/main.py:203`; add `template_fields` to `backend/src/routers/__init__.py`.
- [ ] Targeted tests pass; then `python -m py_compile` on new files is implied by pytest import.

Rollback point A: backend is additive; reverting the two new files + registration lines restores the previous state.

## 3. Frontend tests first (RED)

- [ ] `frontend/tests/templateFieldSearch.test.js` — pure helper tests (pattern: `frontend/tests/searchRanking.test.js`, dynamic import like `frontend/tests/fieldDefinitionAutocomplete.test.js:20-22`):
  - `formatTemplateFieldFormat` for 数值 (both/one/none digits), 日期/日期时间/时间 (explicit + default), 复选 (empty → 「□✔」, custom text), each choice type (with/without codes, no codelist → 「未设置字典」), 文本 → `''` (AC1, AC2)
  - `templateFieldSearchTexts` returns OID, label, aliases; `rankFuzzyMatches` with it finds OID by label, label by OID, and an entry by alias (AC7)
  - `countTemplateFieldForms`, `formatTemplateFieldSource` (form line, display label suffix, 仅字段库) (AC3)
  - `buildCopyToastText` truncation at 30 chars (AC6)
  - `DEFAULT_DATE_FORMATS` exported from `useCRFRenderer.js` and used by `renderCtrl` (no remaining literal defaults at the three call sites)
- [ ] Same file, source-level wiring (pattern: `frontend/tests/adminViewStructure.test.js`, `frontend/tests/editModeHiddenIdentifiers.test.js`):
  - dialog has `:modal="false"`, `modal-penetrable`, `draggable`, `append-to-body`, `:lock-scroll="false"`, `api.get('/api/template-fields')`, a `watch` with `immediate: true`, `rankFuzzyMatches(`, `el-pagination`, copy cells as `<button type="button"`, no action column (AC5, AC6, AC7, AC10)
  - `App.vue` regular header button with `v-if="editMode"` + `aria-label="模板字段查询"`, absent from the admin branch; lazy mount `v-if="hasOpenedTemplateFieldSearch"`; `@open-template-field-search="openTemplateFieldSearch"` on `FormDesignerTab`; an `editMode` watcher that closes the dialog (AC5)
  - `FormDesignerTab.vue` emits include `'open-template-field-search'`; the button sits inside the fullscreen `#header` with `v-if="editMode"` and `data-test="designer-template-field-search"` (AC5)
  - `navigator.clipboard` / `execCommand` appear only in `frontend/src/composables/clipboardCopy.js` (AC6)
- [ ] `frontend/tests/clipboardCopy.test.js` with injected fake `navigator`/`document`: secure path uses `writeText`; non-secure context uses the textarea fallback and removes it; rejected `writeText` falls back; fallback failure returns `false` and still removes the textarea; empty text returns `false` without side effects (AC6)

Run: `cd frontend && node --test tests/templateFieldSearch.test.js tests/clipboardCopy.test.js` → expect failures.

## 4. Frontend implementation (GREEN)

- [ ] `frontend/src/composables/templateFieldSearch.js` and `frontend/src/composables/clipboardCopy.js` per `design.md` §3.1–3.2 (JSDoc on exports, no `console.log`).
- [ ] `frontend/src/composables/useCRFRenderer.js`: export `DEFAULT_DATE_FORMATS`, use it at `useCRFRenderer.js:549-551` (behavior-preserving).
- [ ] `frontend/src/components/TemplateFieldSearchDialog.vue` per `design.md` §3.3 (theme tokens only, scoped styles + one non-scoped block for the teleported dialog class, `el-tooltip` + `aria-label` on icon buttons, visible focus style on copy cells).
- [ ] `frontend/src/App.vue` wiring per `design.md` §3.4 (header button, state, lazy mount, `openTemplateFieldSearch` close/`nextTick`/reopen, `editMode` watcher, designer event binding).
- [ ] `frontend/src/components/FormDesignerTab.vue`: emits + fullscreen header button per `design.md` §3.4; keep the header height/spacing contract (`frontend/tests/acrfViewToggle.test.js`).
- [ ] New tests pass.

Rollback point B: if browser verification (step 6) shows the penetrable panel loses focus to the dialog, drop `:modal="false"` and `modal-penetrable` (modal dialog, state still kept across reopen), update the wiring test and `design.md` §4, and report the fallback. If close/`nextTick`/reopen does not restack above the fullscreen designer, switch to the `z-index` prop fed by Element Plus `useZIndex().nextZIndex()` on each entry click.

## 5. Regression

- [ ] Frontend: `cd frontend && node --test tests/*.test.js` (watch `appSettingsShell`, `acrfViewToggle`, `editModeHiddenIdentifiers`, `searchRankingWiring`, `basePathDeployment`, `checkboxFieldType`, `columnWidthPlanning`), `npm run lint -- --quiet` (0 errors), `npm run build`.
- [ ] Backend: full suite with the CI-style `config.yaml` + seeded db (step 0) and proxy vars unset.

## 6. Browser verification (required, AC12)

- Throwaway data only, e.g. `/tmp/crf-tfs/`: start the backend from `backend/` with env overrides `CRF_DATABASE_PATH=/tmp/crf-tfs/app.db`, `CRF_STORAGE_UPLOAD_PATH=/tmp/crf-tfs/uploads`, `CRF_DISABLE_BACKGROUND_JOBS=1`; seed a regular user and one project with a few forms/fields (numeric+unit, date, choice, checkbox, 标签, log row, label override), copy the db with the Python `sqlite3` backup API to `/tmp/crf-tfs/template.db` (inside the whitelist: same dir as the app db), restart with `CRF_TEMPLATE_PATH=/tmp/crf-tfs/template.db`, run `cd frontend && npm run dev`, drive headless Chromium (chrome-devtools MCP).
- Check: AC5 (完全 vs 简要, admin shell), AC7 (label→OID, OID→label, alias, empty keyword, paging), AC6 (click each copyable cell, toast, clipboard content via page evaluation), AC10 (open over fullscreen designer, click the designer OID input and paste, re-click entry brings to front, close/reopen keeps keyword, refresh), AC11 (unset `CRF_TEMPLATE_PATH` → inline 「未配置模板库…」), light and dark themes, no new console errors.
- Report any blocker (login, permissions) explicitly instead of claiming verification.

## 7. Review gates

- [ ] `trellis-check` against `check.jsonl` specs (layering, error handling, lazy dialog watcher, toolbar contract, useApi-only requests, a11y).
- [ ] Code review of the full diff; security review of the new endpoint (auth dependency, no path disclosure, read-only session, no user-controlled SQL).

## 8. Documentation sync (Phase 3.3, AC13)

- [ ] `README.md` + `README.en.md`: feature list / usage line for 模板字段查询 (full mode only, read-only, click-to-copy).
- [ ] Root `.claude/CLAUDE.md`: Core Capabilities line, module/test counts recounted from the actual file inventory with `ls` (existing counts are partly stale, e.g. the mermaid graph says 12 routers while `backend/src/routers/` already has 13 modules), Change Log entry.
- [ ] `backend/.claude/CLAUDE.md`: router/service overview + related file list + change log; `frontend/.claude/CLAUDE.md`: component/composable lists, testing focus, change log.
- [ ] `.claude/index.json`: new files/entry points.
- [ ] `.trellis/spec`: `guides/cross-stack-contracts.md` (new section: `GET /api/template-fields` response contract + exclusion/merge rules), `backend/database-guidelines.md` (project-independent template read + optional-column probes), `frontend/component-guidelines.md` (non-modal penetrable dialog + restack pattern), `frontend/hook-guidelines.md` (`clipboardCopy.js` as the only clipboard entry).

## 9. Finish

- Commit, push, and PR only when the user asks (Phase 3.4). Commit format `feat(template): …`; stage specific files; include the task directory; never commit `config.yaml`, `*.db`, `frontend/dist`.
- PR `feat/template-field-search` → `main`; the CI `merge-owner-pr` job merges after checks — never run `gh pr merge` manually (`.trellis/spec/guides/git-and-tooling-conventions.md`).
- After merge (on request): archive the task, remove the worktree and branch.
