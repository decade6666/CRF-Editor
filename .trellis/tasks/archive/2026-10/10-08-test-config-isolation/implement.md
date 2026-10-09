# Implementation plan: test session config isolation

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB).

- Branch: `test/test-config-isolation`
- Worktree: `WT=/home/decade/CRF-Editor-test-config-isolation`
- `$PY` is defined in RB §3.

## 0. Preconditions

- `backend-format` is not in progress. If it has merged since planning, start from the formatted `main`.
- Re-verify every line reference in design.md (RB §5.2): `config.py` `CONFIG_FILE` / `_ENV_OVERRIDE_MAP`, the conftest bootstrap block, `test_recycle_bin_policy_api.py:10`.

## 1. Start and baseline

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-test-config-isolation
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-test-config-isolation test/test-config-isolation
git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-test-config-isolation -b test/test-config-isolation main
```

- Run the full backend suite in the fresh worktree (RB §3) and record the counts. At `6580fc9` they were 1030 passed / 4 xfailed.
- Run the coverage command once and record TOTAL. This task changes only test files, which `--cov=src --cov=main` does not measure, so TOTAL only has to not drop.

## 2. RED

1. Add the two guards (design.md T3).
2. Path guard: run the guard file. `test_should_redirect_config_file_under_test_root` must fail, because the path resolves to the worktree root.
3. Env guard, with sentinel variables. Neither value is real data:

   ```bash
   cd "$WT/backend" && CRF_TEMPLATE_PATH=/nonexistent/sentinel.db CRF_ADMIN_BOOTSTRAP_PASSWORD=sentinel-not-a-secret $PY -m pytest -q tests/test_test_environment_isolation.py
   ```

   `test_should_not_inherit_config_override_env` must fail and name both variables.
4. Poison file (AC2). `config.yaml` is gitignored (`.gitignore:4`):

   ```bash
   printf 'a: b: c\n' > "$WT/config.yaml"                  # throwaway invalid YAML created by this task; no real data
   git -C "$WT" status --short --ignored -- config.yaml    # must print "!! config.yaml"
   cd "$WT/backend" && $PY -m pytest -q tests/test_test_environment_isolation.py
   ```

   Expected: the session aborts while conftest imports `main`, with `配置文件格式错误`. Keep the file for §3.

## 3. GREEN

Implement design.md T1 and T2. Then:

- The guard file passes, both with and without the sentinel variables.
- With the poison file still in place, the full suite passes with counts ≥ the baseline. This run is the AC2 evidence.
- Delete the poison file by explicit path (`rm "$WT/config.yaml"`), then run the full suite again (AC3).
- `git -C "$WT" diff --stat main -- backend/src backend/main.py backend/app_launcher.py` is empty (AC4).
- `grep -n CONFIG_FILE "$WT/backend/tests/test_recycle_bin_policy_api.py"` shows only the string patch target (R3).

## 4. Docs (RB §7)

- `.trellis/spec/backend/quality-guidelines.md`: design.md T4.
- `README.md` / `README.en.md`: extend the hermetic note. The suite reads no repo-root `config.yaml` and no `CRF_*` config variables from the shell.
- Root `.claude/CLAUDE.md`:
  - the hermetic bullet under Testing Strategy;
  - one Change Log line, with the full narrative in `.context/history/archives/claudemd-changelog.md`.
- `backend/.claude/CLAUDE.md`: one Change Log entry. File counts do not change, because no test file is added.
- `.claude/index.json` lists the guard by path only. No change is expected.
- After the merge, the main session updates the memory note `backend-test-environment`, which still describes the residual this task removes.

## 5. Checks (RB §6)

- `git diff --check`.
- `trellis-check` (sonnet).
- The `code-review` skill.
- No frontend change, so no Haiku review. The task is not on the RB §6 security-sensitive list.

## 6. Finish

- Follow RB §2 and RB §8.
- AC5, after the merge, in the main checkout:

  ```bash
  cd /home/decade/CRF-Editor && sha256sum config.yaml > /tmp/crf-config-before.sha256
  cd /home/decade/CRF-Editor/backend && $PY -m pytest -q
  cd /home/decade/CRF-Editor && sha256sum -c /tmp/crf-config-before.sha256
  ```

  Then delete `/tmp/crf-config-before.sha256`; this task created it.
- Suggested message: `test(backend): 测试会话不再读取真实 config.yaml 与外部 CRF_* 配置变量`

## Rollback points

- If the scrub breaks a test that silently relied on an inherited `CRF_*` variable, set the value in that test with `monkeypatch.setenv`. Never re-export it globally.
- If a test turns out to need values from the real config file (which would contradict the equal 1030 / 4 baselines), give it its own `tmp_path` config through a `CONFIG_FILE` patch. Never restore reads of the real file.
