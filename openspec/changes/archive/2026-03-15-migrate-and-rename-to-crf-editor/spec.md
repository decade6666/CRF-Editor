# Spec: Migrate and Rename to CRF-Editor

**Change ID**: migrate-and-rename-to-crf-editor
**Version**: 1.0.0
**Status**: Proposed
**Date**: 2026-03-15

---

## 1. 背景与目标

将 `D:\Documents\Gitee\crf_management_online`（原 CRF管理系统）的全部必要源码迁移至当前仓库 `D:\Documents\GitHub\CRF-Editor`，同时将程序名称统一从 **"CRF管理系统" / "crf_management_online"** 改为 **"CRF编辑器" / "CRF-Editor"**。

- 本次迁移是原项目的**直接续版**（direct continuation），不是重写
- 目标仓库已有 `.git/`、`.claude/`、`openspec/` 等工具目录，**不得覆盖**
- 数据库文件 `*.db` **不迁移**，目标仓库在首次启动时由 `init_db()` 自动建库

---

## 2. 功能范围（Scope）

### 2.1 In Scope

| 类别 | 描述 |
|------|------|
| 源码迁移 | 白名单复制：`backend/`、`frontend/`、`assets/`、`config.yaml`（根级如存在）、`README.md`、`LICENSE`、`.gitignore` |
| 程序名称替换 | 将所有用户可见的产品名称改为 **CRF编辑器 / CRF-Editor** |
| 配置修复 | 修复 `backend/src/config.yaml#L9` 绝对路径硬编码问题 |
| 配置统一 | 合并双配置文件（`backend/src/config.yaml` 与 `backend/config.yaml`）为单一运行时真相源 |
| 依赖清单 | 确认 `backend/requirements.txt` 和 `frontend/package.json` 正确，不包含废弃依赖 |

### 2.2 Out of Scope

| 类别 | 说明 |
|------|------|
| 功能重构 | 不对业务逻辑做任何修改 |
| 数据库迁移 | 不复制 `*.db`，目标仓库重新初始化 |
| API 兼容性变更 | 不改变任何 API 端点路径 |
| 测试补充 | 不在本 Change 内新增测试 |
| 工具目录 | `.git/`、`.claude/`、`openspec/` 保持原状 |

---

## 3. 约束条件（Constraints）

### 3.1 必须保留的 "CRF" 业务术语

以下包含 "CRF" 的词语是**业务领域术语**，**不得**被改名：

- `Draft CRF`
- `eCRF`
- `_CRF.docx`（文件命名模式）
- `CRF表单`、`CRF编号`、`CRF页码`（所有 CRF 作为前置修饰词出现在数据字段中的情况）

### 3.2 文件排除清单

复制时**严格跳过**以下内容：

```
.venv/
node_modules/
dist/
build/
.pytest_cache/
__pycache__/
*.db
*.sqlite3
.git/
.claude/（源目录中若有）
.gitee/
.ace-tool/
.playwright-mcp/
openspec/（源目录中若有）
```

### 3.3 路径安全约束

- `backend/src/config.yaml#L9` 的 `database.path` 必须改为**相对路径**（如 `./crf_editor.db` 或 `../crf_editor.db`），**禁止**保留任何指向源仓库绝对路径的内容
- `backend/config.yaml`（PyInstaller 用）与 `backend/src/config.yaml` 必须保持同步，或其中一个明确标记为废弃

---

## 4. 验收标准（Acceptance Criteria）

### AC-1：文件迁移完整性

- [ ] `backend/` 目录完整迁移，包含 `src/`、`requirements.txt`、`main.py`、`app_launcher.py` 等
- [ ] `frontend/` 目录完整迁移，包含 `src/`、`public/`、`index.html`、`package.json`、`vite.config.js` 等
- [ ] 排除清单中的文件/目录均未出现在目标仓库

### AC-2：程序名称一致性

- [ ] 所有面向用户的 UI 文本显示 **"CRF编辑器"**（中文界面）
- [ ] 所有英文标识、打包产物、npm name 显示 **"CRF-Editor"** 或 **"crf-editor"**
- [ ] 业务术语（Draft CRF、eCRF 等）保持不变

### AC-3：配置安全

- [ ] `backend/src/config.yaml#L9` 不再包含任何绝对路径
- [ ] 两个 config.yaml 内容一致（database.path、app.title 等关键字段）

### AC-4：首次启动可用

- [ ] `cd backend && pip install -r requirements.txt` 成功
- [ ] `python main.py` 或 `uvicorn src.main:app` 启动无报错
- [ ] 自动建库：`init_db()` 在目标路径下创建新 SQLite 文件
- [ ] `cd frontend && npm install && npm run dev` 成功
- [ ] 浏览器访问 `http://localhost:5173` 显示 **CRF编辑器** 登录页

### AC-5：现有功能不退化

- [ ] 用户登录/注册正常
- [ ] CRF 表单的创建、编辑、查看正常
- [ ] Word 导出功能正常（`_CRF.docx` 文件名模式保留）
