# CRF 编辑器

[English](./README.en.md) | **中文**

## 项目介绍

CRF（Case Report Form，病例报告表）编辑器是一个用于临床研究的表单设计和管理工具。系统支持创建、编辑和管理临床研究项目中的各类表单，并能将表单导出为标准的 Word 文档格式。

### 主要功能

- **项目与权限管理**：创建和管理临床研究项目，支持账号密码登录、管理员用户管理、项目隔离与管理员独立工作台
- **访视管理**：定义和管理研究访视流程，支持访视序列和表单关联；「访视流程」工作区以页面内矩阵 / 单访视双视图维护访视与表单的关联关系
- **表单设计**：可视化全屏表单设计器，支持多种字段类型（文本、数值、日期、单选、多选、复选等）、字段拖拽排序，并可为表单添加设计备注；日期时间 / 时间字段支持仅到小时的格式（日期时间 `yyyy-MM-dd HH`，时间 `HH` / `hh AP`）
- **实时预览与快编**：设计器底部提供实时预览，支持双击预览字段快速编辑标签、颜色、横向显示与默认值等实例属性；字段行复制先生成本地草稿，点击「保存」后才入库，日志行复制因不属于字段库仍直接保存；完全模式下设计器与访视表单预览都可在 eCRF / aCRF 视图间切换，aCRF 字段 OID / 表单 domain 标注支持竖直拖动、位置持久化，并与导出样式统一
- **字段库 / 代码列表 / 单位管理**：统一管理字段定义、选项字典和测量单位，支持复用与标准化；字段库中单选 / 多选字段可直接内联新增或编辑所引用的选项字典内容，无需切换到字典页；复选字段为不关联字典的单一复选框，可设置复选文本（为空时默认为 ✔），预览和 Word 导出显示为「字段标签 | □复选文本」
- **列表排序与序号快编**：字典、选项、单位、字段、访视、访视内表单，以及表单设计器左侧表单列表均支持拖拽排序；双击「序号」可直接输入目标位置并复用既有 reorder 接口快速移动
- **简要 / 完全编辑模式**：默认隐藏 OID / 变量名等高级标识符，完全模式下统一显示并可维护；表单 / 字段 / 字典 OID 编辑时限制为仅字母、数字、`-`、`_`、`.`，非法字符即时拦截且不改写存量；字典选项编码与标签一样不限制字符内容
- **导入能力**：支持模板库 `.db` 导入、项目数据库导入 / 整库合并导入，以及 Word `.docx` 导入对比预览与原文截图证据面板；Word 导入的 AI 复核建议可按单条 / 单表单 / 全部三级选择性接受（默认关闭），并在「导入效果」预览中实时反映接受后的字段类型
- **模板字段查询**：完全编辑模式下可打开只读、非模态可拖拽的「模板字段查询」弹窗，检索模板库全量可用字段实现 OID / 标签互查（自动排除标签字段、日志行与软删项目），搜索复用全局模糊排序，点击单元格即可复制内容
- **导出能力**：支持 Word 导出（eCRF / aCRF）与数据库导出；Word 导出内置短时频率限制，填写线会按列宽自适应，目录可预渲染并在可用 LibreOffice 时写入真实页码；aCRF 会在不扰动 eCRF 表格文本的前提下叠加浮动 OID / domain 注释框，预览与导出共享标注几何与红色系样式，同时提供预览 / 导出严格表格字段一致性校验脚本
- **项目复制与 Logo**：支持项目深拷贝与运行时 Logo 上传、复制、删除联动处理
- **访视表单预览**：在访视管理面板中直接预览各表单的字段内容布局，复用 Word 预览行高拖拽体验，并在 aCRF 视图下显示与导出一致的可持久化标注；访视预览与设计器预览统一为固定 A4 页面，aCRF 红色标注框默认与单元格纵向居中对齐
- **会话管理**：顶栏显示 JWT 会话剩余时间，临近过期提醒，并支持点击续期
- **AI 与设置**：支持 AI 接口配置、连通性测试、导入导出路径等设置管理
- **全局模糊搜索与暗色模式**：项目、访视、表单、字段、代码列表五个标签页均内置搜索框，搜索结果优先展示完全匹配项，部分匹配按命中文本长度从短到长排列，并支持亮色 / 暗色主题切换
- **桌面发行**：支持 PyInstaller 打包、本地浏览器自动打开与系统托盘运行

