# Design: Remove AI Review

## 1. Architecture and Boundaries

The existing deterministic pipeline remains the only import path:

```text
WordImportDialog / useWordImport
  -> authenticated, project-scoped preview upload
  -> streamed private owned .docx + deterministic parse_full
  -> parsed forms + temp_id
  -> screenshot evidence / deterministic SimulatedCRFForm
  -> execute {temp_id, form_indices}
  -> DocxImportService.import_forms -> existing project entities
  -> import result IDs / cache refresh / open designer
```

Delete the parallel AI branch rather than replace it: runtime AI settings and connectivity probing; `start_ai_review` and its process-local registry; status polling/progressive suggestions; per-item/form/global acceptance; AI preview expansion; execute overrides and their service helpers. There is no replacement provider, SDK, queue, schema migration or new dependency.

Backend and frontend code, their direct tests, the tracked config example and active feature docs form one B write slice. A retains all task/spec/decision/acceptance records. This is one deliverable, not independently deployable child tasks: frontend/backend contract retirement must land together.

## 2. API and Request Contracts

### Removed surfaces

- `POST /api/settings/ai/test` disappears (normal 404).
- `GET /api/projects/{project_id}/import-docx/{temp_id}/ai-review/status` disappears (normal 404).
- Preview no longer emits `ai_error`, `ai_task_id` or per-form `ai_suggestions`; remove their DTOs/serializers.
- Settings GET/PUT exposes only the existing `template_path` surface; no AI settings or masked keys are returned.
- Execute DTO/service signatures no longer model or apply AI field overrides.

Do not leave inert legacy response fields, a 410 compatibility route, disabled review code, or a new feature switch. Preserve all non-AI preview field metadata and the execute result `detail[].form_id`.

### Explicit legacy-write rejection (confirmed)

At the existing request boundaries:

| Endpoint | Retired input presence | Required result |
| --- | --- | --- |
| `POST .../import-docx/execute` | `ai_overrides`, including empty or null values | Sanitized 422; no parsing/import/data writes or upload consumption |
| `PUT /api/settings` | Any old `ai_*` parameter | Sanitized 422; no template/config write |

Return a short Chinese explanation that AI review was removed and the caller should refresh. Test that a submitted fake key/value never appears in the error body or logs. Preserve normal authorization and unrelated unknown-input behavior; do not add blanket `extra='forbid'` to unrelated DTOs. A model-validator default error that echoes the entire raw body is not acceptable. Keep the detection minimal at these actual boundaries; do not build a compatibility framework or restore writable AI fields to apply anything.

## 3. Configuration and Utilities

Remove `AIConfig`, `AppConfig.ai`, the `ai_config` accessor, review settings read/save branches and the `ai:` block from **tracked** `config.yaml.example`.

`load_config` may still parse a legacy raw YAML document and ignore its unknown `ai:` section. Preserve `update_config`'s atomic, unknown-key-retaining merge (`backend/src/config.py:288-326`): template-only updates must neither expose nor proactively erase old stored values, custom `app` sections, auth or other configuration. Prove this using a synthetic `tmp_path` config; never open a real config file/credential store. Do not claim that existing keys were securely erased.

No `CRF_AI_*` mapping exists in the current runtime map; `.env.example` and `deploy/crf-editor.env.example` need no AI removal edit. Weekly release has independent `ReleaseAIConfig` / `RELEASE_AI_*` inputs; retain `httpx` and all release behavior.

After removing settings/test consumers, `is_safe_url` and `mask_secret` in `backend/src/utils.py` are review-exclusive dead code (verified source/test callers). Remove only these functions and now-unused imports. Keep `generate_code`, `is_safe_path`, `is_safe_file_upload` and their semantics. The source tree has no `routers/ai_config.py`; A removes the obsolete AI router example line in the backend directory-structure spec, not a nonexistent source file.

## 4. Deterministic Import, Persistence and Cleanup

- Remove AI imports/DTOs, preview task launch, status route, override validation/serialization, manual AI cleanup and service arguments from `routers/import_docx.py`.
- Remove the AI-only `_cleanup_field_config`, override parameters/maps/expansion and review-registry discard hooks from `docx_import_service.py`.
- Preserve `_split_multiselect_field(s)` and `parse_full(allow_multiselect=...)`: 「其他」 projects still get deterministic checkbox synthesis; unrelated project rules remain unchanged.
- Preserve log rows and actual field ordering. Removing override indices must not break the retained per-field error logging (`_create_form`, inspected line 1535).
- Preserve file + screenshot discard, owned 32-hex IDs and non-disclosure, 24-hour .docx/.db/sidecar sweep, request cancellation cleanup, `run_in_threadpool` / `await_with_drain`, screenshots/start|status|pages and `/admin/cleanup-screenshots`.
- No data migration or reversal of already imported AI-influenced field types is performed.

## 5. Frontend and Upstream Settings Layout

