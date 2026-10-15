# 子代理原始报告 — sonnet 路

> 2026-10-14 独立同题发散分析，与 [haiku](./2026-10-14-report-haiku.md) / [opus](./2026-10-14-report-opus.md) / [fable](./2026-10-14-report-fable.md) 互不共享结论。汇总见 [analysis-synthesis](./2026-10-14-analysis-synthesis.md)。仅只读分析，未改任何文件。

# CDISC 标准参考数据接入 CRF-Editor —— 只读发散式功能探索报告

> 性质：只读分析，未修改/创建/删除任何文件，未执行任何 git 写操作。
> 依据：`.trellis/tasks/10-13-cdisc-standard-reference/prd.md` + 实际读取的仓库代码 + 两次外部仓库核实（COSMoS export 目录、OpenStudyBuilder 主页）。

## 0. 已核实的关键事实（结论的证据基础）

**代码侧（均已实际读取）：**
- `backend/src/models/form.py:31`：`Form.domain`（String(255), nullable）已存在；`backend/src/schemas/form.py:93/109/128` 的 FormCreate/FormUpdate/FormResponse 均已含 `domain` —— **域编辑入口只缺前端**。
- `frontend/src/components/FormDesignerTab.vue:203`：`editFormProp = reactive({ name, code, paper_orientation })`，表单属性卡模板在 ~3454–3470 行，保存走 `persistFormProps`（~558 行）——补 domain 入口是纯前端改动 + 联想数据源。
- `backend/src/routers/template_fields.py`（83 行）+ `backend/src/services/template_field_index_service.py`（287 行）：**只读外部库索引的完整先例**——raw SQL + PRAGMA 列探查 + Python 侧过滤合并 + 稳定错误映射（400/404/TEMPLATE_INCOMPATIBLE）。
- `frontend/src/components/TemplateFieldSearchDialog.vue`（297 行）：只读非模态可拖拽查询弹窗先例（`:modal="false"` + draggable + 点格复制 + 50/页分页 + 四组排序 `rankTemplateFieldMatches`）。
- `frontend/src/composables/fieldDefinitionAutocomplete.js`：现有自动完成是**字段库换绑路径**（PRD 明确不得混入标准记录）。
- `frontend/src/composables/oidValidation.js` + `backend/src/schemas/_common.py:17`：OID 仅字符集校验 `^[A-Za-z0-9._-]+$`，无语义校验。
- `backend/src/routers/settings.py:30` `_validate_template_path`：管理员白名单路径配置先例，标准数据路径可照此管理。
- `backend/src/services/export_service.py:719/774/777/1508`：aCRF 导出已消费 `form.domain` 生成域标注。
- 设计器**一次只允许一个草稿字段**（newField 本地草稿 + saveDraftField 保存门控，见 `frontend/.claude/CLAUDE.md`）——这是批量插入类功能（如 BC 字段组）的主要实现约束。
- Word 导出表结构与预览有严格 parity 契约（cross-stack §5，`word_table_parity.py` ↔ `main.css` `.wp-form-title`）——动导出表格主体的功能成本和风险显著更高。

**外部数据侧（已核实）：**
- COSMoS `export/` 实际有 4 个 CSV：PRD 所列 3 个 **+ `cdisc_biomedical_concepts_hierarchy_latest.csv`（PRD 未提及，BC 层级关系文件，可直接支撑概念树浏览）**。
- CSV 列结构**未在 COSMoS README 文档化**；官方指向 `model/` 下 LinkML 文件（`cosmos_bc_model.yaml`、`cosmos_sdtm_bc_model.yaml`）。导入器需按实际表头或 LinkML 解析，无法提前锁定列名。
- 许可：代码 MIT；内容 CC-BY-4.0（需署名）；**数据文件许可未明示**（README 未单独说明，PRD"使用权限需单独核对"的提醒成立）。
- OpenStudyBuilder `import_standards/`：位于仓库根，负责 CDISC CT 与数据模型导入，**直写 Neo4j**——按约束只能借鉴其"版本化标准库 + 元数据导入"设计，不能照搬存储。

