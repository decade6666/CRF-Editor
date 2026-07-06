## Critical（必须修复）
1. [frontend/src/composables/acrfAnnotationGeometry.js](/root/github/CRF-Editor/frontend/src/composables/acrfAnnotationGeometry.js:23)、[backend/src/services/export_service.py](/root/github/CRF-Editor/backend/src/services/export_service.py:1066) — 三类默认锚点没有真正落地。前端 `ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND` 把 `field / inline-header / form` 全都设成同一个 `-120000`，后端 `_add_oid_annotation_box()` 也没有 `kind` 维度，只能套用单一默认值。这和 PRD 里“normal field / inline header / form-domain 三类分别设默认 anchor”不一致，当前实现无法满足“默认不遮挡”的验收项。
   建议: 给前后端都引入按 kind 区分的默认 vertical offset，并把导出调用点传入 kind；同步把现有“3 类默认值都相同”的测试改成断言 3 个独立默认锚点。

2. [backend/src/schemas/form.py](/root/github/CRF-Editor/backend/src/schemas/form.py:82)、[backend/src/routers/forms.py](/root/github/CRF-Editor/backend/src/routers/forms.py:274)、[backend/src/services/project_clone_service.py](/root/github/CRF-Editor/backend/src/services/project_clone_service.py:288) — `copy_form` / project clone / project import 的字符串路径没有做 canonicalize+clamp 持久化。`preserve_annotation_positions_storage()` 对字符串输入只做“能否解析”校验，然后直接返回原字符串；因此像 `{"_form":{"y":999}}` 这类可解析但越界的数据会在复制/克隆/导入后继续原样存库，只在 API 响应和导出时被读时 clamp，导致“库里是 999、接口看到是 200”的跨入口不一致。
   建议: 把字符串路径也改成“解析后重新序列化”再落库，确保 copy/clone/import 与 create/PATCH 的存储结果完全一致；补一组回归测试覆盖越界字符串经 copy/clone/import 后被规范化为 `±200`。

## Warning（建议修复）
1. [frontend/src/components/VisitsTab.vue](/root/github/CRF-Editor/frontend/src/components/VisitsTab.vue:451) — `VisitsTab` 的 `mergeFormIntoState()` 先从 `allForms` 取当前表单，再回写到 `visitForms`。`allForms` 没有 `sequence`，所以预览里拖动并 PATCH 成功后，`visitForms` 里的该行会被替换成不带 `sequence` 的对象，导致右侧访视表单列表出现 stale/丢序号状态。
   建议: 合并时优先使用目标集合自身的对象，或对 `visitForms` 回写时保留原 `sequence`；同时补一个前端测试，断言 VisitsTab 持久化后右侧列表序号不丢失。

2. [frontend/src/composables/useAcrfAnnotationDrag.js](/root/github/CRF-Editor/frontend/src/composables/useAcrfAnnotationDrag.js:74)、[frontend/src/composables/useAcrfAnnotationDrag.js](/root/github/CRF-Editor/frontend/src/composables/useAcrfAnnotationDrag.js:186) — 保存失败时会 `break` 退出循环，但不会清空同 Map 中剩余的待保存快照。这样一来，用户看到“保存失败”并被 UI 回滚后，残留的 pending snapshot 可能在下一次 `flushPending()` / `dispose()` 时又被偷偷发出去，形成隐性重放。
   建议: 失败时显式清理当前表单/全部 pending，或者把剩余快照安全回滚并交给调用方决定是否重试；至少为“前一个请求失败 + 后一个快照仍在队列里”的场景补测试。

3. [frontend/src/components/FormDesignerTab.vue](/root/github/CRF-Editor/frontend/src/components/FormDesignerTab.vue:2794)、[frontend/src/components/VisitsTab.vue](/root/github/CRF-Editor/frontend/src/components/VisitsTab.vue:1292)、[.trellis/spec/guides/cross-stack-contracts.md](/root/github/CRF-Editor/.trellis/spec/guides/cross-stack-contracts.md:373) — parity 的“前端预览 JSON 不混入标注文字”目前只停留在文档契约，没有仓内实现或测试兜底。实际 DOM 里 `.wp-acrf-annotation` 是直接挂在 `<td>` / 标题行内部的，任何基于 `cell.textContent` 的预览 JSON 提取器都会把 OID/domain 一起带进去。
   建议: 增加一个正式的预览 JSON 提取 helper 或测试，明确过滤 `.wp-acrf-annotation` descendants；否则严格表格 parity 仍然依赖“外部提取器恰好写对”。

## Info（供参考）
1. [backend/tests/test_permission_guards.py](/root/github/CRF-Editor/backend/tests/test_permission_guards.py:324) — 新增 `PATCH /api/forms/{id}` 的 ownership / auth 隔离已有覆盖：跨用户访问断言 403，未登录断言 401。这一块我没有发现明显缺口。

2. [frontend/src/components/FormDesignerTab.vue](/root/github/CRF-Editor/frontend/src/components/FormDesignerTab.vue:1080)、[frontend/src/components/VisitsTab.vue](/root/github/CRF-Editor/frontend/src/components/VisitsTab.vue:503) — 拖动 wiring、模板片段和 `.wp-acrf-annotation` 样式在两个组件里是大段复制的，后续很容易出现“Designer 修了、Visits 忘了”的漂移。
   建议: 中期最好抽一个共享的 annotation overlay 组件或最少抽共享样式，降低双写维护成本。

---
总计: 2 Critical, 3 Warning, 2 Info

导出/预览公式、单位和符号主链路基本同源，权限隔离也基本到位，但“按 kind 的默认锚点”与“字符串入口的 canonical clamp”这两个关键契约还没有闭环，当前不建议提交（REQUEST_CHANGES，66/100）。