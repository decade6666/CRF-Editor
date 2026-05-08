## 📋 实施计划：设计器标签多行与快捷编辑默认值对齐

### 任务类型
- [x] 前端 (→ gemini)
- [ ] 后端 (→ codex)
- [ ] 全栈 (→ 并行)

### 目标
1. 当字段类型为“标签”时，字段标签支持多行输入。
2. 右侧预览区双击打开的快捷编辑弹窗，其“默认值”控件与主属性编辑器保持同一套字段类型限制。
3. 标签字段的多行标签文本在设计器预览与模板预览中按换行显示。
4. 不修改后端 API、数据库结构或无关字段行为。

### 现状证据
- 快捷编辑当前无条件显示并提交默认值：`frontend/src/components/FormDesignerTab.vue:609`、`frontend/src/components/FormDesignerTab.vue:622`、`frontend/src/components/FormDesignerTab.vue:1379`
- 主属性编辑器已复用默认值支持规则：`frontend/src/components/FormDesignerTab.vue:1327`
- 默认值支持规则与归一化逻辑在共享 composable 中：`frontend/src/composables/useCRFRenderer.js:222`、`frontend/src/composables/useCRFRenderer.js:227`
- 标签输入当前仍是单行输入：`frontend/src/components/FormDesignerTab.vue:1269`、`frontend/src/components/FormDesignerTab.vue:1292`、`frontend/src/components/FormDesignerTab.vue:1370`
- 预览标签文本直接输出字符串，当前样式未保留换行：`frontend/src/composables/formFieldPresentation.js:8`、`frontend/src/styles/main.css:189`
- 模板预览复用了同类标签渲染结构：`frontend/src/components/TemplatePreviewDialog.vue:35`、`frontend/src/components/TemplatePreviewDialog.vue:50`
- 现有前端回归测试主要通过源码结构断言约束模板：`frontend/tests/quickEditBehavior.test.js:41`、`frontend/tests/formFieldPresentation.test.js:95`

### 技术方案
- **输入层**：仅对 `field_type === '标签'` 的“变量标签”输入框切换为 `textarea`，主属性编辑器与快捷编辑同步对齐。
- **规则层**：快捷编辑不新增新规则，直接复用 `isDefaultValueSupported(fieldType, inlineMark)` 与 `normalizeDefaultValue(defaultValue, singleLine)`。
- **提交层**：快捷编辑保存时按支持性判断归一化默认值；不支持的字段类型提交 `null`，与主属性编辑器一致。
- **展示层**：不给 `getFormFieldDisplayLabel()` 增加 HTML 逻辑，只在标签字段的预览单元格增加专用 class，通过 CSS 保留换行，避免扩大影响面。
- **测试层**：先更新/补充前端测试，再实施模板与样式改动，保证快捷编辑和预览行为被锁定。

### 实施步骤
1. **先补测试约束（RED）**
   - 更新 `frontend/tests/quickEditBehavior.test.js`：
     - 断言快捷编辑默认值表单项受 `isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark))` 控制。
     - 断言快捷编辑保存时不再直接提交 `quickEditProp.default_value || null`，而是先经过支持性判断与 `normalizeDefaultValue(...)`。
     - 断言 `quickEditProp.label` 在 `标签` 类型下使用多行输入。
   - 更新 `frontend/tests/formFieldPresentation.test.js`：
     - 断言设计器预览和模板预览中的标签字段使用专用多行 class 或对应样式。
     - 断言 `main.css` 中存在标签预览换行样式。

2. **收口快捷编辑默认值规则（GREEN）**
   - 修改 `frontend/src/components/FormDesignerTab.vue:609-640`：
     - 在 `saveQuickEdit()` 中先计算：
       - `supportsDefaultValue = isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark))`
       - `normalizedDefaultValue = supportsDefaultValue ? normalizeDefaultValue(quickEditProp.default_value, !quickEditProp.inline_mark) : ''`
     - `payload.default_value` 改为 `normalizedDefaultValue || null`。
   - 修改 `frontend/src/components/FormDesignerTab.vue:1368-1382`：
     - 将快捷编辑“默认值”表单项改为条件渲染。
     - 输入形态与主属性编辑器一致：
       - `inline_mark === true` → textarea
       - `inline_mark === false` → text

3. **放开标签字段多行输入**
   - 修改 `frontend/src/components/FormDesignerTab.vue:1269`、`frontend/src/components/FormDesignerTab.vue:1292`、`frontend/src/components/FormDesignerTab.vue:1370`：
     - `字段类型 === 标签` 时，`label` 输入框改为 `textarea`。
     - 其它字段类型保持单行输入，避免扩大影响。

