## ADDED Requirements

### Requirement: Client-side DOCX semantic preview is the primary preview path
The system SHALL use browser-side processing as the primary preview path for DOCX import preview. The preview contract SHALL be based on a normalized manifest produced in the browser and SHALL NOT depend on a server-side `temp_id` or a server-stored temporary DOCX file as the primary source of truth.

#### Scenario: Preview succeeds without server temp file
- **WHEN** a user selects a valid `.docx` file for preview
- **THEN** the browser uses a Worker-based parse path to produce a normalized manifest and renders semantic preview data locally
- **AND** the main preview success path does not require a server-created `temp_id`
- **AND** the main preview success path does not require a server-stored temporary DOCX file

#### Scenario: Preview contract excludes raw_html
- **WHEN** the preview result is produced under the new contract
- **THEN** the result does not include `raw_html`

#### Scenario: Preview preserves current field semantics
- **WHEN** the browser produces preview data from a DOCX file
- **THEN** field type, default value, inline semantics, option trailing underscore semantics, ordering, unit/date/numeric precision semantics, and width-related semantics remain consistent with the existing CRF semantic contract
- **AND** the Worker parse path explicitly distinguishes importable rows from filtered rows such as `log_row`

#### Scenario: Normalized manifest carries stable semantic identity
- **WHEN** the browser produces a normalized manifest
- **THEN** each form and field includes a stable `semantic_id`
- **AND** `semantic_id` remains stable within the same `document_fingerprint`
- **AND** `semantic_id` is available to later AI review, screenshot mapping, user selection, and execute-import flows

---

### Requirement: DOCX screenshot capability remains available as delayed enhancement
The system SHALL preserve DOCX screenshot/page-image capability, but screenshot generation SHALL be a delayed enhancement and SHALL NOT block preview success.

#### Scenario: Preview returns before screenshot completes
- **WHEN** a user previews a DOCX file
- **THEN** semantic preview is shown before screenshot generation completes
- **AND** screenshot generation may continue asynchronously after preview success
- **AND** the preview UI can show screenshot state as pending or running without blocking semantic preview interaction

#### Scenario: Screenshot failure does not fail preview
- **WHEN** screenshot generation fails, times out, or is unsupported in the current environment
- **THEN** the semantic preview remains available
- **AND** the system exposes a degraded or unsupported screenshot state instead of failing the preview

#### Scenario: Screenshot capability still exists
- **WHEN** the environment supports screenshot generation and the delayed task succeeds
- **THEN** the user can still access screenshot/page-image output for the DOCX preview

#### Scenario: Legacy screenshot path is not a preview gate
- **WHEN** screenshot generation has not started, is still running, or never succeeds
- **THEN** the user may still keep the semantic preview result and continue toward later import execution
- **AND** screenshot completion is not required before preview success or execute-import availability

---

### Requirement: DOCX execute import is authoritative on normalized manifest input
The system SHALL accept a normalized manifest as the authoritative input for DOCX import execution. The original DOCX file SHALL NOT be required for the normal execute path.

#### Scenario: Execute import accepts normalized manifest
- **WHEN** the user submits a valid normalized manifest for import execution
- **THEN** the server validates manifest `schema_version`, `document_fingerprint`, stable `semantic_id` completeness, allowed field types, and business rules
- **AND** the server verifies the current user owns the target project before persistence
- **AND** the server persists forms/fields from the manifest under transaction protection

#### Scenario: Original DOCX is optional only
- **WHEN** import execution occurs under the new contract
- **THEN** the original DOCX file is not required for successful execution
- **AND** if an original DOCX is present, it is treated only as optional diagnostic input

#### Scenario: Invalid manifest is rejected
- **WHEN** the execute endpoint receives a malformed or semantically invalid manifest
- **THEN** the server rejects the request before persistence
- **AND** no partial import is committed

#### Scenario: Invalid overrides are rejected before write
- **WHEN** AI overrides reference missing `semantic_id` values, unsupported field types, or conflicts with manifest structure
- **THEN** the server rejects the request before persistence
- **AND** no partial import is committed

---

### Requirement: Cross-stage identity uses stable semantic IDs
The system SHALL use stable semantic identifiers for forms and fields across preview, AI review, screenshot mapping, user selection, and execution. Positional array indices SHALL NOT be the only identity across stages.

