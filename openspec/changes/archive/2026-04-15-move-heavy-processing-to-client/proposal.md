# Proposal: move heavy processing to client-side user resources

## Enhanced Requirement

将 CRF Editor 当前消耗服务器 CPU / 内存 / 临时磁盘 / 轮询带宽的重处理链路，按“**浏览器 + Web Worker/WASM**”边界评估是否能下放到前端用户设备执行，并以此降低远程多用户部署下的服务器压力。

本次研究覆盖四条高消耗链路：
1. DOCX 预览截图
2. DOCX 导入解析
3. Word 导出
4. 数据库导入

本次研究的目标不是直接决定实现方案，而是产出后续规划可用的**约束集合**：哪些链路可下放、哪些只能部分下放、哪些必须继续由服务端托管。

### 目标
- 明确哪些服务器重处理环节具备浏览器侧执行空间。
- 保持后端作为权限、schema 校验、持久化写入、导出裁剪的可信边界。
- 约束客户端能力边界为浏览器主线程 + Web Worker/WASM，不依赖本机额外安装、桌面壳或原生桥接。
- 在远程多用户部署场景下，优先降低服务端资源消耗，而不是追求与 MS Word 像素级一致的前端渲染。

### 技术约束
- 客户端能力边界已确认：仅允许浏览器 + Web Worker/WASM。
- 目标部署场景已确认：远程部署、多用户并发。
- 一致性级别已确认：要求**字段语义一致**，不要求与当前 Word 截图或分页完全像素级一致。
- 任何客户端产物都不能替代服务端的鉴权、owner 校验、schema 拒绝、事务回滚和最终持久化。

### 范围边界
**纳入范围**
- DOCX 预览/截图链路的浏览器侧可行性边界
- DOCX 文档解析、字段识别、预览数据构建的浏览器侧可行性边界
- Word 导出链路中可否利用客户端资源降低服务端负担
- 数据库导入链路中可否由客户端承担预检查/预处理工作

**不纳入范围**
- 本阶段不实施代码改动
- 不引入本机 helper、桌面壳、原生 Office 调用
- 不削弱服务端的权限边界、数据可信边界和结构校验
- 不承诺浏览器侧达到当前 MS Word 截图级版式一致性

### 验收标准
- 研究产物能清晰区分“可下放 / 可部分下放 / 必须服务端保留”的工作负载类别。
- 后续规划阶段可直接复用本提案中的硬约束、软约束、依赖、风险与成功判据。
- 所有下放方向都以保留现有语义契约和安全边界为前提。

## Research Summary for Planning

### User Confirmations
- 优先研究四条高消耗链路：DOCX 预览截图、DOCX 导入解析、Word 导出、数据库导入。
- “使用前端用户资源”限定为浏览器 + Web Worker/WASM。
- 一致性目标是字段语义一致，而非 Word 像素级一致。
- 主要面向远程部署、多用户场景，而非仅限当前单机桌面式运行。

### Existing Structures
- DOCX 导入当前是 `preview -> temp_id -> execute` 两阶段流程：预览阶段先把上传文件写入服务端临时目录，再通过 `temp_id` 在执行和截图阶段回查同一份服务器文件。见 `backend/src/routers/import_docx.py:183`、`backend/src/services/docx_import_service.py:555`、`backend/src/services/docx_import_service.py:624`。
- DOCX 截图当前是服务端托管的异步任务：任务状态缓存在进程内内存，图片写入 `uploads/docx_temp/{temp_id}/pages`，前端通过轮询 `start/status/pages` 接口获取结果。见 `backend/src/services/docx_screenshot_service.py:20`、`backend/src/services/docx_screenshot_service.py:43`、`backend/src/routers/import_docx.py:547`、`backend/src/routers/import_docx.py:657`、`backend/src/routers/import_docx.py:723`。
- Word 导出当前由服务端读取完整项目关系树并生成临时 `.docx` 后返回下载，属于典型的服务端可信输出。见 `backend/src/routers/export.py:29`、`backend/src/services/export_service.py:197`。
- 模板库导入与项目 `.db` 导入都基于外部 SQLite 只读打开、schema 校验、clone 到宿主库的模型，不是简单文件搬运。见 `backend/src/services/import_service.py:57`、`backend/src/services/import_service.py:73`、`backend/src/services/project_import_service.py:53`、`backend/src/services/project_import_service.py:73`、`backend/src/services/project_import_service.py:157`、`backend/src/services/project_import_service.py:194`。
- 前端已经持有一部分渲染语义：`useCRFRenderer.js` 明确声明与后端宽度规划共享同一语义契约；当前对比预览左侧原始截图面板实际上已被临时关闭。见 `frontend/src/composables/useCRFRenderer.js:6`、`frontend/src/components/DocxCompareDialog.vue:14`、`frontend/src/components/DocxCompareDialog.vue:86`。
- 模板库路径来自服务端配置并受安全校验，属于服务器本地资源边界。见 `backend/src/routers/settings.py:94`、`backend/src/routers/settings.py:124`。