4. **让标签字段预览保留换行**
   - 修改 `frontend/src/components/FormDesignerTab.vue:1180-1193` 与 `frontend/src/components/FormDesignerTab.vue:1245-1249`：
     - 给标签字段所在的 full-row 预览单元格增加专用 class，例如 `wp-structure-label--multiline`。
   - 修改 `frontend/src/components/TemplatePreviewDialog.vue:38-52`：
     - 为模板预览中的标签字段应用同一专用 class。
   - 修改 `frontend/src/styles/main.css:189-205`：
     - 仅对上述专用 class 增加 `white-space: pre-wrap;` 与必要的 `overflow-wrap: anywhere;`。
     - 不全局修改 `.word-page td`，避免波及默认值/控件渲染。

5. **执行验证与回归检查**
   - 在 `frontend/` 下运行：
     - `node --test tests/quickEditBehavior.test.js tests/formFieldPresentation.test.js`
     - `npm run build`
   - 人工核对场景：
     - 标签字段输入多行标签后，设计器预览与模板预览均按换行显示。
     - 日期/时间/日期时间字段在快捷编辑中不再显示默认值输入框。
     - 文本/数值字段的快捷编辑默认值行为与主属性编辑器一致。
     - 横向字段保留现有多行默认值能力。

### 伪代码
```vue
const quickEditSupportsDefaultValue = isDefaultValueSupported(
  quickEditProp.field_type,
  Boolean(quickEditProp.inline_mark),
)

const normalizedQuickEditDefaultValue = quickEditSupportsDefaultValue
  ? normalizeDefaultValue(quickEditProp.default_value, !quickEditProp.inline_mark)
  : ''

const payload = {
  label_override: quickEditProp.label,
  bg_color: quickEditProp.bg_color || null,
  text_color: quickEditProp.text_color || null,
  inline_mark: quickEditProp.inline_mark ? 1 : 0,
  default_value: normalizedQuickEditDefaultValue || null,
}
```

```vue
<el-form-item label="变量标签">
  <el-input
    v-model="editProp.label"
    :type="editProp.field_type === '标签' ? 'textarea' : 'text'"
    :autosize="editProp.field_type === '标签' ? { minRows: 2, maxRows: 4 } : undefined"
  />
</el-form-item>

<el-form-item
  v-if="isDefaultValueSupported(quickEditProp.field_type, Boolean(quickEditProp.inline_mark))"
  label="默认值"
>
  <el-input
    v-model="quickEditProp.default_value"
    :type="quickEditProp.inline_mark ? 'textarea' : 'text'"
    :autosize="quickEditProp.inline_mark ? { minRows: 1, maxRows: 3 } : undefined"
  />
</el-form-item>
```

```css
.word-page .wp-structure-label--multiline {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue:609-640` | 修改 | 收口快捷编辑默认值保存逻辑，复用共享规则 |
| `frontend/src/components/FormDesignerTab.vue:1269-1334` | 修改 | 主属性编辑器：标签字段标签改为多行输入，默认值逻辑保持现有规则 |
| `frontend/src/components/FormDesignerTab.vue:1368-1382` | 修改 | 快捷编辑：标签字段标签改为多行输入，默认值条件显示 |
| `frontend/src/components/FormDesignerTab.vue:1176-1193` | 修改 | 主预览 normal/unified 分支的标签字段单元格增加多行 class |
| `frontend/src/components/FormDesignerTab.vue:1244-1249` | 修改 | 设计器实时预览中同步标签字段多行 class |
| `frontend/src/components/TemplatePreviewDialog.vue:33-58` | 修改 | 模板预览同步标签字段多行 class |
| `frontend/src/styles/main.css:189-205` | 修改 | 为标签字段预览单元格添加换行样式 |
| `frontend/src/composables/useCRFRenderer.js:222-231` | 复用 | 不改规则，只复用 `isDefaultValueSupported` / `normalizeDefaultValue` |
| `frontend/tests/quickEditBehavior.test.js` | 修改 | 锁定快捷编辑默认值限制与标签多行输入行为 |
| `frontend/tests/formFieldPresentation.test.js` | 修改 | 锁定多行标签预览样式与模板结构 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 快捷编辑隐藏默认值后，历史上不支持类型的旧默认值会在下一次保存时被清掉 | 这是与主属性编辑器对齐的既有规则，按“规则统一”处理，不新增特殊兼容分支 |
| 预览换行样式若全局下沉到 `.word-page td`，会影响其它控件/默认值渲染 | 仅给标签字段单元格增加专用 class，不做全局 white-space 改动 |
| 源码结构测试对模板非常敏感，容易回归失败 | 先改测试，再改模板；保持断言围绕规则而非固定字面片段 |
| 标签字段可能存在历史脏数据（如异常 inline_mark） | 本次只处理前端编辑/预览闭环，不扩展到历史数据清洗 |

### 验证命令
```bash
cd frontend
node --test tests/quickEditBehavior.test.js tests/formFieldPresentation.test.js
npm run build
```

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d9961-0faa-7613-8d86-8fb762819bdd`
- GEMINI_SESSION: `b7ce9c11-b19d-4e52-bdbb-c02f1c826554`