Before dispatch, align the uncommitted task branch to the latest verified main with a safe fast-forward after approval. Reread actual affected files; the planning line anchors are not a license to restore the old settings UI. Preserve main `04df781...`'s 账号 / 界面 / 项目与数据 cards, account-row logout, 基础/完全 and 浅色/深色 boolean segmented options, accessible compact data actions, viewport/root scrolling and admin-only footer.

- `App.vue`: remove only AI form fields, read/save payload entries, test call/state, dedicated review section (`settings-ai-title`) and `.settings-ai-result`; keep template path and Agent host lifecycle intact.
- `WordImportDialog.vue` / `useWordImport.js`: remove review state/timers/acceptance/payload logic and AI-only factories/disposal. Keep initial-open reset, host v-model round trip, upload guard/headers/`apiUrl`, selection, errors, result state and refresh/handoff. `Loading` still serves ordinary upload/import.
- `DocxCompareDialog.vue`: remove AI controls/props/emits/styles, retain both screenshot/effect panels, orientation and field-click evidence mapping.
- `SimulatedCRFForm.vue`: render parsed fields directly, remove AI badges/modes/expansion and `_aiModified`; preserve default normalization, style adapters, planner/cache and input immutability.
- Remove the exclusive acceptance helper and its suite; replace positive AI assertions in mixed suites with removal and preserved-flow tests. Add one comparison mount suite that exercises the real deterministic simulated preview; mock only its external screenshot boundary where required.

Do not modify shared width/rendering algorithms merely because a preview consumer changed. Read relevant width/import/export contracts and run the matching existing regressions on both stacks.

## 6. Test and Acceptance Strategy

1. A prepares the latest base/lockfile environment and records measured baseline results/coverage before B edits. Baseline failures are reported, not silently fixed as this feature removal.
2. B writes failing boundary/UI regressions, confirms RED, then implements the smallest approved deletion. Test ordinary imports, stale input with no side effects/secret echo, missing endpoints/response fields, template-only settings and inert old YAML.
3. Preserve shared unit/integration tests for DB type/log-row rules, import ownership, streamed uploads, cancellations, screenshot failure/expiry, config isolation and 401/403. Keep the existing phase-0 non-admin settings fixture as an authorization regression even though it carries old fields.
4. Run source contracts, real Element Plus mount tests, full backend/frontend regressions, backend format check, frontend lint/build and measured coverage. Do not weaken tests or introduce runner/dependency changes to get green.
5. A inspects the actual diff/new files and reruns all planned validations; security pass covers safe legacy-input errors, unchanged permissions/path whitelists, no new outbound calls and cleanup preservation.
6. A uses only synthetic data in an isolated local backend/browser to verify administrator settings absence, regular settings/Agent entry preservation, Word upload -> compare -> import -> designer, and no AI endpoint calls/override payloads. Request any required formal credential/process authorization; do not touch port 8888 or live data. Report unavailable rendering/browser steps as blocked/not run.
7. After all writers return and A has no blockers, snapshot git state and in-scope contents outside the repo, freeze A/B writes and run one fresh read-only opus reviewer. Compare state/content hashes after return before recording its verdict.

Coverage is measured, not inferred from past logs: at least 80% and no decrease against a comparable assessed baseline. If existing coverage/tooling cannot satisfy or establish that rule, stop and state the shortfall rather than fabricate a pass. Removal of exclusive files must not mask regressions in surviving paths.

## 7. Documentation / Spec Split

B updates only the active product descriptions and file inventories in its exact allowlist. Preserve the unrelated weekly-release/MCP chapters and all upstream layout wording.

A updates the settled contract after B returns: cross-stack §4/§8 AI-only clauses and temp-route count; the settings-cards spec's obsolete AI phrase; the backend directory-tree's obsolete AI router line. After the first R report, the user additionally approved only the retired-feature ranges in `frontend/README.md` and frontend `hook-guidelines.md` / `component-guidelines.md` / `quality-guidelines.md`. A owns these documentation edits; B retains its existing allowlist and the final bounded repair slice in `implement.md`. No historical archive rewriting, new platform rules or journal/finish-work/commit actions are part of implementation approval.

## 8. Operational and Rollback Notes

The app frontend/backend must be rebuilt and deployed together eventually, but production deployment is not authorized here. Existing old pages get a safe 422 for retired write parameters and should refresh; they do not silently import different types.

A records the exact pre-dispatch base/status and snapshots of new/untracked in-scope files outside the tree. The five exclusive tracked source/test deletions are recoverable from git plus that snapshot, and require explicit approval of this plan. Never revert unrelated upstream settings changes or peer work. If preparation diverges from a safe fast-forward, scope changes, a permission is denied or writer ownership is uncertain, stop and ask rather than reset/clean/relaunch.

Relay policy: one native background B requested `sonnet`, duration `unknown` (cross-stack edits, executor validation and fix time have no reliable measured estimate), then fresh read-only final R requested `opus` per the user's latest instruction. The completed first fable review and its unchanged-state audit remain recorded, not relabeled or discarded. No Channel checks, worker, controller, team or fork. At most two logical fix rounds on the same addressable B; the reviewer-model change does not reset them. Snapshot before each; no commits until all required acceptance checks and independent review pass, and only after separate authorization.
