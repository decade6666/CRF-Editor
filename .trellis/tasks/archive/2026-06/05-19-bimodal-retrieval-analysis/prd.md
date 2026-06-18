# brainstorm: 双模态检索分析问题

## Goal

梳理“双模态检索分析问题”的需求边界、可行技术路径与 MVP 范围，避免在目标、输入模态、检索对象和评估方式不清晰时直接实现。

## What I already know

* 用户希望围绕“双模态检索分析问题”进行 brainstorm。
* 当前尚未明确“双模态”具体指哪两种模态，也未明确检索数据源、用户场景、输出形态或是否需要落地到 CRF-Editor 现有代码。
* 现有 Word 导入链路已经产生结构化文本结果：表单、字段、字段类型、选项、默认值、单位、日期格式等预览数据。
* 现有 AI 复核链路只处理文本化字段元数据，用于建议字段类型，不是通用检索能力。
* 现有截图链路可将上传的 Word 文档转为逐页 PNG，并维护表单页码范围与字段页码映射。
* 前端已有“原始文档截图 + CRF 模拟渲染”的对比弹窗结构，但左侧截图预览当前被 `ENABLE_LEFT_PREVIEW = false` 暂时关闭。
* 前端已有截图面板，可轮询截图任务、展示页面图片，并根据字段点击定位/高亮相关页面。

## Assumptions (temporary)

* “双模态检索”最可能落在文本化 CRF 结构与 Word 原文截图/页面证据之间，而不是独立建设通用图文检索平台。
* MVP 应优先复用 Word 导入预览、AI 复核与截图页码映射，避免在需求确认前引入向量库、OCR、embedding 或外部多模态模型。
* 本阶段只做需求发现与方案收敛，不进行代码实现。

## Open Questions

* 暂无阻塞性问题。

## Requirements

* 双模态定义为：结构化字段文本（表单名、字段标签、字段类型、选项等）+ Word 原文截图/页码证据。
* MVP 优先围绕 Word 导入预览阶段，复用现有解析结果、截图任务、表单页码范围和字段页码映射。
* MVP 查询入口为字段点击定位：用户点击 CRF 模拟表单中的字段后，原文截图面板滚动到该字段对应的 Word 页面并高亮证据。
* 输出结果应能把字段/表单定位到对应 Word 原文截图页面，帮助用户核对解析结果来源。
* 字段无法映射到具体截图页时，只显示“未定位到原文页”一类轻提示，不打断预览，也不强行跳转。
* 搜索框输入、跨项目检索、相似字段推荐和语义召回不进入 MVP。
* MVP 不新增持久化检索索引，不调用外部多模态视觉模型，不把截图内容发送给外部 AI。

## Acceptance Criteria

* [x] PRD 明确“双模态”的两类模态定义。
* [x] PRD 明确检索对象、查询方式、输出结果与用户流程。
* [x] PRD 明确 MVP 范围和显式不做的内容。
* [x] PRD 记录技术路径选择及其权衡。
* [x] PRD 明确隐私、安全和外部 AI 调用边界。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Technical Approach

* Re-enable or refine the existing left-side Word screenshot preview path in `DocxCompareDialog.vue` instead of building a new retrieval UI from scratch.
* Use the existing `DocxScreenshotPanel.vue` field click flow as the primary interaction surface: right-side field click updates highlighted field; left-side screenshot panel resolves field page and scrolls/highlights.
* Reuse backend screenshot status payload from `import_docx.py`, especially `field_pages` and `page_ranges`, rather than introducing a persistent search table or vector index.
* Keep AI involvement optional and bounded to the existing text-only field review capability; screenshot evidence display should work without AI.
* Validate via focused frontend interaction tests and backend contract tests around screenshot status/page mapping if implementation proceeds.

## Out of Scope (explicit)

* 在需求确认前不实现检索模型、索引、接口或 UI。
* 在需求确认前不引入新依赖或外部服务。
* MVP 不做跨项目大规模检索、向量数据库、OCR 训练、图像 embedding 训练或私有模型部署。
* MVP 不做搜索框输入、相似字段推荐或语义召回。
* MVP 不把截图内容发送给外部 AI 做视觉理解；如需外部 AI，只保留在现有文本字段复核边界内讨论。

## Expansion Sweep

* Future evolution: 可从 Word 导入时的字段证据定位，扩展到跨文档/跨项目查找相似字段、字段复用建议或导入质量审计。
* Related scenarios: 需要与 AI 字段复核、Docx 对比预览、截图高亮定位、现有全局模糊搜索保持边界清晰。
* Failure and edge cases: 截图任务依赖本地转换能力和临时缓存；多 worker 下进程内任务状态不共享；外部 AI 调用需处理隐私、超时、成本和 prompt injection 边界。

## Feasible Approaches

**Approach A: 字段文本 + Word 截图页码定位（Recommended for MVP）**

* How it works: 复用现有解析字段、表单页码范围与字段页码映射；查询字段或表单后返回结构化字段结果和对应原文页截图证据。
* Pros: 最贴近现有 Word 导入链路，改动小，不需要新模型或向量库，便于验证用户价值。
* Cons: 更像“证据定位/检索”，不是严格意义的图文语义检索；依赖截图任务质量。

**Approach B: 结构化 CRF 字段 + 文档文本语义检索**

* How it works: 将 Word 解析文本、字段标签、选项、表单名等做文本索引或 embedding，查询时返回相似字段和原文位置。
* Pros: 支持模糊/语义查询，可扩展到相似字段发现。
* Cons: 需要确定索引生命周期、存储位置、重建策略和模型来源。

**Approach C: 文本查询 + 截图/OCR/多模态模型证据检索**

* How it works: 对页面截图做 OCR 或多模态 embedding，让用户用自然语言检索页面图像证据。
* Pros: 最接近“真正双模态检索”，可覆盖解析失败或版式信息。
* Cons: 成本、依赖、隐私和准确性风险最高，不适合作为需求未明确时的 MVP。

## Decision (ADR-lite)

**Context**: “双模态检索”需要先明确产品含义，否则容易过早引入向量库、OCR 或外部多模态模型。

**Decision**: MVP 采用 Approach A，将“双模态”收敛为结构化字段文本 + Word 原文截图/页码证据，优先服务 Word 导入预览中的字段来源核对。

**Consequences**: 该路径能最大化复用现有导入、截图和字段页码能力，风险最低；但它不是跨项目语义检索，也不处理截图内容的深度视觉理解。语义检索、OCR 和多模态 embedding 暂作为后续演进方向。

## Technical Notes

* Task directory: `.trellis/tasks/05-19-bimodal-retrieval-analysis`
* 相关后端入口：`backend/src/routers/import_docx.py` 提供 Word 预览、执行导入、截图 start/status/page API。
* 相关后端服务：`backend/src/services/ai_review_service.py` 负责文本字段元数据 AI 复核；`backend/src/services/docx_screenshot_service.py` 负责 Word 转截图、表单页码范围和字段页码映射。
* 相关前端组件：`frontend/src/components/DocxCompareDialog.vue` 有双栏对比结构但左侧截图关闭；`frontend/src/components/DocxScreenshotPanel.vue` 负责截图轮询、展示和字段页定位。
* 当前未发现持久化通用检索索引、向量检索、OCR 索引或图像 embedding 能力。
