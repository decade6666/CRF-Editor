## Context

CRF-Editor 当前在服务端承担四类高消耗链路：DOCX 预览截图、DOCX 导入解析、Word 导出、数据库导入。现状的主要压力点不只是 CPU，还包括临时文件、进程内任务状态、轮询流量以及对宿主环境的依赖。

现有实现中：
- DOCX 预览会先把上传文件写入 `uploads/docx_temp`，生成 `temp_id`，服务端解析完整表单结构，再异步启动截图任务；执行导入再通过 `temp_id` 回查同一份服务端临时文件。见 `backend/src/routers/import_docx.py`、`backend/src/services/docx_import_service.py`。
- DOCX 截图依赖 Word/COM 与服务端文件缓存，且任务状态存在进程内内存里，不适合远程多用户部署的长期主路径。
- Word 导出当前是服务端读取完整项目树并生成最终 `.docx` 后返回下载，导出前还会校验输出有效性。见 `backend/src/routers/export.py:29`。
- 数据库导入通过流式上传、首块 SQLite 签名校验、累计大小限制、schema 检查和 clone/merge 落库实现 authoritative 导入。见 `backend/src/routers/projects.py:47`。

用户已确认本次规划的目标是：尽量把“预览型、分析型、可降级”的重处理移到浏览器 + Web Worker/WASM；但保留服务端作为鉴权、schema 校验、事务回滚、持久化和最终可信输出边界。

---

## Goals / Non-Goals

**Goals**
- 将 DOCX 预览主路径改为浏览器侧语义预览，减少服务端 CPU、内存、临时磁盘与轮询流量。
- 保留截图能力，但把它降级为非主路径、后台延迟触发能力。
- 将 DOCX 导入的重解析迁到客户端，服务端改为接收并校验规范化清单（manifest/AST）后执行导入。
- 保持 Word 导出为服务端 authoritative 生成。
- 保持数据库导入为服务端 authoritative 导入，仅允许小文件做客户端预检增强体验。
- 让后续实现阶段拥有明确的接口契约、边界约束、失败策略与测试不变量。

**Non-Goals**
- 不要求浏览器侧达到与 MS Word 截图完全像素级一致。
- 不把客户端解析结果视为天然可信数据。
- 不把数据库导入或 Word 导出的最终执行权下放到客户端。
- 不在本次规划中直接实现代码改动。
- 不为低版本/禁用 Worker/WASM 的环境设计隐藏自动回退；不支持时应显式暴露 degraded / unsupported 状态。

---

## Decisions

### D1: 总体路线采用“客户端预览/预处理 + 服务端 authoritative 执行”的混合架构

**决策**：
- DOCX 预览与字段语义提取迁到浏览器侧执行。
- 服务端不再以 `temp_id + 服务器临时 DOCX 文件` 作为预览主链路事实源。
- 服务端保留最终导入执行、schema 校验、事务写入、权限检查与审计边界。

**理由**：
这是唯一同时满足“降低远程多用户服务端负担”与“保留后端可信边界”的路径。纯服务端模式无法真正降压；纯客户端可信执行会削弱权限和数据边界。

---

### D2: DOCX 截图能力必须保留，但改为后台延迟触发的增强功能

**决策**：
- DOCX 预览主界面先展示客户端生成的字段语义预览。
- 截图/页面图像仍保留，但不再作为进入预览的阻塞前提。
- 预览返回后，系统在后台延迟触发截图生成；若失败或环境不支持，只展示语义预览并显式告知。

**理由**：
用户已明确要求“必须保留”截图能力，但当前截图链路依赖服务端宿主环境且资源开销高，不能继续占据主路径。延迟触发能保留能力，同时把资源占用从“每次预览必付成本”降为“增强能力成本”。

**影响**：
- 截图接口需要从“主路径必需”转为“增强能力/异步状态补充”。
- 前端必须接受“只有语义预览、截图稍后出现或不可用”的交互语义。

---

### D3: 最终 DOCX 导入执行的 authoritative 输入是规范化 manifest，而不是原始 DOCX

