# Proposal: config-migrate-ui-cleanup-darkmode

## Overview

本变更包含 4 项独立但相关的改进：

1. **Config 迁移**：将 `backend/src/config.yaml` 迁移至项目根目录，统一配置入口
2. **UI 清理 - 模板路径**：从设置对话框中移除"模板路径"输入控件（字段保留在数据模型中）
3. **UI 清理 - AI 配置**：临时隐藏设置对话框中的"AI 复核配置"区块
4. **暗色模式**：在标题栏 ⚙️ 按钮右侧添加浅色/暗色切换按钮

---

## Discovered Constraints

### Hard Constraints（不可违反）

- **C-01**: `backend/src/config.py` 中只有 `CONFIG_FILE = Path(__file__).resolve().parent / "config.yaml"` 这一处硬编码路径，其余模块均通过 `get_config()` 间接访问。迁移只需修改此一行。
- **C-02**: `config.yaml` 中 `database.path` 和 `storage.upload_path` 使用相对路径（`../../crf_editor.db`, `../../uploads`）。迁移后路径将从项目根目录解析，需同步更新为 `./crf_editor.db` 和 `./uploads`。
- **C-03**: `PUT /api/settings`（`backend/src/routers/settings.py:66`）对 `template_path` 调用 `is_safe_path()` 必填验证。移除 UI 控件后，前端必须继续传递该字段（从 `settingsForm.template_path` 读取当前保存值），否则 422 错误。
- **C-04**: `get_config()` 使用 `@lru_cache(maxsize=1)`，`update_config()` 调用后会 `cache_clear()`。迁移路径后首次启动会正确加载新位置的配置。
- **C-05**: Vue 3 项目使用 `<script setup>` Composition API，**不是** Options API。所有前端修改必须使用 Composition API 风格。
- **C-06**: Element Plus 暗色模式要求 `<html>` 元素同时具有 `dark` CSS class 和 Element Plus dark CSS vars（通过 `import 'element-plus/theme-chalk/dark/css-vars.css'`）。
- **C-07**: 自定义 CSS 变量暗色模式通过 `html[data-theme="dark"]` 选择器实现（在 `frontend/src/styles/main.css` 中添加对应规则）。
- **C-08**: Element Plus 所有图标已全局注册（`main.js` 中 `for...in` 循环）。`Moon` 和 `Sunny` 图标可直接使用。

### Soft Constraints（约定/偏好）

- **S-01**: localStorage key 命名约定：`crf_` 前缀（现有 `crf_sidebarWidth`）。暗色模式持久化 key 应为 `crf_theme`，值为 `'light'` 或 `'dark'`。
- **S-02**: 默认主题为浅色模式（`light`）。用户首次访问时按 localStorage 值恢复，无记录则默认 `light`。
- **S-03**: 项目注释语言为中文（参照现有代码）。
- **S-04**: 暗色模式图标风格使用 Element Plus 组件图标（`<el-icon><Moon /></el-icon>` / `<el-icon><Sunny /></el-icon>`），与现有 ⚙️ 按钮风格一致。
- **S-05**: "AI 复核配置"区块仅隐藏（`v-show="false"` 或 `v-if="false"`），不删除代码，保留未来启用能力。
- **S-06**: 迁移完成后删除旧配置文件 `backend/config.yaml` 和 `backend/src/config.yaml`，避免混淆。

---

## Dependencies

- **D-01**: 暗色模式 CSS 变量（`--color-bg-body`, `--color-bg-card`, `--color-text-primary` 等）在 `frontend/src/styles/main.css` 中已有 `:root` 定义，需新增 `html[data-theme="dark"]` 块覆盖这些变量。
- **D-02**: 暗色模式需要在 `frontend/src/main.js` 中新增 `import 'element-plus/theme-chalk/dark/css-vars.css'`，以启用 Element Plus 原生暗色支持。
- **D-03**: 配置路径迁移（Task 1）与 `config.yaml` 内容更新（相对路径修正）必须同步完成，否则 db/uploads 路径失效。

---

## Risks & Mitigations

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| `config.yaml` 移到根目录后，PyInstaller 打包时找不到文件 | 中 | `app_launcher.py` 已有 `base_dir` 逻辑处理工作目录，迁移后路径仍基于 `backend/src/config.py`，PyInstaller 通过 `sys.frozen` 路径解析 — 无影响 |
| `backend/crf.spec` L57 `('config.yaml', '.')` 在迁移后失效 | 中 | 该条目从 `backend/` 目录相对路径收集 `config.yaml`；`backend/config.yaml` 迁移后删除，若 PyInstaller 从 `backend/` 运行则路径应改为 `('../config.yaml', '.')`。**实施时需验证 PyInstaller 执行目录**，必要时修改此行。 |
| 暗色模式 Element Plus 组件未完全适配 | 低 | Element Plus 官方暗色支持覆盖所有内置组件；自定义 CSS 通过 `html[data-theme="dark"]` 独立控制 |
| 删除旧 `backend/config.yaml` 后影响 CI/CD 或外部引用 | 低 | git history 保留，`backend/config.yaml` 无任何代码引用（Codex 已确认） |

---

## Success Criteria

1. **SC-01**: 应用启动后从 `<project_root>/config.yaml` 加载配置，数据库和上传目录路径正确解析
2. **SC-02**: 设置对话框不显示"模板路径"输入框；保存设置成功（无 422 错误）
3. **SC-03**: 设置对话框不显示"AI 复核配置"区块（代码保留）
4. **SC-04**: 标题栏 ⚙️ 右侧显示切换按钮；点击后页面主题切换；刷新后主题状态保持

---

## User Confirmations

1. **template_path 处理方式**：前端隐藏输入框但保留字段（`settingsForm.template_path` 静默传递）
2. **图标风格**：Element Plus `<Moon />` / `<Sunny />` 组件图标
3. **旧配置文件**：迁移后删除 `backend/config.yaml` 和 `backend/src/config.yaml`

---

## Implementation Scope

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `backend/src/config.py` | 修改 | L15: 更新 `CONFIG_FILE` 指向项目根目录；L43/L47: 修正默认路径前缀 |
| `<project_root>/config.yaml` | 新建 | 从 `backend/src/config.yaml` 复制并修正相对路径 |
| `backend/src/config.yaml` | 删除 | 迁移后删除 |
| `backend/config.yaml` | 删除 | 旧备份文件删除 |
| `frontend/src/App.vue` | 修改 | 隐藏"模板路径"控件 + 隐藏"AI 复核配置"区块 + 添加主题切换按钮 + 添加主题切换逻辑 |
| `frontend/src/main.js` | 修改 | 添加 Element Plus dark CSS vars import |
| `frontend/src/styles/main.css` | 修改 | 添加 `html[data-theme="dark"]` CSS 变量块 |
| `backend/crf.spec` | 待验证 | L57 `('config.yaml', '.')` 需确认 PyInstaller 执行目录；若从 `backend/` 运行则需改为 `('../config.yaml', '.')`；若从项目根运行则无需修改 |

**变更文件总计：7 个**，其中 2 个删除，1 个新建，4 个修改，1 个待验证。

---

## Out of Scope

- 后端 `PUT /api/settings` schema 结构修改（`template_path` 保持必填）
- AI 复核功能的实际启用/实现
- 其他 UI 风格调整
