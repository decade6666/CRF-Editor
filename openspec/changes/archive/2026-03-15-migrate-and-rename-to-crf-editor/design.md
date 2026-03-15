# Design: Migrate and Rename to CRF-Editor

**Change ID**: migrate-and-rename-to-crf-editor
**Version**: 1.0.0

---

## 1. 架构概览

本次变更是**纯迁移+重命名**，不改动系统架构。目标仓库迁移完成后与原项目保持相同的分层架构：

```
CRF-Editor/
├── backend/                    # FastAPI + Python 3.11
│   ├── src/
│   │   ├── routers/            # API 路由层
│   │   ├── services/           # 业务逻辑层
│   │   ├── repositories/       # 数据访问层
│   │   ├── models/             # SQLAlchemy ORM 模型
│   │   ├── schemas/            # Pydantic 校验 Schema
│   │   ├── config.py           # 配置加载（读 config.yaml）
│   │   ├── config.yaml         # 运行时配置真相源 ✅
│   │   └── database.py         # DB 初始化（init_db）
│   ├── config.yaml             # PyInstaller 打包用配置（与 src/config.yaml 同步）
│   ├── main.py                 # FastAPI 应用入口
│   ├── app_launcher.py         # PyInstaller 系统托盘启动器
│   ├── build.bat               # 打包脚本
│   ├── crf.spec                # PyInstaller Spec 文件
│   └── requirements.txt
├── frontend/                   # Vue 3.5 + Vite 7.3 + Element Plus 2.13
│   ├── src/
│   │   ├── views/
│   │   ├── components/layout/
│   │   └── App.vue
│   ├── index.html
│   └── package.json
├── assets/                     # 共享静态资源（如有）
├── .git/                       # 保留原有 git 历史
├── .claude/                    # CCG 工具配置（不覆盖）
└── openspec/                   # OpenSpec 规范目录（不覆盖）
```

---

## 2. 关键变更点分析

### 2.1 后端重命名目标文件

| 文件 | 位置 | 变更内容 |
|------|------|----------|
| `backend/main.py` | L28 | `FastAPI(title="CRF元数据管理系统")` → `FastAPI(title="CRF编辑器")` |
| `backend/app_launcher.py` | L84 | 系统托盘名称 → `"CRF编辑器"` |
| `backend/app_launcher.py` | L121 | 窗口标题 → `"CRF编辑器"` |
| `backend/app_launcher.py` | L123 | 错误弹窗标题 → `"CRF编辑器"` |
| `backend/app_launcher.py` | L142 | 关闭确认对话框标题 → `"CRF编辑器"` |
| `backend/build.bat` | L4 | 打包脚本标题注释 → `CRF-Editor` |
| `backend/build.bat` | L24 | 清理目录名 → `crf-editor` |
| `backend/build.bat` | L45 | 输出 exe 名称 → `CRF-Editor.exe` |
| `backend/build.bat` | L46 | dist 目标目录名 → `crf-editor` |
| `backend/crf.spec` | L99 | PyInstaller `name` → `"CRF-Editor"` |
| `backend/crf.spec` | L119 | bundle name → `"CRF-Editor"` |

### 2.2 前端重命名目标文件

| 文件 | 变更内容 |
|------|----------|
| `frontend/index.html` | `<title>CRF管理系统</title>` → `<title>CRF编辑器</title>` |
| `frontend/package.json` | `"name": "crf_management_online"` → `"name": "crf-editor"` |
| `frontend/src/App.vue` | header/logo 文字 "CRF Management" → "CRF-Editor" |
| `frontend/src/views/Login.vue` | 欢迎语 "CRF管理系统" → "CRF编辑器" |
| `frontend/src/components/layout/Sidebar.vue` | 侧边栏项目标题 → "CRF编辑器" |

### 2.3 配置修复

**问题**：`backend/src/config.yaml#L9` 硬编码了原仓库绝对路径：
```yaml
# 修复前（危险！指向源仓库数据库）
database:
  path: D:\Documents\Gitee\crf_management_online\crf_metadata.db
```

**修复方案**：
```yaml
# 修复后（相对路径，相对于 backend/ 目录）
app:
  title: CRF编辑器
  version: 1.0.0
database:
  path: ../crf_editor.db
```

**同步到** `backend/config.yaml`（PyInstaller 包内配置），保持字段一致。

### 2.4 数据库初始化流程

```
目标仓库首次启动
       │
       ▼
database.py:init_db()
       │
       ├─ 检查 config.yaml 中的 database.path
       │
       ├─ 若 .db 文件不存在 → Base.metadata.create_all() 建新库 ✅
       │
       └─ 若 .db 文件已存在 → 跳过建库（不重置数据）
```

> ⚠️ **注意**：若 `database.path` 仍指向源仓库，`init_db()` 会直接读写源数据库。**必须先修复路径再启动**。

### 2.5 docx 服务硬编码路径问题

以下两个文件中 `uploads/docx_temp` 路径硬编码，未使用 `storage.upload_path` 配置：

- `backend/src/services/docx_import_service.py#L546`
- `backend/src/services/docx_screenshot_service.py#L43`

**本 Change 范围内**：迁移时原样复制（保持现有行为），硬编码路径问题记录为技术债，在独立 Issue 中跟踪修复。

---

## 3. 操作执行顺序

必须严格按以下顺序执行，防止在修复完成前意外触碰源仓库数据：

```
阶段 1: 复制（只读）
  1.1 白名单复制 backend/ → 目标 backend/
  1.2 白名单复制 frontend/ → 目标 frontend/
  1.3 复制 assets/、README.md、LICENSE、.gitignore 等

阶段 2: 配置修复（最高优先级）
  2.1 修复 backend/src/config.yaml
      - app.title → "CRF编辑器"
      - database.path → 相对路径（如 ../crf_editor.db）
  2.2 同步 backend/config.yaml（PyInstaller 用）
      - 与 backend/src/config.yaml 保持一致

阶段 3: 程序名称替换
  3.1 后端：main.py、app_launcher.py、build.bat、crf.spec
  3.2 前端：index.html、package.json、App.vue、Login.vue、Sidebar.vue
  3.3 文档：README.md（目录名、克隆示例、数据库名等）

阶段 4: 验证
  4.1 安装依赖（pip install -r requirements.txt）
  4.2 启动后端，确认无报错，数据库在目标路径创建
  4.3 安装前端依赖（npm install）
  4.4 启动前端开发服务器，确认登录页显示 "CRF编辑器"
```

---

## 4. 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| config.yaml 路径未修复导致读写源库 | 高（如跳过步骤） | 高 | 阶段 2 必须在启动前完成 |
| 机械替换 "CRF" 破坏业务术语 | 中 | 高 | 使用精确字符串匹配，不用正则全局替换 |
| 双配置文件不同步导致打包版本行为差异 | 中 | 中 | 阶段 2 同时更新两个文件 |
| docx 服务硬编码路径在新环境下目录不存在 | 低 | 低 | 目录会在首次使用时自动创建（已有 mkdir 逻辑） |
| .git/.claude/openspec 被意外覆盖 | 低（排除清单保护） | 高 | 复制脚本严格 exclude 目标仓库工具目录 |

---

## 5. 技术债记录（本 Change 不处理）

| ID | 描述 | 优先级 |
|----|------|--------|
| TD-001 | `docx_import_service.py` 和 `docx_screenshot_service.py` 中 `uploads/docx_temp` 硬编码路径 | P2 |
| TD-002 | `backend/crf.spec` 文件名与项目已重命名不匹配（仍叫 `crf.spec`，可考虑重命名为 `crf_editor.spec`） | P3 |