## 技术架构

### 技术栈

**后端**

- **框架**：FastAPI + Uvicorn
- **数据库**：SQLAlchemy ORM + SQLite
- **数据校验**：Pydantic v2
- **配置管理**：PyYAML
- **文档导出**：python-docx
- **测试框架**：pytest + hypothesis

**前端**

- **框架**：Vue 3 + Vite
- **组件库**：Element Plus
- **拖拽排序**：vuedraggable + sortablejs
- **测试框架**：node:test + 轻量属性测试工具（testProperty.js）
- **可选运行时**：LibreOffice（Linux/macOS 下 Word 导入原文截图必需；同时用于服务器侧预计算 Word 目录页码——缺失时截图面板不可用，目录保留非空回退页码并由 Word 域后续校正）

### 项目结构

```text
CRF-Editor/
├── config.yaml.example      # 配置示例（含全部可选参数），复制为 config.yaml 使用
├── backend/
│   ├── main.py              # FastAPI 应用入口
│   ├── app_launcher.py      # PyInstaller 桌面入口
│   ├── requirements.txt     # Python 运行依赖
│   ├── requirements-dev.txt # Python 开发 / 测试依赖
│   ├── src/
│   │   ├── models/          # 数据模型层（SQLAlchemy ORM）
│   │   ├── repositories/    # 数据访问层
│   │   ├── services/        # 业务逻辑层（导入 / 导出 / 排序 / 克隆等）
│   │   ├── routers/         # API 路由层（认证、项目、访视、表单、字段等）
│   │   ├── schemas/         # 请求/响应数据结构（Pydantic）
│   │   ├── config.py        # 配置加载与原子更新
│   │   └── database.py      # SQLite 引擎、Session 与轻量迁移
│   └── tests/               # pytest / hypothesis 测试
├── frontend/
│   ├── src/
│   │   ├── components/      # Vue 组件
│   │   ├── composables/     # Vue composables
│   │   ├── styles/          # 全局样式
│   │   └── App.vue          # 根组件
│   ├── tests/               # node:test 前端回归测试
│   ├── package.json         # 前端依赖与脚本
│   ├── vite.config.js       # Vite 配置
│   └── README.md            # 前端模块说明
└── assets/
    └── logos/
        └── README.md        # 静态 Logo 资源说明
```

### AI 协作上下文

- 根级上下文：`.claude/CLAUDE.md`
- 后端模块上下文：`backend/.claude/CLAUDE.md`
- 前端模块上下文：`frontend/.claude/CLAUDE.md`
- 结构化索引：`.claude/index.json`

这些文档面向 AI 辅助开发，记录模块边界、入口、跨栈契约、测试策略与安全部署约束；功能、命令或测试入口变更时应同步更新。

## 安装教程

### 环境要求

- Python 3.10 或更高版本
- Node.js 18 或更高版本（前端开发时需要）
- LibreOffice（Linux/macOS 下 Word 导入原文截图证据面板必需，Ubuntu/Debian 可执行 `sudo apt install libreoffice-writer-nogui`；同时用于服务器侧预计算 Word 目录真实页码——缺失时截图面板不可用，目录保留非空回退页码并由 Word/WPS 更新域校正）
- Windows + MS Word（可选，Word 导入原文截图证据面板的 Windows 渲染后端，需另装 `pywin32` 与 `docx2pdf`；也可改用 LibreOffice）

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/your-username/CRF-Editor.git
cd CRF-Editor
```

2. 创建虚拟环境

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate
```

3. 安装后端依赖

```bash
pip install -r backend/requirements.txt
```

4. 安装前端依赖

```bash
cd frontend
npm install
```

5. （可选）自定义配置

复制根目录下的 `config.yaml.example` 为 `config.yaml` 后按需修改（该示例包含全部可选参数及默认值说明）：

```bash
cp config.yaml.example config.yaml
```

完整可选参数如下（未填写字段使用注释标注的默认值，相对路径以项目根目录为基准解析）：

