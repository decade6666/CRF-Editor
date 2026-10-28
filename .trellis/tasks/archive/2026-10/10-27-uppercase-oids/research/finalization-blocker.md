# Finalization blocker (resolved): intermittent component-test failures

## Current state (2026-10-28)

**Resolved by a test-environment-only clock guard.** A measured host wall-clock rollback and a deterministic no-business ElButton reproduction explain a real event-discard mechanism. The affected tests now pass 62/62, and full frontend runs pass 1056 node:test + 207 mounts in both serial and default modes. Business code, dependencies and runner configuration remain unchanged. The authorized finalization pipeline can resume after review; its commit hashes are recorded in `a-verification.md`.

At the initial pause, the user had accepted the 8888 behavior and explicitly authorized full finalization. No commit, archive, merge, push, service restart or worktree removal had been performed. Fresh full component-test runs had not passed even in serial mode, so earlier statements describing serial execution as deterministic were not supported by that evidence.

## 1. Root Cause Category

- **Category:** D (test coverage/isolation) and E (implicit assumptions) are investigation categories, not a confirmed root cause.
- **Confirmed symptom:** mounted UI assertions sometimes observe no warning, no draft or no save request. The failing cases change across runs.
- **Initial hypotheses:** H1 event/render timing 60%; H2 an actual save guard/behavior defect 25%; H3 suite/process isolation 15%. These are investigative priors, not measured probabilities.
- **Initial confidence:** the exact cause was unresolved; the clock evidence and deterministic reproduction described below subsequently identified a concrete environmental event-discard mechanism. Do not classify every unrelated future timing failure as the same fault without evidence.

## 2. Why the verification attempts did not converge

| Attempt / evidence | Result |
| --- | --- |
| Full backend with coverage, plus formatting | 1472 passed / 1036 warnings in 92.46s; 9623 statements / 1222 missed (~87.30%); 177 files already formatted |
| Full frontend serial, alongside backend | node:test 1056 passed; mounts 201 passed / 2 failed (`OidEditSave.spec.js:368`, `TemplateImportSelection.spec.js:183`) |
| Those two component files in isolation | 26 passed |
| Full frontend serial after backend finished | node:test 1056 passed; mounts 202 passed / 1 failed (`OidUppercase.spec.js:318`, copy draft had no recorded POST) |
| Temporary copy/save diagnostic, 12 cycles | First version: 11 passed / 1 missing draft. Second version: 11 passed / 1 missing POST. For the latter, the button was enabled, one native click was delivered, save/history/reorder guards were false, and no warning/error appeared; no POST appeared even after 100ms. This narrows the symptom but does not identify which handler boundary failed. |
| Instrumented copy/save diagnostics | A later 12-cycle run and a 60-cycle run passed; no missing-effect diagnostics occurred in those runs. Instrumentation may perturb timing; this is not proof of a fix. |
| Final full frontend serial after diagnostics were removed | node:test 1056 passed; mounts 202 passed / 1 failed (`OidEditSave.spec.js:451`, expected 8-character warning was not called) |
| Independent `npm run lint` and `npm run build` | exit 0; 0 errors / 2720 warnings; build passed in 3.49s |

No executable implementation, permanent test, dependency or runner configuration was changed to make these checks pass. Further identical full-suite retries will not be used as a substitute for finding the cause.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Honest verification gate | Pause finalization; preserve failed and passing command evidence | DONE |
| P0 | Scope control | No assertion weakening, warning suppression, dependency/runner/timeout changes or speculative business fix | DONE |
| P1 | Discriminating instrumentation | Inspect disabled state, native click delivery, save guards and delayed effects | DONE; root unresolved |
| P1 | Test/spec guidance | Document that one serial green run is not a determinism guarantee | DONE in component-guidelines.md |
| P1 | Bounded follow-up | The user approved investigation/fixes in the three named component specs only; stop if a necessary fix lies outside them | APPROVED; no permanent fix established |

## 4. Systematic Expansion

- Similar symptoms occurred in the unchanged `OidEditSave.spec.js` and `TemplateImportSelection.spec.js`, and this task's new `OidUppercase.spec.js`.
- Existing Vue warning gates and ordinary Element Plus components remain active; no production function was mocked to replace the code under test.
- Local Element Plus source shows the button ignores disabled/loading clicks; Vue runtime source contains an event-attachment timestamp guard. A timestamp-filter hypothesis remains unconfirmed: no failed capture recorded that boundary directly.
- Vue Test Utils documentation confirms `trigger` / `nextTick` and `flushPromises` cover different asynchronous update boundaries; this does not prove that adding arbitrary waits would fix the observed missing click effect.
- No architecture, business-logic or build-process change is justified by the available evidence.

## 5. Knowledge Capture and retained evidence

