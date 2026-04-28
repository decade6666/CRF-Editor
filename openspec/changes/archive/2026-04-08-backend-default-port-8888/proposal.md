# Proposal: 后端默认端口改为 8888

## Change ID
`backend-default-port-8888`

## 需求（增强后）

**目标**：将 CRF-Editor 当前仓库级默认后端端口从 `8000` 调整为 `8888`，并确保该默认值在以下链路中保持一致：

- 后端源码开发启动（`backend/main.py`）
- 桌面启动入口的静态端口消费方式（`backend/app_launcher.py`）
- 前端开发代理（`frontend/vite.config.js`）
- 仓库自带默认配置与使用文档（`config.yaml`、`README.md`、`README.en.md`）

**用户确认的范围约束**：

1. **覆盖层级**：按“全链路同步”处理，而不是只改后端代码默认值
2. **打包场景**：保留桌面启动入口的端口消费与 host 语义静态验证，不包含桌面发行物 smoke test
3. **覆盖机制**：保持现状，**不新增** `PORT` 环境变量或 CLI 参数覆盖

**技术边界**：

- 保持现有配置优先级：`config.yaml` 显式值优先于 Pydantic 默认值
- 不改变 host 语义：开发态继续使用 `config.server.host`，打包态继续固定 `127.0.0.1`
- 研究阶段仅产出 proposal，不修改源码、不进入实现

---

## Scope

### In Scope
- 收敛“默认端口改为 8888”的真实生效链路
- 明确开发启动、打包启动、前端开发代理、文档与默认配置之间的依赖关系
- 明确必须同步更新的配置源、入口文件和文档文件
- 给出可验证的成功判据，供下一阶段规划/实现直接采用

### Out of Scope
- 不新增环境变量端口覆盖机制
- 不新增命令行参数端口覆盖机制
- 不扩展设置页 API 以在线修改 `server.port`
- 不调整现有 host 策略（`0.0.0.0` / `127.0.0.1`）
- 不重构配置系统、打包系统或前端请求层

---

## Research Summary for OPSX

### Discovered Constraints

#### Hard Constraints（不可违背）
- `backend/src/config.py` 中 `ServerConfig.port` 当前默认值为 `8000`，但**仅修改这里不会改变当前仓库实际运行端口**。
- 当前仓库根目录 `config.yaml` 已显式配置 `server.port: 8000`，并且它会覆盖 `ServerConfig.port` 的代码默认值。
- 开发启动链路是 `config.yaml -> get_config() -> backend/main.py -> uvicorn.run(..., port=config.server.port)`。
- 打包启动链路是 `config.yaml -> get_config() -> backend/app_launcher.py -> uvicorn.run(..., port=port)`，同时浏览器自动打开地址也依赖同一端口。
- `backend/crf.spec` 会将根目录 `config.yaml` 一并打包到发行物中，因此桌面版默认端口同样受该文件影响。
- 前端源码运行时统一使用相对路径 `/api`（见 `frontend/src/composables/useApi.js` 与各组件调用），**生产/静态托管链路本身没有额外硬编码端口**；端口敏感点主要在 Vite 开发代理。
- `frontend/vite.config.js` 当前将 `/api` 代理目标硬编码为 `http://127.0.0.1:8000`；若后端默认端口改为 `8888` 而此处不变，开发态联调会失效。
- `backend/src/routers/settings.py` 当前只暴露模板路径与 AI 配置，不暴露 `server.host` / `server.port`，因此端口不是现成的后台可配置项。
- 仓库中未发现现成的 `PORT` 环境变量、`argparse`、`click`、`sys.argv` 等端口覆盖链路；若保持用户确认的“保持现状”，则后续规划空间应限定在现有 `config.yaml + Pydantic 默认值 + 入口消费点` 体系内。
- `backend/main.py` 启动时还依赖 `config.yaml` 中存在 `auth.secret_key`；因此任何验证都必须基于完整配置可启动这一前提，而不是只看端口常量是否改变。

#### Soft Constraints（惯例/偏好）
- 项目当前遵循“单一 YAML 根配置文件 + Pydantic 模型默认值”的配置组织方式，后续规划应尽量保持这一结构。
- 文档需中英文同步维护：`README.md` 与 `README.en.md` 当前都把 `8000` 写成默认访问端口与 `/docs` 地址。
- 仓库内还存在 `data/admin/config.yaml` 的 `8000` 示例值；**未发现运行时读取链路**，但若追求仓库内默认样例一致性，可在后续规划中作为附带对齐项考虑。
- 前端开发代理目前是唯一显式耦合后端端口的前端配置点，因此不需要把生产前端请求层当成新的改造面。