```yaml
app:
  title: CRF编辑器                     # 应用标题，默认 CRF编辑器
database:
  path: ./database/crf_editor.db       # SQLite 文件路径，默认 ./crf_editor.db
storage:
  upload_path: ./uploads               # 上传目录，默认 ./uploads
server:
  host: 0.0.0.0                        # 监听地址，默认 0.0.0.0
  port: 8888                           # 监听端口，默认 8888
template:
  template_path: ./database/xxx.db     # 模板库 .db 路径，须在白名单目录内且后缀 .db，默认空
ai:
  enabled: false                       # 是否启用 AI，默认 false
  api_url: https://api.example.com/v1  # 接口地址，默认空
  api_key: sk-xxx                      # 接口密钥，默认空
  model: deepseek-chat                 # 模型名，默认空
  api_format: openai                   # openai / anthropic，留空自动探测
  timeout: 30                          # 请求超时（秒），默认 30
admin:
  username: admin                      # 保留管理员用户名，默认 admin
  bootstrap_password: change-this-before-production  # 保留管理员初始密码，默认空
auth:
  secret_key: change-this-dev-only-secret  # JWT 密钥，仅开发用；生产须用 CRF_AUTH_SECRET_KEY
  algorithm: HS256                     # JWT 算法，默认 HS256
  access_token_expire_minutes: 60      # 令牌有效期（分钟），1-60，默认 30
recycle_bin:
  interval_minutes: 60                 # 巡检间隔（分钟），1-1440，默认 60
  min_retain_hours: 24                 # 容量清理的最短保留时间（小时），0 关闭保护，默认 24
  age:
    enabled: false                     # 是否启用按删除时间清理，默认 false
    value: 30                          # 阈值，>=1，默认 30
    unit: day                          # day / month / year；month=30天，year=365天
  size:
    enabled: false                     # 是否启用按回收站总估算大小清理，默认 false
    value: 500                         # 阈值，>=1，默认 500
    unit: MB                           # MB / GB；大小为估算值，不等于数据库文件实际增量
```

公网部署建议优先使用根目录 `.env.example` 中列出的 `CRF_*` 环境变量，尤其是：

- `CRF_ENV=production`
- `CRF_AUTH_SECRET_KEY=<随机长密钥>`
- `CRF_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=60`
- `CRF_ADMIN_BOOTSTRAP_PASSWORD=<生产环境保留管理员初始密码>`

生产模式下有以下默认安全收敛：

- 必须通过 `CRF_AUTH_SECRET_KEY` 提供密钥，`config.yaml` 中的 secret 不再作为生产兜底
- `/docs`、`/redoc`、`/openapi.json` 默认关闭
- 响应统一附带基础安全头
- 登录与高成本导入接口启用单机内存限流
- 项目 Logo 禁止 SVG/XML，历史危险 Logo 读取也会被拒绝
- `template_path` 必须位于白名单目录内，且文件后缀必须为 `.db`

### 回收站自动清理

管理员工作台的「项目回收站」支持配置自动清理策略（默认关闭，配置写入根目录 `config.yaml` 的 `recycle_bin` 段）：

- **年龄规则**：删除 `deleted_at` 超过 N 天/月/年的回收站项目（`month=30 天`，`year=365 天`，不做日历月 / 闰年换算）
- **容量规则**：当回收站内所有项目的**估算总大小**超过 N MB/GB 时，从最早删除的项目开始逐个彻底删除，直到总量回落到阈值以内
- **最短保留时间**：容量规则可额外配置「最短保留时间（小时）」保护刚删除的项目；`0` 表示关闭该保护
- **预览将删除**：保存前可先试运行预览命中的项目列表

注意：

- 「大小」是按项目结构和 Logo 文件估算的近似值，**不等于** SQLite 数据库文件的实际磁盘增量
- 自动清理会执行**不可恢复**的彻底删除，请先使用预览与二次确认
- 清理循环为**进程内单实例任务**；与登录/导入限流器类似，不适用于多实例共同写同一数据库的部署方式

## 使用说明

### 启动服务

**方式一：生产模式**（先构建前端，再启动后端）

```bash
# 1. 构建前端
cd frontend
npm run build

# 2. 启动后端（后端托管前端静态文件）
cd ../backend
python main.py
```

服务启动后访问 `http://localhost:8888` 打开 Web 界面。

