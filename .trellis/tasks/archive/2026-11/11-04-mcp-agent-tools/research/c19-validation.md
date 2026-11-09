# C19 — Two Lookup Error-Boundary Tests and Coverage Recovery

Date: 2026-11-06. Executor: main session, inline; no delegated implementation/review. Authority: the user's `补 2 个测试（推荐）` selection and subsequent `继续`. This is the tenth bounded correction, not permission for an eleventh.

## Scope and Approach

- Exactly one test file changed: `backend/tests/test_agent_tools_edit.py` (one `Engine` import and two new tests).
- Backup: `/tmp/crf-mcp-agent-c19-7f09b614/files/backend/tests/test_agent_tools_edit.py`, SHA-256 `6d69efea9e65619bcd3371dc0f4a5a3d78f98d28e903d4fbe8618b98a0df64c7`; both paths were regular, single-link files and byte-identical before editing.
- The malformed-JSON test uses the real TestClient request and real bounded parser/error formatter. It asserts HTTP422, exact `{detail, code: VALIDATION}` and `Cache-Control: no-store`.
- The unexpected-error test temporarily replaces only the isolated database engine's `connect` method. The real router, authentication path and exception formatter execute. It asserts HTTP500, exact generic `{detail, code: INTERNAL}`, no-store, and exactly one server log carrying the original exception and request ID. The patch is scoped and restored before teardown.
- No production code, adapter, frontend, dependency, configuration, threshold, exclusion or test-selection change.
- This is coverage-only work on already-implemented behavior. The C18 report reproduced the missing coverage; the new tests passed on their first run. No failing RED run is claimed, and no production behavior was deliberately broken to manufacture one.

## Actual Verification

Commands ran from `/home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools` using the existing `/tmp/crf-mcp-agent-backend-checks.sh` wrapper. It fixes the backend interpreter, clears child proxy variables and redirects runtime files to the task temp root. Disposable test credentials remain within C8's authorization; no production config/database/systemd access.

| Command / check | Result |
| --- | --- |
| `bash /tmp/crf-mcp-agent-backend-checks.sh pytest -c pytest.ini tests/test_agent_tools_edit.py::test_operation_lookup_rejects_malformed_json tests/test_agent_tools_edit.py::test_operation_lookup_logs_unexpected_failure_without_exposing_details -q --tb=short --show-capture=no` | 2 passed, 5 warnings, 0.64s |
| `bash /tmp/crf-mcp-agent-backend-checks.sh pytest -c pytest.ini tests --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-c19-suite.json --cov-fail-under=80 -q --tb=short --show-capture=no` | 1648 passed, 1309 warnings, 104.83s; exit0 |
| `bash /tmp/crf-mcp-agent-backend-checks.sh ruff format --check .` | 197 files already formatted; exit0 |
| `diff -u` against the test backup | Exactly one import plus the two tests; main self-review, not independent review |
| `git -C <worktree> diff --check` | Pass |
| `bash /tmp/crf-mcp-agent-backend-checks.sh py_compile tests/test_agent_tools_edit.py` | Pass; cache redirected to the existing task temp root |
| JSON parsing of `task.json` / `.claude/index.json`, and spec-boundary assertions | Pass; all seven §16 sections retained, all other contracts unchanged except the §16 Quick Reference row |
| SHA-256 comparison of the 82-path pre-edit snapshot | Only `backend/tests/test_agent_tools_edit.py` changed, before the subsequent record/spec sync |

Reports: `.pytest-tmp/mcp-agent-tools/backend-c19-suite.json` and `backend-c19-suite.log`. Tests-only suite and temporary probes were not combined.

## Exact Coverage Gates

| Scope | C17 floor | C19 | Gate |
| --- | --- | --- | --- |
| Backend total | 10019/11366 = 88.148865% | 10047/11390 = 88.208955% | PASS, increased |
| Agent production, all 12 modules | 1538/1658 = 92.762364% | 1566/1682 = 93.103448% | PASS, increased |

The comparison uses integer cross-products, not rounded display percentages. Both new lookup exception branches (`routers/agent_tools.py:292-298`) are covered. C19 resolves C18's agent-coverage sub-gate failure (1560/1682 = 92.746730%). Warning categories remain the existing AnyIO deprecation and JWT test-key length warnings.

## Security and Review

- Exact error-body assertions prevent internal exception text from entering the HTTP response.
- Exception details remain server-side; test failure text is synthetic and contains no credentials.
- Scoped connection patch, real endpoint/error conversion, and the passing full suite guard against mock leakage or test-order effects.
- No new production attack surface, credential format, permission change or external publication.
- Main reviewed the actual diff. No independent review of C18/C19 was run; the previous final independent review predates these deltas.

## Specification Synchronization

Updated only §16 and its Quick Reference row in `.trellis/spec/guides/cross-stack-contracts.md`: closed POST lookup and tool/input binding, default409 `CONFLICT` versus explicit `STALE_STATE`, read-path foreign codelist/unit422, reorder rollback assertions, timeout recovery, and both real error-boundary tests. Existing seven-section structure and other contracts remain intact. Root/module context and `.claude/index.json` pointers still name the same files; no redundant schema fixture or new index entry is needed.

## Not Run / Remaining

- Adapter/frontend suites, their coverage/build/browser checks: not rerun for C19; their bytes are unchanged and C18 verification remains applicable (adapter62 + probes11, production289/318; frontend wiring16 and lint0 errors/2819 existing warnings). The earlier disposable-browser evidence remains from round3.
- Bandit: not available in the backend venv/PATH, not installed; scan not run.
- Independent C18/C19 review: not performed.
- F7–F10/F13 and C18 N1–N3 remain recorded non-blocking follow-ups; no fixes applied.
- No commit, merge, push, task archive, deployment, branch deletion or old-temp cleanup. Task stays `in_progress` pending the user's finish decision.
