# agent_bridge — CRF Editor MCP stdio 适配器

把 CRF Editor 后端的十个受控编辑工具桥接为标准 MCP（Model Context Protocol）stdio 服务器，
供 MCP 客户端（Claude Code、Cursor 等）通过环境变量注入凭据后安全调用。

## 工具清单（封闭白名单）

只读：`crf_list_projects` / `crf_get_project_outline` / `crf_get_form_detail` /
`crf_search_field_definitions` / `crf_get_reference_impact`
写操作：`crf_add_form_field` / `crf_update_form_field_instance` / `crf_reorder_form_fields` /
`crf_preview_shared_definition_change` / `crf_apply_shared_definition_change`

适配器启动时向后端拉取认证清单，若清单与白名单不一致立即拒绝启动（fail closed）。清单中每个工具的
input/output schema 在服务任何工具之前都要通过 Draft 2020-12 元 schema 格式校验（本地元 schema，
无远程引用解析），引用必须本地可解析；存在但畸形的 schema（如 `type` 非字符串）同样拒绝启动，
拒绝信息只报工具名，不回显 schema 内容或库 traceback。

## 配置

只认两个环境变量，缺一即启动失败（错误只提变量名，不回显取值）：

| 变量 | 说明 |
| --- | --- |
| `CRF_AGENT_API_URL` | 后端 API 基址，必须 HTTPS（仅回环地址允许 HTTP）且以 `/api` 结尾；禁止内嵌凭据、查询串与片段 |
| `CRF_AGENT_TOKEN` | 项目属主在「设置 → 当前项目 → Agent 授权」发放的 agent 凭据令牌（`crfag_` 前缀），与浏览器登录令牌互不通用 |

适配器环境（一次性）：在仓库主目录按锁定文件创建独立环境——不要指向临时 worktree 或 `/tmp`
路径（清理后入口即失效），与后端环境分离，不升级依赖：

```bash
cd /path/to/CRF-Editor
uv venv --python 3.12 agent_bridge/.venv
uv pip install --python agent_bridge/.venv/bin/python -r agent_bridge/requirements.lock
```

MCP 客户端接线（以 Claude Code 为例，2.1.319 实测）：在仓库主目录用 local 作用域登记——只对本机
该项目目录生效，写入个人 `~/.claude.json`，不进仓库。`env` 只写 `${VAR}` 变量引用，令牌既不出现在
命令参数里，也不落进配置文件；外层单引号必须保留，防止 shell 提前展开：

```bash
cd /path/to/CRF-Editor
claude mcp add-json crf-editor '{"type":"stdio","command":"/path/to/CRF-Editor/agent_bridge/.venv/bin/python","args":["/path/to/CRF-Editor/agent_bridge/server.py"],"env":{"CRF_AGENT_API_URL":"${CRF_AGENT_API_URL}","CRF_AGENT_TOKEN":"${CRF_AGENT_TOKEN}"}}' -s local
```

- `${VAR}` 取自启动该服务器的 Claude Code 进程环境：先在同一 shell 导出两个变量（建议存放在仅本人
  可读的 0600 文件中再 `source`），再启动 Claude Code；已在运行的会话拿不到之后才导出的变量，需新开会话。
- `claude mcp get crf-editor` 只检查这一个条目，只回显 `${VAR}` 引用、不回显令牌：`✔ Connected`
  表示变量已展开且令牌有效；缺变量或令牌无效时适配器拒绝启动，显示 `✘ Failed to connect`。
- 其他 MCP 客户端：stdio 命令与参数相同，两个变量须注入服务器进程环境；不要把令牌写进会同步或共享的配置文件。

## 安全属性

- 令牌只经主机环境变量传递；stdout 专用于 MCP 协议帧，诊断只写 stderr。
- 出站请求强制 `trust_env=False` / `follow_redirects=False` / 证书校验开启，无自动重试。
- 响应体限长 1 MiB；工具名先过本地白名单再发请求。
- 只有「响应超时」触发至多一次自动固定查询：适配器以
  `POST /api/agent/operations/{request_id}` 携带原始工具名与参数重查，后端按与派发
  相同的身份规则绑定。查询命中 → 返回原结果信封；返回 `IDENTITY_REUSED` → 该
  `request_id` 已绑定不同请求、本次调用未执行，必须换新 `request_id`；无结果 →
  `UNKNOWN_OUTCOME`（携带原 `request_id`）。用同一 `request_id` 重试是安全的：相同
  输入只会重放既有结果，绝不二次写入。共享变更「应用」保持 `change_id` 身份，超时
  未知时用同一 `change_id` 重试该工具。连接失败与 HTTP 5xx（含代理 502/504）→
  `BACKEND_UNAVAILABLE`，不做查询；不确定写操作是否已提交时，用同一 `request_id`
  重试。绝不猜测成败、绝不自动换新身份重做。
- 错误结果一律 `isError=true` + 结构化 `error.code`，不吞失败、不伪造成功。适配器
  自有码：`TOOL_REJECTED` / `BACKEND_UNAVAILABLE` / `UNKNOWN_OUTCOME` / `UNKNOWN_TOOL` /
  `OUTPUT_INVALID`；后端领域码原样透传：`GRANT_DENIED` / `NOT_FOUND` / `VALIDATION` /
  `STALE_STATE` / `IDENTITY_REUSED` / `CONFLICT` / `APPROVAL_REQUIRED` /
  `APPROVAL_REJECTED` / `PROPOSAL_EXPIRED` / `INCOMPATIBLE_DATA` / `LIMIT_EXCEEDED` /
  `RATE_LIMITED` / `INTERNAL`。
- MCP 编辑后已打开的网页工作台不会自动更新（无推送/轮询），需点击顶栏「刷新数据」。

## 测试

```bash
# 全量套件（含 ≥80% 覆盖率门禁；E2E 需要 BACKEND_PY，缺失时测试显式失败而非跳过）
BACKEND_PY=/path/to/backend-python \
  agent_bridge/.venv/bin/python -m pytest agent_bridge/tests --cov=agent_bridge --cov-fail-under=80 -q

# 可选：仅单元/集成（不含 E2E；不声明覆盖率门禁）
agent_bridge/.venv/bin/python -m pytest agent_bridge/tests --ignore=agent_bridge/tests/test_stdio_e2e.py -q
```

E2E 夹具自建一次性临时后端（随机库/上传目录、随机会话密钥、运行时随机生成的临时用户与
凭据），凭据只经 0600 握手文件与环境变量传递，不落日志、不触真实数据库；测试夹具在
teardown 删除握手文件与后端临时根目录。`BACKEND_PY` 指向现有后端解释器（不是 SDK venv）。