---

## 1. 功能全景清单（按主题分组，从近到远）

**主题 A：数据底座与管理（一切功能的前置）**
- A1 标准参考数据本地索引与管理端
- A2 标准数据版本快照与署名信息展示

**主题 B：只读查询与设计器内嵌联想（近期，PRD 核心区）**
- B1 「标准参考查询」弹窗（COSMoS 版模板字段查询）
- B2 设计器字段属性卡「标准参照」侧栏
- B3 表单域编辑入口 + 标准域代码联想下拉
- B4 字段属性卡单位/字典「标准对照」提示
- B5 域级中文别名检索（自维护最小别名表）

**主题 C：表单级与项目级报告（中期）**
- C1 表单级域建议（推断式，不自动写 domain）
- C2 表单内标准一致性报告（域必需变量缺失/拼写近似提醒）
- C3 项目标准覆盖度体检（差距报告）
- C4 跨表单目标变量冲突清单

**主题 D：导出与 aCRF 标注增强（中期偏后）**
- D1 aCRF 域标注的标准域合法性提示（预览层）
- D2 导出前 SDTM 就绪度摘要（独立报告，不动导出表结构）
- D3 Word 导入对比的标准字段旁注（远期）

**主题 E：Biomedical Concept 深度利用（远期）**
- E1 BC 驱动的字段组模板（一键插入一组草稿）
- E2 BC 概念层级树浏览
- E3 标准版本升级影响面对比

**主题 F：显式越界方向（仅记录，不在本任务做）**
- F1 自动 OID→SDTM 变量映射/自动改名（**越界，需用户另行决策**）
- F2 保存时强制标准校验/阻止保存（PRD 已排除）

---

## 2. 逐条明细

### 主题 A：数据底座

**A1 标准参考数据本地索引与管理端**
- 通俗描述：把 COSMoS 的 3–4 个 CSV 解析进 SQLite 独立只读表（域/变量/概念/关联），管理员在设置里配置数据文件路径并触发导入。
- 用户价值：一切标准功能的地基；数据留在本地、离线可用。
- 实现要点：新增 `backend/src/services/standard_reference_service.py`（解析 CSV→SQLite 表，表头探测参照 `template_field_index_service.py` 的 PRAGMA 探查思路，但 CSV 无 PRAGMA，需按 LinkML/实际表头映射并容错）；`backend/src/routers/settings.py` 加 `standard_reference_path` 配置（复用 `_validate_template_path` 白名单模式）；轻量迁移在 `backend/src/database.py` 建表；CSV 解析建议用标准库 `csv`，避免新增依赖。
- 数据依赖：COSMoS 3 个 CSV（+层级 CSV）；正式版 + 草案需带状态标记入库。
- 风险：CSV 列结构无官方文档，正式版更新可能改列——需导入失败 fail-fast + 保留旧快照；草案数据只能提示；数据文件许可未明示。
- 评级：成本 中 / 价值 高（前置必做）。

**A2 标准数据版本快照与署名展示**
- 通俗描述：每次导入记录数据版本、导入时间、来源文件与 CC-BY-4.0 署名，界面可见"数据来源：COSMoS vX，CC-BY-4.0，含草案数据"。
- 实现要点：A1 的元数据表 + 弹窗 footer 插槽；设置页展示当前版本。
- 评级：成本 低 / 价值 中（合规必要项）。

### 主题 B：只读查询与设计器联想

