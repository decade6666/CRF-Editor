# Spec: R7 — 表单右侧预览移除“横向”按钮

## Scope
前端：预览区按钮与状态来源。

## Functional Requirements
- 预览区不再显示“横向”按钮。
- 预览方向只保留自动判定逻辑。
- 不再读取或写入 `localStorage['crf_previewForceLandscape']`。
- 移除按钮后，不改变字段布局数据结构与导出渲染规则。

## Acceptance Criteria
- [ ] 预览区不再出现“横向”按钮
- [ ] 页面刷新后本地存储不会强制影响预览方向
- [ ] 预览渲染正常，无明显布局异常
