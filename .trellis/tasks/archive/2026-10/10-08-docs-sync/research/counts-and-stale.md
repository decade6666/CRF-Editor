# Counts and Stale-Content Inventory (read-only scan)

> Task: `.trellis/tasks/10-08-docs-sync`
> Repo: `/home/decade/CRF-Editor`, git `main` @ `0daf58e`, scanned 2026-10-12.
> Scope: `.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`, `README.md`, `README.en.md`.
> Method: `wc -l/-c`, `ls`, `test -e`, `grep -n`, a Python tokenizer over backticked path-like tokens, and a line-by-line numeric diff of the two READMEs. All commands are listed in §7.

## 0. Ground truth (recounted on this tree)

| Entity | Actual | How counted |
|---|---|---|
| `backend/src/routers/*.py` (excl. `__init__.py`) | 14 | `ls backend/src/routers/*.py \| grep -v __init__ \| wc -l` |
| `backend/src/services/*.py` (excl. `__init__.py`) | 33 | same pattern |
| `backend/src/models/*.py` (excl. `__init__.py`) | 11 | same |
| ORM model classes | 12 | `grep -h '^class ' backend/src/models/*.py` minus `Base` |
| `backend/src/schemas/*.py` (excl. `__init__.py`) | 11 | same pattern |
| `backend/src/repositories/*.py` (excl. `__init__.py`) | 4 | same |
| `backend/tests/` files | 76 = 74 `test_*.py` + `conftest.py` + `helpers.py` | `ls backend/tests/*.py` / `ls backend/tests/test_*.py` |
| `backend/scripts/*.py` | 4 | `ls backend/scripts/*.py` |
| `frontend/src/components/*.vue` | 21 | `ls` |
| `frontend/src/composables/*.js` | 36 | `ls` |
| `frontend/scripts/*.mjs` | 1 | `ls` |
| `frontend/tests/` files | 87 = 74 `*.test.js` + `testProperty.js` + 12 under `tests/component/` (10 `*.spec.js` + `setup.js` + `vueWarnGate.js`) | `ls` + `glob` |
| `apiUrl()` call sites in `frontend/src` | 18 (6 in `useApi.js` + 12 bypass) across 7 files | `grep -rn "apiUrl(" frontend/src` |

Verified line counts of files the docs pin by size: `VisitsTab.vue` 552, `VisitFormPreviewDialog.vue` 796, `FormDesignerTab.vue` 4548, `DesignerWordPreview.vue` 577, `DesignerAcrfAnnotation.vue` 133, `useVisitPreviewAnnotation.js` 126, `App.vue` 1341 — all as documented.

## 1. Hand-written counts (mutable statements — keep only these in sync)

### 1.1 root `.claude/CLAUDE.md`

| Line | Exact text | Counts | Actual | Status |
|---|---|---|---|---|
| 18 | `B --> B1["src/routers (14)"];` | routers | 14 | OK |
| 19 | `B --> B2["src/services (33)"];` | services | 33 | OK |
| 20 | `B --> B3["src/models (11)"];` | model files | 11 | OK |
| 21 | `B --> B4["src/schemas (11)"];` | schemas | 11 | OK |
| 22 | `B --> B5["src/repositories (4)"];` | repositories | 4 | OK |
| 23 | `B --> B6["tests (76)"];` | backend test files | 76 | OK |
| 25 | `C --> C1["src/components (21)"];` | components | 21 | OK |
| 26 | `C --> C2["src/composables (36)"];` | composables | 36 | OK |
| 28 | `C --> C4["tests (87)"];` | frontend test files | 87 | OK |
| 39 | `backend/tests/` (76 files, including 74 `test_*.py`) | test files | 76 / 74 | OK |
| 39 | `frontend/tests/` (87 files: 74 node:test `.test.js` + `testProperty.js` + 12 vitest mount-test files under `tests/component/` — 10 `.spec.js` + `setup.js` + `vueWarnGate.js`) | test files | 87 / 74 / 12 / 10 | OK |
| 98 | "This file must stay under the 40k-char context limit" | file size limit | file is **36,164 chars / 40,921 bytes** | OK by chars; `wc -c` reads 40,921 (1.02x the stated cap) — note the unit ambiguity |

