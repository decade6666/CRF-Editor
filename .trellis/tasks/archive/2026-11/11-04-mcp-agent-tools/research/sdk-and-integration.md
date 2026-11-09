# SDK and Integration Evidence

Planning evidence only; no dependencies were installed and no application/tests were run during this research.

## Official MCP Python SDK

Selected API reference for the proposal: **official `mcp` distribution 1.30.0**, not the separately named FastMCP distribution and not SDK v2/main. Its documented v1 stdio lifecycle is intentional; do not force the 2026-07-28 HTTP-era protocol onto it or claim every agent client is certified.

Sources retrieved through Context7 `/modelcontextprotocol/python-sdk/v1.30.0`:
- https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/docs/low-level-server.md
- https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/docs/client.md
- https://github.com/modelcontextprotocol/python-sdk/blob/v1.30.0/docs/server.md

The official tag's dependency declarations were fetched separately:
- https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/v1.30.0/pyproject.toml
- The file uses dynamic versioning rather than a literal version field. Relevant declarations returned: Python >=3.10, anyio>=4.5, httpx>=0.27.1,<1, Pydantic >=2.11,<3 on Python below 3.14, and pydantic-settings>=2.5.2. Distribution installation and the concrete resolved dependency set remain an explicit pre-dispatch gate; these declarations are not a compatibility test.

### Documented low-level stdio APIs

```python
import mcp.server.stdio
import mcp.types as types
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.models import InitializationOptions

server = Server("crf-editor")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    # Return the authenticated backend's fixed allowlisted manifest.
    ...

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> types.CallToolResult:
    # Validate the named tool and JSON schema; no arbitrary URL/method tool.
    ...

async def run() -> None:
    async with mcp.server.stdio.stdio_server() as (read, write):
        await server.run(read, write, InitializationOptions(
            server_name="crf-editor",
            server_version="1.0.0",  # adapter contract, not a product release bump
            capabilities=server.get_capabilities(
                notification_options=NotificationOptions(),
                experimental_capabilities={},
            ),
        ))
```

This is an API-shape reference, not deliverable code. `CallToolResult` supports `content`, `structuredContent`, and `isError`; constructing it directly requires constructing and validating the complete result. Emit JSON text as well as structured content for older-client readability. Send logging only to stderr, never stdout.

Client-side reference: `from mcp import ClientSession, StdioServerParameters`; `from mcp.client.stdio import stdio_client`; open the stdio transport, open `ClientSession`, `await session.initialize()`, then `list_tools()` / `call_tool()`. Test this real process boundary rather than mocking MCP itself.

The proposal uses a backend-generated manifest (`Tool` input/output schemas generated from the actual Pydantic DTOs) plus a fixed adapter route map, avoiding two independently maintained copies of the tool contracts. Permit only the ten selected names, local JSON-schema references, and fixed same-origin routes. The manifest must not contain project text as executable descriptions or arbitrary downstream URLs.

## Existing Backend Boundaries

- `backend/src/database.py:905`: registered new tables are created by `Base.metadata.create_all`; new tables do not require altering existing columns. Confirmed by `.trellis/spec/backend/database-guidelines.md:220`.
- `backend/src/database.py:958`: existing request writes use `Session.begin()`. `get_engine` at line 56 uses Python sqlite/pysqlite and WAL, without an explicit begin event. The new agent transaction boundary must establish a real SQLite transaction before authoritative reads; do not infer a physical SQLite snapshot from SQLAlchemy's logical transaction alone.
- `backend/src/services/field_profile_service.py:90`: definition creation/shared update/link validation already exists, including unchanged-OID semantics and no silent collision rebinding.
- `backend/src/services/field_profile_service.py:282`: instance updates normalize default/inline values and validate the caller's form. A shared definition can affect other forms, so the new agent shared command must additionally capture and validate every affected form's final state.
- `backend/src/services/field_normalization.py`: reuse the existing public inline/default normalization functions; do not create a second renderer.
- `backend/src/routers/fields.py:134`: the legacy field-library update path is not a generic service API. Do not call router functions as if their Depends/transaction boundary runs automatically.
- `backend/src/services/database_export_service.py:70`: full exports are SQLite backups. Project/user exports call that helper before pruning (`:103`, `:130`). Explicitly remove new credential/approval/audit tables from exported copies and vacuum those copies; never alter the live source. New private tables must not become portable credentials/approvals through database export/import/copy.
- `backend/src/services/project_import_service.py:187`: source schema validation is based on explicit required core tables/columns. Keep agent access state out of that import contract. Test that legacy files without agent tables import and supplied agent tables are ignored.
- `backend/tests/conftest.py:15`: existing pytest redirects DB/uploads/config/temp resources before importing the app, disables background cleanup, and generates session-only authentication state. Preserve this isolation. Do not seed a real database or read config.yaml for tests.

## Frontend and Authoring Contracts

- `frontend/src/components/ProjectInfoTab.vue:11`: receives the selected project object. Add only a narrow launch button and lazy child dialog; do not reorganize the existing metadata/logo editor.
- `frontend/src/composables/useApi.js` remains the only request wrapper for the new UI. Preserve subpath deployment and existing session-scoped 401 handling.
- `.trellis/spec/frontend/component-guidelines.md:125`: a lazy-open child must consume an already-true modelValue immediately; invalidate late responses on close, project change, and unmount.
- `frontend/src/composables/clipboardCopy.js:43`: use `copyTextToClipboard`; no new direct clipboard API access.
- `frontend/src/components/FieldsTab.vue:36`: the regular controls are 文本, 数值, 日期, 日期时间, 时间, 单选, 多选, 单选（纵向）, 多选（纵向）, 复选. Structural 标签/log rows remain read/order-compatible but are not created or edited by the first increment's ordinary-field commands.
- `FieldsTab.vue:338`: integer digits 1..20 and decimal digits 0..15. Preserve unset/legacy values on unrelated patches; validate newly supplied authoring values.
- `frontend/src/composables/dateFormatOptions.js` is the canonical UI date-format option list. New agent-side authoring validation must be contract-tested against it; do not rewrite legacy values on omitted/echo updates.
- `frontend/src/composables/oidValidation.js`: Saimeisi new authored field OIDs must obey the 8-character authoring limit; binding an existing definition does not rename it or reject its untouched historical OID. Form OID editing is outside this increment.
- `backend/src/services/field_type_policy.py`: reuse project-specific multiselect policy. The codelist-free checkbox remains distinct from choice fields.

## Coverage Tooling

The current frontend package pins Vitest 5.0.3 but does not declare a coverage provider. The proposal requests user approval for only `@vitest/coverage-v8@5.0.3` as an additional development dependency; no script/build/runner configuration change.

Verified documentation via Context7 `/vitest-dev/vitest/v5.0.3`:
- https://github.com/vitest-dev/vitest/blob/v5.0.3/docs/guide/coverage.md
- https://github.com/vitest-dev/vitest/blob/v5.0.3/docs/config/coverage.md

Documented flags include `--coverage.provider=v8`, repeatable `--coverage.include=<glob>`, and coverage thresholds. Use a glob that matches the new Vue SFC, not a bare directory-like literal. Install the matching provider explicitly in the isolated task checkout; never accept an automatic download prompt in the worker. Existing scripts and `frontend/vitest.config.js` stay unchanged.
