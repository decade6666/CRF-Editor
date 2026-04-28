# Spec 02 — UI 清理（模板路径 + AI 复核配置）

## 目标

从设置对话框视图中移除「模板路径」输入控件和「AI 复核配置」区块，同时保留所有字段和逻辑代码，确保后端验证不受影响。

---

## 前提条件

- `frontend/src/App.vue` 使用 Vue 3 Composition API（`<script setup>`）
- `settingsForm` 为 `reactive({...})` 对象，包含 `template_path`、`ai_enabled`、`ai_api_url`、`ai_api_key`、`ai_model`、`ai_format` 等字段
- 后端 `PUT /api/settings` 要求 `template_path` 必填（`is_safe_path()` 验证）
- `saveSettings()` 当前传递所有 `settingsForm` 字段，**不得改动**

---

## 变更规格

### 2.1 隐藏「模板路径」输入控件

**位置**：App.vue 模板区，设置对话框内

```html
<!-- Before -->
<el-form-item label="模板路径">
  <el-input v-model="settingsForm.template_path" placeholder="请输入模板 .db 文件的绝对路径" clearable />
</el-form-item>

<!-- After -->
<el-form-item v-if="false" label="模板路径">
  <el-input v-model="settingsForm.template_path" placeholder="请输入模板 .db 文件的绝对路径" clearable />
</el-form-item>
```

**不变**：
- `settingsForm.template_path` 字段定义保留
- `openSettings()` 中 `settingsForm.template_path = data.template_path || ''` 保留
- `saveSettings()` 中 `template_path: settingsForm.template_path` 保留

---

### 2.2 隐藏「AI 复核配置」区块

**位置**：App.vue 模板区，模板路径下方

**隐藏范围**（用 `<template v-if="false">` 包裹）：

```html
<!-- Before -->
<el-divider>AI 复核配置</el-divider>
<el-form-item label="启用AI复核">
  <el-switch v-model="settingsForm.ai_enabled" />
</el-form-item>
<el-form-item label="API URL">
  <el-input v-model="settingsForm.ai_api_url" ... />
</el-form-item>
<el-form-item label="API Key">
  <el-input v-model="settingsForm.ai_api_key" type="password" ... />
</el-form-item>
<el-form-item label="模型">
  <el-input v-model="settingsForm.ai_model" ... />
</el-form-item>
<el-form-item v-if="settingsForm.ai_enabled">
  <el-button ... @click="testAiConnection" ...>测试连接</el-button>
  ...
</el-form-item>

<!-- After -->
<template v-if="false">
  <el-divider>AI 复核配置</el-divider>
  <el-form-item label="启用AI复核">
    <el-switch v-model="settingsForm.ai_enabled" />
  </el-form-item>
  <el-form-item label="API URL">
    <el-input v-model="settingsForm.ai_api_url" ... />
  </el-form-item>
  <el-form-item label="API Key">
    <el-input v-model="settingsForm.ai_api_key" type="password" ... />
  </el-form-item>
  <el-form-item label="模型">
    <el-input v-model="settingsForm.ai_model" ... />
  </el-form-item>
  <el-form-item v-if="settingsForm.ai_enabled">
    <el-button ... @click="testAiConnection" ...>测试连接</el-button>
    ...
  </el-form-item>
</template>
```

**不变**：
- `settingsForm` 中所有 AI 字段定义保留
- `testAiConnection()` 函数保留
- `aiTestResult`、`aiTestLoading` 响应式变量保留
- `saveSettings()` 中 AI 字段传递保留

---

## 验证条件（Success Criteria）

| ID | 条件 |
|----|------|
| SC-2.1 | 打开设置对话框，不显示「模板路径」输入框 |
| SC-2.2 | 打开设置对话框，不显示「AI 复核配置」分隔线及其下所有字段 |
| SC-2.3 | 点击「确定」保存设置，HTTP 状态 200，无 422 错误 |
| SC-2.4 | `settingsForm.template_path` 在 script setup 中仍可访问（未被删除）|
| SC-2.5 | AI 相关函数（testAiConnection 等）在 script setup 中仍存在 |

---

## 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| template_path 未随请求发送导致 422 | 高 | saveSettings() 保持不变；SC-2.3 显式验证 |
| v-if="false" 被后续 linter 优化删除 | 低 | 添加注释 `<!-- 暂时隐藏，保留代码 -->` 标注意图 |
