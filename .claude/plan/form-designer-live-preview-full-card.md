## 📋 实施计划：表单设计器实时预览全卡片铺满

### 需求概述
在 `frontend/src/components/FormDesignerTab.vue` 的“实时预览”区域中：
- 不再显示表单名称；
- 让表单内容铺满整个预览卡片可用区域；
- 不影响字段渲染逻辑、主预览、访视预览和模板预览；
- 实现后用浏览器实际验证设计器中的实时预览效果。

### 任务类型
- [x] 前端
- [ ] 后端
- [ ] 全栈

### 技术方案
采用**设计器预览局部流式布局**方案，只改 `FormDesignerTab.vue` 的设计器 live preview 分支，不改共享 `word-page` / `wp-form-title` 全局规则：

1. **删除设计器 live preview 内部的表单标题节点**，仅影响 `frontend/src/components/FormDesignerTab.vue:1264` 这一处分支；
2. **移除设计器预览专用的缩放逻辑**：删除 `previewScale`、`previewScaledWidth/Height`、`ResizeObserver`、`previewPageStageStyle`、`previewPageTransformStyle` 及相关 watch/lifecycle 粘合代码，避免高度约束把整页缩成“小纸片”；
3. **保留现有 DOM 分层类名**（`designer-preview-pane` / `designer-preview-viewport` / `designer-preview-stage` / `designer-preview-page`），但把它们改成纯 CSS 的静态全宽容器，降低对现有结构测试和样式的冲击；
4. **只在设计器局部样式中覆盖** `.designer-preview-*` 与 `.designer-scaled-word-page`，让预览页宽度变成 `100%`，由 viewport 自己承担滚动；
5. **不修改** `frontend/src/styles/main.css` 中共享的 `.word-page` / `.wp-form-title`，因为 `frontend/src/components/FormDesignerTab.vue:1195` 与 `frontend/src/components/VisitsTab.vue:529` 仍依赖这些共享样式。

这套方案比“继续保留 transform 缩放、仅改按宽度 fit”更贴近“内容占满整个卡片”的目标，同时比“抽象所有预览面的统一模式”更小、更安全。

### 实施步骤
1. **定位并精简设计器预览模板**
   - 文件：`frontend/src/components/FormDesignerTab.vue:1256-1284`
   - 删除设计器实时预览中的 `<div class="wp-form-title">{{ selectedForm.name }}</div>`；
   - 保留 `selectedForm` 空态、`designerPreviewFields` 空态、`designerRenderGroups` 渲染、字段双击 quick edit、备注 aside 分支。

2. **移除设计器预览缩放状态与副作用**
   - 文件：`frontend/src/components/FormDesignerTab.vue:497-568`
   - 删除以下状态和函数：
     - `previewViewportRef`
     - `previewPageRef`
     - `previewScale`
     - `previewScaledWidth`
     - `previewScaledHeight`
     - `previewResizeObserver`
     - `previewPageStageStyle`
     - `previewPageTransformStyle`
     - `disconnectPreviewResizeObserver()`
     - `updatePreviewScale()`
   - 删除仅用于这套缩放逻辑的 `watch([designerPreviewFields, designerLandscapeMode, designerHasPreviewNotes], ...)`、`watch(() => showDesigner.value, ...)` 中的缩放部分，以及 `onBeforeUnmount()` 中对应的 observer 清理。

3. **保留类名，改为静态全宽布局**
   - 文件：`frontend/src/components/FormDesignerTab.vue:1258-1263,1655-1680`
   - 模板层：
     - 去掉 `ref="previewViewportRef"`、`ref="previewPageRef"`；
     - 去掉 `:style="previewPageStageStyle"`、`:style="previewPageTransformStyle"`；
     - 保留 `designer-preview-stage` / `designer-preview-page` 包装层，避免不必要的 DOM 结构回归。
   - 样式层：
     - `.designer-preview-viewport`：保留 `overflow: auto`，将 padding 收紧到 `0` 或最小值；
     - `.designer-preview-stage`：改为 `width: 100%; min-height: 100%;`；
     - `.designer-preview-page`：改为 `position: static; width: 100%; min-height: 100%; transform: none;`；
     - `.designer-scaled-word-page`：改为 `width: 100%; max-width: none; min-height: 100%; margin: 0; box-sizing: border-box;`；
     - `.designer-scaled-word-page.landscape`：同样保持 `width: 100%`；
     - 视实际效果决定是否去掉 `box-shadow` / `border-radius`，优先让内容先铺满。

4. **确保共享预览面不受影响**
   - 只读确认，不修改：
     - `frontend/src/styles/main.css:174-188`
     - `frontend/src/components/VisitsTab.vue:527-532`
     - `frontend/src/components/TemplatePreviewDialog.vue:23-61`
   - 目标是仅让设计器 live preview 改成全卡片布局，其它预览面继续沿用现有纸张式渲染。

