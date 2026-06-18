## 📋 实施计划：表单设计器全屏布局与实时预览

### 任务类型
- [x] 前端（→ gemini）
- [ ] 后端（→ codex）
- [ ] 全栈（→ 并行）

### 技术方案
本次改造保持前端闭环，主改 `frontend/src/components/FormDesignerTab.vue:378-413`、`frontend/src/components/FormDesignerTab.vue:493-772`、`frontend/src/components/FormDesignerTab.vue:1029-1130`，复用现有渲染语义，不新增后端接口。

核心做法分为 4 层：

1. **显示顺序层**
   - 新增 `designerVisibleFields` 派生列表，统一按当前表单字段顺序生成连续显示序号 `1..N`。
   - 字段列表展示序号不再直接绑定 `ff.order_index`，而是绑定派生显示序号。
   - 拖拽排序、手动改序号、增删字段后，列表与预览统一使用同一顺序源。

2. **本地草稿覆盖层**
   - 保留 `formFields` 作为“已持久化状态”。
   - 新增 `designerPreviewFields` 作为“即时预览状态”，基于 `formFields` 叠加：
     - 当前选中字段的 `editProp`
     - `pendingFieldPropSnapshots` 中已排队未落库的快照
   - 预览不再等待 autosave 成功后才刷新。

3. **本地备注层**
   - 右侧预览备注直接读取 `formDesignNotes`，不再依赖 `selectedForm.design_notes`。
   - autosave 继续只负责持久化，不负责驱动预览刷新时机。

4. **布局与缩放层**
   - 将设计弹窗改为全屏/等效全窗口布局。
   - 整体改为三栏：字段库 / 中间工作区 / 预览区。
   - 中间工作区再拆为上下：字段列表约 2/3，高度；属性编辑 + 备注约 1/3。
   - 右侧预览通过容器测量 + `transform: scale()` 实现整页缩放适配。

### 实施步骤
1. **抽出设计器可见字段顺序**
   - 在 `frontend/src/components/FormDesignerTab.vue:206-220` 的排序/重排逻辑基础上，新增 `designerVisibleFields` 计算属性。
   - 统一对 `formFields` 做排序和连续编号映射，例如 `_displayOrder: index + 1`。
   - 字段列表中的序号输入框改为展示 `_displayOrder`，手动改序逻辑仍调用现有 `updateFormFieldOrder()`。
   - 预期产物：列表序号始终为当前表单内连续编号。

2. **实现预览覆盖模型**
   - 在 `frontend/src/components/FormDesignerTab.vue:558-575` 的 `buildFieldPropSnapshot()` 基础上，新增预览用快照合成函数。
   - 构建 `pendingSnapshotMap`，把 `pendingFieldPropSnapshots` 变成按 `fieldId` 可查询的 map。
   - 构建 `liveEditSnapshot`，当 `selectedFieldId` 存在时，直接使用当前 `editProp` 生成本地即时快照。
   - 用 `designerPreviewFields` 将 base field、pending snapshot、live snapshot 合并，优先级：`live > pending > persisted`。
   - 预期产物：字段标签、类型、单位、字典、默认值、颜色、横向标记改动时，预览立即变化。

3. **解析字典/单位对象，补齐预览所需嵌套字段**
   - 预览依赖 `field_definition.codelist.options`、`field_definition.unit.symbol`、`field_definition.field_type` 等完整结构。
   - 在合成预览字段时，用 `codelists`、`units` 根据 `editProp.codelist_id` / `unit_id` 解析出完整对象回填。
   - 复用 `frontend/src/composables/useCRFRenderer.js:280-285` 的 `renderCtrlHtml()`，避免另起渲染分支。
   - 预期产物：修改字段类型、单位、选项字典后，预览控件立即按新语义渲染。

4. **将备注预览切换为本地值**
   - 把 `frontend/src/components/FormDesignerTab.vue:409-413` 的预览备注来源从 `selectedForm.design_notes` 切换为 `formDesignNotes`。
   - 保留 `saveDesignNotes()` 与 `onNotesInput()` 现有防抖持久化逻辑。
   - 预期产物：输入备注时，右侧备注区域实时更新。

