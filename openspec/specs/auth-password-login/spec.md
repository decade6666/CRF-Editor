# auth-password-login Specification

## Purpose
TBD - created by archiving change account-password-login-admin-user-management. Update Purpose after archive.
## Requirements
### Requirement: Authentication SHALL use account + password login via `/api/auth/login`
The backend SHALL replace the no-password `/api/auth/enter` login contract with a canonical password-based endpoint at `POST /api/auth/login`, using the existing `user.username` as the account identifier.

#### Scenario: Successful login returns bearer token
- **GIVEN** a user exists with a valid password hash
- **WHEN** the client POSTs `{ "username": "alice", "password": "correct-password" }` to `/api/auth/login`
- **THEN** the response status is `200`
- **AND** the response body contains `access_token`
- **AND** the response body contains `token_type = "bearer"`

#### Scenario: Login never auto-creates users
- **WHEN** the client POSTs credentials for a username that does not exist
- **THEN** the response status is `401`
- **AND** no new `user` row is inserted
- **AND** no token is returned

#### Scenario: Wrong password is rejected
- **GIVEN** a user exists with a valid password hash
- **WHEN** the client POSTs the correct username and a wrong password to `/api/auth/login`
- **THEN** the response status is `401`
- **AND** no token is returned

#### Scenario: Legacy user without password is rejected in production without leaking migration details
- **GIVEN** `CRF_ENV=production`
- **AND** a user exists with `hashed_password = NULL`
- **WHEN** the client POSTs credentials for that username to `/api/auth/login`
- **THEN** the response status is `401`
- **AND** the response does not reveal that the account lacks a password
- **AND** no token is returned

#### Scenario: Legacy user without password shows migration hint in development
- **GIVEN** `CRF_ENV != production`
- **AND** a user exists with `hashed_password = NULL`
- **WHEN** the client POSTs credentials for that username to `/api/auth/login`
- **THEN** the response status is `401`
- **AND** the response includes an explicit migration hint instructing the user to contact an administrator
- **AND** no token is returned

#### Scenario: Production login rate limit remains stable after password migration
- **GIVEN** `CRF_ENV=production`
- **WHEN** the same normalized username and IP exceed the configured auth limit window on `/api/auth/login`
- **THEN** the response status is `429`
- **AND** the response contains `Retry-After`
- **AND** the response detail remains the existing throttling contract

#### Scenario: Username normalization is trim-only and case-sensitive
- **GIVEN** a user exists whose stored `username` is `Alice`
- **WHEN** the client POSTs `{ "username": " Alice ", "password": "correct-password" }` to `/api/auth/login`
- **THEN** the login uses the trimmed username `Alice`
- **AND** authentication may succeed
- **BUT WHEN** the client POSTs `{ "username": "alice", "password": "correct-password" }`
- **THEN** the response status is `401`
- **AND** no token is returned

#### Scenario: Password input is preserved exactly
- **GIVEN** a user password was originally set with leading or trailing spaces preserved
- **WHEN** the client submits the exact same password bytes to `/api/auth/login`
- **THEN** authentication succeeds
- **BUT WHEN** the client submits only the trimmed variant
- **THEN** the response status is `401`

### Requirement: JWTs SHALL become immediately invalid after password-changing events
The authentication system SHALL include a server-verified version marker in issued JWTs so that password setup, password reset, and reserved-admin bootstrap repair immediately invalidate all previously issued tokens for that user.

#### Scenario: Old JWT is rejected after admin password reset
- **GIVEN** a user successfully logged in and received JWT `T1`
- **WHEN** an administrator resets that user's password
- **THEN** any subsequent protected request using `T1` returns `401`

#### Scenario: Old JWT is rejected after user password bootstrap repair
- **GIVEN** the reserved admin account had no usable password and an old JWT was issued before migration
- **WHEN** bootstrap repair sets a usable password and updates the auth version
- **THEN** the old JWT is rejected on the next protected request

#### Scenario: Legacy JWT without the new version claim is rejected after rollout
- **GIVEN** a JWT was issued before the versioned-token migration and does not contain the new invalidation claim
- **WHEN** it is presented to any protected endpoint after rollout
- **THEN** the response is `401`

### Requirement: `/api/auth/me` SHALL preserve identity semantics used by the shell split
The authenticated identity endpoint SHALL continue to return `username` and `is_admin` so the frontend can split admin and non-admin workspaces after login.

#### Scenario: Current user payload remains stable
- **WHEN** an authenticated client GETs `/api/auth/me`
- **THEN** the response status is `200`
- **AND** the response body contains `username`
- **AND** the response body contains `is_admin`
- **AND** the response does not depend on project ownership mutations