**B1 「标准参考查询」弹窗**
- 通俗描述：输入域代码、变量名、概念名或英文标签，查标准库并显示 域→目标变量→单位/字典/标注条件 关联链与"正式/草案"标记。
- 实现要点：后端 `GET /api/standard-fields`（照 `routers/template_fields.py` 的错误映射与鉴权先例）；前端复制 `TemplateFieldSearchDialog.vue` 结构、排序复用 `searchRanking.js`；三态标记在行内呈现。入口挂 App 头部（完整编辑模式门控）。
- 风险：低——SDTM dataset specializations 数千行级，一次性下发可行（汇总注：fable 实测 13,922 行，主张服务端分页）。
- 评级：成本 中 / 价值 高（MVP 核心）。

**B2 设计器字段属性卡「标准参照」侧栏**
- 通俗描述：选中字段时，属性卡下方自动列出按当前字段标签/OID 联想出的标准候选记录，纯展示。
- 实现要点：`FormDesignerTab.vue` 字段属性卡（3454 行起）加只读折叠区；`searchRanking.js` 客户端过滤；索引随设计器打开懒加载。**不得接入 `fieldDefinitionAutocomplete.js` 的换绑候选**。
- 风险：中——多命中展示噪声需克制（默认前 N 条 + "在查询弹窗中查看全部"）。
- 评级：成本 中 / 价值 高。

**B3 表单域编辑入口 + 标准域代码联想**
- 通俗描述：补上「域」输入框，输入时下拉给出标准 SDTM 域代码与英文名联想；这是 PRD 目标 3。
- 实现要点：`editFormProp`（FormDesignerTab.vue:203）加 `domain` 键 + `el-autocomplete`；`persistFormProps` 的 PUT payload 已天然支持；另需检查左侧弹窗式表单编辑双入口是否同步（~534 行）。
- 风险：低；domain 是自由文本，联想只是提示，保存不强制。
- 评级：成本 低 / 价值 高（性价比最高，建议必做）。

**B4 字段属性卡单位/字典「标准对照」提示**
- 通俗描述：若标准记录带单位或字典（CT）引用，属性卡旁注显示"标准建议单位：cm；标准字典：XX CT"，仅提示不绑定。
- 风险：中——CT 值集不在 COSMoS 三个文件内，只能显示引用名，文案避免误导。
- 评级：成本 低 / 价值 中。

**B5 域级中文别名检索（自维护最小别名表）**
- 通俗描述：允许用"不良事件""生命体征"等中文词搜到 AE、VS 域；别名表先内置常用域级中文名，管理员可扩充。
- 实现要点：A1 索引加 `alias` 表；检索时把别名并入候选文本；维护入口先做设置页简单表格。
- 风险：中——别名质量决定检索体验；变量级中文别名工作量大，MVP 只做域级。
- 评级：成本 中 / 价值 中。

### 主题 C：报告类

**C1 表单级域建议**
- 通俗描述：分析表单内字段，提示"这个表单的字段大多匹配 VS 域标准变量，是否要设置域=VS？"——只建议，不自动写。
- 实现要点：后端新 service 对单表单字段与 A1 索引做匹配打分，返回 Top-N 域建议 + 依据；前端显示为可点建议（点击仅回填编辑缓冲，仍走显式保存）。
- 风险：低-中；多域混合表单建议要能降级为"无明确建议"。
- 评级：成本 中 / 价值 中-高。

**C2 表单内标准一致性报告**
- 通俗描述：给定表单+域，列出"该域标准要求的采集变量里，本表单缺了哪些/近似命中了哪些"。
- 风险：中——DRAFT 措辞必须带免责声明；必需性列存在与否待确认。
- 评级：成本 中 / 价值 中。

**C3 项目标准覆盖度体检（差距报告）**
- 通俗描述：一键生成整项目报告：按域汇总已采集/未采集标准变量、命中方式、草案与正式状态分布。
- 实现要点：新 service（`standard_coverage_service.py`）批量扫描 project→form→form_field→field_definition（复用 profile 聚合先例）；报告先做只读弹窗/页面。
- 风险：中——"未覆盖"不等于"错误"，报告文案必须是中性表述。
- 评级：成本 中-高 / 价值 高（差异化能力）。