### Dependencies

| 模块/文件 | 依赖关系 |
|---|---|
| `config.yaml` | 当前仓库实际默认端口的第一优先级来源 |
| `backend/src/config.py` | 定义 `ServerConfig.port` 默认值、配置文件定位规则和缓存逻辑 |
| `backend/main.py` | 开发启动入口，消费 `config.server.port` |
| `backend/app_launcher.py` | 桌面/打包启动入口，消费 `config.server.port` 并据此打开浏览器 |
| `backend/crf.spec` | 将根目录 `config.yaml` 打入发行物，决定桌面版默认端口是否同步 |
| `frontend/vite.config.js` | 开发态 `/api` 代理目标，当前硬编码 `8000` |
| `frontend/src/composables/useApi.js` | 确认前端运行时使用相对 `/api`，说明生产链路不额外依赖具体端口常量 |
| `README.md` / `README.en.md` | 当前默认访问地址与 API 文档地址均写死 `8000` |

### Risks & Mitigations

| 风险 | 严重度 | 缓解思路 |
|---|---|---|
| 只改 `ServerConfig.port` 默认值，不改根目录 `config.yaml` | High | 后续规划必须把“代码默认值”与“仓库显式配置值”视为同一改动面 |
| 只改后端端口，不改 `frontend/vite.config.js` | High | 将前端开发代理列为必同步依赖，而非文档性附带项 |
| 只改开发启动链路，漏掉 `app_launcher.py` / `crf.spec` | High | 将桌面打包路径作为独立边界纳入后续 planning |
| 文档仍保留 `8000` | Medium | 把 `README.md`、`README.en.md` 作为同批次交付范围 |
| 误把生产前端请求层当作硬编码端口来源，导致过度改造 | Low | 以后续实现仅聚焦 Vite 代理，不扩散到 `useApi.js` 的相对 URL 机制 |
| 现有测试主要走进程内调用，真实监听端口回归不足 | Medium | 成功判据中增加“真实启动地址/代理地址”级别的可观察验证 |
| 把未被代码读取的 `data/admin/config.yaml` 误判为运行时强依赖 | Low | 在后续阶段区分“运行时必改项”与“样例一致性项” |

### Success Criteria

1. 在**无额外覆盖机制**前提下，`python backend/main.py` 的默认监听端口应为 `8888`。
2. 保持桌面启动入口继续从 `config.server.port` 取值，并维持 `127.0.0.1` host 语义。
3. 前端开发模式 `npm run dev` 通过 Vite 代理访问后端时，应默认指向 `8888`。
4. `README.md` 与 `README.en.md` 中的默认访问地址、配置示例与 API 文档地址应与 `8888` 对齐。
5. 保持现有配置优先级，不引入 `PORT` 环境变量或 CLI 端口参数。
6. 保持现有 host 语义不变：开发态仍走 `config.server.host`，打包态仍固定 `127.0.0.1`。
7. 若仓库继续自带根目录 `config.yaml` 作为默认配置，则其 `server.port` 需与代码默认值一致；否则“默认端口已改”将只停留在表面。

---

## User Confirmations

| 问题 | 用户决策 |
|---|---|
| “默认端口改为 8888”覆盖到哪一层 | **全链路同步** |
| 是否纳入桌面打包版启动路径 | **包含打包版** |
| 是否顺带支持新的端口覆盖机制 | **保持现状，不新增 env / CLI** |

---

## Affected Areas

- 后端配置默认值：`backend/src/config.py`
- 仓库根默认配置：`config.yaml`
- 开发启动入口：`backend/main.py`
- 桌面启动入口：`backend/app_launcher.py`
- 前端开发代理：`frontend/vite.config.js`
- 使用文档：`README.md`, `README.en.md`
- 可选一致性项（非已证实运行时依赖）：`data/admin/config.yaml`

---

## Research Outcome

本次 research 阶段已把“后端默认端口从 `8000` 改到 `8888`”的实现空间收敛为一组明确约束：

- **不要** 只改代码默认值而忽略根目录 `config.yaml`
- **不要** 只改后端而忽略 Vite 开发代理
- **不要** 漏掉桌面打包链路与 `crf.spec` 对 `config.yaml` 的打包依赖
- **不要** 借此扩展新的 env / CLI 覆盖机制
- **必须** 把开发启动、打包启动、前端开发代理与文档视为同一条默认端口链路

后续 `/ccg:spec-plan` 应在以上约束下输出执行顺序与文件级计划，而不是重新讨论端口机制本身。
