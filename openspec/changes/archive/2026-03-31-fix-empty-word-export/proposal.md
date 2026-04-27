## Why

当前导出链路会把“文件本身为空 / 0 字节 / 非有效 docx”与“结构合法但语义空白”混在一起讨论，导致问题边界不清。用户已明确当前实际问题是**文件本身为空**，因此本次变更聚焦于：确保 Word 导出在生成阶段不会返回空文件，并且在 API 层对空文件做稳定拦截与可诊断反馈，而不是讨论是否允许导出骨架内容。

## What Changes

- 明确 Word 导出问题定义：修复“导出结果文件本身为空”的故障，而非“导出内容偏少”。
- 保持现有导出接口契约不变：继续使用 `POST /api/projects/{project_id}/export/word/prepare` + `GET /api/export/download/{token}` 两步下载模式。
- 保持现有导出文档结构约束不变：封面表、访视图表、表单表顺序不能被重排。
- 在后端导出链路中定位并修复导致空文件的根因，重点关注：
  - `ExportService.export_project_to_word()` 的保存链路是否在异常/边界情况下返回成功但未写入有效文件；
  - 路由层 `prepare_export()` 在临时文件、异常处理与 `_validate_output()` 接入处是否存在空文件漏检；
  - 与 `python-docx`、底层 OOXML 操作、section 切换、共享渲染 helper 的交互是否可能导致生成失败但未被正确上抛。
- 补齐回归验证，确保以下场景可被区分：
  - 有效 docx；
  - 0 字节文件；
  - 非法/损坏 docx；
  - 导出失败时缓存与临时文件被清理；
  - 成功时仍返回有效下载链接与 TTL。

## Constraints

### Hard Constraints

- `ExportService.export_project_to_word(project_id, output_path)` 现有公开契约是返回 `bool`；路由与测试都依赖该契约，研究阶段不建议扩展为其他返回类型。
- `prepare_export()` 必须继续返回 `token`、`download_url`、`expires_in`，下载接口仍需保留当前基于 owner + TTL 的鉴权行为。
- 导入链路依赖前两张表的固定位置，不能通过重排封面表/访视图表/表单表来“修复”空文件问题。
- 空项目/空访视/空表单骨架场景在现有测试中是允许的；本次问题是“文件本身为空”，不能把“骨架导出”误定义为故障。
- 导出数据来源受 `ProjectRepository.get_with_full_tree()` 约束；若根因与关系加载有关，修复需在 repository 边界与 service 渲染层协同处理。

### Soft Constraints

- 保持“薄路由 + 厚服务”分层；路由只做鉴权、临时文件与错误转换，导出内容逻辑继续放在 `ExportService`。
- 继续复用 `field_rendering.py` 的共享语义，避免在导出服务中复制默认值/inline 表格逻辑。
- 测试继续优先使用真实 `python-docx` 回读，而不是只依赖 mock。
- 当前工作区已存在用户未提交改动，实施时需要最小化 diff，避免覆盖既有改动。

## Risks

- 如果只加强“表数量”校验，可能会误伤当前允许的骨架导出场景，但仍无法解释“文件本身为空”的真实根因。
- 如果根因发生在 `doc.save(output_path)` 之前后的异常吞没路径，单纯修改 `_validate_output()` 只能兜底，不能解决真实写入失败。
- 如果问题与 `python-docx`/OOXML 底层交互有关，测试中能被 `Document(output_path)` 读回，不代表 Word 客户端一定可见；需要把“0 字节/损坏文件”和“可打开但空白”严格区分。
- 当前测试运行入口在仓库里存在环境约束，实施阶段需要先确认正确的 pytest 启动方式，避免把环境问题误判为导出失败。

## Success Criteria

- 导出成功时，生成的目标文件大小大于 0，且能被 `python-docx.Document(output_path)` 正常解析。
- 导出过程中若生成 0 字节文件、损坏 docx 或未生成有效文件，`prepare_export()` 返回明确失败，不写入 `_export_cache`，并清理临时文件。
- 现有 prepare/download API 契约、TTL、owner 鉴权与下载链接格式保持不变。
- 现有结构性导出行为不回归：封面表仍为第 1 张表，访视图仍为第 2 张表，空访视/空表单骨架场景仍按既有测试语义工作。
- 回归测试能覆盖“有效 docx / 0 字节 / 非法 docx / 失败清理 / 成功返回下载链接”等关键路径。

## Research Summary for OPSX

**Discovered Constraints**:
- 后端导出链路是 `export.py` 薄路由 + `export_service.py` 厚服务的集中式结构。
- `ExportService` 单入口顺序固定：完整关系树加载 → `Document()` → 全局样式 → 封面 → 页眉页脚 → 目录 → 访视图 → 表单内容 → 保存。
- `ProjectRepository.get_with_full_tree()` 是导出数据边界入口。
- `field_rendering.py` 是导出/预览共享语义层，影响默认值拆行与 inline 表格。
- `_validate_output()` 当前只检查文件大小、docx 可解析性、最少两张表，无法单独表达“文件本身为空”的根因，只能兜底。
- 当前问题经用户澄清后，目标是修复“文件本身为空”，而不是“只有骨架内容”。

**Dependencies**:
- `backend/src/services/export_service.py`
- `backend/src/routers/export.py`
- `backend/src/repositories/project_repository.py`
- `backend/src/services/field_rendering.py`
- `backend/tests/test_export_service.py`
- `backend/tests/test_export_validation.py`
- `frontend/src/App.vue`（仅当需要改善错误提示时）

**Risks & Mitigations**:
- 风险：误把骨架导出当故障。缓解：仅针对 0 字节/无效 docx/未写出有效文件建立校验与测试。
- 风险：根因在保存链路异常吞没。缓解：优先检查 `export_project_to_word()` 的异常处理与 `doc.save(output_path)` 附近路径。
- 风险：修改共享渲染逻辑造成预览/导入语义回归。缓解：非必要不动 `field_rendering.py`，若必须改动则补共享语义测试。
- 风险：工作区已有未提交改动。缓解：实施阶段采用最小 diff，并先审阅现有变更再写入。

**Success Criteria**:
- 成功导出生成非空且可解析的 docx。
- 空文件或无效 docx 会被 API 层稳定拦截并清理临时文件与缓存。
- 下载接口契约与鉴权行为不变。
- 现有结构性导出语义不回归。
- 回归测试覆盖有效与无效导出文件路径。

**User Confirmations**:
- “导出的文档内容为空”指的是：**文件本身为空**。