5. **重构弹窗布局为全屏三栏**
   - 改造 `frontend/src/components/FormDesignerTab.vue:1029-1130`：
     - 弹窗改全屏或等效全窗口 body
     - 左侧保留字段库
     - 中间工作区包含：字段列表（上）+ 属性编辑/备注（下）
     - 右侧新增实时预览区
   - 中间工作区建议用 CSS Grid：`grid-template-rows: minmax(0, 2fr) minmax(0, 1fr)`。
   - 去掉当前备注固定高度模式，让备注输入框在底部区域内 `flex: 1` 填满剩余空间。
   - 预期产物：弹窗占满窗口，中间字段列表明显变窄，右侧预览获得主空间。

6. **实现整页缩放预览**
   - 为右侧预览新增：
     - `previewViewportRef`
     - `previewPageRef`
     - `previewScale`
   - 使用 `ResizeObserver` + `nextTick()` 测量可视区与页面自然尺寸。
   - 按 `Math.min(widthRatio, heightRatio, 1)` 计算缩放比例。
   - 通过 `transform: scale(previewScale)` + `transform-origin: top center` 缩放整页。
   - 预期产物：窗口变化时，右侧整张表单整体缩放适配，不只是局部裁切。

7. **补测试与验证门禁**
   - 补充或更新：
     - `frontend/tests/orderingStructure.test.js`
     - `frontend/tests/quickEditBehavior.test.js`
   - 必测点：
     - 序号来自当前显示顺序
     - 备注预览使用本地 `formDesignNotes`
     - 当前字段的 `editProp` 会即时覆盖到预览模型
     - 预览缩放值不会超过 `1`
   - 运行验证：
     - `node --test frontend/tests/formFieldPresentation.test.js frontend/tests/quickEditBehavior.test.js frontend/tests/orderingStructure.test.js`
     - `cd frontend && npm run build`
   - 备注：`npm run lint` 当前被仓库现有 ESLint/ESM 配置冲突阻断，不作为本次变更成败门禁。

### 伪代码

#### 1. 连续显示顺序
```js
const designerVisibleFields = computed(() => {
  return [...formFields.value]
    .sort((a, b) => {
      const orderA = a?.order_index ?? Number.MAX_SAFE_INTEGER
      const orderB = b?.order_index ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return (a?.id ?? 0) - (b?.id ?? 0)
    })
    .map((field, index) => ({
      ...field,
      _displayOrder: index + 1,
    }))
})
```

#### 2. 本地预览覆盖模型
```js
const pendingSnapshotMap = computed(() => {
  return new Map(
    pendingFieldPropSnapshots.map(snapshot => [snapshot.fieldId, snapshot])
  )
})

const liveEditSnapshot = computed(() => {
  if (!selectedFieldId.value) return null
  return buildFieldPropSnapshot(selectedFieldId.value)
})

function resolveCodelist(codelistId) {
  return codelists.value.find(item => item.id === codelistId) || null
}

function resolveUnit(unitId) {
  return units.value.find(item => item.id === unitId) || null
}

function applyPreviewSnapshot(baseField, snapshot) {
  if (!snapshot) return baseField

  if (baseField.is_log_row) {
    return {
      ...baseField,
      label_override: snapshot.label ?? baseField.label_override,
      bg_color: snapshot.bg_color ?? baseField.bg_color,
      text_color: snapshot.text_color ?? baseField.text_color,
    }
  }

  const fieldDefinition = baseField.field_definition || {}
  const codelist = resolveCodelist(snapshot.codelist_id ?? fieldDefinition.codelist_id)
  const unit = resolveUnit(snapshot.unit_id ?? fieldDefinition.unit_id)

  return {
    ...baseField,
    default_value: snapshot.default_value ?? baseField.default_value,
    inline_mark: snapshot.inline_mark ?? baseField.inline_mark,
    bg_color: snapshot.bg_color ?? baseField.bg_color,
    text_color: snapshot.text_color ?? baseField.text_color,
    field_definition: {
      ...fieldDefinition,
      label: snapshot.label ?? fieldDefinition.label,
      variable_name: snapshot.variable_name ?? fieldDefinition.variable_name,
      field_type: snapshot.field_type ?? fieldDefinition.field_type,
      integer_digits: snapshot.integer_digits ?? fieldDefinition.integer_digits,
      decimal_digits: snapshot.decimal_digits ?? fieldDefinition.decimal_digits,
      date_format: snapshot.date_format ?? fieldDefinition.date_format,
      codelist_id: codelist?.id ?? null,
      unit_id: unit?.id ?? null,
      codelist,
      unit,
    },
  }
}

const designerPreviewFields = computed(() => {
  return designerVisibleFields.value.map(field => {
    const pending = pendingSnapshotMap.value.get(field.id)
    const live = liveEditSnapshot.value?.fieldId === field.id ? liveEditSnapshot.value : null
    return applyPreviewSnapshot(field, live || pending)
  })
})
```

