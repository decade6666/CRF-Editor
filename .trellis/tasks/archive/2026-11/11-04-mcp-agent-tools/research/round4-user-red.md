# C13 RED Evidence — User-Executed External Terminal

Date: 2026-11-06. Attribution: the user executed the existing isolated probe command in an external terminal and pasted its actual output into the conversation. This is **not** a main-agent or implementer-run result.

## Execution and Limits

The session's `!` command was also isolation-guard-refused. The user's independent external shell then ran:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && bash /tmp/crf-mcp-agent-backend-checks.sh pytest -c pytest.ini ../.pytest-tmp/mcp-agent-tools/test_independent_followup.py -q --tb=short --show-capture=no
```

Result: **12 failed,1 passed,23 warnings in3.57s**. Existing hermetic fixtures and disposable data only. The guard remains effective inside this session; this output does not authorize any agent to rerun a denied command, use another runner/provider/session to evade it, or change permissions. C13's already-approved implementation can proceed from this RED baseline, but subsequent validation is pending an allowed execution path or explicit user-executed results. No GREEN/coverage/build/browser success is established by this run.

## Observed Failures

| Finding | Cases | Actual outcome |
|---|---:|---|
| IR1 committed-result lookup | 1 | Pydantic closed output DTO rejects extra `data.project_fingerprint` |
| IR2 unrelated dictionary | 2 | Granted outline returns413 for another owner's active and recycled501-option dictionaries |
| IR5 insertion range | 2 | position0 and10000 return500 instead of400/422 |
| IR4 shared type normalization | 4 | choice→text retains codelist1; text-with-unit→date retains unit1; date→time retains `yyyy-MM-dd` rather than `HH:mm`; text→date retains null rather than `yyyy-MM-dd` |
| IR4 new date canonicalization | 1 | Persists `YYYY-MM-DD`, not canonical `yyyy-MM-dd` |
| IR6 corrupt foreign-definition link | 1 | Instance update succeeds200 instead of rejecting404/422 |
| IR3 same-loop lock wait | 1 | Bounded200ms SQLite wait returns500 after0.208s; scheduled same-loop release cannot run first |

The control read without credentials while another write lock is held passed. IR3 proves the isolated event-loop/lock-wait mechanism, not an actual concurrent browser HTTP round trip or the production-default5s duration; permanent C13 concurrency tests must cover that wider path.

Warnings: one Starlette/AnyIO deprecation plus11 signing and11 decoding short-HMAC fixture warnings. No secret value was supplied or inspected; these are not proof of a production-key issue, and conftest/secret configuration is outside this repair scope.

## Implementation Handoff

- Exactly one native Sonnet writer, implement.md's current C13 nineteen-file subset, IR1–IR6 only.
- Write permanent regressions first, using these already-failing behavioral assertions. Their separate pre-fix execution is **not run**, not a claimed extra RED command. Then make minimal source fixes.
- All test/build/app/import/formatter/script runners remain prohibited for the implementer under this execution restriction; read/search/plain Git + scoped Edit/Write only. Report checks NOT RUN rather than looking for a different command shape or peer.
- Main will review actual diffs and scope, then obtain actual post-fix execution evidence. No final acceptance, fourth-round completion, commit/merge/deploy or fifth-round permission follows from editing code alone.
