# 表单设计器中下预览与右下备注改版计划

## 📋 实施计划：表单设计器中下预览与右下备注改版

### 任务类型
- [x] 前端 (→ gemini)
- [ ] 后端 (→ codex)
- [ ] 全栈 (→ 并行)

### 增强后的目标
在 `frontend/src/components/FormDesignerTab.vue` 中做一次最小范围的前端布局修复：
1. 将中间工作区改为“上方字段列表/设计画布、下方表单实时预览”的上下布局；
2. 将右侧区域改为“上方属性编辑、下方表单设计备注输入框”的上下布局；
3. 左侧字段库、字段列表拖拽、右侧属性编辑宽度与现有交互保持不变；
4. 设计备注继续通过现有 autosave 链路保存；
5. 仅在表单设计器实时预览中隐藏备注侧栏，不影响备注数据、普通预览或其他页面；
6. 不修改后端接口与数据结构。

### 技术方案
采用“中间下方预览 + 右侧下方备注”方案：
- 保留 `designer-shell` 的四列大框架和当前右侧固定宽度；
- 恢复中间工作区的上下两段布局：上半区承载字段列表/设计画布，下半区承载实时预览；
- `designer-side-pane` 只保留右侧属性编辑与设计备注输入框，不再放实时预览；
- 实时预览继续复用现有 `previewViewportRef` / `previewPageRef` / `ResizeObserver` / `updatePreviewScale()` 缩放逻辑；
- 设计备注仍通过 `formDesignNotes`、`saveDesignNotes()`、`onNotesInput()` 自动保存，但设计器预览专用的备注显示开关固定为 `false`；
- 只更新受布局契约影响的前端源码正则测试。

### 关键依据
- 当前预览缩放依赖 `previewViewportRef`、`previewPageRef`、`previewScale`、`ResizeObserver`：`frontend/src/components/FormDesignerTab.vue:498-565`
- 备注数据与自动保存链路由 `formDesignNotes`、`hasPreviewNotes`、`previewDesignNotesHtml`、`saveDesignNotes()` 驱动：`frontend/src/components/FormDesignerTab.vue:491-597`
- 当前错误实现把预览放进右侧侧栏，和最新目标图不一致；需要改回“中间下方预览、右侧下方备注”的区域分配
- 现有测试对 `designer-preview-pane`、`designer-editor-stack`、`previewPaneWidth = 460`、`designerHasPreviewNotes` 和预览备注 markup 有源码断言：
  - `frontend/tests/orderingStructure.test.js:105-121`
  - `frontend/tests/quickEditBehavior.test.js:16-23`
  - `frontend/tests/formFieldPresentation.test.js:112-136`

### 实施步骤
1. **收口设计器备注显示语义**
   - 将设计器实时预览的备注显示从“跟随 `hasPreviewNotes`”改为“固定隐藏”。
   - 保留 `formDesignNotes`、`previewDesignNotesHtml`、`saveDesignNotes()` 原逻辑不动。
   - 目标：只影响设计器实时预览，不影响备注编辑与自动保存。

2. **重组设计器模板结构**
   - 在 `showDesigner` 对应的 `el-dialog` 内，把 `designer-workspace` 改回上下两段：
     - `designer-workspace-top`：字段列表/设计画布
     - `designer-workspace-bottom`：实时预览
   - `designer-side-pane` 只保留两块：
     - 上：属性编辑
     - 下：设计备注输入框
   - 将现有 `designer-preview-pane` 从右侧侧栏移回中间下方，保留内部实时预览渲染与双击快捷编辑逻辑。

3. **隐藏设计器预览中的备注版式占位**
   - 设计器预览的 `word-page--with-notes`、`wp-body--with-notes` 不再启用。
   - `aside.wp-notes` 在设计器实时预览中不再显示。
   - 普通预览路径保持现状，不做修改。

4. **调整 scoped CSS 布局**
   - 保留 `.designer-shell` 的整体四列结构，右侧列继续固定宽度。
   - `.designer-workspace` 改为双行布局，保证中间下方预览区始终可见。
   - `.designer-side-pane` 改为双行布局，上方属性编辑、下方备注输入框。
   - 保证 `.designer-workspace-bottom`、`.designer-side-pane`、`.designer-editor-stack`、`.designer-notes-card`、`.designer-preview-pane`、`.designer-preview-viewport` 等容器都有 `min-height: 0`，防止缩放失效或滚动溢出。
   - 让中间下方预览和右侧下方备注都由内部滚动层接管溢出，而不是内容把父容器撑开。

5. **更新回归测试契约**
   - `orderingStructure.test.js`：改为断言“中间工作区上下布局 + 右侧属性/备注上下布局”，保留右侧固定宽度契约。
   - `formFieldPresentation.test.js`：改为断言“设计器备注编辑仍存在，设计器实时预览不显示备注”。
   - `quickEditBehavior.test.js`：改为匹配中间下方预览块，保留双击快捷编辑行为断言。

6. **执行验证**
   - 先跑三组相关 Node 测试；
   - 再跑 `frontend` 构建；
   - 最后手工验证全屏设计器的交互、备注 autosave 与预览缩放。

