# Shared execution runbook — children of `10-08-review-remediation`

Every child task follows this runbook. A child's own `implement.md` lists only its task-specific steps and references the sections here.

## 0. Roles and gates

- The plan was produced by the lead session; implementation executes it. A child starts only after the user has reviewed its artifacts.
- The parent task holds no code; never `task.py start` the parent.
- Start a child from the main checkout:

  ```bash
  python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-<slug>
  python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-<slug> <branch>
  ```

- Task docs stay untracked in the main checkout until archive. From a worktree, read them by absolute path: `/home/decade/CRF-Editor/.trellis/tasks/10-08-<slug>/`.
- Explicit user authorization is required before each of: commit, merge, push, deploy, installing any tool or package, and deleting anything you did not create in this task.
- No `sudo`. No system package installs.

## 1. Hard safety rules

- **Since `test-isolation` merged, the backend suite is hermetic** and may run in the main checkout too: `backend/tests/conftest.py` redirects database / upload / screenshot / Word-import temp paths to a session temp root before `import main`, and `tests/test_test_environment_isolation.py` fails if anyone breaks that redirect. Historical note (pre-merge): the suite then read the root `config.yaml` DB in the permission-guard export test, ran the real `init_db()` in the lifespan self-check test, and wiped `backend/uploads/docx_temp` on every app shutdown.
  - Harness gotcha: the executor's shell cwd resets between commands. Every pytest invocation still needs its explicit `cd <dir> && ` prefix (or `git -C`); a missing prefix once ran the suite against the real main-checkout database during `test-isolation` itself (no damage: WAL untouched, nothing to wipe).
- Never copy the main checkout's `config.yaml` or `crf_editor.db` into a worktree. They point at real data.
- Never stage `config.yaml`, `*.db`, `uploads/`, or coverage artifacts. Stage files by explicit path; never `git add .`.
- A dev server may be running from the main checkout (`python main.py`). Do not stop it. Use another port (e.g. 8901) for any throwaway server.
- Log approach decisions per `.context/prefs/workflow.md`.

## 2. Worktree lifecycle

```bash
SLUG=<slug>; BR=<type>/<slug>; WT=/home/decade/CRF-Editor-$SLUG
git -C /home/decade/CRF-Editor worktree add "$WT" -b "$BR" main
```

Finish, only after the user authorizes it:

```bash
git -C "$WT" merge main                          # only if main moved; resolve conflicts, re-run §3/§4 checks
git -C /home/decade/CRF-Editor status --short    # no modified tracked files; untracked .trellis/tasks/ and the dev server's backend/backend.log are expected
git -C /home/decade/CRF-Editor merge --no-ff "$BR"
git -C /home/decade/CRF-Editor push origin main  # separate authorization
git -C /home/decade/CRF-Editor worktree remove "$WT"
git -C /home/decade/CRF-Editor branch -d "$BR"
```

- Never delete, stash, or `git clean` files you did not create. If `status` shows anything unexpected in the main checkout, stop and ask the user.
- Commit message: `<type>(<scope>): 中文描述`. Types: feat / fix / refactor / docs / test / chore / perf.
- Do not add a `Co-Authored-By` trailer. The user's git rule overrides the harness default.
- Archive the task (`python3 ./.trellis/scripts/task.py archive <task-dir>`) and its journal entry in a **separate** `.trellis/` commit. Never mix it with project code.

## 3. Backend test environment

```bash
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
cd "$WT/backend" && $PY -m pytest -q
```

- The proxy variables must be unset. The venv lacks `socksio`, so the AI-review tests fail for environmental reasons otherwise.
- LibreOffice is installed (`/usr/bin/soffice`). The two LibreOffice-gated tests run instead of being skipped.
- **Throwaway config: no longer needed — `test-isolation` has merged.** `backend/tests/conftest.py` now redirects `CRF_DATABASE_PATH` / `CRF_STORAGE_UPLOAD_PATH` to a session temp root and generates a random `CRF_AUTH_SECRET_KEY`, so a fresh worktree runs the full suite with zero setup. The recipe below is kept for history only (it mirrors the deleted CI step, `git show a601090:.github/workflows/ci.yml`); do not recreate it:

  ```bash
  cd "$WT"
  SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
  ADMIN_PW=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
  cat > config.yaml <<YAML
  database:
    path: ./crf_editor.db
  storage:
    upload_path: ./uploads
  auth:
    secret_key: "$SECRET"
  admin:
    bootstrap_password: "$ADMIN_PW"
  YAML
  cd backend && $PY - <<'PY'
  import secrets
  from sqlalchemy import select
  from sqlalchemy.orm import Session
  from src.database import get_engine, init_db
  from src.models.project import Project
  from src.models.user import User
  from src.services.auth_service import hash_password

  init_db()
  with Session(get_engine()) as session:
      owner = session.get(User, 1)
      if owner is None:
          owner = User(id=1, username="ci-export-owner",
                       hashed_password=hash_password(secrets.token_urlsafe(16)), is_admin=False)
          session.add(owner)
          session.flush()
      if session.scalar(select(Project.id).where(Project.owner_id == owner.id)) is None:
          session.add(Project(name="CI 导出测试项目", version="1.0", owner_id=owner.id, order_index=1))
      session.commit()
  PY
  git -C "$WT" status --short --ignored | grep -E 'config.yaml|crf_editor.db|uploads' # must show as ignored (!!)
  ```

