# Design — Controlled CRF MCP Editing

Status: approved by the user on 2026-11-05, including bounded dependency and disposable-test preparation (PRD C8). PRD C1–C7 define the product choices. Runtime compatibility and implementation validation remain unverified until the real commands pass.

## 1. Architecture and Dependency Boundary

Use a standalone stdio adapter in `agent_bridge/`, backed by a small, separately authenticated agent API in the existing FastAPI application. The adapter forwards only the ten allowlisted business commands; it never opens SQLite, imports the backend application, executes SQL, accepts arbitrary HTTP destinations, or calls an LLM.

- Keep backend runtime requirements and existing browser authentication unchanged.
- Adapter candidate dependencies: `mcp==1.30.0`, `httpx==0.27.2`, `jsonschema~=4.23`; development requirements add the existing pytest/pytest-cov families. Use a separate virtual environment.
- Use the documented v1.30 low-level `Server`, `list_tools`, `call_tool`, `InitializationOptions`, stdio transport, and `CallToolResult` APIs in `research/sdk-and-integration.md`. Do not mix SDK v2 APIs or force a 2026 protocol revision onto the v1 session lifecycle.
- Expose an authenticated backend manifest containing the ten names and Pydantic-generated input/output schemas. The adapter validates the exact allowlist and accepts only local schema references; no database text is used to generate executable tool descriptions.
- Backend dispatch uses a fixed name-to-typed-command registry. A JSON transport dispatcher is not a weak user-facing `manage_entity` tool: each MCP tool has its own closed schema and allowed business operation.
- Runtime entry: an explicit interpreter running the absolute `agent_bridge/server.py` path; no new package scripts, build/release changes, client-configuration edits, or public MCP listener.

### Adapter configuration

Required host environment variables: `CRF_AGENT_API_URL` (base URL ending at the agent API) and `CRF_AGENT_TOKEN` (dedicated backend credential). Fail with variable names only when missing. Reject credentials embedded in URLs, fragments, query strings, and non-HTTPS remote targets; HTTP is permitted only for loopback development. Preserve an explicitly configured deployment prefix such as `/crf/`.

Use HTTPX with TLS verification, redirects disabled, and `trust_env=False`; do not forward a credential to redirected hosts or silently read proxy/netrc credentials. Use bounded responses (1 MiB), connect/read timeouts (5/30 seconds), no automatic mutation retries, and stderr-only redacted logging. The token is never a tool argument, tool result, persistent client-side setting, or log field. Agent/owner access responses use `Cache-Control: no-store`, and the owner UI uses fresh `useApi` requests rather than cached approval data.

## 2. Dedicated Backend Grants

Add `agent_credential`, `agent_operation`, and `agent_audit_event` tables in one cohesive model module. Register them in `models/__init__.py`; the existing `init_db`/`Base.metadata.create_all` path creates new tables. No existing-column migration, global revision counter, or background job is needed.

A credential belongs to one owner and one project. Store only a hash of a runtime-generated, high-entropy opaque token, its name, read/read-write permission, issue-time `auth_version`, expiry, and revocation state. Show the raw token once on creation; never return it from list endpoints. Default permission is read-only. Default lifetime: 24 hours, selectable up to 7 days. Do not implement sliding renewal or a browser-JWT fallback for agent endpoints.

Every call validates the credential, current user/auth_version, current project ownership, project not recycled, operation permission, and every resource link within that granted project. An actor never inherits admin powers through this credential. A credential for one project cannot access another project even if the same user owns both. Ownership transfer/password reset/revocation invalidate access immediately through current-state checks. A recycled project is denied while recycled; this does not silently change existing browser recycle-bin semantics.

Use isolated, always-on `InMemoryRateLimiter` instances with the existing rule type: generous pre-auth IP protection and per-credential read/write buckets (600 requests/min/IP, 240 reads/min/credential, 60 writes/min/credential); owner credential issuance is bounded to 10/min/user and 20 active credentials/project. Keep the existing login/import limiters unchanged. Document the existing single-node deployment limitation.

## 3. Transactional State Checks and Idempotency