### 1.2 `backend/.claude/CLAUDE.md`

| Line | Exact text | Counts | Actual | Status |
|---|---|---|---|---|
| 24 | `src/routers/` (14 router modules) | routers | 14 | OK |
| 25 | `src/services/` (33 service modules) | services | 33 | OK |
| 26 | `src/models/` (11 ORM model files, including 12 model classes) | model files / classes | 11 / 12 | OK |
| 27 | `src/schemas/` (11 Pydantic modules) | schemas | 11 | OK |
| 28 | `src/repositories/` (4 repository modules) | repositories | 4 | **stale text** — "wrappers for base repository, projects, field definitions, field instances, form fields" but actual files are `base_repository.py`, `project_repository.py`, `field_definition_repository.py`, `form_field_repository.py` (no "field instances" module) |
| 29 | `tests/` (76 files: 74 `test_*.py` modules + `conftest.py` + `helpers.py`) | test files | 76 / 74 | OK |
| 30 | `scripts/` (4 scripts) | scripts | 4 | OK |

### 1.3 `frontend/.claude/CLAUDE.md`

| Line | Exact text | Counts | Actual | Status |
|---|---|---|---|---|
| 39 | `src/components/` (21 Vue components) | components | 21 | OK |
| 40 | `src/composables/` (36 JS modules) | composables | 36 | OK |
| 42 | `scripts/` (1 script) | scripts | 1 | OK |
| 43 | `tests/` (87 files: 74 node:test `.test.js` + `testProperty.js` + 12 vitest files under `tests/component/` — 10 `.spec.js` + shared `setup.js` + `vueWarnGate.js`) | test files | 87 / 74 / 12 / 10 | OK |
| 51 | `components/VisitsTab.vue` (552 lines) | file size | 552 | OK |
| 52 | `components/VisitFormPreviewDialog.vue` (796 lines, ...) | file size | 796 | OK |
| 55 | `components/DesignerWordPreview.vue` (577 lines, ...) | file size | 577 | OK |
| 56 | `components/DesignerAcrfAnnotation.vue` (133 lines, ...) | file size | 133 | OK |
| 116 | ``tests/component/**/*.spec.js`` narrative | vitest glob | matches 10 files | OK |
| 162 | "designer + visits-preview-dialog field/domain annotation placement" | n/a | — | — |
| (changelog 181) | `useVisitPreviewAnnotation.js` (126 lines) | file size | 126 | OK |

### 1.4 `README.md` / `README.en.md`

| Line (both) | Exact text | Counts | Actual | Status |
|---|---|---|---|---|
| 463 | `backend/tests/` 63 Python test files (61 `test_*.py` + `conftest.py` + `helpers.py`) | test files | **76 / 74** | **STALE (off by 13 files)** |
| 464 | `frontend/tests/` 87 frontend test files (74 `.test.js` + `testProperty.js` + 12 component) | test files | 87 / 74 / 12 | OK |
| 500 | 134 Python files formatted by the one-shot format commit (17 with CRCRLF) | commit scope | `git show --stat fb1ae18` = **134 files changed** | OK |
| 99 | `sudo apt install libreoffice-writer-nogui` | command | valid Ubuntu package | OK |

### 1.5 intentionally frozen literals (informational, not drift)

`CLAUDE.md` §Cross-Stack Contracts and the module files embed calibration/test-vector constants — `WEIGHT_CHINESE=2`, `FILL_LINE_WEIGHT=6`, `UNDERSCORE_CHAR_CM=0.19`, `FILL_LINE_SAFETY_CM=0.2`, `FILL_LINE_MIN_CHARS=6`, `FILL_LINE_MAX_CHARS=20`, `AVAILABLE_CM=14.66`, `INLINE_HEADER_FLOOR=8`, `max-width:10.0em`, `FORM_TABLE_ROW_HEIGHT_CM=1`, `SINGLE_LINE_HEIGHT_PT=15.6`, `VERTICAL_OPTION_GAP_PT=3`, `pypdf`/`vitest@5.0.3` pins, JWT 60 min, `month=30`/`year=365`, page sizes 21×29.7 cm, history numbers inside the Change Log. These describe fixed contracts or immutable history; they are not recountable statements.

## 2. Path references (mechanically verified)