**C4 跨表单目标变量冲突清单**
- 通俗描述：找出"同一标准目标变量在不同表单/域中被不同字段采集"的情况。
- 评级：成本 低（若 C3 框架已建）/ 价值 中。

### 主题 D：导出与标注增强

**D1 aCRF 域标注的标准域合法性提示（预览层）**
- 通俗描述：aCRF 视图时若表单域代码不在标准域列表中，域标注旁给非阻断小标记"非标准域代码（自定义）"。
- 实现要点：预览链路旁挂只读校验函数；**不改 `annotation_positions` 持久化结构，不加导出侧新元素**——否则触碰 cross-stack §6 契约。
- 评级：成本 低 / 价值 中。

**D2 导出前 SDTM 就绪度摘要（独立报告，不动导出表结构）**
- 实现要点：若做"独立附页"需动 `export_service.py` + `word_table_parity.py`（parity 范围显式排除新附页）+ `main.css` 同步（§5 契约），成本上升；**建议 MVP 先做预览层/报告弹窗，附页列入远期**。
- 评级：成本 预览层 中 / 附页 高；价值 中。

**D3 Word 导入对比的标准字段旁注（远期）**
- 实现要点：`DocxCompareDialog.vue`/`docx_import_service.py` 对比链路挂 A1 查询；导入是限流高成本端点，旁注查询应是本地索引即时查。
- 风险：中——对比视图信息密度已高，旁注默认折叠。
- 评级：成本 中 / 价值 中（远期做）。

### 主题 E：Biomedical Concept 深度利用

**E1 BC 驱动的字段组模板（一键插入一组草稿）**
- 通俗描述：从 BC（如"血压测量"）一键插入一组字段草稿，标签与类型按标准预填，OID 留空由用户定。
- 实现要点：受"设计器一次只允许一个草稿"约束；逐字段循环走 `newField→saveDraftField` 或新增后端批量端点；OID 预填边界敏感——建议默认留空或草稿内可编辑建议值，绝不触达已保存字段。
- 风险：中-高——与草稿/undo/排序三套机制交互多，测试面大。
- 评级：成本 高 / 价值 高（但应排在报告类之后）。

**E2 BC 概念层级树浏览**
- 通俗描述：概念树（如 循环系统发现 → 血压 → 收缩压），点节点看关联域/变量，点格复制——数据源是第 4 个文件 `cdisc_biomedical_concepts_hierarchy_latest.csv`（已核实存在）。
- 实现要点：层级 CSV 导入为自引用表；`el-tree` 只读树 + 详情面板；挂 B1 弹窗第二标签页成本最低。
- 评级：成本 中 / 价值 中。

**E3 标准版本升级影响面对比**
- 实现要点：A1 每次导入保留快照版本；diff service 对比两版索引；受影响面=对现有 field_definition 全量重新匹配。
- 风险：中；COSMoS `export/archive/` 目录（已核实），历史版本可得性未验证。
- 评级：成本 中-高 / 价值 中（低频但高影响场景）。

### 主题 F：越界方向（仅记录）

**F1 自动 OID→SDTM 变量映射 / 按标准自动改名** —— **越界，需用户另行决策**。自动映射在数据模型上不成立（身高/体重同为 `VSORRES`）；若未来要做，只可能是"用户逐条确认的建议清单"形态。
**F2 保存时强制标准校验/阻止保存** —— PRD 已明确排除；本报告所有功能均为非阻断提示。

---

## 3. 评级汇总表

