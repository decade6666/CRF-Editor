**变更**
- 这次实际改动的核心代码在 [VisitsTab.vue](/root/github/CRF-Editor/frontend/src/components/VisitsTab.vue:1) 和 [acrfViewToggle.test.js](/root/github/CRF-Editor/frontend/tests/acrfViewToggle.test.js:1)，文档同步到了 [README.md](/root/github/CRF-Editor/README.md:1)、[README.en.md](/root/github/CRF-Editor/README.en.md:1)、[.claude/CLAUDE.md](/root/github/CRF-Editor/.claude/CLAUDE.md:1)、[frontend/.claude/CLAUDE.md](/root/github/CRF-Editor/frontend/.claude/CLAUDE.md:1)、[.claude/index.json](/root/github/CRF-Editor/.claude/index.json:1)、[cross-stack-contracts.md](/root/github/CRF-Editor/.trellis/spec/guides/cross-stack-contracts.md:1)，另外按仓库 workflow 追加了 `.context/current/branches/draft/session.log`。
- `VisitsTab` 的接线方式是直接复用 PR2 的 `buildAnnotationStyle` 和 `useAcrfAnnotationDrag`，没有重写拖动逻辑。预览弹窗新增与设计器共享的 `crf_view_mode`，aCRF 视图下在 form title、normal/unified field、inline header 上渲染同款红色标注；拖动门控也和设计器一致，只在 `aCRF + editMode + 有 formId + 有持久化 key` 时允许，且只走竖直方向。
- 标注持久化仍写同一份 `Form.annotation_positions`。我在 `VisitsTab` 内做了一个最小的 `mergeFormIntoState`，把乐观更新/保存成功后的结果同步回 `allForms`、`visitForms`、`matrixData.forms` 和当前 `formPreviewForm`，因此设计器和访视预览现在读写的是同一存储。关闭预览和组件卸载时也会 flush/dispose 保存队列。
- 文档上，README 中补了“aCRF 标注竖直拖动 + 持久化 + 预览/导出样式统一”；root/frontend CLAUDE 补了 VisitsTab 接线、两个 composable、测试计数与 change log；`cross-stack-contracts.md` 新增了 “aCRF 标注几何契约” 一节，明确了 `_form` / `variable_name` key 语义、`0.01cm` 整数单位、`[-200,200]` clamp、`posOffset = -120000 + Δy*3600`、`+Δy` 向下，以及 `1in = 914400 EMU = 96px = 72pt` 的换算关系。

**Parity 与测试**
- parity 只读复核结论是安全的。后端 [word_table_parity.py](/root/github/CRF-Editor/backend/src/services/word_table_parity.py:1) 只抽 `Table.cell.text`，导出的 aCRF 标注则是 `w:drawing/wp:anchor` 浮动框，不会进入严格表格文本比对；我也把“preview JSON 提取时必须忽略 `.wp-acrf-annotation`”写进了 cross-stack contract，避免前端提取脚本未来把标注文字混进 cell text。
- 前端全量：`cd frontend && node --test tests/*.test.js` 跑完结果是 `39 passed, 1 failed`。失败项仍是既有的 `tests/browserPerfBaselineScript.test.js`，和这次 VisitsTab/aCRF 接线无直接关联。
- 后端指定回归：`cd backend && python3 -m pytest -q tests/test_word_table_parity.py tests/test_export_acrf.py tests/test_export_service.py tests/test_export_unified.py` 结果是 `72 passed, 3 xfailed`，通过。
- lint：`cd frontend && npm run lint` 已运行，结果是 `0 errors, 2031 warnings`。没有新增 error，但仓库里仍有大量既有 warning。
- 额外校验：`git diff --check` 通过。

**未决**
- 目前唯一未绿的是仓库既有的 `frontend/tests/browserPerfBaselineScript.test.js`；我复跑单测和全量前端时它都还是失败。
- 没有执行任何 git 写操作；也没有做全文件格式化或行尾归一化，只用 `apply_patch` 做了局部编辑，diff 没出现整文件换行风格 churn。