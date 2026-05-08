## ADDED Requirements

### Requirement: The settings dialog SHALL expose a self-service password-change entry for ordinary users only
The frontend settings dialog SHALL expose a `修改密码` entry only for authenticated non-admin users.

#### Scenario: Ordinary user sees the password-change entry beside the username
- **GIVEN** an authenticated non-admin user opens the settings dialog
- **WHEN** the dialog renders the `当前用户` row
- **THEN** the current username is displayed
- **AND** a `修改密码` button is displayed on the right side of that same row

#### Scenario: Admin does not see the password-change entry
- **GIVEN** an authenticated admin user opens the settings dialog
- **WHEN** the dialog renders
- **THEN** no `修改密码` button is shown

### Requirement: The self-service password-change action SHALL open a dedicated child dialog within settings
The `修改密码` action SHALL open a dedicated child dialog and SHALL NOT navigate to a separate account-security page.

#### Scenario: Clicking the entry opens a child dialog
- **GIVEN** an authenticated non-admin user sees the `修改密码` button in settings
- **WHEN** the user clicks the button
- **THEN** a child dialog opens from within the settings flow
- **AND** no route navigation occurs

### Requirement: The password-change child dialog SHALL collect the required fields
The child dialog SHALL collect `当前密码`, `新密码`, and `确认新密码`.

#### Scenario: Child dialog renders all password fields
- **GIVEN** the password-change child dialog is open
- **THEN** the dialog contains an input for `当前密码`
- **AND** the dialog contains an input for `新密码`
- **AND** the dialog contains an input for `确认新密码`

### Requirement: The frontend SHALL prevent mismatched confirmation from being submitted
The frontend SHALL block submission when `新密码` and `确认新密码` are not equal.

#### Scenario: Confirmation mismatch blocks submission
- **GIVEN** the password-change child dialog is open
- **AND** the user entered different values for `新密码` and `确认新密码`
- **WHEN** the user attempts to submit
- **THEN** no request is sent to the backend
- **AND** the user receives a clear validation message

### Requirement: Successful self-service password change SHALL show success then immediately return the user to the login state
After a successful self-service password change, the frontend SHALL show a success message, clear the local authenticated session, close the settings flow, and require re-login.

#### Scenario: Success message precedes forced logout
- **GIVEN** an authenticated non-admin user submits a valid password-change request
- **WHEN** the backend responds with `204`
- **THEN** the frontend shows a success message first
- **AND** then clears the stored token
- **AND** then closes the settings dialog and password-change child dialog
- **AND** then returns the user to the login state

### Requirement: Business validation failures SHALL remain in the settings flow
Business validation failures during self-service password change SHALL not be treated as global auth-expiry events.

#### Scenario: Wrong current password stays in the dialog flow
- **GIVEN** an authenticated non-admin user submits a wrong current password
- **WHEN** the backend responds with the defined business error
- **THEN** the settings dialog remains open
- **AND** the local token is not cleared solely because of that business error
- **AND** the user sees the backend-provided error message

#### Scenario: Policy violation stays in the dialog flow
- **GIVEN** an authenticated non-admin user submits a new password that violates the password policy
- **WHEN** the backend responds with the defined business error
- **THEN** the settings dialog remains open
- **AND** the user sees the backend-provided error message

### Requirement: Auth-expiry behavior SHALL still use the existing global session-expiry handling
If the self-service password-change request fails because authentication is no longer valid, the frontend SHALL continue to use the existing global auth-expiry handling.

#### Scenario: Expired token triggers existing auth-expiry flow
- **GIVEN** an authenticated user opens the password-change child dialog with an expired or otherwise invalid token
- **WHEN** the request is submitted and the backend returns `401`
- **THEN** the existing global auth-expiry handling clears the local token
- **AND** the user is returned to the login state