- Updated `.trellis/spec/frontend/component-guidelines.md` Copy/Save validation notes.
- `src/templates/markdown/spec/` does not exist in this product repository; template synchronization is not applicable, and no template directory was created.
- Logs: `/tmp/crf-uppercase-relay.JxXQVJ/final-{backend,ruff,frontend-test,isolated-components,frontend-idle,copy-diagnostic,copy-diagnostic2,copy-diagnostic3,copy-diagnostic60,frontend-after-diagnostic,lint,worktree-build}.log`.
- The temporary diagnostic spec was moved outside the repository to `/tmp/crf-uppercase-relay.JxXQVJ/OidUppercase.debug.spec.js`; it is not collected by the deliverable suite or staged.
- Existing deployment backups remain intact; the running 8888 service and production data were not changed by this investigation.

## Bounded follow-up after the user's approval

The user selected "先修测试再收尾（推荐）", authorizing only `OidUppercase.spec.js`, `OidEditSave.spec.js` and `TemplateImportSelection.spec.js`, with an explicit stop if the necessary fix exceeds that scope. Temporary capture listeners were added to the three designer mount helpers to inspect Vue click-invoker attachment timestamps without changing assertions or production behavior.

`npm run test:component -- --maxWorkers=1` with this instrumentation produced **202 passed / 1 failed**. All three instrumented files passed, no `SYNTHETIC_CLICK_FILTERED` evidence was emitted, and the sole failure moved to **`tests/component/SingleInlineTableGuard.spec.js:451`** (undefined request-record access). This is a fourth file, not an approved fix target. It does not prove a common cause with the other failures and does not confirm the timestamp-filter hypothesis. Stop rather than extending the repair scope or claiming the tests fixed.

All temporary trace imports/calls were removed. The two pre-existing specs are byte-identical to HEAD; the new uppercase spec remains its original accepted content. Instrumentation/helper logs stay outside the repo at `/tmp/crf-uppercase-relay.JxXQVJ/event-trace.mjs` and `final-event-trace.log`. At this point no permanent executable change had been made and broader investigation was paused for authorization.

## Authorized shared-environment investigation and resolution

The user then said "继续" in response to the proposal to include the fourth spec and shared component-test environment, while leaving business code, dependencies and runner configuration unchanged. A fresh independent read-only review was requested; the main session independently measured environmental time and built a no-business reproduction.

### Confirmed evidence

- A 30-second Node sample collected 26124 observations: one `Date.now` step of **-1039ms**, while `process.hrtime.bigint()` advanced **1.121088ms**. Output is retained in `/tmp/claude-1000/-home-decade-CRF-Editor/38357354-8fae-4749-98af-f350fec874e1/tasks/bylot7lv1.output`.
- Installed Vue runtime-dom rejects an already timestamped event when `event._vts <= invoker.attached`; VTU stamps `trigger()` events with `Date.now() + 1`. A host correction can therefore make a new synthetic event look older than its mounted listener.
- The standalone `EventHarness.debug.spec.js` controlled the host reading, mounted an actual ElButton, moved the clock backward1040ms and triggered click: handler count was **0 instead of1** (RED). It imports no business component. Log: `event-clock-backward-red.log`; the probe is retained outside the repo.

### Minimal implementation and verification

- `testClock.js::createNonDecreasingNow(readNow)` returns `max(previous, readNow())`. `setup.js` installs this as a per-test real `Date.now` spy; the existing restore hook removes it. Explicit fake Date/timer control is unchanged. No handlers are bypassed and no existing assertion or timeout is weakened.
- Added `testClock.spec.js` first, then the minimal helper/setup implementation. Its four cases cover forward/repeated readings, rollback/catch-up, a real ElButton click after rollback, and fake-timer/system-time advancement.
- Targeted new clock + four previously failing specs: **62 passed / 5 files** (`clock-fix-targeted.log`).
- Full serial `npm test -- --maxWorkers=1`: **1056 node:test + 207 mounts /18 files passed** (`clock-fix-full-serial.log`).
- Full default `npm test`: **1056 node:test + 207 mounts /18 files passed** (`clock-fix-full-default.log`).
- `npm run lint`: **0 errors /2720 baseline warnings**; `npm run build`: passed in **5.27s**. Logs use the `clock-fix-` prefix under `/tmp/crf-uppercase-relay.JxXQVJ/`.

### Updated analysis / prevention

- Category **E (implicit wall-clock monotonicity assumption)** is confirmed for the reproduced event-discard mechanism. Confidence is high because actual host sampling, installed source and a deterministic independent reproduction agree; this is not a claim that every future timing issue is eliminated.
- Earlier isolated/serial reruns did not fix the cause; instrumentation and short runs could miss a host correction. The retained failures are not overwritten by green results.
- Shared setup contains the bounded real-clock remedy and preserves fake timers; quality-guidelines.md records the signature, contract and regression matrix. No template source tree exists here to sync.
- The four original failing spec files remain unchanged; only shared setup and two new test-only clock files are executable changes. No production service/data change was needed.
- Fresh independent read-only review found no confirmed blocker in the three clock files and confirmed fake-timer/cleanup compatibility. It did not independently execute tests. A non-blocking failed-test-cleanup recovery suggestion is preserved in `a-verification.md` rather than silently claimed fixed. Work commits are `2b82644` (feature), `41a3a7d` (clock patch), `7ae30c0` (spec); local gates passed.
