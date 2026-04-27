## ADDED Requirements

### Requirement: Administrative authorization SHALL be driven by `user.is_admin`
The backend SHALL add an explicit `is_admin` flag to the `user` table and SHALL use that flag, rather than username equality, for all administrator-only authorization checks and `/api/auth/me` responses.

#### Scenario: Admin guard only trusts `is_admin`
- **WHEN** a non-admin user has the same username as the configured admin name is impossible or attempted indirectly
- **THEN** `require_admin()` still denies access unless `user.is_admin` is true
- **AND** `/api/auth/me` returns `{"username": <name>, "is_admin": false}` for that user

#### Scenario: Existing admin account is healed during migration
- **WHEN** the database already contains a user whose username exactly matches `config.admin.username.strip()`
- **THEN** startup migration upgrades that user to `is_admin = true`
- **AND** the upgrade is idempotent across repeated startups

#### Scenario: `/api/auth/me` contract remains stable
- **WHEN** an authenticated user calls `/api/auth/me`
- **THEN** the response still includes `username` and `is_admin`
- **AND** frontend consumers do not need a breaking contract change

### Requirement: Reserved admin username SHALL no longer be auto-claimable through login or admin management
The reserved administrator username SHALL be protected by exact, case-sensitive matching after trimming leading/trailing whitespace. `POST /api/auth/enter` MUST NOT auto-create a normal user for that reserved username, and admin user-management operations MUST reject creating, renaming, or deleting the reserved admin account.

#### Scenario: Reserved username cannot be auto-created by login
- **WHEN** `POST /api/auth/enter` is called with the reserved admin username and no such user exists yet
- **THEN** the backend MUST NOT create a normal user record from that login request
- **AND** the request follows the startup-bootstrap rule instead of regular self-registration behavior

#### Scenario: Reserved admin cannot be renamed or deleted
- **WHEN** an administrator attempts to rename or delete the account whose username exactly equals the reserved admin username
- **THEN** the backend rejects the operation with a 400/403-style JSON error
- **AND** the system retains at least that protected administrator account

#### Scenario: Other users cannot be renamed to the reserved username
- **WHEN** a user-management request attempts to rename a different user to the reserved admin username
- **THEN** the backend rejects the request
- **AND** no duplicate or conflicting reserved-name account is created

### Requirement: Production empty-database bootstrap SHALL auto-create the reserved admin account
If `CRF_ENV=production` and the database contains no users at startup, the system SHALL auto-create the reserved admin username account with `is_admin = true`.

#### Scenario: Empty production database creates initial admin
- **WHEN** the application starts in production with an empty `user` table
- **THEN** startup creates one user whose username equals the reserved admin username and whose `is_admin` is true
- **AND** subsequent restarts do not create duplicates

#### Scenario: Non-empty database does not create extra bootstrap admins
- **WHEN** the application starts in production and at least one user already exists
- **THEN** startup does not create an additional bootstrap admin user
- **AND** only the migration/self-heal rules apply

### Requirement: Admin migration SHALL be covered by compatibility tests
Backend tests SHALL verify old-database migration, self-healing of an existing reserved-name account, empty-production bootstrap creation, and rejection of reserved-name create/rename/delete flows.

#### Scenario: Old database upgrades in place
- **WHEN** tests initialize a pre-migration user table without `is_admin`
- **THEN** startup migration adds the column with `NOT NULL DEFAULT 0`
- **AND** existing data remains readable
- **AND** the healed reserved admin account can access admin endpoints
