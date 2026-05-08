# admin-user-credentials Specification

## Purpose
TBD - created by archiving change account-password-login-admin-user-management. Update Purpose after archive.
## Requirements
### Requirement: Admin user creation SHALL require an initial password
The admin user-management API SHALL stop creating new users with `hashed_password = NULL`. Administrators MUST provide an initial password when creating a user.

#### Scenario: Admin creates user with initial password
- **GIVEN** an authenticated administrator
- **WHEN** the client POSTs `{ "username": "newuser", "password": "initial-password" }` to `/api/admin/users`
- **THEN** the response status is `201`
- **AND** the new user is persisted with a usable password hash
- **AND** the new user's `is_admin` remains `false`

#### Scenario: Empty or invalid initial password is rejected
- **GIVEN** an authenticated administrator
- **WHEN** the client POSTs a password that violates the password policy to `/api/admin/users`
- **THEN** the response status is `400`
- **AND** the user is not created

#### Scenario: Reserved admin username cannot be manually created
- **GIVEN** an authenticated administrator
- **WHEN** the client POSTs a new user whose normalized username equals the reserved admin username
- **THEN** the response status is `400`
- **AND** no duplicate reserved-admin account is created

### Requirement: Admin user list SHALL expose non-sensitive password state
The admin user list endpoint SHALL expose a machine-readable password state for each user, without returning password hashes or equivalent secrets.

#### Scenario: User list shows whether password is set
- **GIVEN** an authenticated administrator
- **WHEN** the client GETs `/api/admin/users`
- **THEN** each returned user item contains `has_password`
- **AND** `has_password = true` only when the backend considers the stored credential usable for login

#### Scenario: User list never leaks password hash content
- **GIVEN** an authenticated administrator
- **WHEN** the client GETs `/api/admin/users`
- **THEN** no response item contains `hashed_password`
- **AND** no response item contains any derived secret value that can be used as a credential surrogate

### Requirement: Admin password reset SHALL be explicit and invalidate old tokens immediately
The backend SHALL provide a dedicated admin password-reset endpoint that updates the stored hash and invalidates previously issued JWTs for that user immediately.

#### Scenario: Admin resets a legacy user's password
- **GIVEN** an authenticated administrator
- **AND** a user exists with `hashed_password = NULL`
- **WHEN** the client PUTs a valid new password to `/api/admin/users/{user_id}/password`
- **THEN** the response status is `204`
- **AND** the response body is empty
- **AND** the user can subsequently log in via `/api/auth/login`

#### Scenario: Password state reflects only usable hashes
- **GIVEN** an authenticated administrator
- **AND** one user has a recognized password hash
- **AND** another user has `hashed_password = NULL` or an unrecognized/damaged hash
- **WHEN** the client GETs `/api/admin/users`
- **THEN** only the recognized-hash user returns `has_password = true`
- **AND** the other user returns `has_password = false`

#### Scenario: Duplicate trimmed reserved-admin names do not create a second repair target
- **GIVEN** the database contains multiple rows where `TRIM(username)` equals the reserved admin username
- **WHEN** startup repair runs in production
- **THEN** the earliest matching row is selected as the repair target
- **AND** no automatic merge rewrites the other matching rows

#### Scenario: Old tokens are rejected after password reset
- **GIVEN** a user previously logged in and received a token
- **WHEN** an administrator resets that user's password
- **THEN** the old token is rejected on the next protected request with `401`

#### Scenario: Reserved admin password can be repaired without allowing delete or rename
- **GIVEN** an authenticated administrator operating on the reserved admin account
- **WHEN** the client resets the reserved admin password through the dedicated password endpoint
- **THEN** the operation succeeds
- **AND** existing protections against deleting or renaming the reserved admin account remain unchanged

