# Sonnet Execution — Late-Input Slice Remaining Verification

Updated: 2026-11-18T02:15Z (complete). Sole execution writer per user instruction 2026-11-18 (`使用sonnet执行，fable只负责审查`).
State: EXECUTION COMPLETE — all four dispatched goals executed; no product/test file edits made this session (the late-input repair from the pre-pause phase was verified as-is). Handback to main for diff inspection and Fable read-only review.

## Session File Inventory (exact)

- `.trellis/tasks/11-16-edit-conflict-followups/sonnet-execution.md` — this progress/result file (task-local, allowlisted).
- `/tmp/crf-edit-conflict-sonnet-verify/` — new nonsecret evidence root: backend-narrow.sh, backend-full.sh, backend-full.log, backend-coverage.json, compare_coverage.py, coverage-comparison.json, browser-lateinput-*.png (5), browser-lateinput-result.json, gitleaks-sonnet.json, isolated-backend.log, isolated-chrome.log.
- `/tmp/crf-edit-conflict-main-7weFaz/reload-input-browser/{verify.mjs, probe.mjs, reset-pages.mjs, chrome.pid}` — private browser driver helpers under the authorized root.
- NO edits to any product source, test, runner, config, docs, spec, README, index, or shared helper. E and P evidence roots untouched.

## Goal 1 — Backend Interrupted Run: DIAGNOSED + FRESH FULL VALIDATION PASS

- Evidence: E/backend-full.log = 1784 passed + 1 setup ERROR (`{"detail":"未授权"}`, tests/test_fields_router.py:52, `unit_id` fixture POST /api/projects/1/units → 401), duration 32529.18s (9:02:09). P/backend-full.log = 1785 passed in 131.19s.
- Timeline reconstruction: E run started ≈ 2026-11-17T23:30:14+0800 (log mtime 08:32:23+0800 minus duration); failing test at 46% ≈ first ~80s of a normal 131s run; fixture order client → auth_token (fresh login; token exp decodes to 2026-11-17T16:01:33Z = 30-minute TTL per `backend/src/config.py:114` `access_token_expire_minutes: int = 30`) → project POST 201 OK → unit POST 401. The 9h wall-time gap plus 401/TTL is consistent with expiration during pause; high-confidence environmental hypothesis, exact host suspension vs clock jump/other delay not independently established or reproduced.
- Root-cause confidence: HIGH, stated as environmental hypothesis — the pause itself cannot be reproduced on demand; not claimed as executed reproduction. The 401 `未授权` response is directly observed; product behaved as designed for an invalid/expired token. No auth TTL/config/product/test changes made or needed.
- Fresh narrow repro: `tests/test_fields_router.py -q` → 25 passed, 2.58s (includes the previously errored test).
- Fresh full suite (same hermetic wrapper shape as E/check-backend.sh; proxy vars cleared, CRF_DISABLE_BACKGROUND_JOBS=1): **1785 passed, 1508 warnings in 127.13s (0:02:07)**, exit 0. Coverage JSON totals byte-identical to P: 9886/11071 = **89.29635985909133%** (missing 1185, excluded 42) — >=80%, nonregressing.

## Goal 2 — Frontend Raw Coverage Comparison: PASS

Script `/tmp/crf-edit-conflict-sonnet-verify/compare_coverage.py`; raw counts in coverage-comparison.json. Istanbul line rule as dispatched (unique statement start lines, max hit per line); exact integers.

| variant | metric | E | P | >=80% | nondecreasing |
| --- | --- | --- | --- | --- | --- |
| default | statements | 7387/8448 = 87.44081% | 7372/8439 = 87.35632% | yes | up |
| default | branches | 5532/6861 = 80.62965% | 5520/6852 = 80.56042% | yes | up |
| default | functions | 2198/2470 = 88.98785% | 2197/2469 = 88.98339% | yes | up |
| default | lines | 6363/6987 = 91.06913% | 6350/6979 = 90.98725% | yes | up |
| serial | statements | 7388/8448 = 87.45265% | 7373/8439 = 87.36817% | yes | up |
| serial | branches | 5533/6861 = 80.64422% | 5521/6852 = 80.57501% | yes | up |
| serial | functions | 2198/2470 = 88.98785% | 2197/2469 = 88.98339% | yes | up |
| serial | lines | 6363/6987 = 91.06913% | 6350/6979 = 90.98725% | yes | up |

- Identical 64-file scope (exact same path sets, both variants).
- Totals differ because the source legitimately changed between P and E: per-file totals delta confined to the allowlisted `frontend/src/components/FormDesignerTab.vue` (+9 stmt all covered, +9 br, +1 fn; covered 1856→1871). Zero per-file covered-count drops on any metric in either variant. Percentage nondecreasing holds file-by-file and overall; a naive identical-totals check would be wrong and is corrected here.

## Goal 3 — Browser Acceptance of Late-Input Preservation: PASS (all 5 screenshots personally inspected)

Setup: credential file pre-checked (mode 0600, `test -f` before launcher start — generation branch never reachable); `launch-isolated-backend.py` ran with the existing throwaway DB (1 project 隔离验收项目, FU_A/FU_B + copies), loopback 8903, production mode, background jobs disabled, 60-minute token; chrome-headless-shell 153 CDP 9222 with the task-owned `reload-input-browser/profile`; two owned contexts `?case=followups-primary|secondary` created via bootstrap.mjs; UI login via browser-login-private.mjs (values never displayed). Frontend dist verified current (no src file newer than the build; E build was the last chain step).