> 若要把前端部署到子路径（如 `/crf/`，与其它站点共享域名），需改用子路径 base 构建：`cd frontend && VITE_BASE_PATH=/crf/ npm run build`，并在 Nginx 反代层把 `/crf/` 前缀剥掉后转发给后端。默认构建产物只走根路径 `/assets/...`，桌面版打包必须使用默认构建（见「方式三」警告）。

设置 `CRF_ENV=production` 时，uvicorn 自动关闭热重载（适合长期运行）；需要「后台运行 + 开机自启」时请使用下面的「生产部署（Linux / systemd）」章节。

如果设置了 `CRF_ENV=production`：

- 访问 `/docs`、`/redoc`、`/openapi.json` 会返回 404
- 登录接口固定为 `POST /api/auth/login`
- 若不存在可用保留管理员，启动阶段会使用 `CRF_ADMIN_BOOTSTRAP_PASSWORD` 初始化或修复管理员账号；缺失时启动直接失败
- 登录接口与数据库 / Word 导入接口会返回统一 429 JSON：`{"detail":"操作过于频繁，请稍后重试"}`，并附带 `Retry-After`

**方式二：开发模式**（前后端分别启动，热更新）

```bash
# 终端 1：启动后端
cd backend
python main.py

# 终端 2：启动前端开发服务器
cd frontend
npm run dev
```

前端开发服务器启动后访问 `http://localhost:5173`，API 请求自动代理到后端 `http://127.0.0.1:8888`。

开发模式下 API 文档见 `http://localhost:8888/docs`；生产模式默认关闭。

**方式三：桌面打包入口**（适用于 PyInstaller 发行包）

```bash
cd backend
python app_launcher.py
```

桌面入口会在本地启动后端服务、自动打开浏览器，并保持系统托盘图标运行。

> ⚠️ 打包前必须使用**默认根路径**构建前端（即 `cd frontend && npm run build`，不带 `VITE_BASE_PATH`）。桌面版通过 `http://127.0.0.1:8888/` 直接访问后端托管的静态文件，若误用子路径产物，页面会因请求 `/crf/assets/...` 而白屏。

### 登录与管理员迁移说明

- 登录统一使用现有 `username` + 密码，请求入口为 `POST /api/auth/login`。
- 旧历史账号若尚未设置密码，development 下会收到迁移提示；production 下统一返回通用未授权。
- 管理员登录后默认进入独立的用户管理工作台，不显示普通项目列表、设计器与 CRF 编辑入口。
- 管理员工作台顶部提供「用户管理 / 机构管理」双入口：用户管理保留用户、批量项目操作、回收站与清理策略；机构管理以全宽表格 + 弹窗编辑维护机构预设，上传 Logo 后列表立即显示缩略图，点击可放大预览；两页共享宽壳并通过 KeepAlive 无感切换（不重复拉取数据与 Logo）。
- 管理员可在用户管理工作台中为新用户设置初始密码，并为旧账号执行密码重置迁移。

### 基本操作流程

1. **管理员初始化（首次 production 启动）**：确认 `CRF_ADMIN_BOOTSTRAP_PASSWORD` 已配置，并在上线后立即审计保留管理员账号
2. **创建项目**：普通用户在项目管理界面创建新的临床研究项目
3. **定义访视**：添加研究访视节点，设置访视序列
4. **设计表单**：使用表单设计器创建 CRF 表单并维护设计备注
5. **添加字段**：从字段库选择或创建新字段；复制已有普通字段时先在设计器中生成草稿，确认内容后点击「保存」入库，配置字段属性与实例显示样式
6. **关联表单**：将表单关联到相应的访视节点，并在访视页以 eCRF / aCRF 视图预览布局与标注
7. **导入数据**：按需要执行模板库导入、项目数据库导入或 Word 导入对比预览
8. **导出结果**：将项目导出为 Word 文档或数据库模板

### Word 文档导出格式

导出的 Word 文档包含以下内容：

- **封面页**：试验名称、版本号、方案编号、中心编号、筛选号等信息
- **目录**：预渲染目录条目，打开即可查看与点击跳转；服务器装有 LibreOffice 时导出即带真实页码，否则显示非空回退页码并在 Word 更新域后校正
- **表单访视分布图**：矩阵表格显示表单与访视的关联关系
- **表单内容**：详细的表单字段定义和控件

