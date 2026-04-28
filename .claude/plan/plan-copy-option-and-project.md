## 📋 实施计划：选项复制按钮 + 项目列表复制图标

### 任务类型
- [x] 前端
- [x] 后端
- [x] 全栈

### 技术方案

复用现有 FieldsTab / FormDesignerTab 的复制模式：前端 `api.post(/copy)` → 后端复制记录并自动去重。

---

### 实施步骤

#### 步骤 1：后端 — 选项复制 API

**文件**：`backend/src/routers/codelists.py` (~L227)

新增端点 `POST /api/codelist-options/{option_id}/copy`：
1. 查询原 option，获取 `codelist_id`, `code`, `decode`, `order_index`
2. `decode` 去重：追加 `_copy` 后缀，若已存在则 `_copy2`, `_copy3`...
3. `code` 保持不变（UniqueConstraint 是 `(codelist_id, code, decode)` 三元组，decode 变了就不冲突）
4. `order_index` = 原值 + 1，后续选项 order_index 全部 +1
5. 创建新记录并返回

#### 步骤 2：后端 — 项目复制 API

**文件**：`backend/src/routers/projects.py`

新增端点 `POST /api/projects/{project_id}/copy`：
1. 查询原项目
2. `name` 去重：追加 `_copy` 后缀
3. 深拷贝所有子资源：codelists → options, forms → fields, visits 等
4. 返回新项目

#### 步骤 3：前端 — 选项复制按钮

**文件**：`frontend/src/components/CodelistsTab.vue`

3a. 新增 `copyOpt` 函数（~L115，`delOpt` 旁）：
```javascript
async function copyOpt(opt) {
  await api.post(`/api/codelist-options/${opt.id}/copy`, {})
  reloadOpts()
  ElMessage.success('复制成功')
}
```

3b. 模板：在"编辑"按钮前增加"复制"按钮
3c. 操作列宽度从 80px → 120px

#### 步骤 4：前端 — 项目列表复制图标

**文件**：`frontend/src/App.vue`

4a. 导入 `CopyDocument` + `Close` 图标
4b. 新增 `copyProject` 函数（~L57）
4c. 替换 `✕` 为两个 `<el-icon>`：CopyDocument + Close，常显

#### 步骤 5：CSS 样式调整

**文件**：`frontend/src/styles/main.css`

- 删除 `.del-btn` hover 隐显样式
- 新增 `.project-actions` + `.action-icon`：常显 opacity 0.5，hover 时 1.0

---

### 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/routers/codelists.py:~L227` | 新增 | copy_option 端点 |
| `backend/src/routers/projects.py` | 新增 | copy_project 端点 |
| `frontend/src/components/CodelistsTab.vue:~L115,L295` | 修改 | copyOpt + 复制按钮 |
| `frontend/src/App.vue:~L57,L409` | 修改 | copyProject + 图标替换 |
| `frontend/src/styles/main.css:~L102` | 修改 | project-actions 样式 |

### 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 项目深拷贝遗漏子资源 | 逐表检查所有外键关系 |
| UniqueConstraint 冲突 | decode 字段去重循环检测 |
| order_index 不连续 | 复制后重排序 |
