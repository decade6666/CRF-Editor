## ADDED Requirements

### Requirement: Production configuration SHALL require environment-provided auth secret
The runtime configuration layer SHALL support explicit `CRF_*` environment variable overrides for security-sensitive settings. In `CRF_ENV=production`, the application MUST require `CRF_AUTH_SECRET_KEY` and MUST NOT fall back to `config.yaml` for the auth secret.

#### Scenario: Missing production env secret blocks startup
- **WHEN** `CRF_ENV=production` and `CRF_AUTH_SECRET_KEY` is unset or empty
- **THEN** application startup fails before serving requests
- **AND** the failure message clearly indicates the missing production secret requirement

#### Scenario: Development can still rely on YAML defaults
- **WHEN** `CRF_ENV` is unset, `development`, or `test`
- **THEN** the runtime may continue using YAML or fixture-provided auth secret values
- **AND** local development startup remains possible without production-only env requirements

#### Scenario: Env overlay is runtime-only
- **WHEN** runtime configuration is influenced by `CRF_*` environment variables
- **THEN** `get_config()` returns the overlaid values
- **AND** `update_config()` does not write env-only secret values back into `config.yaml`

### Requirement: JWT lifetime SHALL default to 60 minutes or less
The effective access-token expiration used by the backend SHALL default to at most 60 minutes, whether loaded from YAML or overridden by environment variables.

#### Scenario: New token expiry is capped
- **WHEN** the backend issues a JWT after this change
- **THEN** the token `exp` is no more than 60 minutes after issuance by default
- **AND** frontend clients continue using the same bearer-token flow

#### Scenario: Expired token still drives logout UX
- **WHEN** an expired token is used by the frontend and the backend returns 401
- **THEN** the frontend clears `localStorage.crf_token`
- **AND** it emits the existing `crf:auth-expired` event and returns to the login state

### Requirement: Production docs endpoints SHALL be disabled at application construction time
When `CRF_ENV=production`, the FastAPI application SHALL expose no Swagger UI, ReDoc, or OpenAPI JSON endpoint.

#### Scenario: Docs routes return 404 in production
- **WHEN** a client requests `/docs`, `/redoc`, or `/openapi.json` while `CRF_ENV=production`
- **THEN** each endpoint returns 404

#### Scenario: Docs remain available outside production
- **WHEN** the application runs outside production
- **THEN** the existing documentation endpoints remain available unless explicitly disabled by other configuration

### Requirement: Security headers SHALL be added to regular and error responses
The application SHALL attach baseline security headers to normal API responses, static file responses, and handled error responses.

#### Scenario: Security headers are present on successful responses
- **WHEN** a client receives a normal API or static-file response
- **THEN** the response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a Content-Security-Policy header

#### Scenario: Security headers are present on handled errors
- **WHEN** the application returns a handled 4xx/5xx JSON response or 429 response
- **THEN** the same baseline security headers are still present

### Requirement: Production security configuration SHALL be regression-tested
Backend tests SHALL verify env override precedence, startup failure when production secret is missing, docs-route shutdown in production, and security-header presence on success and error responses.

#### Scenario: YAML secret is ignored in production without env secret
- **WHEN** tests provide a YAML auth secret but omit `CRF_AUTH_SECRET_KEY` while setting `CRF_ENV=production`
- **THEN** startup still fails
- **AND** this proves production does not silently reuse repository-stored secrets