### Project content fingerprint

Use a canonical SHA-256 fingerprint of the granted project's design metadata: project, dictionaries/options, units, definitions, forms, instances, visits, and visit-form links. Include stable row IDs and persisted design values, sorted by table/key/column; normalize database types deterministically. Exclude credentials/operations/audit state so approval bookkeeping does not invalidate its own proposal. Return the fingerprint with project/form/search/reference reads.

This deliberately coarse precondition may reject an edit after an unrelated change within the same project. It avoids changing every existing browser/import writer to advance a new revision counter. All current writers are observed through their actual resulting database state; content fingerprints are not a substitute for an append-only history or an assertion that no intervening identical-state restoration ever occurred.

Use real SQLite transactions before authoritative reads: explicit `BEGIN` for consistent agent reads, `BEGIN IMMEDIATE` for agent mutations/approval decisions. Keep scopes short and perform no HTTP/file work inside the write lock. Do not rely on pysqlite's logical/autobegin state to establish a physical snapshot. Keep this boundary in new agent dependencies/services, not a global change to existing session dependencies.

Mutations authorize and recheck current user/project state under the transaction, resolve an existing idempotency record, then compare the expected fingerprint and perform the business operation. Successful mutation, result record, and append-only audit event commit together. Any validation/structural failure rolls back the complete attempted edit.

### Idempotency

Local mutations and preview take a caller-stable `request_id` (1..64 safe ASCII characters) and the last observed `expected_project_fingerprint`. Bind the request ID to credential, project, command kind, and canonical full input. The same ID/input returns the original result; reusing it for different input returns 409. Check current authorization before returning cached results. Applied results retain their original after-fingerprint and identify a replay; clients must read again before a new edit.

Shared apply uses its server-created change ID as the idempotent identity. After a local mutation/preview transport timeout, the adapter may query the fixed request-result endpoint once, sending the original tool name and arguments so the backend can bind the lookup to the same identity. A different bound input is a definitive `IDENTITY_REUSED`: the call did not run. Absence is an unknown outcome, not proof of failure. For an unresolved local outcome or shared apply timeout, report the stable request/change ID and instruct retry with that same identity, never automatic recreation with a new ID.

## 4. Tool Contracts

All input DTOs and nested variants forbid extra keys. Positive IDs are distinct definition/instance/form IDs, not interchangeable OIDs. Read results use an envelope with typed data, `project_fingerprint` where relevant, warnings, and a structured error branch. Waiting for human approval is an explicit status, not a fake success or silently swallowed failure.

| MCP name | Principal inputs | Behavior |
| --- | --- | --- |
| `crf_list_projects` | none | Return only the active project granted to this credential. |
| `crf_get_project_outline` | project_id | Bounded form/visit/relation and dictionary/unit summaries plus editing-rule metadata. |
| `crf_get_form_detail` | project_id, form_id | Complete bounded form metadata, instances/definitions, resolved attributes, log rows, and full order; never raw HTML or a claimed Word layout preview. |
| `crf_search_field_definitions` | project_id, query, limit=20, offset=0 | Project-local regular-field candidates with literal matching; exact OID first, then OID/label substring, stable library order/ID ties. No fuzzy/typo/pinyin ranking or automatic first-match writes. |
| `crf_get_reference_impact` | project_id, resource_type, resource_id | Safe resource details and authorized reference impact; type is definition/codelist/unit/form. Include unplaced definitions where relevant, separately from placed-form impact. |
| `crf_add_form_field` | project_id, form_id, source, instance, position, expected fingerprint, request_id | `source` is either an existing definition ID or a strictly typed new definition; use `create_field_profile` and its positional insertion. No history/preferred-ID/cleanup parameters. |
| `crf_update_form_field_instance` | project_id, form_field_id, patch, expected fingerprint, request_id | Instance-only attributes; construct definition=none, binding=keep, instance=upsert, cleanup=None. No implicit rebind, shared update, delete, or structural-row edit. |
| `crf_reorder_form_fields` | project_id, form_id, ordered_form_field_ids, expected fingerprint, request_id | Complete current permutation including log rows; use the existing repository/order behavior plus final inline-block guard. |
| `crf_preview_shared_definition_change` | project_id, definition_id, patch, expected fingerprint, request_id | Validate a shared-definition proposal, calculate the exact diff/derived effects and impact, and persist only the immutable approval proposal. |
| `crf_apply_shared_definition_change` | project_id, change_id | Require an approved, unexpired, caller-bound, current proposal and execute it once. No modified payload or model confirmation boolean. |

