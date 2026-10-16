# Existing Version and Release Chain

Initial read-only source inspection of `main` at `5025182`, performed on 2026-10-16, followed by the main session's read-only GitHub Release metadata check below. No private configuration read, build, test, AI request, upload, or publication was performed.

## Version Evidence

| Source | Verified state | Evidence |
| --- | --- | --- |
| Frontend package | Private package, version `0.4.0`; no release/version/publish script | `frontend/package.json:2-14` |
| npm lock | Root `version` and `packages[""].version` both `0.4.0` | `frontend/package-lock.json:2-9` |
| Local tags | `0.1.0`, `0.1.1`, `0.2.0`, `0.3.0`, `0.3.1`, `0.4.0`; all bare three-part tags | Local Git ref metadata, not a source-file line |
| Latest local tag | `0.4.0` points to `5c64c9a`, dated 2026-07-20; its release-preparation diff aligns the three package/lock version fields | Local Git tag/show/diff metadata |
| Backend API | No explicit application release version is passed into FastAPI | `backend/main.py:119-123,175-176` |
| Windows bundle | Fixed `CRF-Editor` executable name and `crf-editor` COLLECT directory, no explicit application-version resource | `backend/crf.spec:94-119` |

There is no discovered automatic authority-to-backend/UI/EXE version injection chain. Proposed authority: `frontend/package.json`, with the two lock-file root-package mirrors updated together. Do not change business-project data such as `App.vue`'s new-project `version: '1.0'` (`frontend/src/App.vue:130`). Do not rewrite dependency versions or `lockfileVersion` as part of an application bump.

`0.4.0..5025182` contains 364 reachable commits, including merges and documentation. This is neither a code-change count nor proof that GitHub's latest published stable release is `0.4.0`. Initial activation must query published release metadata and validate its resolved tag commit.

### Read-Only GitHub Metadata Verification

The main session subsequently ran `gh release list --limit 5 --json tagName,isDraft,isPrerelease,publishedAt,isLatest` and a field-limited `gh release view --json tagName,publishedAt,assets` query on 2026-10-16. GitHub reports latest published stable release `0.4.0`, published `2026-07-21T00:49:45Z`, with **no uploaded release assets**. This independently agrees with the current package version and local latest tag. GitHub's generated source archives are not uploaded binary attachments. No release content or repository setting was changed. Treat this as a planning-time observation; execution must re-query instead of pinning the future baseline to `0.4.0`.

## Existing Build/Deployment Objects

- Frontend: `npm ci && npm run build`; `frontend/package.json:7-9`, `README.md:307-309`. Backend serves the generated dist: `backend/main.py:207-211`.
- Desktop: Windows `backend/build.bat` expects `.venv\\Scripts\\python.exe` (`backend/build.bat:8-20`) and runs the PyInstaller spec from the backend directory (`backend/build.bat:32-46`). `backend/crf.spec:94-120` produces a directory bundle containing EXE plus dependencies. Any downloadable ZIP must include the entire directory.
- Packaged static chain: Vite dist -> spec's `frontend_dist` (`backend/crf.spec:51-58`) -> launcher's `CRF_STATIC_DIR` (`backend/app_launcher.py:14-19,35-39,127-131`) -> backend static serving.
- Desktop builds require root base `/`; do not reuse a `/crf/` frontend build (`frontend/vite.config.js:4-19`, `README.md:259-268`, `backend/app_launcher.py:51,101-105`).
- Windows assumptions: System32 runtime collection, `pystray._win32`, and `ctypes.windll.user32` (`backend/crf.spec:35-49,71-72`, `backend/app_launcher.py:117-124,195-201`). Cross-platform desktop support is not an existing contract.
- Linux: source/venv/systemd installation (`deploy/install-service.sh:21-24,39-51,79-93`); upgrade is pull/build/install/restart, not consumption of a GitHub Release binary (`README.md:402-408`). Release creation must not restart or modify the live server.

## Clean-Runner Gaps If Desktop Assets Are In Scope

