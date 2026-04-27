# auth-self-password-change Specification

## Purpose
TBD - created by archiving change add-self-password-reset-in-settings. Update Purpose after archive.
## Requirements
### Requirement: Ordinary authenticated users SHALL be able to change their own password via the auth domain
The system SHALL provide a dedicated self-service password-change endpoint at `PUT /api/auth/me/password` for authenticated non-admin users.

#### Scenario: Ordinary user changes own password successfully
- **GIVEN** an authenticated non-admin user
- **AND** the user provides the correct `current_password`
- **AND** the provided `new_password` satisfies the existing password policy
- **WHEN** the client PUTs the request to `/api/auth/me/password`
- **THEN** the response status is `204`
- **AND** the response body is empty
- **AND** the stored password hash is updated to the new password
- **AND** the user's `auth_version` is incremented by exactly 1

#### Scenario: Old password no longer works after successful change
- **GIVEN** an authenticated non-admin user successfully changed their password
- **WHEN** the client POSTs the old password to `/api/auth/login`
- **THEN** the response status is `401`
- **AND** no token is returned

#### Scenario: New password works after successful change
- **GIVEN** an authenticated non-admin user successfully changed their password
- **WHEN** the client POSTs the new password to `/api/auth/login`
- **THEN** the response status is `200`
- **AND** the response contains a bearer token

### Requirement: Self-service password change SHALL be bound to the authenticated user identity
The self-service password-change endpoint SHALL derive the target user exclusively from the validated bearer token and SHALL NOT accept a user identifier from the client.

#### Scenario: Request body does not target another user
- **GIVEN** an authenticated non-admin user
- **WHEN** the client calls `PUT /api/auth/me/password`
- **THEN** the target user is the authenticated user from the bearer token
- **AND** the endpoint does not require `user_id` or `username` in the request body

#### Scenario: Admin user cannot use the ordinary-user self-service endpoint
- **GIVEN** an authenticated admin user
- **WHEN** the client calls `PUT /api/auth/me/password` with otherwise valid credentials
- **THEN** the response status is `403`
- **AND** the stored password hash is unchanged
- **AND** the user's `auth_version` is unchanged

### Requirement: Current-password verification SHALL gate all self-service password changes
The backend SHALL verify the current password before applying any self-service password change.

#### Scenario: Wrong current password is rejected without session expiry
- **GIVEN** an authenticated non-admin user
- **AND** the provided `current_password` does not verify against the stored credential
- **WHEN** the client calls `PUT /api/auth/me/password`
- **THEN** the response status is `400`
- **AND** the stored password hash is unchanged
- **AND** the user's `auth_version` is unchanged
- **AND** the previously valid bearer token remains usable until a later successful password change

#### Scenario: Unusable stored credential cannot bypass current-password verification
- **GIVEN** an authenticated non-admin user whose stored password hash is unusable
- **WHEN** the client calls `PUT /api/auth/me/password`
- **THEN** the response status is `400`
- **AND** the stored password hash is unchanged
- **AND** the user's `auth_version` is unchanged

### Requirement: New-password validation SHALL reuse the existing password policy
The backend SHALL reuse the existing password-policy validation when applying a self-service password change.

#### Scenario: Password policy violation is rejected
- **GIVEN** an authenticated non-admin user
- **AND** the provided `new_password` violates the existing password policy
- **WHEN** the client calls `PUT /api/auth/me/password`
- **THEN** the response status is `400`
- **AND** the stored password hash is unchanged
- **AND** the user's `auth_version` is unchanged

#### Scenario: New password equal to current password is rejected
- **GIVEN** an authenticated non-admin user
- **AND** the provided `new_password` equals the provided correct `current_password`
- **WHEN** the client calls `PUT /api/auth/me/password`
- **THEN** the response status is `400`
- **AND** the stored password hash is unchanged
- **AND** the user's `auth_version` is unchanged

### Requirement: Self-service password change SHALL invalidate all previously issued JWTs for that user
A successful self-service password change SHALL increment `auth_version` so that all previously issued JWTs for that user are rejected on subsequent protected requests.

#### Scenario: Old JWT is rejected after successful self-service password change
- **GIVEN** an authenticated non-admin user received a valid JWT before changing their password
- **WHEN** the user successfully changes their password
- **AND** the old JWT is used on the next protected request
- **THEN** the response status is `401`

#### Scenario: Newly issued JWT reflects the incremented auth version
- **GIVEN** an authenticated non-admin user successfully changed their password
- **WHEN** the user logs in again with the new password
- **THEN** the issued JWT contains the current incremented version value

### Requirement: Password input SHALL be preserved exactly
The self-service password-change flow SHALL preserve password input exactly and SHALL NOT trim, case-fold, or normalize password strings.

#### Scenario: Password with surrounding whitespace is stored and verified exactly
- **GIVEN** an authenticated non-admin user changes their password to a value containing surrounding whitespace
- **WHEN** the client later logs in with the exact same password bytes
- **THEN** authentication succeeds
- **BUT WHEN** the client submits only a trimmed variant
- **THEN** authentication fails

### Requirement: Production self-service password change SHALL reuse the login throttling contract
In production, the self-service password-change endpoint SHALL reuse the existing authentication throttling contract, including `429` and `Retry-After` behavior.

#### Scenario: Repeated failures hit the reused auth throttle in production
- **GIVEN** `CRF_ENV=production`
- **AND** an authenticated non-admin user repeatedly submits failing self-service password-change requests within the active window
- **WHEN** the throttling threshold is exceeded
- **THEN** the response status is `429`
- **AND** the response contains `Retry-After`

#### Scenario: Non-production self-service password change does not enforce the production throttle
- **GIVEN** `CRF_ENV != production`
- **WHEN** the same failing self-service password-change sequence is executed
- **THEN** the request is not rejected solely by the production throttle