Regular authored field types are the ten current `FieldsTab.vue` types, excluding structural 标签/log rows. Existing structural rows stay readable and participate in complete reordering. Unsupported/structural instance mutation fails explicitly rather than inventing a definition.

New definition authoring uses existing OID/checkbox/link/multiselect rules plus server-side Saimeisi 8-character authored-field policy; existing binding/legacy values are never renamed or truncated. Validate newly supplied numeric digits against the current UI ranges (integer 1..20, decimal 0..15) and newly supplied date formats against the canonical frontend option contract. Preserve omitted/untouched historical values. Choices require an in-project codelist; the single checkbox remains codelist-free. Contract-test the agent's authoring registry against existing frontend sources/fixtures; do not rewrite the old frontend authoring flows.

Limits: 64 KiB command input, 1 MiB response, 500 fields per complete form operation, 500 items per returned complete reference/option set, 100 maximum search page size, and 50,000 design rows per fingerprint operation. Refuse over-limit complete operations with explicit counts/limits; never silently truncate a permutation or approval impact. Lists that are intentionally paged expose total/offset/has_more. No arbitrary table/URL/file/execution parameters are permitted.

## 5. Shared Change Approval

Shared patch keys: label, field_type, checkbox_label, integer_digits, decimal_digits, date_format, codelist_id, unit_id. OID renaming, reserved table flags, definition ordering, deletion, and fork/rebind are not exposed by this increment.

1. Under the write transaction, verify the expected fingerprint and all target/dependency/reference ownership.
2. In an explicitly nested savepoint, run the proposed definition operation, normalize affected instances using the existing public normalization functions, validate every affected form against its original inline-block baseline, and collect semantic before/after differences.
3. Roll back the savepoint and expire stale ORM state; assert CRF metadata returned to its base fingerprint. Persist only the immutable proposal, impact, normalized command, contract/application version, actor/credential/project binding, and a 10-minute expiry. No file or external effects are allowed in this preview.
4. The owner reviews and approves/rejects from the normal authenticated CRF web UI. Approval checks that the displayed proposal digest/base state is still current. It does not itself apply CRF changes or extend proposal expiry.
5. Apply rechecks grant, ownership, approval, expiry, application/contract version, and the project fingerprint in the same write transaction. The fingerprint covers the reference set and referenced dictionary/unit contents, not merely definition columns.
6. Apply the immutable command and all derived normalization, validate all affected forms, then store the result and audit atomically. Duplicate apply returns that original result. Failure cannot leave partially normalized instances, a successful audit, or a consumed approval while CRF writes rolled back.

Expose a small public shared-definition helper extracted from the existing private profile branch so validation is reused, not router functions called manually. Preserve existing browser/profile semantics; the new agent command additionally owns whole-reference-set normalization/validation. Unplaced regular definitions may be proposed with an empty impact set; no representative form is required.

UI impact lists include form IDs/OIDs/names, visit usage, affected instances, and changes to effective attributes. Preserve visible local label overrides and clearly explain which instance properties do not change. If legacy cross-project links are found, fail closed without serializing foreign details; a shared mutation must not ignore hidden foreign references and then change them indirectly.

## 6. API and Trusted UI

Agent credential only:
- `GET /api/agent/tools` — static allowlisted schemas and contract version; no project text in tool descriptions.
- `POST /api/agent/tools/{tool_name}` — bounded JSON, validate with the registered Pydantic DTO and fixed permission/transaction category, execute the named business command.
- `POST /api/agent/operations/{request_id}` with closed body `{tool_name, arguments}` — credential-scoped result lookup for uncertain local-write/preview outcomes. The backend validates `arguments` with that tool's DTO and binds the lookup through the same `bind_or_reject` identity check as dispatch. Mismatched tool or canonical input → 409 `IDENTITY_REUSED`; absent → 404 `UNKNOWN_OUTCOME`. C18 replaced the earlier `GET` form, which could not bind input.