### Boundary Classification
- **更接近可下放**：DOCX 预览展示、前端对比渲染、DOCX 解析后的字段语义提取/预处理。原因是这些链路已经部分依赖前端渲染语义，且用户只要求字段语义一致，不要求 Word 像素级一致。
- **更接近部分下放**：Word 导出、DOCX 执行导入。原因是客户端可以承担部分预计算或结构化准备，但最终输出、最终导入、最终校验仍受服务端可信边界约束。
- **必须服务端保留为 authoritative**：模板库访问、项目 `.db` 导入/整库合并、数据库导出快照裁剪、owner 绑定、schema 兼容性拒绝、事务回滚。原因是这些链路依赖服务器本地路径、SQLite authoritative 数据、权限验证和持久化写入。

### Hard Constraints
- DOCX 截图当前依赖 `pythoncom + docx2pdf + PyMuPDF` 的服务端链路，且 `docx2pdf` 绑定 MS Word COM 生态；在“浏览器 + Worker”边界内没有天然等价能力。见 `backend/src/services/docx_screenshot_service.py:126`、`backend/src/services/docx_screenshot_service.py:165`、`backend/src/services/docx_screenshot_service.py:192`。
- 截图任务状态当前保存在进程内 `_tasks`，代码已默认单 worker / 单进程内存缓存语义；任何仍依赖服务端截图托管的方案都不能默认兼容多实例共享状态。见 `backend/src/services/docx_screenshot_service.py:20`、`backend/src/services/docx_screenshot_service.py:24`。
- DOCX 导入预览与执行都依赖服务端临时文件和 `temp_id` 生命周期；如果把解析前移到浏览器，必须重定义这条状态链路，而不能沿用“服务器暂存文件即事实来源”的假设。见 `backend/src/services/docx_import_service.py:555`、`backend/src/services/docx_import_service.py:576`、`backend/src/services/docx_import_service.py:587`、`backend/src/routers/import_docx.py:575`。
- Word 导出当前是服务端 eager-load 完整项目树再生成 `.docx`，并在返回前做输出有效性检查；这不是简单字符串拼装，意味着客户端若介入也不能破坏最终导出契约。见 `backend/src/services/export_service.py:197`、`backend/src/routers/export.py:45`。
- 数据库导出依赖 `sqlite3.backup()` 与 `VACUUM` 在可信数据库快照上做裁剪；数据库导入依赖 schema 校验、只读打开外部库、`clone_from_graph` 写入宿主库。浏览器端不能替代这类 authoritative 数据边界。见 `backend/src/services/export_service.py:2987`、`backend/src/services/export_service.py:3021`、`backend/src/services/project_import_service.py:53`、`backend/src/services/project_import_service.py:73`、`backend/src/services/project_import_service.py:178`、`backend/src/services/project_import_service.py:222`。
- 模板库来源于 `config.template_path` 指向的服务器本地 `.db`，并经过路径安全校验；远程浏览器端无法直接访问同一资源边界。见 `backend/src/routers/settings.py:126`、`backend/src/routers/settings.py:132`。
- 前后端已经共享一套字段宽度/控件语义契约；任何下放都不能改变 `default_value`、`inline_mark`、`trailing_underscore`、宽度规划等现有业务语义。见 `frontend/src/composables/useCRFRenderer.js:6`。
- 当前 DOCX 预览接口仍返回 `raw_html` 字段，但前端主对比视图更多依赖 `SimulatedCRFForm`，且左侧截图面板被关闭，说明已有历史兼容字段与当前主路径分离的情况。见 `backend/src/routers/import_docx.py:105`、`backend/src/routers/import_docx.py:355`、`frontend/src/components/DocxCompareDialog.vue:29`、`frontend/src/components/DocxCompareDialog.vue:87`。
- 远程多用户场景下，客户端设备性能、内存、浏览器实现各异，且客户端输入不可信；即使某段处理被前移，服务端仍必须保留最终重校验。现有上传限制也显示不同链路已存在明显文件体量差异：DOCX 预览 10MB，数据库导入 200MB。见 `backend/src/services/docx_import_service.py:551`、`backend/src/routers/projects.py:26`、`backend/src/routers/admin.py:27`。

