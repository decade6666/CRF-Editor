## ADDED Requirements

### Requirement: Static asset serving SHALL remain confined to the configured assets directory
The backend SHALL only serve files from the resolved `_assets_dir` configured by `CRF_STATIC_DIR` or the frontend build output. Requests to `/assets/{filepath}` MUST reject absolute paths, path traversal, mixed separator variants, encoded dot-segments, and Windows drive-style inputs before file resolution, and MUST verify that the resolved candidate path remains inside `_assets_dir`.

#### Scenario: Traversal payloads are rejected
- **WHEN** a client requests `/assets/../../config.yaml`, `/assets//etc/passwd`, `/assets/%2e%2e/config.yaml`, or a Windows-style traversal variant
- **THEN** the backend returns a non-200 response
- **AND** the response MUST NOT include bytes from any file outside `_assets_dir`

#### Scenario: Valid in-tree assets still resolve
- **WHEN** a client requests a hashed frontend asset that exists under `_assets_dir`
- **THEN** the backend returns that file with `Cache-Control: no-cache, must-revalidate`
- **AND** the deskop `CRF_STATIC_DIR` injection path remains supported

#### Scenario: Candidate path confinement uses resolved directory containment
- **WHEN** the backend resolves a candidate asset path from `_assets_dir / filepath`
- **THEN** the final resolved path MUST be accepted only if it is contained by `_assets_dir.resolve()`
- **AND** symlink, repeated separator, and mixed slash inputs MUST NOT bypass the containment check

### Requirement: Path safety helper SHALL support allowlisted resolved-path validation
`is_safe_path()` SHALL preserve its `(bool, str)` return contract while validating resolved candidate paths against explicit allowlisted directories. It SHALL be usable by `/assets` and template path checks without forcing a blanket rejection of all absolute candidate paths.

#### Scenario: Allowlisted resolved candidate passes
- **WHEN** `is_safe_path(candidate, allowed_dirs=[allowed_root])` is called with a candidate path whose `resolve()` result is inside `allowed_root.resolve()`
- **THEN** it returns `(True, "")`

#### Scenario: Resolved path outside allowlist fails
- **WHEN** `is_safe_path(candidate, allowed_dirs=[allowed_root])` is called with a candidate path whose `resolve()` result is outside `allowed_root.resolve()`
- **THEN** it returns `(False, <中文错误信息>)`
- **AND** callers can surface the returned error directly to users

### Requirement: Asset path hardening SHALL be regression-tested with adversarial inputs
Backend tests SHALL cover path traversal attempts across POSIX, URL-encoded, and Windows-style payloads, and SHALL verify that no out-of-tree file contents are returned.

#### Scenario: Encoded and mixed-separator inputs cannot escape
- **WHEN** the test suite exercises inputs containing `%2e%2e`, backslashes, duplicate slashes, empty segments, and drive prefixes
- **THEN** every request is rejected or treated as missing in-tree content
- **AND** no test fixture outside `_assets_dir` is readable through `/assets/{filepath}`
