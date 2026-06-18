# 📋 实施计划：登录过期改为 6 天 + 恢复表单设计器行内表格标记按钮

## 任务类型
- [x] 前端
- [x] 后端
- [x] 全栈（小范围并行）

## 已确认事实
1. 登录过期时间当前由 `backend/src/config.py:68-71` 的 `AuthConfig.access_token_expire_minutes` 定义，`backend/src/services/auth_service.py:18-27` 通过 `timedelta(minutes=...)` 消费。
2. 项目根 `config.yaml:21-23` 的 `auth` 目前只有 `secret_key`，没有显式 `access_token_expire_minutes`，所以运行时实际在走代码默认值 `30` 分钟。
3. 表单设计器里的 `inline_mark` 逻辑并未消失：
   - 快捷编辑仍保留 `inline_mark`：`frontend/src/components/FormDesignerTab.vue:434-467`
   - 属性编辑仍读取 `inline_mark` 和默认值联动：`frontend/src/components/FormDesignerTab.vue:471-569,854-860`
   - 预览分组仍依赖 `inline_mark`：`frontend/src/composables/formFieldPresentation.js:17-92`
4. 按钮消失确实与 `fd6f387` 有关：该提交删除了字段列表里的 `toggleInline(ff)` 按钮入口，但没有删除后端能力。
5. 后端 `PATCH /api/form-fields/{ff_id}/inline-mark` 仍存在：`backend/src/routers/fields.py:381-393`。
6. 该 PATCH 路由已有关键回归：
   - 切换 `inline_mark` 时保留 `default_value`：`backend/tests/test_fields_router.py:231-267`
   - 权限保护仍在：`backend/tests/test_permission_guards.py:185-186,245-246`

## 综合方案结论
### 后端（采用 Codex 方案）
登录过期时间改为 **配置显式覆盖 6 天**，而不是直接把代码默认值从 30 分钟改成 6 天。

**理由**：
- 最小改动且更可见：把项目运行策略放回 `config.yaml`，排障时一眼能看出当前 TTL。
- 不扩大默认影响面：保留 `AuthConfig` 默认值 30 分钟，避免所有未显式配置环境一起被改成 6 天。
- 测试更清晰：新增“配置覆盖生效”和“JWT exp 接近 6 天”的回归即可。

### 前端（采用最小恢复方案）
在当前字段列表结构内恢复“标记表格/横向布局”按钮，继续走现有 `PATCH /inline-mark` 路由；**不盲目回滚** `fd6f387` 前的整段列表模板。

**理由**：
- 当前字段列表已和旧版不同，保留了新的序号输入、简化布局、快捷编辑增强等改动。
- 现有后端 PATCH 路径已经有更强的默认值保护测试。
- 用户要的是“按钮恢复”，不是“整块 UI 回滚”。

## 恢复范围建议
### 推荐恢复范围（本次直接执行）
1. `config.yaml` 显式加 `auth.access_token_expire_minutes: 8640`
2. 补后端配置/鉴权测试
3. 在 `FormDesignerTab.vue` 当前字段列表中恢复行内切换按钮
4. 补前端针对按钮存在与 PATCH 路由的回归测试

### 若用户要求更大范围恢复，需单独确认
以下改动与旧按钮属于**同区域历史联动项**，但不建议在本次一并恢复：
1. 恢复旧字段列表中的 `ff-type` 类型标记
2. 恢复旧 log 行提示文案/辅助显示
3. 恢复旧删除按钮禁用态处理
4. 恢复旧 `role="listbox" / role="option" / aria-selected` 语义
5. 统一快捷编辑（PUT）与字段列表按钮（PATCH）的 `inline_mark` 更新语义
6. 统一快捷编辑/属性编辑对 `default_value` 的规范化行为

## 实施步骤
### 1. 显式配置登录过期时间为 6 天
修改 `config.yaml` 的 `auth` 段，新增 `access_token_expire_minutes: 8640`。

伪代码：
```yaml
auth:
  secret_key: <existing-secret>
  access_token_expire_minutes: 8640
```

### 2. 补配置加载回归
在 `backend/tests/test_config.py` 增加一条用例，验证 YAML 中的 `auth.access_token_expire_minutes` 能覆盖模型默认值。

伪代码：
```python
def test_load_config_reads_auth_expire_minutes_from_yaml(tmp_path):
    write_yaml(
        """
        auth:
          secret_key: test-secret
          access_token_expire_minutes: 8640
        """
    )
    config = load_config(path)
    assert config.auth.access_token_expire_minutes == 8640
```

### 3. 补 JWT 过期时间语义回归
在 `backend/tests/test_auth.py` 增加一条测试，验证签发 token 的 `exp` 接近当前时间 + 8640 分钟。

做法：patch `src.services.auth_service.get_config`，避免修改共享 fixture。

伪代码：
```python
def test_create_access_token_uses_configured_expire_minutes():
    cfg = AppConfig(auth=AuthConfig(secret_key="test", access_token_expire_minutes=8640))
    before = now_utc_ts()

    with patch("src.services.auth_service.get_config", return_value=cfg):
        token = create_access_token(user_id=1, username="alice")

    payload = jwt.decode(token, cfg.auth.secret_key, algorithms=[cfg.auth.algorithm])
    after = now_utc_ts()

    assert before + 8640 * 60 <= payload["exp"] <= after + 8640 * 60 + 2
```