5. **同步更新结构测试**
   - 重点文件：`frontend/tests/formFieldPresentation.test.js:112-129`
   - 把原本锁定缩放实现的断言改为锁定新目标：
     - 仍有 `designer-workspace-bottom` / `designer-preview-pane` 结构；
     - 设计器 live preview 不再渲染 `wp-form-title`；
     - 不再存在 `previewScale`、`Math.min(availableWidth / pageWidth, availableHeight / pageHeight, 1)`、`translateX(-50%) scale(...)`；
     - `.designer-scaled-word-page` 使用 `width: 100%` / `max-width: none`。
   - `frontend/tests/orderingStructure.test.js:105-127` 预计无需大改，因为预览区块层级仍保留；若模板调整造成正则失配，再做最小修正。

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue:497-568` | 修改 | 删除设计器预览专用缩放状态、observer 与相关 watch/lifecycle 逻辑 |
| `frontend/src/components/FormDesignerTab.vue:1256-1284` | 修改 | 删除 live preview 内部表单标题，移除 ref/style 绑定，保留预览结构与字段渲染链路 |
| `frontend/src/components/FormDesignerTab.vue:1655-1680` | 修改 | 将设计器预览从绝对定位 + transform 缩放改为静态全宽布局 |
| `frontend/tests/formFieldPresentation.test.js:112-129` | 修改 | 将测试从“固定纸宽 + 缩放”更新为“无标题 + 全宽铺满” |
| `frontend/tests/orderingStructure.test.js:105-127` | 视情况修改 | 仅在模板层级变化导致断言失配时做最小修正 |

### 伪代码
```vue
<!-- FormDesignerTab.vue: 设计器实时预览 -->
<div class="designer-preview-pane">
  <div class="designer-section-title">实时预览</div>
  <div class="designer-preview-viewport">
    <div class="designer-preview-stage">
      <div class="designer-preview-page">
        <div :class="['word-page', 'form-designer-word-page', 'designer-scaled-word-page', { landscape: designerLandscapeMode, 'word-page--with-notes': designerHasPreviewNotes }]">
          <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
          <template v-else>
            <!-- 移除 wp-form-title -->
            <div v-if="!designerPreviewFields.length" class="wp-empty">暂无字段</div>
            <div :class="['wp-body', { 'wp-body--with-notes': designerHasPreviewNotes }]">
              <div class="wp-main">
                <!-- 保持 designerRenderGroups / renderCellHtml / 双击 quick edit 不变 -->
              </div>
              <aside v-if="designerHasPreviewNotes" class="wp-notes">...</aside>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</div>
```

```css
.designer-preview-viewport {
  overflow: auto;
  padding: 0;
}

.designer-preview-stage {
  width: 100%;
  min-height: 100%;
}

.designer-preview-page {
  position: static;
  width: 100%;
  min-height: 100%;
  transform: none;
}

.designer-scaled-word-page,
.designer-scaled-word-page.landscape {
  width: 100%;
  max-width: none;
  min-height: 100%;
  margin: 0;
  box-sizing: border-box;
}
```

### 验证计划
1. **结构测试**
   - `node --test frontend/tests/formFieldPresentation.test.js frontend/tests/orderingStructure.test.js`
2. **构建验证**
   - `cd frontend && npm run build`
3. **浏览器验证（MCP）**
   - 启动前端：`cd frontend && npm run dev`
   - 进入表单设计器，打开一个已有字段的表单；
   - 验收点：
     - 实时预览区域不显示表单名称；
     - 表单内容横向铺满预览卡片主体，不再是缩小后居中的纸页；
     - 长表单通过预览区域自身滚动查看；
     - 普通表单、含 inline/unified 的宽表单、空表单三种场景都正常；
     - 双击预览字段仍能触发 quick edit；
     - 主预览和访视预览仍保留原本标题和样式。

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 设计器 live preview 与其它“纸张式”预览视觉不再完全一致 | 只限定在 `designer-preview-*` 局部样式中调整，保持其它预览面不变 |
| 移除缩放后，宽表单在窄窗口下更依赖滚动 | 用 viewport 承担滚动，并在浏览器验证中覆盖 landscape / inline 场景 |
| 结构测试仍锁定旧实现细节 | 先改 `formFieldPresentation.test.js` 的断言目标，再落代码 |
| 误改共享 `main.css` 造成其它预览面回归 | 明确不改 `frontend/src/styles/main.css:174-188` 的共享规则 |

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d964c-88ba-77f3-8716-6085e2546a85`
- GEMINI_SESSION: `a1dbe006-93f7-4996-895e-2fcd07091456`

### 参考分析会话
- CODEX_ANALYSIS_SESSION: `019d964c-834f-7a90-8475-ebfade58ff63`
- GEMINI_ANALYSIS_SESSION: `15bac3a8-a688-4f81-a7fe-5363ef6c1330`