### Soft Constraints
- 延续项目现有的 `routers -> services/repositories -> models/schemas` 分层，重逻辑仍应集中在 service/composable，而不是散落到 UI 模板。见 `backend/.claude/CLAUDE.md`、`frontend/.claude/CLAUDE.md`。
- 对外错误结构与鉴权方式应保持稳定，避免下放后把错误处理从结构化响应退化为不可观测的前端异常。
- 若某能力在纯浏览器边界下做不到，需要显式暴露 degraded / unsupported 状态，而不是静默回退为错误结果。
- 已存在的前端渲染能力应优先作为语义复用面，而不是再造第三套语义实现。

### Dependencies
- DOCX 导入链：`backend/src/routers/import_docx.py` -> `backend/src/services/docx_import_service.py` -> `frontend/src/components/DocxCompareDialog.vue` / `frontend/src/components/DocxScreenshotPanel.vue` / `frontend/src/components/SimulatedCRFForm.vue`。
- Word 导出链：`backend/src/routers/export.py` -> `backend/src/services/export_service.py` -> `backend/src/repositories/project_repository.py`。
- 模板库导入链：`backend/src/routers/settings.py` -> `config.template_path` -> `backend/src/services/import_service.py`。
- 项目数据库导入链：`backend/src/routers/projects.py` / `backend/src/routers/admin.py` -> `backend/src/services/project_import_service.py` -> `ProjectCloneService.clone_from_graph(...)`。
- 共享渲染语义链：`backend/src/services/width_planning.py` / `backend/src/services/field_rendering.py` <-> `frontend/src/composables/useCRFRenderer.js`。

### Risks
- 若把“截图一致性”错误地当作必须目标，会把浏览器侧探索锁死在几乎不可达的 Word fidelity 上。
- 若把过多解析结果交给客户端而不做服务端重校验，会直接削弱 owner 绑定、schema 拒绝和事务回滚等当前安全边界。
- 若只下放前端展示、不处理现有 `temp_id` / 轮询 / 文件缓存耦合，服务端资源占用可能下降有限。
- 若继续扩张前后端各自的渲染逻辑而不维护共享语义契约，`trailing_underscore`、默认值、多行文本、inline 宽度等行为最容易漂移。
- 浏览器侧处理大文件会把服务器压力转移为用户设备压力；在远程多用户场景下，这种转移必须以明确的能力边界和失败提示为前提。
- 当前截图依赖项和宿主环境耦合较深，如果不先拆清哪些只是“预览视觉增强”而非“业务真值”，后续规划容易把宿主问题误当成功能问题。

### Open Questions
- `raw_html` 是否仍属于必须保留的接口契约，还是可在后续规划中降级为兼容字段。
- 浏览器侧若无法提供接近当前截图的视觉对照，是否接受只保留字段语义级对比而不再保留“原始文档截图”能力。
- 浏览器侧需要覆盖的文档/数据库体量上限应如何定义，尤其是在远程多用户和低配终端环境下。

### Verifiable Success Criteria
- 预览型交互（尤其 DOCX 预览/对比）能够显著减少服务端 CPU、内存、临时磁盘占用和轮询流量。
- 即使引入客户端预处理，服务端仍继续执行 owner 校验、schema 兼容性校验、导入事务回滚和最终持久化。
- 不依赖本机 Office、桌面壳或额外 helper，就能在浏览器边界内完成被判定为“可下放”的处理部分。
- 现有语义契约保持一致：字段类型、默认值、inline 语义、选项尾下划线、排序与导入/导出回环不被破坏。
- 对于“不可在浏览器边界内可靠完成”的能力，系统能清晰暴露 unsupported / degraded 状态，而不是伪造结果。
- 数据库导出与数据库导入继续保持当前的可信快照、结构兼容性与敏感数据裁剪约束。