**决策**：
- 服务端执行导入时以客户端生成的规范化 manifest/AST 为 authoritative 输入。
- 原始 DOCX 不作为执行必需输入；如需保留，仅作为可选诊断附件，不参与主契约。
- 服务端必须对 manifest 做严格 schema 校验、业务语义校验、owner 校验与事务回滚保护。

**理由**：
若执行阶段仍强制重新上传原始 DOCX 并由服务端重解析，服务端 CPU/内存/临时文件成本仍然存在，无法真正完成“把重处理迁到客户端”的目标。将 authoritative 输入改为 manifest 才能把主计算链真正移走。

**风险与缓解**：
- 风险：客户端解析 bug 会影响最终导入结果。
- 缓解：预览与执行共享同一 manifest；服务端对 manifest 做强校验；关键语义通过差分测试和 PBT 保证一致性。

---

### D4: manifest 必须以稳定 `semantic_id` 作为跨阶段身份

**决策**：
- `normalized_import_manifest` 中的 form 和 field 都必须带稳定 `semantic_id`；它是 preview / AI / screenshot / execute 的唯一跨阶段主键。
- `client_id` 如需存在，只能作为当前前端会话的本地渲染 key，不能进入服务端 authoritative 契约，也不能替代 `semantic_id`。
- AI 建议、用户勾选、截图页码映射、执行导入和审计日志都必须引用 `semantic_id`，不再接受仅基于位置索引的关联。
- 位置索引只允许作为显示顺序，不得作为跨阶段身份主键。

**理由**：
当前预览会过滤 `log_row`，AI 建议与执行仍大量依赖索引；一旦解析迁到客户端或过滤规则变化，基于位置的映射极易漂移。用 `semantic_id` 收敛身份语义，才能避免 preview / AI / screenshot / execute 四阶段错位。

---

### D5: `raw_html` 立即移出新契约

**决策**：
- 新的预览协议不再包含 `raw_html`。
- 规划中将其视为立即移除的非目标字段，而不是长期兼容字段。

**理由**：
用户已明确选择“立即移除”。同时当前主预览路径已更多依赖语义渲染，继续保留 `raw_html` 只会放大旧兼容面，阻碍接口收敛。

---

### D6: Word 导出保持服务端 authoritative 生成，不迁到客户端

**决策**：
- 最终 `.docx` 文件仍由服务端从服务端项目快照生成并校验。
- 客户端可在未来参与轻量预计算或导出配置收集，但不得替代最终文件生成与校验。

**理由**：
Word 导出是最终可信输出，不是预览型能力。当前服务端还会做完整项目树加载与导出结果校验；把最终导出放到客户端会削弱一致性、可审计性和跨环境稳定性。

---

### D7: 数据库导入保持服务端 authoritative，仅允许 32MB 以内文件做客户端预检

**决策**：
- `.db` 导入、整库合并、schema 判定、clone/merge 写库全部继续留在服务端。
- 浏览器端最多只对 `<= 32MB` 的文件做可选预检，用于提前暴露明显错误或不兼容提示。
- 超过 32MB 的数据库文件直接走服务端 authoritative 导入，不走客户端预检。

**理由**：
数据库导入本质上依赖可信 SQLite 快照、结构兼容性检查和持久化写入；即使做了浏览器预检，最终仍需完整上传和服务端处理。预检只能改善体验，不能实质性卸载主压力。

---

### D8: 不支持的客户端能力必须显式降级，不允许静默回退

**决策**：
- Worker/WASM 不可用、浏览器内存不足、文件超出客户端阈值、截图失败等场景，必须返回明确的 degraded / unsupported 状态与原因。
- 不允许偷偷切回旧的服务端重处理主路径，除非用户显式触发受支持的服务器增强能力（如截图后台任务）。

**理由**：
静默回退会让服务端负担重新扩散且难以观测，也会让用户误以为“客户端化已经完成”。

---

## Interface Contract

### 1. `normalized_import_manifest` 数据契约