556 backticked path-like tokens across the five files were resolved against repo root, `backend/`, `backend/src/`, `frontend/`, `frontend/src/`, `frontend/tests/`, `backend/tests/`, `.trellis/spec/`, `.trellis/spec/guides/`, `backend/tests/fixtures/` (plus glob expansion). Result: **13 unresolved; all 13 confirmed MISSING by `test -e`.**

### 2.1 Confirmed missing (`test -e` = absent)

| File:line | Token | Note |
|---|---|---|
| `backend/.claude/CLAUDE.md:145` | `src/perf.py` | retired perf baseline (deleted by `legacy-cleanup`) — inside a Change Log entry |
| `backend/.claude/CLAUDE.md:145` | `scripts/generate_perf_fixture.py` | retired — Change Log |
| `backend/.claude/CLAUDE.md:145` | `scripts/run_perf_baseline.py` | retired — Change Log |
| `backend/.claude/CLAUDE.md:150` | `scripts/run_perf_baseline.py` | retired — Change Log |
| `backend/.claude/CLAUDE.md:154` | `tests/test_ci_merge_gate.py` | deleted with GitHub Actions — Change Log |
| `frontend/.claude/CLAUDE.md:187` | `scripts/collectBuildMetrics.mjs` | retired perf — Change Log |
| `frontend/.claude/CLAUDE.md:187` | `scripts/runBrowserPerfBaseline.mjs` | retired perf — Change Log |
| `.claude/CLAUDE.md:122` | `backend/auth-security.md` | abbreviated prose reference to `.trellis/spec/backend/auth-security.md` (file itself exists) |
| `.claude/CLAUDE.md:127`, `:172`; `backend/.claude/CLAUDE.md:116`; `frontend/.claude/CLAUDE.md:116`, `:189`; `README.md:460`; `README.en.md:460` | `tests/component/**/*.spec.js` | a glob, not a literal path; expands to 10 existing files |

All other 543 tokens resolve. Nothing in the normative (non-changelog) body of the five files points at a non-existent file, except the abbreviated `backend/auth-security.md` and the intentional `**` globs.

### 2.2 README project-structure tree (lines 52-82) — every leaf verified present

`config.yaml.example`, `backend/main.py`, `backend/app_launcher.py`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/src/{models,repositories,services,routers,schemas}`, `backend/src/config.py`, `backend/src/database.py`, `backend/tests`, `frontend/src/{components,composables,styles}`, `frontend/src/App.vue`, `frontend/tests`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/README.md`, `assets/logos/README.md` — all OK.

## 3. Commands (target-verified)

### 3.1 `frontend/package.json` scripts vs documented commands

| Documented | package.json | Status |
|---|---|---|
| `npm run dev` | `vite` | OK |
| `npm run build` | `vite build` | OK |
| `npm run lint` | `eslint --ext .js,.vue src` | OK (deps `eslint ^8.57.0`, `eslint-plugin-vue ^9.26.0` present) |
| `npm run format` | `prettier --write "src/**/*.{js,vue}"` | OK (`prettier ^3.2.5`) |
| `npm test` | `node --test tests/*.test.js && vitest run` | OK |
| `npm run test:component` | `vitest run` | OK |
| `node --test tests/*.test.js` | — | OK |
| `npx vitest run` (frontend CLAUDE.md:69) | vitest 5.0.3 | OK |
| `cd frontend && VITE_BASE_PATH=/crf/ npm run build` (README 232) | `vite.config.js:19` reads `VITE_BASE_PATH` | OK |

### 3.2 backend

| Documented | Target | Status |
|---|---|---|
| `python main.py` | `backend/main.py` exists | OK |
| `python -m pytest` | `backend/pytest.ini` exists (only `filterwarnings`) | OK |
| `python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered` | `pytest-cov~=4.1` in `backend/requirements-dev.txt` | OK |
| `python -m pytest tests/test_config.py -q` | file exists | OK |
| `python -m pytest tests/test_auth.py tests/test_user_admin.py -q` | both files exist | OK |
| `python scripts/compare_word_table_parity.py <preview.json> <export.docx>` | script exists; argparse takes positional `preview_json`, `docx_path` (+ optionals at lines 23-31) | OK |
| `python -m ruff format .` / `--check .` | `ruff==0.16.10` pinned in `backend/requirements-dev.txt`, `backend/ruff.toml` exists | OK |
| `git config blame.ignoreRevsFile .git-blame-ignore-revs` | `.git-blame-ignore-revs` lists `fb1ae18`; `git cat-file -t fb1ae18` = commit; `git show --stat` = 134 files | OK |