### 伪代码
#### 1) script setup 调整
```js
const previewPaneWidth = 460
const propWidth = computed(() => previewPaneWidth)

const formDesignNotes = ref('')
const previewDesignNotesText = computed(() => String(formDesignNotes.value ?? ''))
const hasPreviewNotes = computed(() => Boolean(previewDesignNotesText.value.trim()))
const previewDesignNotesHtml = computed(() => {
  return hasPreviewNotes.value ? escapePreviewText(previewDesignNotesText.value) : ''
})

// 仅设计器实时预览隐藏备注
const designerHasPreviewNotes = computed(() => false)

watch([designerPreviewFields, designerLandscapeMode, designerHasPreviewNotes], async () => {
  if (!showDesigner.value) return
  await nextTick()
  updatePreviewScale()
}, { deep: true })

// saveDesignNotes / onNotesInput / ResizeObserver / previewScale 保持不变
```

#### 2) 设计器模板重组
```vue
<el-dialog v-model="showDesigner" :title="'设计：' + (selectedForm?.name || '')" fullscreen class="designer-dialog">
  <div class="designer-shell">
    <div class="fd-library designer-library-pane">...</div>
    <div class="fd-panel-resizer" @mousedown="startLibResize"></div>

    <div class="designer-workspace">
      <div class="designer-workspace-top">
        <div class="fd-canvas designer-fields-panel">...</div>
      </div>

      <div class="designer-workspace-bottom">
        <div class="designer-preview-pane">
          <div class="designer-section-title">实时预览</div>
          <div ref="previewViewportRef" class="designer-preview-viewport">
            <!-- 原实时预览结构 -->
          </div>
        </div>
      </div>
    </div>

    <div class="designer-side-pane" :style="{ width: propWidth + 'px' }">
      <div class="designer-editor-card">
        <div class="designer-section-title">属性编辑</div>
        <!-- 原属性编辑表单 -->
      </div>

      <div class="designer-notes-card">
        <div class="designer-section-title">设计备注</div>
        <div class="designer-notes-editor">
          <el-input
            v-model="formDesignNotes"
            type="textarea"
            :autosize="false"
            class="designer-notes-input"
            @input="onNotesInput"
          />
        </div>
      </div>
    </div>
  </div>
</el-dialog>
```

#### 3) scoped CSS 调整
```css
.designer-shell {
  display: grid;
  grid-template-columns: auto 4px minmax(320px, 1fr) 460px;
  height: 100%;
  min-height: 0;
  background: var(--color-bg-body);
}

.designer-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 8px;
  padding: 8px;
}

.designer-workspace-top,
.designer-workspace-bottom {
  min-height: 0;
}

.designer-side-pane {
  min-width: 460px;
  max-width: 460px;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(180px, 1fr);
  gap: 8px;
  padding: 8px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-hover);
}

.designer-editor-card,
.designer-notes-card,
.designer-preview-pane,
.designer-preview-viewport {
  min-height: 0;
}
```

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue:491-597` | 修改 | 收口设计器备注显示语义，保留备注 autosave 与普通预览逻辑 |
| `frontend/src/components/FormDesignerTab.vue:1186-1335` | 修改 | 重组全屏设计器模板：中间下方放预览，右侧下方放设计备注 |
| `frontend/src/components/FormDesignerTab.vue:1456-1618` | 修改 | 更新设计器 scoped 样式，形成中下预览 + 右下备注布局 |
| `frontend/tests/orderingStructure.test.js:105-121` | 修改 | 更新布局结构契约断言 |
| `frontend/tests/quickEditBehavior.test.js:16-23` | 修改 | 调整预览块定位，保留双击快捷编辑行为断言 |
| `frontend/tests/formFieldPresentation.test.js:112-136` | 修改 | 更新设计器备注预览相关断言 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 中间下方预览高度不足导致缩放过小 | 保留 `updatePreviewScale()` 与 `ResizeObserver` 原逻辑，并为中间下方预览区设置最小高度 |
| 右侧备注输入框被属性编辑内容挤出可视区 | 右侧列改为双行布局，并让备注卡内部滚动接管溢出 |
| 设计器预览隐藏备注后仍留下空白版式 | 同步关闭设计器预览里的 `word-page--with-notes` 与 `wp-body--with-notes` 条件 |
| 源码正则测试因 DOM 层级变化误报失败 | 改为断言关键 class / 表达式 / 事件锚点，不再依赖固定闭合层级 |
| 顺手修改状态机导致 autosave 回归 | 不触碰 `saveDesignNotes()`、字段属性 autosave、`designerPreviewFields` 等状态流逻辑 |

### 验证计划
1. 运行：
   ```bash
   node --test frontend/tests/orderingStructure.test.js frontend/tests/quickEditBehavior.test.js frontend/tests/formFieldPresentation.test.js
   ```
2. 构建验证：
   ```bash
   cd frontend && npm run build
   ```
3. 手工回归：
   - 左侧字段库与拖拽、宽度调整正常；
   - 中间上方字段列表/设计画布行为不变；
   - 中间下方可见“实时预览”卡片并能正常缩放；
   - 右侧上方可见“属性编辑”卡片；
   - 右侧下方可见“设计备注”输入框并能自动保存；
   - 双击预览字段仍可快捷编辑；
   - 设计器实时预览中不显示备注侧栏。

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d954d-43cf-7371-aabd-d2d2e6d3bd2a`
- GEMINI_SESSION: `f54ea2d8-4b3f-4d6e-962e-f91778c717ad`

### 分析参考 SESSION_ID
- CODEX_ANALYSIS_SESSION: `019d9547-ab78-7ab3-9885-89a4ab841e68`
- GEMINI_ANALYSIS_SESSION: `1fa601d0-a065-4564-a17b-a6e086365a84`
