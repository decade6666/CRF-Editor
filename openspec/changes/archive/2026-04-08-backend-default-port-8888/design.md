# Design: backend-default-port-8888

## 1. 目标与范围

本变更只做一件事：把 **当前仓库级默认后端端口** 从 `8000` 收敛为 `8888`，并把这件事在以下链路中一次对齐：

- 源码开发启动：`backend/src/config.py` + `config.yaml` + `backend/main.py`
- 桌面打包启动：`config.yaml` + `backend/app_launcher.py` + `backend/crf.spec`
- 前端开发联调：`frontend/vite.config.js`
- 文档与默认示例：`README.md`、`README.en.md`

本设计遵循四条边界：

1. **全链路同步**，不是只改代码默认值
2. **包含桌面打包路径**
3. **不新增 env / CLI 端口覆盖机制**
4. **不改变 host 语义，不纳入 `data/admin/config.yaml`**

---

## 2. 已确认的代码事实

### 2.1 配置源头与优先级

- `backend/src/config.py` 当前通过 `CONFIG_FILE = Path(__file__).resolve().parents[2] / "config.yaml"` 读取仓库根 `config.yaml`
- `ServerConfig.port` 当前默认值为 `8000`
- `load_config()` / `get_config()` 语义已经明确：**YAML 显式值优先，模型默认值兜底**
- `backend/src/routers/settings.py` 的 `update_config()` 会把设置写回同一根 `config.yaml`

### 2.2 源码开发入口

- `backend/main.py` 启动时使用 `config.server.host` 和 `config.server.port`
- `startup()` 还要求 `config.auth.secret_key` 存在，因此任何运行验证都必须基于可启动的根 `config.yaml`

### 2.3 桌面打包入口

- `backend/app_launcher.py` 从 `get_config()` 读取 `config.server.port`
- 桌面版 host 固定为 `127.0.0.1`
- 自动打开浏览器与托盘“打开浏览器”都基于同一个 `port`
- `backend/crf.spec` 当前会把根 `config.yaml` 打进发行物
- 用户已确认：桌面配置契约锁定为 **EXE 同级 `config.yaml` 可编辑**

### 2.4 前端与文档

- `frontend/vite.config.js` 当前把 `/api` 代理到 `http://127.0.0.1:8000`
- `frontend/src/composables/useApi.js` 继续使用相对 `/api`，不是本次改造面
- `README.md` / `README.en.md` 中的配置示例、默认访问地址、开发代理说明、`/docs` 地址都仍写 `8000`

---

## 3. 关键裁决

### 3.1 真正的“默认端口”必须改两处

如果只改 `backend/src/config.py` 的 `ServerConfig.port`，当前根 `config.yaml` 仍会以显式值覆盖回 `8000`；
如果只改根 `config.yaml`，模型 fallback 仍停留在 `8000`。

**因此实现必须同时修改：**

- `backend/src/config.py` 的 `ServerConfig.port`
- 根 `config.yaml` 的 `server.port`

这两处一起才构成“仓库级默认端口已改为 8888”。

### 3.2 消费者文件默认只验证，不在入口层硬编码 8888

`backend/main.py`、`backend/app_launcher.py`、`backend/crf.spec` 当前的职责是**消费**现有配置链路，而不是提供新的端口真值。

本次不在这些入口写死 `8888`，否则会制造新的漂移点。

### 3.3 桌面启动入口只保留静态消费验证

本次设计不新增新的配置定位机制，也不把桌面发行物 smoke test 作为实现必需项。

本次只要求静态确认现有桌面入口满足以下边界：

- `backend/app_launcher.py` 继续从 `config.server.port` 读取端口
- 桌面版 host 继续固定为 `127.0.0.1`
- 自动打开浏览器与托盘“打开浏览器”继续复用同一个 `port`

这里的关键不是新增实现分支，而是保持现有桌面入口的端口消费方式与 host 语义不变。

### 3.4 文档改动只收敛端口事实，不借机扩范围

本次 README 更新仅聚焦端口相关事实：

- YAML 示例中的 `server.port`
- 默认 Web 访问地址
- 开发代理说明
- `/docs` 地址

不借机扩展到其他与端口无关的文档重写。

### 3.5 明确排除项

以下文件或能力**不纳入本次实现范围**：

- `data/admin/config.yaml`
- `frontend/src/composables/useApi.js`
- 新的 env 覆盖机制
- 新的 CLI 端口参数
- 源码开发 host 语义变更
- 桌面打包 host 语义变更

---

## 4. 文件变更矩阵

| 文件 | 动作 | 变更内容 | 不做什么 |
|---|---|---|---|
| `backend/src/config.py` | 修改 | `ServerConfig.port` 默认值 `8000 -> 8888` | 不新增 env / CLI 读取；不改 `host` 默认值 |
| `config.yaml` | 修改 | `server.port: 8000 -> 8888` | 不改其他配置键，不触碰已存在的 `auth` / `ai` / `admin` 值 |
| `frontend/vite.config.js` | 修改 | `/api` 代理目标 `127.0.0.1:8000 -> 127.0.0.1:8888` | 不改前端 dev server 端口 `5173` |
| `README.md` | 修改 | 统一所有默认端口示例到 `8888` | 不扩写无关使用说明 |
| `README.en.md` | 修改 | 统一所有默认端口示例到 `8888` | 不扩写无关使用说明 |
| `backend/main.py` | 只验证 | 继续消费 `config.server.host/port` | 不写死 8888 |
| `backend/app_launcher.py` | 只验证 | 继续消费 `config.server.port`，host 保持 `127.0.0.1` | 不改 host 语义 |
| `backend/crf.spec` | 只验证 | 继续把根 `config.yaml` 打入发行物 | 不改打包结构 |

---

## 5. 验证设计

### 5.1 静态/单元验证

- 配置优先级测试：验证 YAML 显式值仍覆盖 `ServerConfig.port`
- fallback 测试：缺失 `server.port` 时回退到 `8888`
- 前端静态断言：`vite.config.js` proxy target 为 `127.0.0.1:8888`
- 文档静态断言：README 中所有默认端口示例改为 `8888`

### 5.2 源码运行验证

- 使用当前根 `config.yaml` 启动源码开发后端
- 验证 `http://127.0.0.1:8888/docs` 可达
- 配合前端 `npm run dev` 验证 `/api` 代理命中 `8888`

### 5.3 桌面入口静态验证

- 读取 `backend/app_launcher.py`，确认它继续通过 `get_config()` 获取 `config.server.port`
- 确认桌面版 host 仍固定为 `127.0.0.1`
- 确认自动打开浏览器与托盘“打开浏览器”继续复用同一个 `port`

---

## 6. 需要避免的假完成

1. **只改 `backend/src/config.py`**：根 `config.yaml` 仍会把默认端口压回 `8000`
2. **只改根 `config.yaml`**：模型 fallback 仍停留在 `8000`
3. **只改 `frontend/vite.config.js`**：开发联调看似恢复，但仓库默认端口事实没有真正改完
4. **只改 README**：文档与运行时分裂
5. **在 `backend/main.py` / `backend/app_launcher.py` 写死 8888**：掩盖配置链问题，并制造新的维护漂移