Browser JWT / current project owner only:
- `GET` / `POST /api/projects/{project_id}/agent-access/credentials`.
- `POST .../credentials/{credential_id}/revoke` (soft revocation, not record deletion).
- `GET .../agent-access/changes` (paged pending/recent summaries) and `GET .../changes/{change_id}` (complete bounded proposal detail).
- `POST .../changes/{change_id}/approve` and `/reject`, binding the displayed proposal digest.

Agent credentials are never accepted on these browser management endpoints; browser JWTs are never accepted as agent credentials. No MCP tool can mint/revoke credentials or approve its own plan. Preserve browser JWT verification/refresh semantics, but revalidate its identity/auth_version and project ownership within the agent write transaction; an ORM user fetched before acquiring the lock is not authoritative for issuance or approval.

Add a lazy `AgentAccessDialog.vue` launched from a small 项目信息 button. Show credential creation/revocation and shared proposals in two simple sections/tabs, using Element Plus and `useApi`. Do not change App login/admin routing or reorganize the project editor. Display the new token once, masked by default, use the existing clipboard helper, and clear it on close/project change/unmount. Never persist it to localStorage or include it in screenshots/logs. Handle initial-open props and late async responses correctly. Provide explicit refresh; no background notification/polling system is required. After MCP edits, normal workbench data may require the existing global refresh; disclose this rather than adding WebSockets.

## 7. Private-State Portability and Lifecycle

- Credential, operation/proposal, and audit rows are server authorization state, not CRF design assets.
- All existing SQLite export variants must remove these tables from the **exported copy**, with child-before-parent handling and vacuuming so deleted private data is not retained in free pages. Leave the live database and existing export error behavior unchanged. Old databases lacking these tables remain exportable.
- Do not copy this state during project copy, project DB import, template import, or database merge. Add regressions for injected private tables and legacy files without them; change import/copy production code only if inspection/tests establish a necessary compatibility fix, otherwise report a scope question.
- New FKs must permit existing project purge/user lifecycle behavior without orphan credentials or locks. Revalidate current ownership/auth_version on every access, including cached-result access.
- No production DB migrations, service restarts, real token creation, cleanup jobs, or deployments are performed by this task's validation.

## 8. Errors, Audit, and Validation

Map stable machine codes plus user-readable Chinese detail and `retryable`/repair guidance. Distinguish invalid input, denied grant, incompatible legacy data, stale state, reused request identity, approval required/expired/rejected, business structural rejection, backend unavailable, and unknown transport outcome. Preserve current business errors without leaking paths, SQL, raw headers, or credentials. Tool annotations are hints only.

Append audit events for successful local writes, proposal/approval decisions, and shared apply in their owning transaction. Keep actor/credential/project/operation IDs, result codes and compact semantic differences; never raw tokens. Failed/denied operations must remain observable through redacted errors/logs and must not be recorded as successful writes.

Verification is TDD with existing isolated backend fixtures, new schema/security/concurrency/export tests, adapter unit tests in its own environment, real official-SDK stdio process tests, component mount tests, frontend regression/lint/build, and a main-session browser walk on a throwaway service. Main reruns all acceptance checks and an independent read-only reviewer examines the final complex diff. Coverage gates: backend total >=80% and not below the captured baseline, new agent backend/adapter modules >=80%, and the new Vue dialog/composable's line/branch/function/statement metrics >=80%. Do not claim global frontend coverage from a scoped dialog report.

The additional frontend test dependency is only `@vitest/coverage-v8@5.0.3`, matching current Vitest. The user must approve this and the isolated adapter dependencies before installation; no test scripts or global coverage configuration change. Main provisions dependencies, temporary test wrappers, and isolated test credentials only after the formal authorization gate; Sonnet installs nothing.
