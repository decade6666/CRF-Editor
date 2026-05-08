# Tasks: config-migrate-ui-cleanup-darkmode

> 按依赖顺序排列；T1 独立优先，T2/T3 可并行，T4 独立执行。

---

## T1 — Config 迁移

- [x] 1.1 修改 `backend/src/config.py` L15：将 `CONFIG_FILE` 路径由 `.parent / "config.yaml"` 改为 `.parents[2] / "config.yaml"`
- [x] 1.2 修改 `backend/src/config.py` L43：将 `DatabaseConfig.path` 默认值由 `"../../crf_editor.db"` 改为 `"./crf_editor.db"`
- [x] 1.3 修改 `backend/src/config.py` L47：将 `StorageConfig.upload_path` 默认值由 `"../../uploads"` 改为 `"./uploads"`
- [x] 1.4 新建 `<project_root>/config.yaml`：以 `yaml.safe_load` 读取 `backend/src/config.yaml` 原始 dict，修正 `database.path` 和 `storage.upload_path` 为 `./` 前缀，再用 `yaml.safe_dump` 写出到项目根目录
- [x] 1.5 删除 `backend/src/config.yaml`（迁移完成后清理旧文件）
- [x] 1.6 删除 `backend/config.yaml`（旧备份文件）
- [x] 1.7 验证：启动后端，确认日志路径包含项目根目录，数据库和上传目录路径正确解析（SC-1.4 / SC-1.5）

---

## T2 — UI 清理：隐藏「模板路径」

- [x] 2.1 在 `frontend/src/App.vue` 模板区定位 `<el-form-item label="模板路径">` 元素（约 L444）
- [x] 2.2 为该 `<el-form-item>` 添加 `v-if="false"` 属性，同时在其上方添加注释 `<!-- 暂时隐藏，保留代码 -->`
- [x] 2.3 确认 `settingsForm.template_path` 字段定义、`openSettings()` 填充、`saveSettings()` 传递均未被修改（SC-2.4）

---

## T3 — UI 清理：隐藏「AI 复核配置」区块

- [x] 3.1 在 `frontend/src/App.vue` 模板区定位 `<el-divider>AI 复核配置</el-divider>`（约 L447）
- [x] 3.2 用 `<template v-if="false">` 包裹以下所有元素：`<el-divider>AI 复核配置</el-divider>`、`<el-form-item label="启用AI复核">`、`<el-form-item label="API URL">`、`<el-form-item label="API Key">`、`<el-form-item label="模型">`、`<el-form-item v-if="settingsForm.ai_enabled">（测试连接按钮）`；并在包裹前添加注释 `<!-- 暂时隐藏，保留代码 -->`
- [x] 3.3 确认 AI 相关字段定义、`testAiConnection()` 函数、`aiTestResult`/`aiTestLoading` 变量均未被删除（SC-2.5）
- [x] 3.4 打开设置对话框验证：不显示「模板路径」输入框、不显示「AI 复核配置」区块；点击「确定」保存设置 HTTP 返回 200（SC-2.1 / SC-2.2 / SC-2.3）

---

## T4 — 暗色模式切换

- [x] 4.1 修改 `frontend/src/main.js`：在 `import './styles/main.css'` **之前**添加 `import 'element-plus/theme-chalk/dark/css-vars.css'`
- [x] 4.2 在 `frontend/src/styles/main.css` 文件末尾追加 `html[data-theme="dark"]` 规则块，覆盖以下变量：`--indigo-900`、`--indigo-500`、`--color-bg-body`、`--color-bg-card`、`--color-bg-hover`、`--color-border`、`--color-text-primary`、`--color-text-secondary`、`--color-text-muted`、`--color-primary-subtle`、`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--shadow-page`
- [x] 4.3 在 `frontend/src/App.vue` `<script setup>` 中添加暗色模式状态：`const isDark = ref(localStorage.getItem('crf_theme') === 'dark')`
- [x] 4.4 在 `frontend/src/App.vue` `<script setup>` 中添加 `applyTheme()` 函数：同步 `document.documentElement.classList.toggle('dark', isDark.value)` 和 `document.documentElement.setAttribute('data-theme', ...)`
- [x] 4.5 在 `frontend/src/App.vue` `<script setup>` 中添加 `toggleTheme()` 函数：切换 `isDark`，持久化到 `localStorage.setItem('crf_theme', ...)`，调用 `applyTheme()`
- [x] 4.6 在 `frontend/src/App.vue` 中新增独立 `onMounted(() => { applyTheme() })` 调用（保持现有 `onMounted(loadProjects)` 不变）
- [x] 4.7 在 `frontend/src/App.vue` 模板区设置按钮（⚙️）**之后**添加暗色切换按钮：`<el-button class="theme-btn" text circle @click="toggleTheme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"><el-icon><Moon v-if="!isDark" /><Sunny v-else /></el-icon></el-button>`
- [x] 4.8 在 `frontend/src/styles/main.css` 中追加 `.theme-btn` 样式：`cursor: pointer; opacity: 0.85; transition: opacity 0.2s;` 及 `:hover` 规则
- [x] 4.9 验证：标题栏 ⚙️ 右侧可见切换按钮（默认 Moon 图标）；点击后 `<html>` 同时拥有 `class="dark"` 和 `data-theme="dark"`；Element Plus 组件视觉变暗；刷新后主题状态保持（SC-4.1 / SC-4.2 / SC-4.3 / SC-4.5）

---

## 验收标准汇总

| SC | 条件 | 关联任务 |
|----|------|----------|
| SC-1.1 | `<project_root>/config.yaml` 存在，`database.path = ./crf_editor.db` | T1.4 |
| SC-1.2 | `config.py` L15 使用 `parents[2]` | T1.1 |
| SC-1.3 | `config.py` L43/L47 默认值为 `./` 前缀 | T1.2 / T1.3 |
| SC-1.4 | 应用启动日志路径包含项目根目录 | T1.7 |
| SC-1.5 | 数据库和上传目录路径基于项目根正确解析 | T1.7 |
| SC-1.6 | `backend/src/config.yaml` 和 `backend/config.yaml` 均已不存在 | T1.5 / T1.6 |
| SC-2.1 | 设置对话框不显示「模板路径」输入框 | T2.2 |
| SC-2.2 | 设置对话框不显示「AI 复核配置」区块 | T3.2 |
| SC-2.3 | 保存设置 HTTP 200，无 422 错误 | T3.4 |
| SC-2.4 | `settingsForm.template_path` 在脚本中仍可访问 | T2.3 |
| SC-2.5 | `testAiConnection` 等 AI 函数仍存在 | T3.3 |
| SC-4.1 | 标题栏 ⚙️ 右侧可见切换按钮，默认 Moon 图标 | T4.7 / T4.9 |
| SC-4.2 | 点击后 `<html>` 同时有 `class="dark"` 和 `data-theme="dark"` | T4.4 / T4.9 |
| SC-4.3 | 暗色模式下 Element Plus 组件视觉变暗 | T4.1 / T4.9 |
| SC-4.4 | 暗色模式下背景色/文字色/边框色符合 dark token 值 | T4.2 / T4.9 |
| SC-4.5 | 刷新后主题状态保持（localStorage 持久化） | T4.5 / T4.9 |
| SC-4.6 | 首次访问（无 localStorage）默认浅色模式 | T4.3 |
| SC-4.7 | 点击两次后回到初始主题（幂等） | T4.4 / T4.5 |