客户端：
- 在浏览器 + Worker 中读取 DOCX，生成 `normalized_import_manifest`。
- 本地渲染字段语义预览。
- 可选把 manifest 发给服务端做 AI 复核、截图后台任务或最终执行导入。

manifest 最少包含：
- `schema_version`
- `document_fingerprint`
- `forms[]`
  - `semantic_id`
  - `name`
  - `order_index`
  - `importable`
  - `fields[]`
    - `semantic_id`
    - `label`
    - `field_type`
    - `inline_mark`
    - `default_value`
    - `options[]`
      - `text`
      - `trailing_underscore`
    - `unit_symbol`
    - `date_format`
    - `integer_digits`
    - `decimal_digits`
    - `importable`
    - `source_row_kind`
    - 其它与现有 CRF 字段语义契约对齐的字段

约束：
- manifest 不包含 `raw_html`
- manifest 中 form / field 的顺序必须与前端展示顺序一致
- manifest 中必须显式编码 `log_row` / 非导入字段的处理结果，避免执行期再猜测
- manifest 中的 `semantic_id` 在同一 `document_fingerprint` 范围内必须稳定，可被后续 AI、截图和执行端复用
- 旧 `temp_id + 服务端临时 DOCX 文件` 模式不再作为预览主路径事实源

### 2. DOCX 预览协议（新主路径）

- 浏览器侧先在 Web Worker 中完成 DOCX 解析，再生成 manifest，并直接渲染语义预览；预览成功不依赖服务端 `temp_id`。
- Worker 解析主路径必须覆盖当前 `parse_full` 的核心业务语义：表单标题配对、表格类型分流、字段 `field_type`、`default_value`、`inline_mark`、选项 `trailing_underscore`、`unit_symbol`、日期格式、数值精度，以及 `log_row` / 非导入字段的显式标记。
- 语义预览 UI 以 manifest 为单一前端事实源，先展示表单/字段结构与 AI 建议入口；截图区域只展示“待生成 / 生成中 / degraded / unsupported / done”状态，不阻塞主预览可用性。
- 服务端可接收 manifest 做增强能力，但预览主路径不再要求预先上传原始 DOCX 到服务端临时目录。
- 当 Worker/WASM 不可用或浏览器资源不足时，前端必须显式返回 degraded / unsupported 状态，而不是静默回退到旧的服务端重预览路径。

### 3. AI 复核协议

- AI 复核不再依赖服务端重新解析原始 DOCX。
- AI 输入基于 manifest。
- AI 输出对 form/field 的引用必须使用 `semantic_id`，不得只用位置索引。
- 用户接受或拒绝 AI 建议时，提交给执行端的覆盖信息也必须按 `semantic_id` 对齐。

### 4. 截图协议

- 截图是增强能力，不阻塞 preview 成功。
- 前端可在 preview 成功后请求截图后台任务。
- 截图任务状态应与 preview 结果解耦；截图失败、超时或当前环境不支持时，只返回明确的 degraded / unsupported 状态，不影响 manifest 预览和执行导入。
- 截图结果如果需要映射到 form / field，只能引用 `semantic_id`，不得只依赖页内位置或数组索引。
- 旧的“上传 DOCX → 服务端立即截图 → 轮询成功后才进入完整预览”的主路径必须下线；截图完成不再是进入预览或执行导入的前置条件。

### 5. 执行导入协议

- 服务端执行端点接收 manifest + 用户选择信息 + 可选 AI overrides。
- manifest 是 authoritative 输入；原始 DOCX 最多作为可选诊断附件，不再是正常执行链路的必需输入。
- 服务端必须先做 manifest 校验层：校验 `schema_version`、`document_fingerprint`、form/field `semantic_id` 完整性、字段类型白名单、字段语义一致性，以及当前用户对目标项目的 owner 权限。
- AI overrides 必须按 `semantic_id` 对齐；当覆盖的目标字段不存在、字段类型不在白名单或与 manifest 语义冲突时，服务端必须在写库前拒绝。
- 校验通过后，执行层复用现有导入写库语义：保留表单/字段创建、单位/选项字典复用、`log_row` 处理、唯一命名与排序规则，但输入改为 manifest 而非原始 DOCX 重解析。
- 导入执行继续运行在后端事务边界内；校验失败、flush 失败或执行异常时必须整体回滚，不得产生部分写入。

