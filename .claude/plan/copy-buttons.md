## 实施计划：复制按钮（选项行 + 项目列表）

### 任务类型
- [x] 前端
- [x] 后端
- [x] 全栈

### 技术方案

两个独立的复制功能，复用现有 copy 端点模式（`POST /<resource>/{id}/copy` → 201）。

### 实施步骤

#### Step 1：后端 — 选项复制端点

**文件**: `backend/src/routers/codelists.py`
**操作**: 新增端点

```python
@router.post("/codelist-options/{opt_id}/copy", response_model=CodeListOptionResponse, status_code=201)
def copy_codelist_option(opt_id: int, session: Session = Depends(get_session)):
    src = session.get(CodeListOption, opt_id)
    if not src:
        raise HTTPException(404, "选项不存在")
    # UniqueConstraint on (codelist_id, code, decode) -> 修改 decode
    base = src.decode + "_copy"
    candidate = base
    idx = 1
    while session.scalar(select(CodeListOption).where(
        CodeListOption.codelist_id == src.codelist_id,
        CodeListOption.code == src.code,
        CodeListOption.decode == candidate
    )):
        candidate = f"{base}{idx}"
        idx += 1
    new_opt = CodeListOption(
        codelist_id=src.codelist_id,
        code=src.code,
        decode=candidate,
        trailing_underscore=src.trailing_underscore,
        order_index=OrderService.get_next_order(session, CodeListOption, CodeListOption.codelist_id == src.codelist_id)
    )
    session.add(new_opt)
    session.commit()
    session.refresh(new_opt)
    return new_opt
```

#### Step 2：后端 — 项目复制端点

**文件**: `backend/src/routers/projects.py`
**操作**: 新增端点

```python
@router.post("/projects/{project_id}/copy", response_model=ProjectResponse, status_code=201)
def copy_project(project_id: int, session: Session = Depends(get_session)):
    src = session.get(Project, project_id)
    if not src:
        raise HTTPException(404, "项目不存在")
    base = src.name + "_copy"
    candidate = base
    idx = 1
    while session.scalar(select(Project).where(Project.name == candidate)):
        candidate = f"{base}{idx}"
        idx += 1
    new_proj = Project(
        name=candidate,
        version=src.version,
        trial_name=src.trial_name,
        crf_version=src.crf_version,
        crf_version_date=src.crf_version_date,
        protocol_number=src.protocol_number,
        sponsor=src.sponsor,
        data_management_unit=src.data_management_unit,
    )
    session.add(new_proj)
    session.commit()
    session.refresh(new_proj)
    return new_proj
```

> 浅拷贝：仅复制项目元数据，不复制子记录（visits/forms/fields/codelists）。

#### Step 3：前端 — 选项复制按钮

**文件**: `frontend/src/components/CodelistsTab.vue`
**操作**: 修改

1. 新增 `copyOpt` 函数（参考 `FieldsTab.copyField` 模式）：
```javascript
async function copyOpt(opt) {
  try {
    await api.post(`/api/codelist-options/${opt.id}/copy`, {})
    reloadOpts()
    ElMessage.success('复制成功')
  } catch (e) { ElMessage.error(e.message) }
}
```

2. 在选项行模板中，**编辑按钮左边**插入复制按钮：
```html
<el-button size="small" link @click="copyOpt(element)">复制</el-button>
<el-button size="small" link @click="openEditOpt(element)">编辑</el-button>
<el-button type="danger" size="small" link @click="delOpt(element)">删除</el-button>
```

3. 操作列宽度从 `80px` 调整为 `120px`。

#### Step 4：前端 — 项目列表复制图标

**文件**: `frontend/src/App.vue`
**操作**: 修改

1. 新增 `copyProject` 函数：
```javascript
async function copyProject(p) {
  try {
    const { data } = await api.post(`/api/projects/${p.id}/copy`, {})
    await loadProjects()
    selectProject(data)
    ElMessage.success('复制成功')
  } catch (e) { ElMessage.error(e.message) }
}
```

2. 替换模板中的 `✕` 文本为 Element Plus 图标，添加复制图标（**在删除图标左边**）：
```html
<span class="project-actions">
  <el-icon class="action-icon copy-icon" @click.stop="copyProject(p)"><CopyDocument /></el-icon>
  <el-icon class="action-icon del-icon" @click.stop="deleteProject(p)"><Close /></el-icon>
</span>
```

#### Step 5：CSS 样式

**文件**: `frontend/src/styles/main.css`
**操作**: 修改

将 `.del-btn` 的 hover 隐藏样式替换为 `.project-actions` 常显样式：

```css
.project-item .project-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.project-item .action-icon {
  font-size: 14px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}
.project-item .action-icon:hover { opacity: 1; }
.project-item .copy-icon { color: var(--el-color-primary); }
.project-item .del-icon { color: var(--color-danger); }
```

### 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| backend/src/routers/codelists.py | 新增端点 | POST /codelist-options/{id}/copy |
| backend/src/routers/projects.py | 新增端点 | POST /projects/{id}/copy |
| frontend/src/components/CodelistsTab.vue | 修改 | 添加复制按钮+函数，调整列宽 |
| frontend/src/App.vue | 修改 | 添加复制图标+函数，替换X为Close图标 |
| frontend/src/styles/main.css | 修改 | .del-btn -> .project-actions 常显样式 |

### 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| UniqueConstraint 冲突 | decode 加 _copy 后缀 + 递增编号 |
| 操作列宽度不够 | 80px -> 120px |
| 删除旧 .del-btn 样式遗留引用 | 全局搜索确认无其他引用 |