#### 3. 备注即时预览
```js
const designerPreviewNotes = computed(() => String(formDesignNotes.value || '').trim())
const hasPreviewNotes = computed(() => Boolean(designerPreviewNotes.value))
const previewDesignNotesHtml = computed(() => {
  return hasPreviewNotes.value ? escapePreviewText(designerPreviewNotes.value) : ''
})
```

#### 4. 预览缩放
```js
const previewViewportRef = ref(null)
const previewPageRef = ref(null)
const previewScale = ref(1)
let previewResizeObserver = null

function updatePreviewScale() {
  const viewport = previewViewportRef.value
  const page = previewPageRef.value
  if (!viewport || !page) return

  const availableWidth = Math.max(0, viewport.clientWidth - 24)
  const availableHeight = Math.max(0, viewport.clientHeight - 24)
  const pageWidth = page.scrollWidth || page.offsetWidth || 1
  const pageHeight = page.scrollHeight || page.offsetHeight || 1

  previewScale.value = Math.min(
    availableWidth / pageWidth,
    availableHeight / pageHeight,
    1,
  )
}

onMounted(() => {
  previewResizeObserver = new ResizeObserver(() => updatePreviewScale())
  if (previewViewportRef.value) previewResizeObserver.observe(previewViewportRef.value)
})

watch(
  [showDesigner, designerPreviewFields, designerPreviewNotes, landscapeMode],
  async ([visible]) => {
    if (!visible) return
    await nextTick()
    updatePreviewScale()
  },
  { deep: true }
)
```

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue:378-413` | 修改 | 备注状态与预览数据来源切到本地草稿 |
| `frontend/src/components/FormDesignerTab.vue:493-772` | 修改 | 基于 `editProp` / `pendingFieldPropSnapshots` 构建即时预览覆盖层 |
| `frontend/src/components/FormDesignerTab.vue:1029-1130` | 修改 | 重做设计弹窗为全屏三栏布局，并把属性编辑/备注下沉到中列底部 |
| `frontend/src/composables/useCRFRenderer.js:280-285` | 复用 | 继续使用统一控件 HTML 渲染逻辑 |
| `frontend/tests/orderingStructure.test.js` | 修改 | 覆盖连续序号与重排后的显示顺序 |
| `frontend/tests/quickEditBehavior.test.js` | 修改 | 覆盖设计器即时预览与备注预览行为 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 本地预览与持久化状态短时不一致 | 明确预览模型只负责本地草稿镜像，保存仍走原有 autosave 契约 |
| 仅覆盖当前字段会导致切换字段时预览闪回 | 将 `pendingFieldPropSnapshots` 一并叠加进预览模型 |
| 类型/字典切换后预览仍滞后 | 在覆盖层中把 `codelist_id` / `unit_id` 解析回完整对象 |
| 整页缩放后超长表单过小 | 首版先满足整页适配，后续再评估最小缩放阈值或手动缩放控件 |
| 主弹窗全屏后子弹窗层级/滚动异常 | 回归验证字典新增、字典编辑、单位新增、快速编辑等子弹窗 |
| `FormDesignerTab.vue` 继续膨胀 | 仅在必要时抽极小 helper，例如纯 scale 计算函数，避免大范围重构 |

### 验证顺序
1. 先补测试，确保即时预览与连续序号有明确契约。
2. 再改预览覆盖模型与备注本地预览。
3. 然后重构全屏三栏布局与缩放。
4. 最后跑窄验证：相关 node test + `frontend` build。
5. 人工回归：拖拽排序、手动改序号、键盘排序、新增字段、删除字段、编辑标签/类型/字典/单位/默认值/颜色/备注、打开子弹窗。

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d942e-c8d6-7931-861f-2865714c50f5`
- GEMINI_SESSION: `d4c2d785-b84b-41b9-ab04-aad8880b5cca`

### 备注
- Codex architect 尝试会话：`019d9440-5675-7d00-9c17-376b2f878ba0`，输出了有价值的规划证据，但进程以 status 1 结束，未作为最终 SESSION 交接。
- Gemini architect 最后一轮会话：`a899374d-17ea-4e60-82ea-92c5794a36d5`，在生成本计划时仍未返回可用结果，因此本计划以已完成的双模型 analyzer 结果和当前代码证据为主。