| 编号 | 功能 | 成本 | 价值 | 备注 |
|---|---|---|---|---|
| A1 | 标准数据索引与管理端 | 中 | 高 | 前置必做 |
| A2 | 版本快照与署名 | 低 | 中 | 合规必要 |
| B1 | 标准参考查询弹窗 | 中 | 高 | MVP 核心 |
| B2 | 字段属性卡标准参照侧栏 | 中 | 高 | |
| B3 | 域编辑入口+域代码联想 | 低 | 高 | 性价比最高 |
| B4 | 单位/字典标准对照提示 | 低 | 中 | 依赖 CSV 列形态 |
| B5 | 域级中文别名检索 | 中 | 中 | MVP 可裁剪 |
| C1 | 表单级域建议 | 中 | 中-高 | |
| C2 | 表单一致性报告 | 中 | 中 | 草案免责声明 |
| C3 | 项目覆盖度体检 | 中-高 | 高 | 差异化能力 |
| C4 | 跨表单变量冲突清单 | 低(依赖C3) | 中 | |
| D1 | aCRF 域代码合法性标记 | 低 | 中 | 预览层 |
| D2 | 导出就绪度摘要 | 中(预览)/高(附页) | 中 | 附页触碰 parity 契约 |
| D3 | Word 导入标准旁注 | 中 | 中 | 远期 |
| E1 | BC 字段组模板 | 高 | 高 | 草稿机制约束 |
| E2 | BC 概念层级树 | 中 | 中 | 第 4 个 CSV |
| E3 | 版本升级影响面 | 中-高 | 中 | 低频场景 |
| F1/F2 | 自动映射/强制校验 | — | — | 越界，不做 |

---

## 4. PRD 缺口

1. **数据接入方式未定**：构建期打包 vs 管理员运行时导入 vs 固定路径轮询；更新策略与旧版兼容。
2. **"匹配/疑似不匹配/未覆盖"判定规则未定义**：归一化规则、近似阈值、多命中排序与截断数量。
3. **权限边界未定**：authenticated-user 还是管理员；含草案数据的入口是否对普通用户降级展示。
4. **性能与数据规模验收缺失**：CSV 行数量级、检索目标延迟、整表下发 vs 服务端分页。
5. **许可署名落地方式未定**：UI 何处展示署名与版本；数据文件许可核对的责任人/结论记录。
6. **草案数据展示规范缺失**：视觉标记、免责文案、能否与正式数据混排。
7. **与现有自动完成的隔离验收标准**：建议加 source-level 测试断言（wiring-guard 风格）。
8. **失败降级未定义**：索引缺失/损坏/版本过旧时各功能的表现。
9. **域编辑入口范围未定**：仅设计器属性卡，还是含弹窗式表单编辑双入口与批量设置。
10. **中文别名范围与维护责任未定**。

## 5. MVP 切分建议

**目标**：一条纵切——"数据能进来、能查到、设计时看得见、域字段能维护"，全部只读/提示，零写路径侵入。

1. **A1+A2 数据底座**：admin 配置路径 + 导入 4 个 CSV 进 SQLite 只读表 + 版本/署名元数据表。导入失败 fail-fast、保留旧快照。
2. **B1 标准参考查询弹窗**：`GET /api/standard-fields` + 复用查询弹窗交互骨架 + `searchRanking.js` 排序；三态标记 + 正式/草案列。
3. **B3 域编辑入口 + 域代码联想**：后端零改动。
4. **B2 字段属性卡标准参照侧栏（精简版）**：Top-N 候选 + "查看全部"入口；与换绑自动完成完全隔离。
5. **D1 aCRF 域代码合法性小标记（可选）**。

**明确推迟**：B5 中文别名、C 系全部报告、D2/D3、E 系全部。
**MVP 验收基线建议**：后端 pytest（索引导入、查询端点、错误映射、隔离测试）+ 前端 node:test wiring 契约 + B3 的表单属性编辑测试扩展。

## 6. 不确定项声明

- COSMoS 三个（+1）CSV 的具体列名未在任何已核实来源中文档化；C2 的"必需性/核心标记"、B4 的单位/字典列形态均以导入时实际表头为准。
- 数据文件许可：COSMoS README 只写"内容 CC-BY-4.0"，未对 export CSV 单独声明。
- `cdisc_biomedical_concepts_hierarchy_latest.csv` 的层级粒度（BC↔BC 还是 BC↔变量）未核实。