1. The spec requires a `config.yaml` input (`backend/crf.spec:51-58`), but no tracked backend-local file exists and the configuration loader now expects a root file (`backend/src/config.py:31-36`). Real configuration is ignored (`.gitignore:1-8`). Do not copy a developer/production file or production key into the bundle. A safe generated/default configuration strategy needs dedicated design and tests.
2. Desktop dependencies Pillow and pystray are imported by the launcher (`backend/app_launcher.py:67-78,156-158`); inspected requirements files do not declare them or PyInstaller. The batch script installs unpinned PyInstaller if missing (`backend/build.bat:17-20`); the spec skips failed collect-all calls (`backend/crf.spec:16-17,29-33`). Treat clean-runner dependency provisioning as new work, not as an already verified build.
3. `requirements.lock` describes a production lock installation (`backend/requirements.lock:1-7`), but the installer and upgrade documentation use `requirements.txt` (`deploy/install-service.sh:48-51`, `README.md:405-407`). Make a deliberate release-only dependency choice; do not silently alter production installation policy.
4. Python >=3.10; frontend build Node `^20.19.0 || >=22.12.0`; complete frontend tests need `^22.12.0 || ^24.0.0 || >=26.0.0` (`README.md:95-100`). Choose a single supported runner/toolchain version at implementation time.
5. No established versioned ZIP naming, checksum generation, project Release upload script, or packaged-bundle smoke test was found in the inspected scope.

These are observable gaps, not reproduced build failures: no build was executed.

## Existing Automation and Tests

- No tracked `.github` directory/workflow currently exists. Local deletion commit `8ed19cd` removed the old CI workflows and `backend/tests/test_ci_merge_gate.py` on 2026-10-08. Do not restore those old workflows merely to add a weekly release.
- Local pre-commit is not a build/test pipeline (`README.md:467-474`).
- Backend: pytest, with optional statistics-only coverage (`README.md:434-447`); fresh worktrees need no actual config/database (`README.md:442`, `backend/tests/test_test_environment_isolation.py:42-47`).
- Frontend: `npm test` runs node:test then vitest (`frontend/package.json:12-13`, `README.md:450-460`).
- Existing root/subpath build tests: `frontend/tests/basePathDeployment.test.js:62-96,131-135`. They do not validate a PyInstaller bundle.
- Existing production reload regression: `backend/tests/test_main_reload_flag.py:18-34`.
- No discovered release-bump consistency, release-path eligibility, publisher idempotency, or desktop-packaging tests. These must be added if the corresponding release behavior is implemented.

## Proposed Eligibility Policy

Use the net difference from a validated release baseline to the pinned candidate commit, including rename old/new paths and deleted files. A completely reverted product change must not release merely because commits exist.

- Include runtime code (`backend/src/**`, `backend/main.py`, `backend/app_launcher.py`, `frontend/src/**`, `frontend/index.html`), runtime dependency/build inputs, and actual shipped static assets.
- Include deployment behavior and explicitly selected user-facing maintenance scripts if the task adopts one shared version for desktop/server source.
- Documentation, tests, test-fixture generators, Trellis/context files, development-only tools, and release-engineering files must not trigger a release by themselves.
- Compare package manifests semantically enough to ignore only the application's own version fields; dependency or application-script changes still qualify. A broad `chore(release)` message exemption is unsafe because it can hide real code.
- Actual configs, env instances, databases, uploads, secrets, logs, and generated binaries never enter the AI payload. Config examples may be release-triggering configuration-contract inputs without their full contents being eligible for AI upload.
- Future shipped assets must not be lost to a blanket `assets/**` exclusion.

## Resolved Planning Decisions

- The user selected the existing three-part semantic scheme: `minor` for the requested `+0.1`, `patch` for `+0.01`. Keep bare tag names and integer component arithmetic.
- The user selected source-only publication: tag, Chinese release notes, and GitHub-generated source archives. Windows packaging and its clean-runner gaps are deferred, not fixes authorized by this task.
- The user allowed summaries plus bounded, filtered, secret-scanned source diffs to the configured AI. See `workflow-security.md` and the final design for the transmission boundary.

These are user product decisions, not facts inferred from source. The final artifacts remain subject to user review before task activation and implementation.
