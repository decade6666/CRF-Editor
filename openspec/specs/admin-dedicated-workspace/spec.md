# admin-dedicated-workspace Specification

## Purpose
TBD - created by archiving change account-password-login-admin-user-management. Update Purpose after archive.
## Requirements
### Requirement: Admin login SHALL land on a dedicated management workspace
After successful login, the frontend shell SHALL fetch `/api/auth/me` and route administrators into a dedicated admin workspace that uses the existing `AdminView` capability set, without showing the normal CRF editing workspace.

#### Scenario: Admin lands in AdminView by default
- **GIVEN** an administrator successfully logs in
- **WHEN** the frontend resolves `/api/auth/me`
- **THEN** the shell mounts the admin workspace
- **AND** the shell displays the existing user-management, batch project operation, and recycle-bin capabilities
- **AND** the shell does not display the normal project list or CRF designer tabs

#### Scenario: Non-admin user keeps the normal workspace
- **GIVEN** a non-admin user successfully logs in
- **WHEN** the frontend resolves `/api/auth/me`
- **THEN** the shell mounts the existing normal CRF workspace
- **AND** the dedicated admin workspace is not shown

#### Scenario: Admin split occurs before normal workspace data is shown
- **GIVEN** an administrator successfully logs in
- **WHEN** the shell is deciding which workspace to render
- **THEN** the admin identity check completes before normal project workspace content is rendered
- **AND** the admin user does not briefly see non-admin project UI during this transition

### Requirement: Admin workspace SHALL expose password migration controls
The dedicated admin workspace SHALL expose both password state and password-management actions so legacy users without passwords can be migrated without leaving the admin shell.

#### Scenario: Admin workspace shows password state column
- **GIVEN** an authenticated administrator is viewing the user list
- **WHEN** the user table is rendered
- **THEN** each row shows whether the user currently has a usable password

#### Scenario: Admin workspace allows password reset from the user table
- **GIVEN** an authenticated administrator is viewing a user row
- **WHEN** the administrator chooses the password reset action and submits a valid password
- **THEN** the frontend calls the dedicated admin password endpoint
- **AND** the updated password state is reflected after refresh

### Requirement: Documentation and tests SHALL align with the password-login admin split
The repository documentation and shell-structure tests SHALL be updated so they no longer describe or assert the legacy no-password enter flow.

#### Scenario: Frontend shell tests no longer assert no-password login
- **WHEN** the frontend test suite inspects the login and admin shell structure
- **THEN** tests assert an account+password login form and an admin-first shell split
- **AND** tests do not rely on the old `/api/auth/enter` no-password contract

#### Scenario: Project documentation reflects bootstrap password and migration path
- **WHEN** the repository documentation is read after this change
- **THEN** it describes the admin bootstrap password requirement in production
- **AND** it documents that legacy users without passwords must be migrated through admin password management