## 生产部署（Linux / systemd）

适用于 Linux 服务器长期运行：服务由 systemd 托管，后台运行、崩溃自动重启、服务器重启后自动启动，日志统一进入 journald。

> 架构约束：后端使用 SQLite（WAL 模式）与单机内存限流，**只能单进程单实例运行**，不支持多副本横向扩展；也不要同时用 `python main.py` 手动启动多个实例，会造成数据库写冲突或端口占用。

### 前置准备（一次性）

```bash
# 1. 构建前端（后端托管 frontend/dist 静态文件）
cd frontend
npm ci && npm run build

# 2. 创建虚拟环境并安装后端依赖（脚本也会自动执行，此处可跳过）
cd ..
python3 -m venv backend/.venv-linux
backend/.venv-linux/bin/python -m pip install -r backend/requirements.txt

# 3. 安装文档渲染后端 LibreOffice（Word 导入原文截图必需；缺失时截图面板不可用，目录页码回退由 Word 域校正；安装后即时生效，截图无需重启服务）
sudo apt install -y libreoffice-writer-nogui fonts-noto-cjk   # Ubuntu/Debian；无 Windows 字体的服务器需一并安装中文字体
```

### 一键安装

```bash
sudo bash deploy/install-service.sh
```

首次运行会生成 `/etc/crf-editor/crf-editor.env`（自动填充随机的 `CRF_AUTH_SECRET_KEY`）并提示你编辑该文件：

```bash
sudo vi /etc/crf-editor/crf-editor.env   # 设置 CRF_ADMIN_BOOTSTRAP_PASSWORD（生产管理员初始密码）
sudo bash deploy/install-service.sh      # 再次运行完成安装
```

脚本会渲染 `deploy/crf-editor.service.template` 到 `/etc/systemd/system/crf-editor.service`，执行 `systemctl enable --now`，并打印服务状态。

### 手工安装（不用脚本时）

```bash
# 1. 准备环境变量文件（含 CRF_ENV=production、CRF_AUTH_SECRET_KEY、CRF_ADMIN_BOOTSTRAP_PASSWORD）
sudo mkdir -p /etc/crf-editor
sudo cp deploy/crf-editor.env.example /etc/crf-editor/crf-editor.env
sudo vi /etc/crf-editor/crf-editor.env

# 2. 渲染 systemd unit（把占位符换成实际路径）
APP_DIR="$PWD"
PY="$PWD/backend/.venv-linux/bin/python"
sed -e "s#__APP_DIR__#${APP_DIR}#g" -e "s#__PYTHON_BIN__#${PY}#g" \
    deploy/crf-editor.service.template | sudo tee /etc/systemd/system/crf-editor.service

# 3. 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable --now crf-editor
```

### 日常运维

| 操作 | 命令 |
| --- | --- |
| 查看状态 | `systemctl status crf-editor` |
| 查看实时日志 | `journalctl -u crf-editor -f` |
| 重启 / 停止 | `systemctl restart crf-editor` / `systemctl stop crf-editor` |
| 日志保留策略 | `sudo journalctl --vacuum-time=30d` |

服务配置了 `Restart=always`，进程崩溃会自动拉起；日志默认占用系统磁盘，建议定期按上表清理。

### 对外暴露方式（二选一）

**方式 A：直接暴露端口**

保持 `/etc/crf-editor/crf-editor.env` 中 `CRF_SERVER_HOST=0.0.0.0`，在防火墙放行 `CRF_SERVER_PORT`（默认 8888）后直接访问 `http://<服务器IP>:8888`。

**方式 B：Nginx 反向代理（推荐公网使用）**

1. 把 `CRF_SERVER_HOST` 改为 `127.0.0.1`，使后端仅监听本机回环
2. 参考 `deploy/nginx/crf-editor.conf.example` 配置反向代理（含大文件上传 `client_max_body_size` 与长耗时接口超时），`nginx -t` 通过后 `nginx -s reload`
3. 若服务器已用 1panel / openresty 等面板占用 80/443，请通过面板的「网站」功能添加反代站点，而不是直接放置 Nginx 配置文件

> 提示：无论哪种方式，若之前用 `nohup` / `python main.py` 手动启动过实例，请先停掉再启用服务，否则会端口冲突。