#### Scenario: Filtered rows do not break field identity
- **WHEN** preview excludes non-imported rows such as `log_row`
- **THEN** the remaining importable fields still retain stable identities that match execution input
- **AND** field identity is not derived solely from filtered array position

#### Scenario: AI suggestions reference stable identity
- **WHEN** AI suggestions are generated for parsed forms or fields
- **THEN** each suggestion references the target form or field by `semantic_id`
- **AND** the suggestion remains applicable even if display filtering or ordering changes

#### Scenario: Screenshot mappings reference stable identity
- **WHEN** screenshot output is associated with forms or fields
- **THEN** the mapping uses `semantic_id` rather than only positional indices

---

### Requirement: DOCX execute import emits structured audit context
The system SHALL record structured audit context for manifest validation, screenshot enhancement status, and final execute-import outcome so that client-side preprocessing does not reduce server observability.

#### Scenario: Execute import logs authoritative context
- **WHEN** the server validates or executes a normalized manifest import
- **THEN** it records `document_fingerprint`, `schema_version`, target project identity, owner identity, and execution outcome in structured logs

#### Scenario: Screenshot status is auditable without blocking import
- **WHEN** screenshot enhancement is pending, done, failed, degraded, or unsupported
- **THEN** the server can record that status alongside the import-related context without making screenshot success a prerequisite for execute import

---

### Requirement: Word export remains server-authoritative
The system SHALL keep final Word export generation on the server side. Browser-side processing SHALL NOT replace the server as the authoritative generator of the final exported `.docx`.

#### Scenario: Final Word export generated on server
- **WHEN** a user exports a project to Word
- **THEN** the server generates the final `.docx` from the server-side project snapshot
- **AND** the server validates export output before returning the file

#### Scenario: Client hints do not override authoritative export
- **WHEN** the client provides preview or layout hints
- **THEN** the server may ignore them for final export generation
- **AND** the authoritative export remains the server-generated document

#### Scenario: Final export keeps server-side validation
- **WHEN** the server finishes building the final `.docx`
- **THEN** it validates the output before returning the file to the user

---

### Requirement: Database import remains server-authoritative with bounded client preflight
The system SHALL keep database import authoritative on the server. Client-side database preflight SHALL be optional and limited to files of 32MB or smaller.

#### Scenario: Small database file may use client preflight
- **WHEN** a user selects a `.db` import file of 32MB or smaller
- **THEN** the browser may run an optional preflight check before upload
- **AND** the preflight result is advisory only

#### Scenario: Large database file skips client preflight
- **WHEN** a user selects a `.db` import file larger than 32MB
- **THEN** the client does not run browser-side preflight
- **AND** the file proceeds directly to the server-authoritative import path
- **AND** it does not enter any browser-side SQLite preflight branch

#### Scenario: Server import result overrides client preflight
- **WHEN** client preflight indicates success but server-side import validation fails
- **THEN** the server rejects the import
- **AND** the authoritative outcome is the server-side result

---

### Requirement: Migration validation covers manifest consistency and raw_html removal
The system SHALL define verification coverage for manifest consistency, screenshot degradation, transaction safety, bounded database preflight, and `raw_html` removal before rollout.

#### Scenario: Preview and execute share manifest semantics
- **WHEN** the same DOCX is used for browser preview and server-side execute import
- **THEN** form and field ordering, stable identities, and import semantics remain consistent across both stages

#### Scenario: raw_html has no remaining required callers
- **WHEN** the new preview contract is adopted
- **THEN** no required caller depends on `raw_html` being present

#### Scenario: Transaction failures do not create partial imports
- **WHEN** manifest validation passes but execution later fails during persistence
- **THEN** the server rolls back the import so no partial write remains

---

### Requirement: Unsupported client-side processing is explicit
The system SHALL explicitly surface degraded or unsupported states when the browser cannot complete a client-side processing step. The system SHALL NOT silently fall back to the old heavy server-side preview path.

#### Scenario: Worker or WASM unavailable
- **WHEN** the browser environment cannot run the required Worker or WASM processing
- **THEN** the system reports the capability as unsupported or degraded
- **AND** it does not silently switch to the legacy heavy preview path

#### Scenario: Browser resource limit exceeded
- **WHEN** the browser cannot safely process the selected file because of size or memory limits
- **THEN** the system reports a clear degraded or unsupported state
- **AND** it preserves the authoritative boundaries of later server-side operations
