## ADDED Requirements

### Requirement: Login and high-cost import endpoints SHALL be rate-limited in production
The backend SHALL enforce in-memory rate limiting in `production` for the login endpoint and the high-cost import endpoints. `development` and `test` SHALL leave this limiter disabled.

The required protected endpoints are:
- `POST /api/auth/enter` → 5 requests / 60 seconds / key = normalized username + client IP
- `POST /api/projects/import/project-db` → 3 requests / 60 seconds / key = authenticated user ID, falling back to client IP
- `POST /api/projects/import/database-merge` → 3 requests / 60 seconds / same key rule
- `POST /api/projects/import/auto` → 3 requests / 60 seconds / same key rule
- `POST /api/projects/{project_id}/import-docx/preview` → 3 requests / 60 seconds / same key rule
- `POST /api/projects/{project_id}/import-docx/execute` → 3 requests / 60 seconds / same key rule

#### Scenario: Production login bursts hit 429
- **WHEN** a client exceeds 5 login attempts within 60 seconds for the same normalized username + IP in production
- **THEN** the backend returns 429
- **AND** the response body uses JSON `detail`
- **AND** the response includes `Retry-After`

#### Scenario: Production import bursts hit 429
- **WHEN** an authenticated user exceeds the configured import threshold for one protected import endpoint in production
- **THEN** the backend returns 429 for further requests inside the active window
- **AND** the limit key prefers `current_user.id` over IP

#### Scenario: Development and test stay unthrottled
- **WHEN** the same request bursts occur in `development` or `test`
- **THEN** the limiter does not block those requests solely due to rate-limit counting

### Requirement: Rate limiting SHALL not trust arbitrary proxy headers by default
Unless a trusted-proxy feature is added later, rate-limit keys SHALL use the direct client host and MUST NOT trust arbitrary `X-Forwarded-For` or similar proxy headers.

#### Scenario: Forged forwarding header does not change limiter key
- **WHEN** a client submits a request with a spoofed `X-Forwarded-For`
- **THEN** the limiter key remains based on the direct request client information under current configuration

### Requirement: 429 responses SHALL integrate with existing frontend error UX
Frontend consumers SHALL continue to display backend-provided Chinese `detail` messages for 429 responses without breaking the current login and import flows.

#### Scenario: Login screen shows rate-limit detail
- **WHEN** `POST /api/auth/enter` receives 429
- **THEN** `LoginView.vue` displays the returned `detail`
- **AND** the page remains usable after the cooldown

#### Scenario: Shared API client preserves 429 detail
- **WHEN** a protected import request receives 429
- **THEN** `frontend/src/composables/useApi.js` throws an error containing the backend `detail`
- **AND** the caller can present that message instead of a generic network failure

### Requirement: Rate limiting SHALL be testable and resettable
The limiter implementation SHALL provide a deterministic way for tests to reset stored counters and to verify both trigger and recovery behavior around the active window.

#### Scenario: Window expiry restores access
- **WHEN** a client exceeds a rate limit and then the configured time window elapses
- **THEN** a subsequent request for the same key is accepted again

#### Scenario: Test isolation prevents cross-test pollution
- **WHEN** the test suite resets limiter state between cases
- **THEN** one test's counters do not cause another test to spuriously receive 429