Scenario: designer on FU_A (the form that has fields); a page-level fetch wrapper holds the five coherent-read GETs at response delivery (bodies/status/headers 100% genuine — this is network-delay simulation at delivery, NOT claimed as a backend race reproduction).

Results (driver `/tmp/crf-edit-conflict-main-7weFaz/reload-input-browser/verify.mjs`, evidence JSON `browser-lateinput-result.json`):

1. Own field save first (PUT 200, history entry, undo enabled) → dirty discard via reload leave-guard (取消) → reload confirm (重新载入) → 5 reads held → late field label typed → release → warning toast `重新载入未应用：读取期间编辑内容已变化，当前输入和撤销记录已保留` shown; editor retained late input; save button enabled; undo still enabled (history NOT cleared); later save → genuine 409 review dialog (设计冲突：核对后覆盖) showing local + latest; narrow (390×844) review screenshot; 保留我的输入 preserved input. Desktop + narrow screenshots inspected.
2. Second held reload → 新增字段 during hold + draft label typed → release → warning; draft row (未保存 tag) and editor survived; zero POST writes.
3. Third held reload (clean state) → blank-click deselect during hold → form 名称/表单域 late typed → release → warning; both retained; form save → genuine 409 review (local `等待期间本地名` + latest server name both asserted in dialog) → cancel preserved.
4. Write summary across the session: `PUT 200` (own save), `PUT 409`, `PUT 409` (both post-abort saves reviewed, never silently applied); JS errors: 0 on both pages.

Process stop status: backend (pid 1337019) and chrome (pid 1337223) killed; ports 8903/9222 verified free; profile/DB/driver/evidence retained, nothing deleted.

## Goal 4 — Security / Data-Integrity: PASS (self-review, honestly labeled)

- Actual diff reviewed (`E/input-repair.diff`, 120 lines, exactly the two allowlist paths): `captureDesignerReloadInput()` serializes editor buffers/identity; rehydration of a leave-flow-cleared selected field via the existing `selectField` before the read; post-read capture comparison warns and returns before ANY installation/history clearing. Placement is after the context/confirm guards and before snapshot consumption; preserves the completed full-list data/tag pairing, dirty/frozen/history/context protections; no backend/wire/Agent/export boundary change; no schema/dependency/runner change.
- Late-input implementation re-read in the worktree (`FormDesignerTab.vue:1274-1322`); `designerEditGeneration` semantics checked (bumped only on editor-identity changes: selectField/clears — correct inclusion in the capture).
- `git diff --check`: clean (rc 0).
- Gitleaks (8.30.1): the authorized check is the stdin `--pipe` scan over the full working diff + all new untracked files (697.76 KB) → **no leaks found**; report at gitleaks-sonnet.json (contains only the final stdin-scan result, `leaks: 0`).
- SCOPE DEVIATION DISCLOSED (kept, not rerun): an earlier invocation (`gitleaks detect` without `--pipe`) unintentionally scanned git history — 834 commits / ~56 MB — which was NOT this session's authorized check target (nonsecret source snapshot only). That run also reported no leaks, but it is recorded here as a scope deviation, not as part of the authorized check; it produced no separately retained report (the json path was overwritten by the authorized stdin scan), it has not been rerun, and no history scan result is claimed for the authorized check.
- Manifest: all 48 verified source/test SHA256s re-checked at session start AND after all work — 0 mismatches; HEAD still 2549ec69d39a69b9ad8841c35c60f1554d82cc9a. Since code hashes are unchanged from E's validated state, the already-executed full frontend chain (1117 node + 892 components default+serial PASS, default/serial coverage 892 PASS, lint 0 errors/2790 warnings, build 4.77s) remains valid; no fresh frontend re-run was needed (dispatched rule: no unnecessary reruns when hashes unchanged).
- Labeling: this is self-review by the execution writer; it is NOT independent review. Fable read-only review is main's next step.

## Blockers / Not-Run / Notes for Main

- Not run this session: Bandit (still unavailable in `/home/decade/.venvs/crf-editor/bin/python`; existence re-checkable, installation still requires approval — NOT RUN, not passed). Backend `ruff format --check` (not dispatched to me; backend untouched this session). No browser E2E of the CLEAN reload-install path beyond the probe (a clean-path manual probe correctly installed fresh state and cleared history — undo disabled — but that path was already covered by prior phases and the RELOAD witnesses).
- Documentation ownership stays with main: cross-stack §17 (`cross-stack-contracts.md` line ~1326 "Existing in-flight limitations" and validation-matrix line ~1356 "not repaired here") plus README zh/en, root/frontend module docs and `.claude/index.json` now need to reflect the verified late-input repair. I did not edit them per ownership boundary.
- Boundary notes: my driver does NOT claim generic own-write supersession or all-race safety — the repair covers the toolbar-reload in-flight-input path that was RED→GREEN'd pre-pause; HIGH-2(c) copy selection-change feedback, copy-fallback read freshness, cross-tab refresh and prior LOW items remain documented backlog.
- Browser debugging note (honest process record): several driver iterations were needed (stale page reuse, JS `.click()` being ineffective on ElMessageBox — real mouse events required, reference-impact confirm dialog on the two-form-shared definition, exit-transition overlay covering blank-canvas clicks, and a stale-value dirty check from prior runs). All resolved inside the driver; no product/test changes were made for them. The `holdToolbarReload` delivery-hold simulates fetch-response delivery delay only.
- Model telemetry: requested alias "sonnet"; runtime exposes the session model as **Claude Sonnet 5.5 (claude-sonnet-5-5)** per environment. No other model/usage telemetry exposed.