### 4. 在当前字段列表中恢复最小按钮入口
在 `frontend/src/components/FormDesignerTab.vue` 新增两个小函数：
- `canToggleInline(ff)`：仅允许普通字段切换，不给 `标签` / `日志行` / `is_log_row` 显示按钮
- `toggleInline(ff)`：调用现有 `PATCH /api/form-fields/${ff.id}/inline-mark`

建议复用当前已有的 `confirmFormChange()`（`FormDesignerTab.vue:164-198`）。

伪代码：
```js
function canToggleInline(ff) {
  const type = ff?.field_definition?.field_type || ''
  return !ff?.is_log_row && type !== '标签' && type !== '日志行'
}

async function toggleInline(ff) {
  if (!selectedForm.value || !canToggleInline(ff)) return

  await confirmFormChange()
  await api.patch(`/api/form-fields/${ff.id}/inline-mark`, {
    inline_mark: ff.inline_mark ? 0 : 1,
  })

  api.invalidateCache(`/api/forms/${selectedForm.value.id}/fields`)
  await loadFormFields()

  if (selectedFieldId.value === ff.id) {
    const refreshed = formFields.value.find(item => item.id === ff.id)
    if (refreshed) selectField(refreshed)
  }
}
```

### 5. 把按钮插回当前字段列表，而不是回滚旧模板
按钮插入位置建议：字段标签和删除按钮之间，保留当前顺序输入框与删除按钮结构。

伪代码：
```vue
<el-tooltip v-if="canToggleInline(ff)" content="横向表格标记">
  <el-button
    size="small"
    link
    :type="ff.inline_mark ? 'warning' : ''"
    @click.stop="toggleInline(ff)"
  >
    ⊞
  </el-button>
</el-tooltip>
```

### 6. 补前端回归测试
优先改 `frontend/tests/quickEditBehavior.test.js`，新增对字段列表按钮和 PATCH 路由的断言。

伪代码：
```js
test('field list exposes inline toggle backed by patch endpoint', () => {
  assert.match(formDesignerSource, /function canToggleInline\(/)
  assert.match(formDesignerSource, /function toggleInline\(/)
  assert.match(formDesignerSource, /api\.patch\(`\/api\/form-fields\/\$\{ff\.id\}\/inline-mark`, \{\s*inline_mark:/)
  assert.match(formDesignerSource, /@click\.stop="toggleInline\(ff\)"/)
})

test('inline toggle is hidden for label and log-row fields', () => {
  assert.match(formDesignerSource, /type !== '标签' && type !== '日志行'/)
})
```

### 7. 回归验证
后端：
```bash
cd backend
.venv/Scripts/python -m pytest tests/test_config.py tests/test_auth.py tests/test_fields_router.py tests/test_permission_guards.py
```

前端：
```bash
node --test frontend/tests/quickEditBehavior.test.js frontend/tests/formFieldPresentation.test.js frontend/tests/formDesignerPropertyEditor.runtime.test.js
cd frontend && npm run build
```

## 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `config.yaml:21-23` | 修改 | 显式声明登录 TTL 为 8640 分钟 |
| `backend/tests/test_config.py` | 修改 | 验证 YAML 配置覆盖生效 |
| `backend/tests/test_auth.py:17-54` | 修改 | 新增 JWT `exp` 接近 6 天的断言 |
| `frontend/src/components/FormDesignerTab.vue:164-198` | 复用 | 使用现有 `confirmFormChange()` |
| `frontend/src/components/FormDesignerTab.vue:784-788` | 修改 | 在当前字段列表恢复按钮入口 |
| `frontend/src/components/FormDesignerTab.vue:434-569` | 修改 | 新增 `canToggleInline` / `toggleInline`，并在刷新后同步选中项 |
| `frontend/tests/quickEditBehavior.test.js` | 修改 | 追加字段列表按钮与 PATCH 路由断言 |
| `backend/src/routers/fields.py:381-393` | 只读参考 | 复用现有 PATCH 路由，无需修改 |
| `backend/tests/test_fields_router.py:231-267` | 只读参考 | 已覆盖切换 `inline_mark` 时保留 `default_value` |
| `backend/tests/test_permission_guards.py:185-186,245-246` | 只读参考 | 已覆盖 PATCH 权限保护 |

## 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 直接改代码默认值会扩大所有环境影响 | 只改 `config.yaml`，保留 `AuthConfig` 默认值 30 分钟 |
| 旧按钮条件回滚过头，导致 `标签` 也能切换布局 | 使用 `canToggleInline(ff)` 对齐当前 UI 语义 |
| 切换后右侧属性面板显示旧状态 | `loadFormFields()` 后重新 `selectField(refreshed)` |
| 快捷编辑仍走 PUT、字段列表走 PATCH，语义不完全统一 | 本次范围内显式接受；若后续要统一，再单独确认并实施 |
| `confirmFormChange()` 引入额外交互打断 | 与当前删除/变更流程保持一致，属于最稳妥最小方案 |

## 验收标准
1. `config.yaml` 显式包含 `auth.access_token_expire_minutes: 8640`
2. 新签发 token 的 `exp` 接近 6 天，而不是 30 分钟
3. 表单设计器字段列表重新出现行内“标记表格/横向布局”按钮
4. `标签` / `日志行` 不显示该按钮
5. 通过按钮切换 `inline_mark` 后，预览分组生效、当前选中字段属性面板状态同步
6. 既有 PATCH 回归继续通过，`default_value` 不丢失

## SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d9006-5d5f-78d2-bff5-894ebd6540b1`
- GEMINI_SESSION: `578cfd4a-065c-4cf3-8d2b-d821f09c80e8`
