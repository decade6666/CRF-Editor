# fix: 导入模板预览按钮首次点击无反应

## Goal

修复"导入模板"弹窗中点击表单行后面的"预览"按钮无反应、Python 控制台无日志的问题。让首次点击即可正常打开预览并加载表单字段。

## What I already know

- 入口：`App.vue:914` 导入模板按钮 → `openImportDialog`；弹窗 `App.vue:1062`，表单行预览按钮 `App.vue:1084` `@click.stop="openTemplatePreview(data)"`。
- `openTemplatePreview` (`App.vue:640-646`)：设置 formId/formName，并在同一同步 tick 把 `hasOpenedTemplatePreview`(v-if 懒挂载开关) 和 `showTemplatePreview`(modelValue) 同时置 true。
- `TemplatePreviewDialog.vue:302` 的 `watch(() => props.modelValue, …)` 是**非 immediate**，且 `loadFields()` 仅在该 watch 回调内调用。
- 组件经 `v-if="hasOpenedTemplatePreview"` (`App.vue:1106`) 懒挂载，挂载发生在 modelValue 已为 true 之后 → watch 注册时初值即 true → 永不触发 `false→true` → `loadFields()` 不执行 → 无 API 请求 → 后端无日志。
- `visible = ref(props.modelValue)` (`TemplatePreviewDialog.vue:155`)，对话框框架会显示，但内容空白。

## Root Cause (确认)

非 immediate 的 modelValue watch + v-if 懒挂载时序耦合：组件在 modelValue 已为 true 后才挂载，watch 错过首次跳变，导致 `loadFields()` 不执行。表现为首次预览空白/无反应、无后端日志；关闭后再次点击因产生 false→true 跳变而恢复正常。

## Requirements

- 首次点击"预览"即触发 `loadFields()`，正常请求 `/api/projects/{pid}/import-template/form-fields?form_id={fid}`。
- 对话框 `visible` 与 `modelValue` 在挂载时即保持同步。
- 不破坏后续多次点击预览、切换不同表单、关闭重开的既有行为。

## Acceptance Criteria

- [ ] 打开导入模板弹窗后，首次点击任一表单"预览"，对话框打开且加载字段，后端有对应请求日志。
  - Source-level behavior regression: `frontend/tests/appTabLazyLoad.test.js` mounts the real `TemplatePreviewDialog.vue` via Vite SSR with `modelValue: true` already set after lazy mount, and verifies the first mount requests `/api/projects/11/import-template/form-fields?form_id=22`.
  - Browser runtime attempt on `http://0.0.0.0:8888` reached the import-template dialog path, but local template loading is currently blocked before the preview button appears: `POST /api/projects/2/import-template` returned 400 because the template library `form_field` table is missing `label_bold, label_font_size`. No database mutation was performed during validation.
- [ ] 连续预览不同表单、关闭后重新预览均正常。
  - Existing `modelValue` false→true watcher path is unchanged; the new `immediate: true` only adds setup-time consumption for the lazy-mounted initial-open case, but browser runtime verification is blocked by the same local template-library compatibility issue.
- [x] 现有 TemplatePreviewDialog 相关前端测试通过。
  - `node --test tests/appTabLazyLoad.test.js` passed after replacing the source-string assertion with behavior-level coverage.

## Technical Approach

首选最小修复：给 `TemplatePreviewDialog.vue:302` 的 watch 增加 `{ immediate: true }`，使挂载时即读取 `modelValue` 并在为 true 时同步 `visible` 并调用 `loadFields()`。`loadFields` 为函数声明（已提升），immediate 回调中可调用。

## Decision (ADR-lite)

- **Context**: 懒挂载 + 非 immediate watch 导致首次加载丢失。
- **Decision**: watch 加 `immediate: true`（候选 B：移除 `v-if` 懒挂载；候选 C：App.vue 中 nextTick 后再置 modelValue）。
- **Consequences**: 保留懒加载结构，改动局限于单文件单行；需回归首开/重开/切换三场景。

## Out of Scope

- 预览渲染样式、列宽规划逻辑。
- Word 导入预览 (`openDocxCompare`) 与访视表单预览 (`VisitsTab`) ——不同路径，本次不动。

## Technical Notes

- 关联文件：`frontend/src/App.vue`、`frontend/src/components/TemplatePreviewDialog.vue`。
- 相关测试：`frontend/tests/` 中 TemplatePreviewDialog / 导入相关用例（待确认具体文件）。