### 3.3 pre-commit / deploy / README blocks

| Documented | Target | Status |
|---|---|---|
| `git config core.hooksPath .githooks`; "four checks" | `.githooks/pre-commit` exists; its header lists exactly 4 checks (gitleaks, `git diff --cached --check`, `py_compile`, `ruff format --check`) — matches README 469-474 | OK |
| gitleaks allowlist "`.gitleaks.toml` flow" | `.gitleaks.toml` exists at repo root | OK |
| `sudo bash deploy/install-service.sh` / `... uninstall` | `deploy/install-service.sh` exists and implements `install` / `uninstall` subcommands | OK |
| `deploy/crf-editor.env.example`, `deploy/crf-editor.service.template`, `deploy/nginx/crf-editor.conf.example` | all exist | OK |
| `.env.example` (root, `CRF_*`) | exists | OK |
| README deploy blocks (`sed` unit rendering, `systemctl enable --now crf-editor`, nginx `proxy_pass … /`) | syntax consistent with `deploy/` templates | OK |
| `README.md:511-513` contribution block (`git checkout -b`, `git commit -m`, `git push origin`) | generic boilerplate | OK |

**No documented command points at a missing script/config file.**

## 4. Entry / module / key-file lists

Every path in the three `CLAUDE.md` "Key Entry Points", "Key Components and Flows", "Router Overview", "Service Overview" and the three "Related File List" tables resolves.

Two list-level **omissions** (mentioned in prose but absent from the tabular lists):

Precise set difference between each "Related File List" row and the on-disk directory:

| Row | Listed | Actual | Missing from the row |
|---|---|---|---|
| backend Services (`:133`) | 27 | 33 | `field_normalization.py`, `field_profile_service.py`, `field_type_policy.py`, `logo_storage_service.py`, `organization_preset_service.py`, `project_profile_service.py` |
| backend Routers (`:132`) | 13 | 14 | `organization_presets.py` |
| backend Models (`:134`) | 10 | 11 | `organization_preset.py` |
| backend Schemas (`:135`) | 8 | 11 | `_common.py`, `field_profile.py`, `organization_preset.py` |
| frontend Composables (`:176`) | 30 | 36 | `dateFormatOptions.js`, `designNotesSummary.js`, `fieldDefinitionAutocomplete.js`, `fieldReferenceImpact.js`, `fieldTypeAvailability.js`, `oidValidation.js` |
| frontend Components (`:175`) | 21 | 21 | — complete |

Both module docs qualify their directory counts with "and more", so the counts themselves stay correct; only the file-list rows are incomplete.

## 5. README.md vs README.en.md

The two files are **the same length (522 lines)** and correspond line-for-line. 24 fenced code blocks each, aligned 1:1.

### 5.1 Code-block diffs

All 24 block pairs were compared. Every difference is a translated comment inside an otherwise byte-identical command block (build/run, two-terminal dev, deploy prerequisites, systemd rendering, nginx, upgrade, tests, ruff). **No command exists in one README but not the other, and no path differs.**

### 5.2 Numeric divergences (line-by-line number-token diff)

6 lines differ in digits; 5 are translation artifacts, 1 is a real content gap:

| Line | Situation |
|---|---|
| 172 | MD comment ends "…默认 24"; EN comment omits the ", default 24" tail (config value `24` identical in both). Cosmetic. |
| 218 / 232 / 243 / 259 | Chinese ordinals 「方式一/二/三」 carry no digit; English "Option 1/2/3" and "Option 3 warning" do. Translation artifact. |
| 375 | Digit ordering differs only because of 「面板占用 80/443 … 1panel」 word order. Equivalent. |

**Real discrepancy:** none in counts — both READMEs carry the *same* wrong backend test count (63 files / 61 `test_*.py`); the correct value is 76 / 74 (§1.4).