### 6. 结构化日志与审计协议

- 服务端必须为 manifest 校验、截图后台任务和最终执行导入记录结构化日志。
- 最少记录字段包括：`document_fingerprint`、`schema_version`、目标 `project_id`、`owner_id`、截图任务状态、执行结果摘要，以及失败原因类别。
- 审计日志中的 form / field 引用应优先记录 `semantic_id`，避免再次退回索引语义。
- 这些日志只用于可观测性与追溯，不改变服务端 authoritative 判定结果。

### 7. Word 导出协议

- 最终 `.docx` 仍由服务端基于服务端项目快照生成，并在返回前完成输出有效性校验。
- 客户端最多提供导出参数或预览提示，不得替代最终 `.docx` 生成、裁剪与校验。
- 即使客户端曾参与预览或布局提示，最终交付给用户的 Word 文件仍以服务端生成结果为准。

### 8. 数据库导入预检协议

- 客户端预检仅对 `<= 32MB` 的文件开放。
- 预检结果为 advisory，不影响后端鉴权和最终导入判定。
- `> 32MB` 的数据库文件必须直接走服务端 authoritative 导入，不进入浏览器 SQLite 预检路径。
- 服务端导入结果与客户端预检结果不一致时，以服务端 authoritative 结果为准。

---

## Risks / Trade-offs

| 风险 | 描述 | 缓解 |
|---|---|---|
| 客户端/服务端语义漂移 | 客户端 manifest 与服务端落库语义不一致 | 使用稳定 schema_version、共享语义测试集、PBT 和差分测试 |
| 稳定身份漂移 | 仍用索引关联 AI/截图/执行，会在过滤后错位 | 强制 form/field 使用稳定 semantic_id |
| 浏览器资源耗尽 | 大 DOCX 或低配终端可能卡死或崩溃 | Worker 隔离、文件阈值、显式 unsupported 状态 |
| 截图能力保留导致服务器仍有压力 | 后台截图仍会占用宿主资源 | 截图降级为延迟增强能力，非主路径必需 |
| 客户端数据不可信 | 用户可篡改 manifest | 服务端严格校验、权限校验、事务回滚、字段类型白名单 |
| `raw_html` 移除带来兼容破坏 | 旧前端/外部消费者若依赖该字段会出错 | 在实现阶段同步清理调用方，不再保留旧协议 |
| DB 预检造成“虚假通过” | 浏览器预检通过但服务端仍拒绝 | 明确声明预检仅 advisory，以服务端结果为准 |
| 可观测性下降 | 预览转到客户端后，服务端失去部分中间态 | 为 manifest 校验、截图任务、执行导入增加结构化日志与 fingerprint |

---

## Open Questions

无。用户已明确以下硬约束：
- 截图能力必须保留。
- 截图触发方式为后台延迟触发。
- 执行导入以规范化 manifest 为 authoritative 输入。
- `raw_html` 立即移除。
- 数据库导入客户端预检阈值固定为 32MB。

---

## Validation Strategy

后续实现阶段至少验证：
1. 为 manifest 设计属性测试：同一 DOCX 在客户端预览与服务端执行之间，form / field 的 `semantic_id`、顺序、字段语义与导入结果保持一致。
2. 为截图降级路径设计验证：截图失败、超时、degraded 或 unsupported 时，语义预览仍成功，且执行导入仍可继续。
3. 为服务端执行设计验证：非法 manifest、非法字段类型、稳定 ID 缺失、owner 权限不匹配或事务失败时，服务端明确拒绝且不产生部分写入。
4. 为数据库导入预检边界设计验证：`<= 32MB` 与 `> 32MB` 文件分别命中正确分支，且最终 authoritative 结果始终以服务端为准。
5. 为 `raw_html` 移除设计迁移检查：确认新契约、前端调用方和后续执行链都不再依赖该字段。