- Coverage, once `test-isolation` has merged and `pytest-cov` is installed:

  ```bash
  $PY -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q
  ```

  Record coverage for every file you change. It must not drop. There is no threshold gate.

## 4. Frontend environment

```bash
cd "$WT/frontend" && npm ci          # worktrees have no node_modules
node --test tests/*.test.js
npm run lint
npm run build
```

- Browser checks follow the memory note `browser-e2e-recipe`:
  - headless shell path;
  - a throwaway backend with `CRF_DATABASE_PATH` / `CRF_STORAGE_UPLOAD_PATH` under `/tmp/<dir>`, `CRF_ENV=production`, port 8901;
  - `npm run build` needs no backend restart.
- Use `httpx` for API scripts. `requests` is not installed in the venv.
- If browser verification is blocked, say so and state what was verified instead. Never claim live DOM verification you did not do.

## 5. Per-child flow

1. Read, in order:
   - the child's `implement.jsonl` entries;
   - the child's `prd.md` → `design.md` → `implement.md`;
   - this runbook;
   - `.context/prefs/coding-style.md` and `.context/prefs/workflow.md`;
   - the `.claude/CLAUDE.md` of each package you touch.
2. Re-verify every line reference you rely on. Code moves between planning and execution.
3. Record the baseline: the full backend suite, and the frontend suite if the task touches the frontend. Use the same commands as the final run.
4. TDD:
   - write the RED tests and confirm each fails for the stated reason (not an import error, unless the test targets a new function);
   - make them GREEN with the minimal change;
   - then refactor.
   - Functions < 50 lines, nesting ≤ 4, type hints on all new Python signatures.
5. Sync docs (§7).
6. Run the review gates (§6).
7. Report (§8) and stop. Wait for the user's authorization before committing.

## 6. Review gates

- `git -C "$WT" diff --check main...HEAD` (and the working tree) is clean.
- Dispatch a `trellis-check` sub-agent on the full branch diff. Fix its findings.
- Run the `code-review` skill on the branch diff.
- For security-sensitive tasks, run the `security-review` skill on the diff, or a read-only sub-agent applying its checklist. No Critical or High finding may remain. Security-sensitive here means `docx-temp-ownership` and the auth part of `small-defects`.
- For frontend diffs, a read-only Haiku sub-agent (`Agent`, model `haiku`) reviews the diff and only reports findings. The executor decides what to fix.
- After any delegated code change, read the actual diff yourself. Do not trust the agent's summary alone.

## 7. Docs sync checklist

From root `.claude/CLAUDE.md` → Development Conventions:

- `README.md` + `README.en.md`, kept semantically identical, when features, commands, or test entry points change.
- `backend/.claude/CLAUDE.md` / `frontend/.claude/CLAUDE.md` for the touched module.
- `.claude/index.json` when it describes the touched area.
- Root `.claude/CLAUDE.md` Change Log: one line only. Append the full narrative to `.context/history/archives/claudemd-changelog.md`. Keep the root file under 40k chars.
- `.trellis/spec/guides/cross-stack-contracts.md` for any contract change.
- Trellis step 3.3: record new conventions in `.trellis/spec/`.

## 8. Report template (final message to the user, in Chinese)

- One-sentence plain-language result.
- Files changed; RED → GREEN evidence for each new test.
- Full-suite counts vs baseline; coverage of the changed files (when available).
- Review findings and how each was resolved.
- Docs touched.
- **Not run**, with reasons, e.g. "browser check not run: …".
- What needs the user's authorization next: commit / merge / push / deploy.