**子路径部署（共享域名，例如 `/crf/`）**

当域名根路径已被其它站点占用、CRF 只能挂在子路径时：

1. 构建前端时带上子路径 base（懒加载资源才会带 `/crf/` 前缀，否则会串到根路径站点的同名资源）：
   ```bash
   cd frontend && VITE_BASE_PATH=/crf/ npm run build
   ```
2. Nginx 参考 `deploy/nginx/crf-editor.conf.example` 末尾的「子路径部署」注释段：
   ```nginx
   location = /crf { return 301 /crf/; }          # 裸路径重定向到带尾斜杠
   location /crf/ {
       proxy_pass http://127.0.0.1:8888/;         # 末尾斜杠「/」必需：剥掉 /crf/ 前缀再转发
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       client_max_body_size 100m;
       proxy_read_timeout 600s;
   }
   ```
   前端所有 API 请求也会带 `/crf/api/...` 前缀，同样被该 location 剥掉前缀后到达后端 `/api/...`，后端无需任何改动；也不要再配置同域根路径的 `location /` 指向 CRF，避免资源串站。
   
   > 安全注意：`localStorage` 按「域名 + 端口」隔离、不按路径。若同域名根路径运行着其它站点，它能读取 CRF 的 `crf_token` 登录令牌。子路径部署前请确认同域其它站点可信，或改用独立子域名部署。

### 升级流程

```bash
git pull
cd frontend && npm ci && npm run build   # 子路径部署时改为：VITE_BASE_PATH=/crf/ npm run build
cd ../backend && <venv-python> -m pip install -r backend/requirements.txt
sudo systemctl restart crf-editor
```

### 备份

需要备份的状态数据：`database/`（SQLite 数据库）、`uploads/`（项目 Logo 等上传文件）、`config.yaml` / `/etc/crf-editor/crf-editor.env`（配置与密钥）。

SQLite 处于 WAL 模式时，直接拷贝 `*.db` 会漏掉 `-wal` / `-shm` 文件中的未合并数据。正确做法：先 `systemctl stop crf-editor` 再拷贝整个 `database/` 目录，或用 `sqlite3 database/crf_editor.db ".backup '/备份路径/crf_editor.db'"` 在线备份（后者无需停机）。

### 卸载

```bash
sudo bash deploy/install-service.sh uninstall
```

脚本只停止并删除服务，**保留** `/etc/crf-editor/`、`database/`、`uploads/` 等数据与配置，便于日后重新安装。

上线前的安全收敛项（保留管理员初始化与审计、密钥轮换、多实例限制等）见下方「上线安全注意事项」。

## 上线安全注意事项

- 生产环境首次空库启动或发现保留管理员不可用时，系统会使用 `CRF_ADMIN_BOOTSTRAP_PASSWORD` 自动创建 / 修复保留管理员账号；该密码必须在受控环境中提供，且上线后应立即轮换或重置。
- 上线后应立即审计保留管理员账号是否存在、密码是否已完成接管、以及该账号是否仅在受控环境可访问。
- 部署前应轮换仓库中的历史 `auth.secret_key`，并只通过 `CRF_AUTH_SECRET_KEY` 注入新密钥。
- 若升级为多实例部署，当前单机内存限流不再足够，需要替换为共享存储限流方案。

## 测试

### 后端
```bash
cd backend
python -m pytest
```

### 前端
```bash
cd frontend
node --test tests/*.test.js
```

当前仓库中：
- `backend/tests/` 当前包含 47 个 Python 测试文件（45 个 `test_*.py` 模块 + `conftest.py` + `helpers.py`），并包含部分 `hypothesis` 属性测试
- `frontend/tests/` 当前包含 65 个前端测试文件（64 个 `.test.js` + `testProperty.js`），覆盖设计器 / 访视预览 aCRF 标注几何、持久化与拖动接线、字段实例复制、复选字段类型契约、OID 字符集校验接线、单位 / 访视右侧属性卡，以及管理端机构弹窗编辑等契约
- 预览 / 导出严格表格字段一致性可通过 `backend/scripts/compare_word_table_parity.py` 对比浏览器预览 JSON 与导出的 `.docx`

## 参与贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目采用 PolyForm Strict License 1.0.0 许可证，仅限非商业用途。详见 LICENSE 文件。

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。
