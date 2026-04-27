# Functional Specifications — fix-empty-word-export

## 1. Problem Statement

`POST /api/export/{project_id}/prepare` could return HTTP 200 with a valid download token, yet the resulting `.docx` file downloaded by the user was 0 bytes or otherwise invalid. Root cause: `ExportService.export_project_to_word()` returned `True` based solely on "no exception raised", not on "output file is valid".

## 2. Scope

| In scope | Out of scope |
|----------|-------------|
| Post-save file validity validation | Re-architecting the export rendering pipeline |
| Generator-validator alignment (≥3 tables invariant) | Changing the two-step download API contract |
| Observability: logger.exception replacing print/traceback | Atomic write hardening (secondary-temp → os.replace) |
| Auth ownership check on token download | Export content semantic correctness |

## 3. Functional Requirements

### FR-1: Post-Save Validation Gate
After `ExportService.export_project_to_word()` returns `True`, the router **MUST** invoke `ExportService._validate_output(tmp_path)` before issuing a download token. If validation fails, the router **MUST** return HTTP 500 with a descriptive error and **MUST NOT** cache the token.

**Acceptance**: A manually truncated output file (0 bytes) causes `prepare_export` to return HTTP 500, not HTTP 200.

### FR-2: Generator-Validator Invariant Alignment
`ExportService._validate_output()` requires `len(doc.tables) >= 3`. The generator **MUST** always produce ≥3 tables regardless of project data:

| Project state | Expected tables |
|---------------|----------------|
| Has N forms | cover (1) + visit-flow (1) + form tables (N) = N+2, minimum 3 |
| No forms | cover (1) + visit-flow (1) + empty-skeleton (1) = 3 |
| No visits | cover (1) + visit-flow (1) + empty-skeleton (1) = 3 |

**Constraint**: `_add_forms_content()` **MUST NOT** return early without adding at least one skeleton table when `project.forms` is empty. Replace `if not project.forms: return` with `self._build_form_table(doc, [])`.

**Acceptance**: Exporting a project with zero forms produces a valid downloadable `.docx` with exactly 3 tables.

### FR-3: Observability
The `except Exception` block in `export_project_to_word()` **MUST** use `logger.exception("导出失败 project_id=%s", project_id)` instead of `print() + traceback.print_exc()`.

**Acceptance**: Export failure produces a structured log entry with project_id visible in application logs.

### FR-4: Token Ownership Enforcement
`GET /api/export/download/{token}` **MUST** verify that `token_cache[token].owner_id == current_user.id`. Mismatched ownership **MUST** return HTTP 403.

**Acceptance**: Token created by user A cannot be redeemed by user B.

### FR-5: Token TTL
Download token TTL **MUST** be 1800 seconds (30 minutes). The `prepare_export` response **MUST** include `expires_in: 1800`.

**Acceptance**: Token created at T is rejected after T+1800s.

## 4. Property-Based Testing (PBT) Invariants

| ID | Invariant | Falsification Strategy |
|----|-----------|----------------------|
| PBT-1 | `os.path.getsize(output) > 0` for any valid project | Monkey-patch `doc.save` to raise mid-write; assert prepare returns 500 |
| PBT-2 | `Document(output)` parseable without exception | Feed 0-byte file, garbage bytes, truncated zip to `_validate_output`; assert returns `(False, reason)` |
| PBT-3 | `len(doc.tables) >= 3` for any project | Generate projects with 0, 1, N forms; export; count tables |
| PBT-4 | `doc.tables[0]` is cover (2 rows, 3 cols) | Export any valid project; assert `len(tables[0].rows) == 2`, `len(tables[0].columns) == 3` |
| PBT-5 | `doc.tables[1]` is visit-flow; `cell(0,0).text == "访视名称"` | Export any project; assert visit-flow table position |
| PBT-6 | Table cardinality: `count == max(2 + len(forms), 3)` | Random form counts 0..10; assert count |
| PBT-7 | Idempotency: same project → same table count | Export same project twice; assert count equal |
| PBT-8 | Token not redeemable after TTL | Freeze time past TTL; assert 401/404 |
| PBT-9 | Token not redeemable by non-owner | Create token as user A; redeem as user B; assert 403 |

## 5. Non-Functional Requirements

- **NFR-1**: No change to `POST /prepare` or `GET /download/{token}` URL patterns
- **NFR-2**: No change to `ExportService.export_project_to_word()` function signature
- **NFR-3**: All existing passing tests must continue to pass
- **NFR-4**: `_validate_output()` must remain a static method (callable without instantiation)