### 5.3 Other semantic pairs checked

- Project-structure tree: identical topology, translated comments only.
- AI-collaboration-context list (`.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`, `.claude/index.json`): identical in both.
- Test section list bullets and the "two suites are disjoint" bullets: identical.
- Preview/export parity script reference: identical.

**Conclusion: the two READMEs are semantically identical except for the shared stale backend test count.**

## 6. Side finding — `.claude/index.json` (outside the 5-file scope, harness-relevant)

Referenced by `README.md:84-89` / `README.en.md` and by root `CLAUDE.md:96` ("synchronously update … `.claude/index.json`"). Its counts are all correct against this tree (backend: routers 14 / services 33 / models 11 / schemas 11 / repositories 4 / scripts 4 / tests 76; frontend: components 21 / composables 36 / scripts 1 / tests 87; timestamp `2026-10-12`), and every listed file exists. Not stale — noted so the docs task knows a machine-checkable index already exists and should be regenerated rather than hand-edited.

## 7. Existence-check commands used

```bash
wc -l .claude/CLAUDE.md backend/.claude/CLAUDE.md frontend/.claude/CLAUDE.md README.md README.en.md
ls backend/src/routers/*.py | grep -v __init__ | wc -l      # and services/models/schemas/repositories
ls backend/tests/*.py | wc -l ; ls backend/tests/test_*.py | wc -l
ls frontend/src/components/*.vue | wc -l ; ls frontend/src/composables/*.js | wc -l
ls frontend/tests/*.test.js | wc -l ; ls frontend/tests/component/
python3 -c "import glob; print(len(glob.glob('frontend/tests/component/**/*.spec.js', recursive=True)))"
grep -h '^class ' backend/src/models/*.py | wc -l
grep -rn "apiUrl(" frontend/src --include=*.vue --include=*.js        # 18 sites incl. definition
python3 /tmp/docsync-scan/extract_paths.py                            # 556 backticked tokens, multi-base resolve + glob
test -e <path>                                                        # for each of the 13 missing tokens
python3 -  # code-block + numeric-token diff of README.md vs README.en.md
git cat-file -t fb1ae18 ; git show --stat --oneline fb1ae18
grep -n <count-pattern> <each file>                                   # locating every numeric statement
```

---

## Digest

1. **Counts:** all directory/test counts in the five files are correct on this tree **except README.md:463 / README.en.md:463** (backend tests 63/61 → should be **76/74**). Root `CLAUDE.md`'s "40k-char limit" note is satisfied by characters (36,164) but the file is 40,921 bytes.
2. **Missing paths:** 13 tokens fail `test -e`; 7 are retired perf/CI artifacts inside Change Log entries (`backend/.claude/CLAUDE.md:145,150,154`; `frontend/.claude/CLAUDE.md:187`), 1 is an abbreviated prose path (`backend/auth-security.md` at `.claude/CLAUDE.md:122`), 5 are intentional `tests/component/**/*.spec.js` globs. No normative-briefing path is broken.
3. **Command targets:** all verified — package.json scripts, `backend/pytest.ini`, `ruff==0.16.10` + `backend/ruff.toml`, `compare_word_table_parity.py` argparse signature, `.githooks/pre-commit` (4 checks as documented), `deploy/install-service.sh install|uninstall`, `.gitleaks.toml`, `.git-blame-ignore-revs` → `fb1ae18` (134 files).
4. **Listed files:** every listed file in the three `CLAUDE.md` key-file tables exists; the backend "Related File List" omits 6 services (`field_normalization.py`, `field_profile_service.py`, `field_type_policy.py`, `logo_storage_service.py`, `organization_preset_service.py`, `project_profile_service.py`), 1 router (`organization_presets.py`), 1 model (`organization_preset.py`) and 3 schemas (`_common.py`, `field_profile.py`, `organization_preset.py`); the frontend one omits 6 composables (`dateFormatOptions.js`, `designNotesSummary.js`, `fieldDefinitionAutocomplete.js`, `fieldReferenceImpact.js`, `fieldTypeAvailability.js`, `oidValidation.js`). Accuracy gap, not a broken link.
5. **README discrepancies:** none beyond the shared stale backend test count; 24/24 code blocks aligned with translation-only diffs.
