# Implement — Word导入AI建议接受开关

> 关联 `./prd.md`、`./design.md`。TDD 优先，前端 `node:test` + 后端 `pytest`。

## 执行顺序（含验证与回滚点）

### 阶段 0：后端 index 契约对齐（先做，保证前端预览=落库一致）
1. **RED**：在 `backend/tests/test_ai_review_service.py` 增用例——含 `log_row` 的表单，断言 AI 建议 `index` 对齐“过滤 log_row 后的真实字段序号”。
2. **GREEN**：改 `ai_review_service._build_user_prompt` 与 `_review_one`，对“过滤 log_row 后的真实字段列表”重排 `enumerate`；`fields[s["index"]]` 用同一份过滤列表。
3. **RED**：在后端 import 覆盖用例中增——含 log_row 的表单，`ai_overrides`（按过滤后序号）命中并落库到正确字段类型。
4. **GREEN**：改 `docx_import_service._create_form`，用 `real_index`（遇 log_row 不自增）匹配 `field_overrides`，替换原含 log_row 的 `fi`。
5. **验证**：`cd backend && python -m pytest tests/test_ai_review_service.py tests/test_docx_import_contract.py -q` + 相关 import 用例。
   - 回滚点 A：阶段 0 可独立回退，不影响前端。

### 阶段 1：前端纯函数 helper（TDD）
6. **RED**：新增 `frontend/tests/docxAiSuggestionAcceptance.test.js`，覆盖 design §8 全部纯函数用例（默认关闭、三级 toggle、全选/半选派生、reconcile、buildAiOverridesPayload 过滤）。
7. **GREEN**：新增 `frontend/src/composables/docxAiSuggestionOverrides.js`，实现 `reconcileAcceptedOverrides` / `buildAiOverridesPayload` / 选中态派生纯函数 + 前端 `VALID_FIELD_TYPES` 常量（注释同步约定）。
8. **验证**：`cd frontend && node --test tests/docxAiSuggestionAcceptance.test.js`。

### 阶段 2：App.vue 状态与接线
9. 新增 `acceptedAiOverrides` ref；在 4 个生命周期锚点清空（design §3 表）。
10. `mergeAiSuggestions()` 后接 `reconcileAcceptedOverrides`。
11. 加三级操作方法（单条/单表单/全部）与向 DocxCompareDialog 的 props/emit 接线；Step 2 模板加“全部表单：全接受/全取消”控件（无建议置灰）。
12. `executeImportWord()` 用 `buildAiOverridesPayload` 按需追加 `ai_overrides`。

### 阶段 3：DocxCompareDialog.vue UI
13. AI 建议列表每条加 `el-checkbox` 接受控件；顶部加“本表单全接受/全取消”（indeterminate）。
14. 向 `SimulatedCRFForm` 传 `view-mode="ai"` + 已接受子集 `acceptedSuggestions`；未接受传空数组。
15. 保持 `:model-value`+`@update:model-value` 契约，不引入空 setter。

### 阶段 4：前端契约测试与全量验证
16. 扩展 `frontend/tests/docxBimodalPreview.test.js`（design §8）。
17. **验证**：`cd frontend && node --test tests/*.test.js` 全绿；`npm run lint` 无新增阻断错误。
18. **验证**：`cd backend && python -m pytest -q` 全绿。
    - 回滚点 B：阶段 1-4 前端改动可整体回退到“只读建议”现状。

### 阶段 5：文档同步 + 复核
19. 同步 README（功能一句）、`frontend/.claude/CLAUDE.md`、`backend/.claude/CLAUDE.md`、`.claude/index.json`；如动到 index 语义，在 `.trellis/spec` docx 契约处补注。
20. 代码走 code-reviewer；涉及导入执行路径，安全面无新增（不碰鉴权/隔离），如有疑虑再走 security 检查。
21. 可选：Codex/Antigravity 复核 diff（按 multi-cli 规则，Claude 最终裁决）。

## 验证命令清单
```bash
cd backend && python -m pytest tests/test_ai_review_service.py -q
cd backend && python -m pytest -q
cd frontend && node --test tests/docxAiSuggestionAcceptance.test.js
cd frontend && node --test tests/docxBimodalPreview.test.js
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
```

## Review Gates
- 阶段 0 后：确认无 log_row 场景零行为变化，有 log_row 场景 index 对齐。
- 阶段 2/3 后：确认接受状态不被轮询覆盖、默认关闭、三级联动正确。
- 提交前：全量前后端测试 + lint；diff 自审 + code-reviewer。

## 关键风险与对策
- **index 三处不一致** → 阶段 0 先统一为“过滤后序号”，前后端一致。
- **轮询覆盖接受状态** → 独立 ref + reconcile，不写进 preview。
- **提交非法/无效 override** → buildAiOverridesPayload 双重过滤 + 后端兜底校验。
- **预览近似 vs 落库精确** → 已在 PRD Out of Scope 声明，仅覆盖字段类型。
