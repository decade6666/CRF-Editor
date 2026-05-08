# Spec: backend-default-port-8888

## ADDED Requirements

### Requirement: 仓库级默认后端端口统一为 8888
系统 SHALL 将当前仓库的默认后端端口统一为 `8888`，并同时更新代码层 fallback 与仓库根默认配置；同时 MUST 保持现有配置优先级不变：显式 `config.yaml.server.port` 优先于 `ServerConfig.port` 默认值。

#### Scenario: 根配置默认端口为 8888
- **WHEN** 使用仓库自带根 `config.yaml` 启动源码开发后端
- **THEN** 后端默认监听端口为 `8888`

#### Scenario: 缺省 `server.port` 时回退到模型默认值
- **WHEN** `config.yaml` 缺少 `server.port`
- **THEN** `backend/src/config.py` 中的 `ServerConfig.port` fallback 为 `8888`

#### Scenario: 显式 YAML 覆盖仍然生效
- **WHEN** `config.yaml` 显式设置了非 `8888` 的 `server.port`
- **THEN** 运行时必须使用 YAML 显式值
- **AND** 本次变更 MUST NOT 改变“YAML 显式值覆盖模型默认值”的优先级语义

---

### Requirement: 端口覆盖面保持不变
系统 SHALL NOT 因本次变更新增 `PORT` 环境变量、CLI 参数或其他新的端口覆盖入口。

#### Scenario: 运行时覆盖入口不扩张
- **WHEN** 用户按当前项目方式启动源码版或桌面版
- **THEN** 端口来源仍限定在现有 `config.yaml` + Pydantic 默认值链路
- **AND** 实现 MUST NOT 引入新的 env / CLI 覆盖机制

---

### Requirement: Host 绑定语义保持不变
系统 SHALL 保持现有 host 语义不变。

#### Scenario: 源码开发入口继续使用配置 host
- **WHEN** 通过 `backend/main.py` 启动源码开发后端
- **THEN** `uvicorn.run` 继续使用 `config.server.host`
- **AND** 实现 MUST NOT 将源码开发 host 写死为 `127.0.0.1`

#### Scenario: 桌面打包入口继续使用回环地址
- **WHEN** 通过 `backend/app_launcher.py` 启动桌面版
- **THEN** 服务监听、自动打开浏览器、托盘“打开浏览器”都继续使用 `127.0.0.1`
- **AND** 实现 MUST NOT 将桌面版 host 改为 `config.server.host`

---

### Requirement: 前端开发代理默认指向 8888
系统 SHALL 将 Vite 开发代理的默认后端目标与仓库默认后端端口保持一致。

#### Scenario: Vite 默认代理命中 8888
- **WHEN** 运行前端开发服务器并请求 `/api`
- **THEN** `frontend/vite.config.js` 的 `/api` proxy target 默认指向 `http://127.0.0.1:8888`

#### Scenario: 前端运行时请求层不新增绝对端口依赖
- **WHEN** 前端源码访问 API
- **THEN** 继续通过相对 `/api` 路径访问
- **AND** 实现 MUST NOT 在 `frontend/src` 新增 `localhost:8888` 或 `127.0.0.1:8888` 绝对 base URL

---

### Requirement: 桌面启动入口保持现有端口消费方式
系统 SHALL 保持桌面启动入口继续消费 `config.server.port`，且不改变桌面版 host 语义。

#### Scenario: 桌面打包入口继续使用回环地址
- **WHEN** 通过 `backend/app_launcher.py` 启动桌面版
- **THEN** 服务监听、自动打开浏览器、托盘“打开浏览器”都继续使用 `127.0.0.1`
- **AND** 实现 MUST NOT 将桌面版 host 改为 `config.server.host`
- **AND** `backend/app_launcher.py` 继续从 `config.server.port` 读取端口值

---

### Requirement: 文档与仓库默认示例统一为 8888
系统 SHALL 将仓库中的端口示例与默认访问说明统一为 `8888`，覆盖中文与英文文档。

#### Scenario: 中文 README 统一为 8888
- **WHEN** 查看 `README.md`
- **THEN** 配置示例中的 `server.port`、默认 Web 访问地址、开发代理说明与 `/docs` 地址均为 `8888`

#### Scenario: 英文 README 统一为 8888
- **WHEN** 查看 `README.en.md`
- **THEN** 配置示例中的 `server.port`、默认 Web 访问地址、开发代理说明与 `/docs` 地址均为 `8888`

## Properties

### Property: 配置优先级不变
对于任意有效配置输入，若 `config.yaml` 显式提供 `server.port = p`，则运行时端口为 `p`；仅当 YAML 未提供该字段时，才回退到 `ServerConfig.port`。

### Property: 桌面端口行为一致性
对于任意桌面版有效端口 `p`，服务监听端口、自动打开浏览器 URL 端口、托盘“打开浏览器”URL 端口三者必须相等。

### Property: 开发代理一致性
在默认仓库配置下，Vite `/api` proxy target 端口与根 `config.yaml.server.port` 默认值一致。

### Property: 文档一致性
在本次变更范围内，`README.md` 与 `README.en.md` 中所有默认端口示例必须收敛到同一值 `8888`。
