## 📋 实施计划：表单设计器单位下拉清空修复

### 任务类型
- [x] 前端
- [ ] 后端
- [ ] 全栈

### 结构化需求增强

#### 目标
修复 `frontend/src/components/FormDesignerTab.vue` 中字段属性编辑面板的“单位”下拉框无法清除单位的问题，使文本/数值字段在点击清除按钮后，能够稳定把单位保存为空。

#### 范围
本次仅处理与该缺陷直接相关的最小范围：
- `frontend/src/components/FormDesignerTab.vue`
- 相关前端回归测试

#### 非目标
- 不修改单位管理 CRUD
- 不重构字段属性自动保存机制
- 不调整后端字段 schema / 数据库结构
- 不扩展到无关属性（如颜色、默认值、字典编辑）

#### 验收标准
- 文本/数值字段已选择单位时，可通过属性面板右侧清除按钮移除单位；
- 自动保存发出的字段定义更新请求中，清空场景显式包含 `unit_id: null`；
- 保存成功并重新回填后，属性面板、字段列表读回结果都保持单位为空；
- 不影响已有“选择单位”“新增单位”“其他属性自动保存”行为；
- 相关前端测试通过；
- 后端现有清空单位契约保持成立。

### 当前代码证据
- 单位下拉位于 `frontend/src/components/FormDesignerTab.vue:1319-1324`，当前仅使用 `clearable`，未指定清空值语义；
- 自动保存时直接透传 `snapshot.unit_id` 到字段定义更新请求：`frontend/src/components/FormDesignerTab.vue:932-935`；
- 请求体由 `JSON.stringify(data)` 序列化：`frontend/src/composables/useApi.js:136-141`；若值为 `undefined`，对应键会被省略；
- 后端字段更新使用 `data.model_dump(..., exclude_unset=True)` 后逐项 `setattr`：`backend/src/routers/fields.py:138-140`，只要前端显式传 `unit_id: null` 就会真正清空；
- 后端已有契约测试覆盖清空单位：`backend/tests/test_fields_router.py:159-184`；
- 当前前端依赖 `element-plus@^2.13.2`：`frontend/package.json:15`。根据 Element Plus 文档，`el-select` 的 clear 默认回退值是 `undefined`，可通过 `value-on-clear=null` 改为 `null`。

### 根因判断
1. `el-select clearable` 在当前配置下，点击清除后给 `v-model` 的空值语义是 `undefined`；
2. `saveFieldProp()` 直接把 `snapshot.unit_id` 放进请求对象；
3. `useApi.put()` 通过 `JSON.stringify` 序列化时会忽略 `undefined` 字段，导致请求体里没有 `unit_id`；
4. 后端因此把这次更新视为“未修改单位”，旧单位值被保留，界面表现为“无法清除单位”。

结论：这是前端空值语义与后端 `null` 清空契约不一致导致的问题，后端本身无需改动。

### 最小修复方案

#### 1. 在单位下拉控件显式指定清空值为 `null`
- 对 `frontend/src/components/FormDesignerTab.vue:1321` 的单位 `el-select` 增加 `:value-on-clear="null"`；
- 让用户点击清除图标时，`editProp.unit_id` 直接进入 `null` 状态，而不是 `undefined`。

#### 2. 在保存链路再做一次 `unit_id` 归一化
- 在 `saveFieldProp()` 构造字段定义更新 payload 时，把 `snapshot.unit_id` 归一化为 `null`；
- 推荐最小写法：`unit_id: snapshot.unit_id ?? null`；
- 这样即使未来有其他路径把 `unit_id` 置成 `undefined`，保存时也不会再次漏发。

#### 3. 在字段回填时统一使用 `null`
- `selectField()` 从 `fd.unit_id` 回填 `editProp.unit_id` 时，改为 `fd.unit_id ?? null`；
- 目的是减少编辑快照里混入 `undefined` 的机会，保持状态语义一致。

### 影响文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue` | 修改 | 修复单位清空值语义与保存 payload |
| `frontend/tests/quickEditBehavior.test.js` | 修改 | 增加单位清空相关源码结构断言 |
| `frontend/tests/formDesignerPropertyEditor.runtime.test.js` | 视需要修改 | 若抽出或复用归一化逻辑，可补运行时断言 |

### 测试建议
1. **结构断言**
   - 断言单位 `el-select` 带有 `:value-on-clear="null"`；
   - 断言 `saveFieldProp()` 提交 `unit_id` 时做了 `null` 归一化；
   - 断言 `selectField()` 回填单位时使用 `fd.unit_id ?? null`。
2. **后端契约**
   - 不新增后端逻辑测试，继续依赖已有 `backend/tests/test_fields_router.py:159-184`。
3. **验证命令**
```bash
node --test frontend/tests/quickEditBehavior.test.js frontend/tests/formDesignerPropertyEditor.runtime.test.js
cd frontend && npm run build
```

### 实施步骤
1. 修改单位下拉控件的清空值配置；
2. 修改 `saveFieldProp()` 的 `unit_id` 提交语义；
3. 修改 `selectField()` 的 `unit_id` 回填语义；
4. 补充前端测试并运行验证。

### 实施原则
- 最小必要修复；
- 以后端现有 `null` 契约为准，不额外扩散修改面；
- 只解决“单位无法清空”，不借机重构整个属性编辑器。