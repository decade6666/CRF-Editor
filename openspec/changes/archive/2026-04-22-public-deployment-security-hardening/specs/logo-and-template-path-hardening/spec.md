## ADDED Requirements

### Requirement: Project Logo uploads SHALL only accept safe bitmap images
The project logo upload flow SHALL reject SVG and SVG-disguised files, enforce a bitmap-only allowlist, validate the actual file size from the upload stream, and derive the stored file extension from server-side content detection instead of trusting the user-supplied extension.

#### Scenario: SVG upload is rejected
- **WHEN** `POST /api/projects/{project_id}/logo` receives a file whose extension, MIME sniffing result, or leading bytes indicate SVG/XML content
- **THEN** the backend returns 400 with a Chinese `detail`
- **AND** the file is not persisted

#### Scenario: Bitmap upload still succeeds
- **WHEN** `POST /api/projects/{project_id}/logo` receives a valid PNG, JPEG, or WEBP file within the size limit
- **THEN** the backend stores the file under the logos directory
- **AND** the persisted filename extension matches the detected bitmap type

#### Scenario: Disguised extension cannot bypass validation
- **WHEN** a file named `logo.svg` contains PNG bytes or a file named `logo.png` contains SVG/XML bytes
- **THEN** the backend uses content validation rather than the original filename
- **AND** unsafe combinations are rejected

### Requirement: Existing SVG Logo files SHALL no longer be served
The backend SHALL refuse to serve stored project logo files that are SVG or otherwise fail the tightened logo safety checks, even if they were uploaded before this change.

#### Scenario: Historical SVG logo read is blocked
- **WHEN** `GET /api/projects/{project_id}/logo` targets a stored logo that is `.svg` or is detected as SVG/XML
- **THEN** the backend returns a non-200 response
- **AND** the response instructs the operator to replace it with a bitmap logo through the normal error `detail`

### Requirement: Frontend logo picker SHALL align with backend bitmap policy
The frontend SHALL narrow the logo file input accept list to supported bitmap formats and SHALL surface backend rejection details for invalid uploads.

#### Scenario: File picker excludes generic SVG selection
- **WHEN** a user opens the project logo file picker
- **THEN** the accept filter prefers allowed bitmap formats rather than generic `image/*`
- **AND** an invalid upload still shows the backend error detail if manually forced

### Requirement: Template path SHALL be restricted to allowlisted `.db` files at both save-time and use-time
`template_path` SHALL be resolved relative to `config.yaml` when provided as a relative path, MUST end with `.db`, and MUST resolve inside either the parent directory of `db_path` or `upload_path`. The same validation MUST run both when settings are saved and when the template database is actually opened for use.

#### Scenario: White-listed `.db` path is accepted
- **WHEN** `PUT /api/settings` submits a relative or absolute template path that resolves to an existing `.db` file under the allowed directories
- **THEN** the backend accepts and persists the setting

#### Scenario: Out-of-scope or non-db path is rejected
- **WHEN** `PUT /api/settings` submits `/etc/passwd`, `C:\\Windows\\win.ini`, a white-list-external path, or a non-`.db` file
- **THEN** the backend returns 400 with a Chinese `detail`
- **AND** the unsafe path is not stored

#### Scenario: Runtime template use re-validates old configuration
- **WHEN** runtime code attempts to open the configured template database after the YAML was edited manually or predates the new rules
- **THEN** the import service re-runs the same allowlist and suffix validation
- **AND** invalid paths fail safely instead of being opened

### Requirement: Logo and template hardening SHALL be covered by regression tests
Backend and frontend regression tests SHALL cover SVG rejection, disguised-file rejection, historical SVG read blocking, valid bitmap success, and template path allowlist enforcement at both save-time and use-time.

#### Scenario: Dual-layer template checks stay consistent
- **WHEN** the test suite exercises the same matrix of candidate template paths through `PUT /api/settings` and the runtime template-open path
- **THEN** both layers accept and reject the same cases
- **AND** no bypass exists through stale config or manual YAML edits
