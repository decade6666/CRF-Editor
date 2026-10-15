# 子代理原始报告 — fable 路

> 2026-10-14 独立同题发散分析，与 [haiku](./2026-10-14-report-haiku.md) / [sonnet](./2026-10-14-report-sonnet.md) / [opus](./2026-10-14-report-opus.md) 互不共享结论。汇总见 [analysis-synthesis](./2026-10-14-analysis-synthesis.md)。仅只读分析，未改任何文件。本报告是四路中唯一做了本地模板库实测与 CSV 全量行数统计的。

# CDISC 标准参考接入：发散式功能探索报告（只读分析）

**一句话结论**：COSMoS 标准数据可以做成一个本地只读的"标准词典"，在现有架构上能做出 41 项功能，另有 5 项越过 PRD 边界、需你另行决定。最值得先做的是三件只读的事：一个"查标准"的小窗；让表单能填"域"并自动给出建议；在字段旁显示"是否对得上标准"的标签。但实测本地模板库里只有约 3 成字段编号能直接对上标准，字段标签几乎全是中文。所以能否做成，关键在两点：中文别名，以及不会把用户吓到的提示方式。

> **术语速览**：CDISC=临床数据标准国际组织；SDTM/域=提交数据标准及表分类（VS=生命体征、AE=不良事件）；CDASH=CRF 采集端标准；BC（生物医学概念）=被测量的东西本身；VLM（值级元数据）=同一变量在不同检验项下的具体规则；CT（受控术语）=标准规定的可选值；aCRF=带标注的 CRF；OID=本编辑器里表单或字段的唯一编号（`FieldDefinition.variable_name`）；草案（DRAFT）=未正式发布的数据。

---

## 1. 调研依据

### 1.1 代码事实（已读源码）

- **已有只读索引先例**：`GET /api/template-fields`。只要求登录，不限定项目；经 `ImportService._open_template_session` 只读打开模板库（路径白名单 + `PRAGMA query_only`）；错误信息不暴露文件路径。前端把全量结果一次下发，用 `searchRanking.js` 分四组排序，点击单元格即复制，每页 50 条。相关：`template_fields.py`、`template_field_index_service.py`、`templateFieldSearch.js`、`TemplateFieldSearchDialog.vue`，契约见 cross-stack §12。
- **`Form.domain` 后端已打通，前端没有入口**：该列为 String(255)、可空、无校验，已贯通 schema、表单复制、项目克隆、模板导入、项目导入和 aCRF 导出（标在表单标题旁，`export_service.py` 第 774–779 行）。但设计器表单属性只编辑 `name/code/paper_orientation`（`formDesignerPropertyEditor.js` 第 113–124 行，`FormDesignerTab.vue` 第 203 行和第 3455–3478 行）。Word 导入也不写 domain（`docx_import_service.py` 中没有 domain）。后端 `PUT /api/forms/{id}` 已能接收 domain（`schemas/form.py` 的 FormUpdate；`routers/forms.py::_apply_form_update` 使用 exclude_unset）。
- **设计器的 OID/标签输入框是"字段库换绑"自动完成**（`FormDesignerTab.vue` 第 3497–3559 行）。选中候选会改写 9 个定义级属性（`fieldDefinitionAutocomplete.js`），所以标准提示不能混进去。
- **OID 相关约束**：目前只校验字符集 `^[A-Za-z0-9._-]+$`（`schemas/_common.py`、`oidValidation.js`）；字段 OID 在项目内唯一（`uq_field_def_var_name`）；aCRF 标注的拖动位置以字段 OID 和 `_form` 为键持久化（§6）。
- **aCRF 标注框是单行**：最宽 4.6cm、高 0.7cm，前后端同值（`export_service.py` 第 99–104 行，`acrfAnnotationGeometry.js`）。
- **预览/导出一致性校验的限制**：抽取器会把最后一个表单标题之后的所有表格都算进该表单（`word_table_parity.py` 第 113–130 行）。往导出文档里加附录表会破坏这项校验。
- **依赖与现有能力**：依赖中没有 openpyxl 和 ECharts；没有 Excel 或 Define-XML 导出。AI 复核服务支持 OpenAI/Anthropic 两种接口格式，默认关闭。多选类型只有"赛美斯"数据库类型允许（`field_type_policy.py`）。
- **`FormField.help_text` 列存在，但设计器没有编辑入口**。
- **本项目许可**：CRF-Editor 是 PolyForm Strict 1.0.0，仅限非商业使用（`LICENSE`，`README.md` 第 516–518 行）。

### 1.2 COSMoS 数据形态

用两种方式交叉核对：网页抓取表头，再用管道流式解析计数（未落盘）。

| 文件 | 行×列 | 关键列 | 覆盖与版本 | 备注 |
|---|---|---|---|---|
| SDTM 数据集特化（正式） | 13,922×32 | domain, vlm_group_id, sdtm_variable, codelist（C 码）, value_list（如单位 "cm;ft;in;m"）, assigned_value, role, data_type/length/format, mandatory_variable | 32 个域；SDTMIG 3-2/3-3/3-4；package_date 按行混合，共 7 种，最新 2026-07-14 | 1,475 个 VLM 组，1,008 个 BC |
| CRF 特化（**草案**） | 2,073×35 | crf_group_id, implementation_option, crf_item, variable_name, question_text, prompt, value_list/value_display_list, selection_type, prepopulated_term, sdtm_annotation | 16 个域；CDASHIG 2-1/2-3；package_date 2026-06-30 | sdtm_annotation 有 2,052 行有值（如 "VSORRES when VSTESTCD = HEIGHT"）；**completion_instructions 全空**；question_text 449 行，prompt 1,624 行 |
| BC（正式） | 6,306×17 | ncit_code, parent_bc_id, synonyms, result_scales, definition, system/code（LOINC）, data_type | 1,475 个 BC | 没有中文 |
| BC 层级（PRD 未列） | 11 列 | parent_bc_id, bc_hierarchy_level, bc_hierarchy_full | — | 可以做分类树 |
| archive 归档 | — | — | 2025-04-01 起每版都有 CSV+XLSX，更早只有 XLSX；CRF 草案没有带日期的归档 | 可以做版本对比 |

- SDTM 特化的 32 个域：AE BE CM DD DM DS EC EG EX FA FT GF IE IS LB MB MH MI MK PR QS RE RP RS SC SR SU TR TS TU VS。
- CRF 特化的 16 个域：AE CM DM DS EC EG FT IE LB MB MH PR QS SC SU VS。

### 1.3 本地模板库只读聚合

以只读、不改文件的方式打开配置的模板库，只输出统计数字，不输出任何字段名或项目名。注意这只是 1 个样本，结论能否推广不确定。

- **规模**：1 个项目，54 张表单，424 个字段定义（其中 398 个不是"标签"类型）。
- **domain 一张都没填**：54 张表单都有 OID，但 domain 填写数为 0。
- **表单前缀高度一致**：52/54 张表单里，字段 OID 最常见的前两位等于表单 OID 的前两位；46/54 张表单有 ≥80% 的字段用同一前缀。
- **OID 风格统一**：394/398 个 OID 是不超过 8 位的大写字母数字。
- **与标准精确对上的只有约 3 成**：118/398。其中按 CDASH 变量名 96 个，按 crf_item 90 个，按 SDTM 变量 70 个。只按变量名算命中 114 个，其中 65 个在标准里对应多个概念。只有 4 个 OID 等于某个 VLM 组代码。
- **域覆盖有缺口**：287/398 个 OID 的前两位落在 COSMoS 的域里。表单 OID 前缀只有 35/54 被覆盖，PC/DA/ML/MO/SV 不在其中。
- **标签几乎全是中文**：517 条字段引用中有 516 条。
- **单位以中文为主**：15 个带单位的字段，只有 3 个与 CDISC 单位取值精确一致，1 个仅大小写不同；其余多为"克/岁/支/粒"这类中文单位。

### 1.4 许可事实与冲突

- **COSMoS**：README 写明代码和脚本是 MIT，"documentation and minutes 等内容文件"是 CC-BY-4.0，且不含商标许可。**导出的 CSV 数据是否属于 CC-BY-4.0，README 原文没有写明**。PRD 写的是"内容 CC-BY-4.0"，两者之间有空隙，需要核实。
- **OpenStudyBuilder（下称 OSB）**：`import_standards/LICENSE.md` 是 GPLv3，与 `licenses.md` 一致。`db/LICENSE.md` 写的是 MIT，但 `licenses.md` 把 "Neo4j MDR DB" 列为 GPLv3，**两处来源冲突**。
- **结论**：CRF-Editor 是 PolyForm Strict，**不能复制任何 GPLv3 代码，只能借鉴设计**。

### 1.5 OSB 可借鉴的设计（只借思路，不引入 Neo4j）

- **两阶段导入**：先进暂存区校验原始数据，再发布成带日期的版本包（RawCatalogue → CTPackage）。
- **版本化**：包以"名称 + 日期"区分，多个版本可并存。
- **离线包文件**：把包文件放进仓库，以避开 CDISC Library API 的限流（该 API 需要 cdiscID 账号）。
- **标准库与项目实例分离**：与 CRF-Editor 现有的"模板库只读、项目可写"结构相同。

---

## 2. 功能全景清单

- **近期（第一阶段，以只读为主）**：A1 标准参考包构建与只读加载、A2 来源/草案/署名展示、B1 标准查询弹窗、B2 概念详情卡（精简版）、B4 域目录与中文域名、C1 表单"域"入口 + 联想、C2 表单域建议、C3 字段标准对照徽标
- **中期-甲（提示深化，只写辅助元数据）**：A3 中文别名词表、A4 从模板库种子别名、A7 项目锁定标准版本、B3 概念分类树、B5 NCIt/LOINC 对照、C4 字段库状态列、C5 独立标准建议面板、C6 类型/精度提示、C7 单位提示、C8 字典 CT 对照、C9 成组完整性提示、C10 文案参考、C12 OID 风格提示、D1 表单报告、D2 项目体检、D3 模板库体检、D4 豁免登记、D5 CSV 导出、F3 模板导入预览状态、F4 就绪度报告
- **中期-乙（会写入 CRF 设计数据，需用户确认）**：E1 批量回填 domain、E2 从标准新建字段、E5 从标准生成字典/单位
- **远期**：A5 企业标准扩展、A6 版本影响面对比、C11 aCRF 预览参考层、D6 跨项目差异、E3 字段组模板、E4 表单骨架、E6 只补空属性、F1 Word 导入建议、F2 AI 候选、F5 TS/TV 提示
- **越界（需另行决策）**：X1–X5

---

## 3. 逐条明细表

> 表内路径都相对 `/home/decade/CRF-Editor/`。

### A 数据底座与治理

| 编号 | 名称 | 通俗描述 | 实现要点 | 数据依赖 | 风险 | 成本/价值 |
|---|---|---|---|---|---|---|
| A1 | 标准参考包构建与只读加载 | 把 CSV 预处理成本地只读小数据库，编辑器只读不写 | ① 新增 `backend/scripts/build_standard_reference.py`，只用标准库 csv+sqlite3；先校验表头，漂移即失败。② 生成 `standards_<日期>.db`：`std_package`（来源、SHA256、行数、草案标记）、`std_sdtm_vlm`、`std_crf_item`、`std_bc`。③ `src/config.py` 增加 `standards.reference_path` 和 `CRF_STANDARDS_REFERENCE_PATH`。④ 仿 `_open_template_session` 只读打开。⑤ 新增 `services/standard_reference_service.py`。⑥ `tests/conftest.py` 同步重定向该路径。推荐独立只读库 | 3 个 CSV，可选层级 CSV | 导出数据的许可待确认；"latest"文件里按行混用不同日期；约 2–3 个月出一版；桌面安装包体积变大 | 中/高 |
| A2 | 来源·版本·草案·署名展示 | 每条结果标明"来自 COSMoS、哪一天的包、正式还是草案" | 新增 `GET /api/standards/meta`；弹窗页脚和报告页眉显示；文案注明"不代表 CDISC 认证" | `std_package` | 署名文案需法务确认 | 低/中 |
| A3 | 中文别名词表 | 维护"VS=生命体征、SYSBP=收缩压、g=克、M=男" | 主库新表 `standard_alias(kind,target_key,alias,source,status)` 或随包分发 CSV + 主库覆盖层；搜索时并入候选文本（`searchRanking.js` 支持多候选，不支持拼音） | 人工维护 + A4 | 别名质量；归属是全局还是按项目；不能随项目导出 | 中/高 |
| A4 | 从模板库种子别名 | 自动把"OID 恰好等于标准变量名"的字段的中文标签作为候选别名，管理员勾选后启用 | 复用 `build_template_field_index` 的 label/label_aliases，与标准索引比对，生成待审核别名 | 模板库 + A1 | 114 个变量名命中中有 65 个对应多个概念，只能当"变量级"别名，必须人工确认 | 低中/高 |
| A5 | 企业标准扩展 | 把公司自有设计登记为第三类参照来源，对上就算"匹配（企业标准）" | 最省做法：直接把 §12 模板字段索引当第二参照源，状态分为"官方匹配 / 模板库匹配 / 未覆盖"；完整做法：建可写的 sponsor 标准表 | 模板库或新表 | 容易与官方标准混淆，需要醒目来源标签 | 中高/中高 |
| A6 | 标准升级影响面对比 | 换新版标准包时，列出本项目用到的概念里哪些变了 | 读 archive 下按 YYYYMMDD 命名的历史文件；新增 `standard_diff_service.py`，以 (domain, vlm_group_id, variable) 为键比较 | 归档 CSV | 2025-04 之前只有 xlsx，需 openpyxl（新依赖要确认）；CRF 草案没有归档 | 中高/中 |
| A7 | 项目锁定参考标准版本 | 每个项目记住"按哪一版标准检查" | 简化版：只在报告里写明用了哪个包。完整版：`project` 表加列，同步 clone、import、数据库导出 | `std_package` | 复制、导入链路需要同步 | 中/中 |

### B 只读查询

| 编号 | 名称 | 通俗描述 | 实现要点 | 数据依赖 | 风险 | 成本/价值 |
|---|---|---|---|---|---|---|
| B1 | 标准参考查询弹窗 | 像模板字段查询一样开可拖动小窗，按域、变量名、概念名、中英文搜索，点一下复制 | ① 新增 `routers/standards.py` 的 `GET /api/standards/search`：只要求登录；错误处理仿 §12（未配置 400、文件缺失 404、路径无效 400、不兼容 400，响应不含路径）。② 前端新增 `StandardReferenceDialog.vue`（照 `TemplateFieldSearchDialog.vue`）和纯逻辑 `standardReference.js`。③ 入口放 `App.vue` 第 797–806 行旁和全屏设计器头部，只在完全模式显示。④ SDTM 特化有 13,922 行，**不要像 §12 那样整表下发**，改为服务端分页，或只下发按概念聚合的索引 | A1（中文还需 A3） | 英文数据对中文用户不好用；草案要能筛选 | 中/高 |
| B2 | 概念详情卡 | 点开概念，看它属于哪个域、落到哪个变量、单位和字典、aCRF 怎么标 | 新增 `GET /api/standards/concepts/{bc_id}`，按 bc_id 聚合 BC 信息、SDTM VLM 行、CRF 项 | 三张表按 bc_id 关联 | CRF 项是草案；没有"填写指南"数据，不要承诺 | 中/高 |
| B3 | 概念分类树 | 按"生命体征 > 体重"逐级浏览 | 层级 CSV + `el-tree` 懒加载 | 层级 CSV | 分类名是英文，需要别名 | 中/中 |
| B4 | 域目录与中文域名 | 一张"域代码—中文名—是否被标准库覆盖"的表 | 从索引取不重复 domain（32/16 个），加一份随应用分发的中文域名清单 | A1 + 中文域名表 | COSMoS 不是完整的 SDTMIG 域目录；完整目录要另找来源 | 低/中 |
| B5 | NCIt/LOINC 对照 | 详情卡显示 NCIt 和 LOINC 编码，可复制 | 读 BC 的 `ncit_code` 和 `system/code` 纯展示 | BC 文件 | LOINC 只有部分行有；LOINC 条款需核对 | 低/低中 |

### C 设计器内嵌提示（只读）

| 编号 | 名称 | 通俗描述 | 实现要点 | 数据依赖 | 风险 | 成本/价值 |
|---|---|---|---|---|---|---|
| C1 | 表单属性补齐"域"输入 + 联想 | 加"域"输入框，边输边提示标准域 | ① `buildFormPropState`/`sameFormPropState` 增加 domain。② `editFormProp`、`persistFormProps`（第 558–601 行）和编辑弹窗同步。③ 后端只需补 strip 规范化。④ 非标准值只警告，允许 X*/Y*/Z* 自定义域。⑤ 联想数据来自 B4，与换绑补全分开。⑥ 只在完全模式显示，同步 `editModeHiddenIdentifiers.test.js` | B4 | domain 格式未定（单值/多值/自由文本）；填写后 aCRF 导出会立刻多出表单级标注；涉及 §6 的 `_form` 语义 | 低中/高 |
| C2 | 表单域建议 | 根据表单 OID 和表内字段 OID 前缀猜出域，给"采纳"按钮（只写进编辑区，仍要点保存） | 新增纯函数 `composables/formDomainSuggestion.js`（实测 52/54 张表单前缀一致，猜得准） | 现有项目数据 + B4 | 4 字母拆分域、SUPP--、自定义域会猜错；8 张混合前缀的表单应显示"不确定" | 低/高 |
| C3 | 字段"标准对照"徽标 | 选中字段时显示"匹配 / 疑似不匹配 / 参考库未覆盖"，点开看依据 | ① 新增纯逻辑 `standardFieldMatch.js` 和 `StandardMatchBadge.vue`，放字段属性表单顶部（第 3489 行起）。② 按表单批量请求 `POST /api/standards/match`。③ 判定分三级：变量级、概念级（结合表单 domain 和中文别名）、差异项。④ **绝不接入换绑用的 el-autocomplete** | A1、A3 | 噪音大：只有约 3 成精确命中，"未覆盖"会占多数。必须中性措辞和灰色；草案命中单独标记 | 中/高 |
| C4 | 字段库"标准状态"列 | 字段库表格加一列状态，可筛选 | `FieldsTab.vue` 第 290–299 行列区加列；数据来自 `POST /api/projects/{pid}/standards/check`（校验项目归属）；遵守"筛选状态下禁用拖动"约定 | A1 | 字段库很大时需服务端批量 + 缓存 | 低中/中高 |
| C5 | 独立"标准建议"面板 | OID 和标签输入框旁放"标准"按钮。已保存字段只能复制建议；新建草稿可填空属性 | 草稿沿用 `__draft__`→`saveDraftField` 路径；与 `buildAutocompleteCandidates` 完全分开 | A1/A3 | 两套补全并存需明显视觉区分 | 中/中高 |
| C6 | 类型/精度/长度提示 | 标准要求"小数 8.3 / 日期 / 单选"而字段是"文本"时提示 | 把标准的 data_type 和 selection_type 映射到编辑器字段类型；项目类型为"其他"时不能用多选，提示改为"拆成复选组" | A1 | CDASH 日期和时间分开采集，与 SDTM datetime 不是一一对应 | 低/中 |
| C7 | 单位一致性提示 | 单位不在标准允许范围，或只大小写不同（ml 与 mL）时提示 | 用 `--ORRESU` 的 value_list（约 90 种取值）和 `prepopulated_term` 比对，加中文单位别名 | A1+A3 | 实测 15 个带单位字段只有 3 个精确命中；完整单位 CT 不在 COSMoS | 低中/中 |
| C8 | 字典选项 CT 对照 | 字典选项与标准术语（如 SEX：F/M/U/INTERSEX）比，提示缺项/多项/编码不一致 | 用 value_list/value_display_list 对 `CodeListOption` 比对；入口放 `CodelistsTab.vue` 和 `CodelistQuickEditDialog.vue` | A1+A3 | COSMoS 只有取值子集；选项编码是自由文本，不能强制 | 中/中高 |
| C9 | 成组完整性与重复概念提示 | 提示"测了身高却没有单位或日期字段"，或"同表单两字段对应同一概念" | 用 crf_group_id（共 303 组）和 mandatory_variable 按表单聚合 | A1 | 依赖概念级匹配准确度；草案数据 | 中/中高 |
| C10 | 标签文案参考 | 展示标准提问句和提示语，供拟中文标签参考 | 只读展示 question_text 和 prompt，可复制 | A1 | 英文；草案 | 低/中 |
| C11 | aCRF 预览"标准标注参考层" | 浏览器 aCRF 预览可打开一层浅色参考标注，只看不存，不进 Word | 在 `DesignerWordPreview.vue`/`VisitFormPreviewDialog.vue` 加可选图层和开关；不接入 `useAcrfAnnotationDrag.js` 持久化 | A1 | 单行 4.6cm 标注框放不下长标注；涉及 §6 几何契约；容易被误读成"已建立映射"，属于灰区 | 中/中 |
| C12 | OID 命名风格提示 | 提示超过 8 位或风格不一致的 OID | 纯提示，不阻断 | 无 | 规则只能是建议；实测只有 4 个 OID 超过 8 位 | 低/低中 |

### D 报告与体检

| 编号 | 名称 | 通俗描述 | 实现要点 | 数据依赖 | 风险 | 成本/价值 |
|---|---|---|---|---|---|---|
| D1 | 表单级一致性报告 | 列出本表单每个字段的对照结果和差异点 | 新增规则引擎 `services/standard_check_service.py`（纯函数）和 `GET /api/forms/{id}/standards/report` | A1 | 措辞不能写成"合规" | 中/高 |
| D2 | 项目覆盖度体检/差距报告 | 一键给整个项目体检 | 同一引擎按项目聚合；结果放项目信息页卡片或独立对话框；图表用简单进度条（引入 ECharts 属新依赖，需确认） | A1(+A3/A5) | 结果是否缓存待定 | 中高/高 |
| D3 | 模板库体检（管理员） | 对公司模板库做同样体检 | 复用 §12 的只读读取和 D2 引擎；仅管理员可用（`require_admin`） | 模板库 | 沿用路径白名单和只读约束 | 中/中高 |
| D4 | 例外/豁免登记 | 对差异点标为已确认例外，以后不再提示 | 新表 `standard_check_waiver`；必须同步项目克隆、导入、数据库导出、体积估算、硬删除级联 | 主库新表 | 同步链路多（以前出过漏同步问题） | 中/中高 |
| D5 | 报告导出 CSV | 体检结果导出 Excel 能打开的 CSV | 前端 Blob 或后端流式输出，不加新依赖；对以 `= + - @` 开头的单元格转义防公式注入；加 BOM；下载走 `apiUrl()`（§9） | D1/D2 | 公式注入 | 低/中 |
| D6 | 跨项目同概念差异（管理员） | 对比同一标准概念在不同项目里的设计 | 管理员只读聚合 | 主库 + A1 | 生产是多用户：跨用户数据只能管理员可见，需安全评审 | 中/中 |

### E 写入型辅助（需用户确认后才写入；不触碰"不改字段 OID 体系"硬边界，但超出第一阶段"只读"）

| 编号 | 名称 | 通俗描述 | 实现要点 | 风险 | 成本/价值 |
|---|---|---|---|---|---|
| E1 | 批量回填缺失的 domain | 列出没填域的表单和建议值，勾选后预览，一次写入 | 复用 C2 推断。建议新增单事务批量端点（现有 `persistFormProps` 每张表单弹一次确认） | domain 不是 OID，没有越过硬边界；何时开放写入需你决定 | 低中/高 |
| E2 | 从标准新建字段（草稿） | 新建字段可"从标准选一个"，带出类型、位数、单位和选项 | 沿用本地草稿→原子保存路径；OID 默认建议用 crf_item（如 HEIGHT_VSORRES），用 `findOidConflict` 检查重名；单位/字典优先复用项目已有的 | 标准变量名不唯一（VSORRES 服务多个检验项），不能直接拿变量名当 OID；草案数据 | 中高/高 |
| E3 | 标准字段组模板插入 | 一次插入一整组字段（如身高的日期、结果、单位），可选规范化/非规范化 | 以 crf_group_id 为单位（Normalized 285 行、Denormalized 1,195 行），单事务批量创建；撤销需新增动作类型（现有 7 种） | 草案；与"同一时间只能有一个草稿"冲突；撤销逻辑复杂 | 高/高 |
| E4 | 按域新建标准表单骨架 | "新建表单→选 VS→勾选身高、体重、血压"直接得到带域和字段的表单 | E1 和 E3 组合 | 同 E3 | 高/中高 |
| E5 | 从标准生成字典/单位 | 一键按标准取值（如 SEX）建字典，中文显示值可改 | 给 `CodelistQuickEditDialog.vue` 新增预填参数（已核实现有 props 没有预填能力）；code 默认用 codelist_submission_value | 只是取值子集，不是完整 CT；中文显示值需人工填 | 中/中 |
| E6 | 只补空属性 | 对已匹配字段，只把空着的属性按标准补上，不碰已有值和 OID | 走显式保存路径，必须经过 `confirmFieldReferenceImpact`（第 2146 行）影响确认，并进入撤销栈 | 字段定义被多张表单共享时会一起受影响 | 中/中 |

### F 导入/导出链路与其他

| 编号 | 名称 | 通俗描述 | 实现要点 | 风险 | 成本/价值 |
|---|---|---|---|---|---|
| F1 | Word 导入时的标准建议 | 导入 Word 时提示"这个字段像标准里的 XX，建议域 YY"，默认不采纳 | 复用三级采纳模式（`docxAiSuggestionOverrides.js`）和 `DocxCompareDialog.vue`；离线规则匹配，不需要 AI | 要改 §4 导入契约和 `useWordImport.js`，测试面大 | 中高/中高 |
| F2 | AI 辅助概念候选 | 中文标签对不上时，先本地找候选，再让已配置的 AI 从候选里选一个并说明理由 | 扩展 `ai_review_service.py`，规定"只能从候选中选"；沿用 `AIConfig.enabled` 默认关闭 | 字段标签会发给第三方 API，需告知并同意；结果只能作建议 | 中高/中 |
| F3 | 模板导入预览显示标准状态 | 从模板导入表单前就能看到对照情况 | 在 `TemplatePreviewDialog.vue` 加一列 | 低 | 低中/低中 |
| F4 | SDTM 就绪度报告（独立文件） | 单独导出就绪度报告，不塞进 eCRF/aCRF 正文 | 复用 D2 结果；如果出 Word，**必须是独立文档**，因为附录表格会破坏预览/导出一致性校验 | 措辞不能暗示合规 | 中/中 |
| F5 | 项目信息/访视 ↔ TS/TV 参考提示 | 提示方案号、申办方等对应试验摘要（TS）的哪些参数 | COSMoS 里有 TS 域的行，对照 `ProjectInfoTab.vue` 只读展示 | 覆盖有限 | 中/低 |

### X 越界方案（需另行决策）

| 编号 | 名称 | 说明 | 风险及边界 |
|---|---|---|---|
| X1 | 字段与标准概念的持久化关联 | 给字段存"它对应哪个标准概念"的引用 | **越界**：PRD 明确"不建立 SDTM 映射"；需同步全部复制、导入、导出、撤销链路。是 X2、X3 的前提 |
| X2 | aCRF 导出改用标准标注文本 | 导出时标 "VSORRES when VSTESTCD = HEIGHT" 而不只是 OID | **越界**：映射语义 + 监管交付物（aCRF 是映射到 SDTM 变量的申报文件）；单行 4.6cm 放不下；标错风险高；依赖 X1 |
| X3 | 映射规格草稿 / Define-XML / ODM 导出 | 自动生成映射表或标准交换文件 | **越界**：既是映射又是新交付格式；归档的多个 PRD 都明确不做 Define.xml |
| X4 | 按标准自动改名 OID / 自动换绑 | 发现不一致就自动改 OID | **越界（硬边界）**：唯一约束下引用破坏；aCRF 标注位置以 OID 为键，改名即丢；历史导出不一致 |
| X5 | 保存时按标准阻断 | 不符合标准不让保存 | **越界**：违反"不默认阻止保存"；CRF 特化还是草案 |

---

## 4. PRD 缺口

1. **用户与入口没定义**：谁用（设计员、数据经理、管理员），在哪里用，简要模式下是否可见。
2. **数据范围不完整**：PRD 只列 3 个 CSV，没有层级 CSV；COSMoS 不含完整 SDTMIG 域目录（PC/DA/ML/MO/SV 缺）也不含完整 CT；是否引入 SDTMIG/CDASHIG 变量全集、NCI EVS 的 CT 需决策。
3. **存储与更新机制没定**：独立只读库还是主库表？谁构建、怎么更新？多版本是否并存？项目是否锁定版本？表头漂移怎么办？
4. **"匹配"的含义没定义**：判定用什么键？是否结合 domain 上下文？匹配到变量级还是概念级？大小写？CDASH 与 SDTM 变量名不同（--DAT 与 --DTC）怎么算？建议把三态细化为：匹配（正式）/ 匹配（仅草案）/ 变量匹配但概念待定 / 疑似不匹配（列出差异项）/ 未收录 / 已豁免。
5. **domain 的格式和影响没定**：单值、多值还是自由文本？是否规范化？填写后 aCRF 导出会多出表单级标注，需写进验收。实测模板库 54 张表单 domain 全空。
6. **中文别名的归属没定**：全局还是按项目？谁维护、审核流程？是否需要拼音（现有排序不支持）？
7. **草案数据策略没定**：默认展示？怎么标记？是否参与"疑似不匹配"判定？
8. **许可与署名没定**：署名文案和位置；COSMoS 导出 CSV 的许可表述待核实；OSB db 组件许可来源冲突；禁止复制 GPLv3 代码（本项目 PolyForm Strict）；商标措辞（不写"CDISC 认证/合规"）。
9. **非功能要求缺失**：检索响应目标（建议 <300ms）、约 1.4 万行负载、桌面包体积、未配置时降级、测试隔离（`conftest.py` 重定向）、新的跨栈契约 §15。
10. **出界清单应写成可测试的验收**：不持久化映射、不改导出、不自动改名、不阻断保存——每条都应有测试断言。
11. **缺成功指标**：如"domain 填写率"、"评审发现的不一致数量下降"。

---

## 5. MVP 切分建议

**目标**：在不改任何字段 OID 或字段绑定、不阻断保存的前提下，让用户查得到、看得懂、域能填。

| 步骤 | 内容 | 成本 |
|---|---|---|
| M0 | A1：离线构建脚本 + 只读加载 + 配置，未配置时优雅降级；A2：署名和草案标识 | 中 |
| M1 | B1 查询弹窗（服务端分页）+ B2 精简版 + B4（内置中文域名，作为最小别名集） | 中 |
| M2 | C1 + C2 域入口和建议（PRD 第 3 条标"待确认"，**需你确认是否纳入**）；domain 只做 strip，非标准值只提示 | 低中 |
| M3 | C3 只读徽标：变量级匹配 + 表单 domain 上下文；"未收录"用中性灰；有草案标签；暂不做 C6–C8 差异项 | 中 |

**MVP 不做**：别名维护界面、体检报告、豁免、任何批量写入 CRF 设计数据的功能、导入/导出改动、AI。

**建议写入 PRD 的可测验收**：
- 未配置标准库时，弹窗显示中文提示，接口返回 400 且不含文件路径，其他功能不受影响。
- 搜 "VSORRES" 返回多个 VS 概念，每行显示 IG 版本、package_date、正式或草案；搜 "HEIGHT" 命中的 CRF 项带"草案"标签，详情卡显示 "VSORRES when VSTESTCD = HEIGHT"。
- 设计器能编辑并保存 domain，aCRF 预览出现表单级标注；非标准值只提示，仍可保存。
- 字段前缀 ≥80% 是 VS 且表单 OID 以 VS 开头时，建议 VS；前缀混合时显示"不确定"。
- 字段 OID=AETERM、表单 domain=AE 时显示"匹配"；OID 不在标准中时显示"未收录"（灰色）。
- 任何徽标交互后，后端测试断言 `variable_name` 和 `field_definition_id` 不变；保存按钮不受徽标状态影响。
- 页脚显示 CC-BY 署名；新增跨栈契约 §15，并同步 README、README.en、模块 CLAUDE.md、`.claude/index.json`。

**后续阶段**：第二阶段 A3/A4 → C4、C6–C9 → D1/D2/D5 → D4；第三阶段写入型 E1/E2/E5，需决策后再做。

---

## 6. 执行与验证说明

- **只读读取**：PRD 和 task.json；模型 form/field_definition/form_field/field/codelist/unit/project/visit；schemas `form.py`、`_common.py`、`field.py`；`template_fields.py`、`forms.py`、`settings.py` 部分；服务 `template_field_index_service.py`、`import_service.py`、`export_service.py`、`word_table_parity.py`、`ai_review_service.py`、`field_type_policy.py` 部分；前端 `TemplateFieldSearchDialog.vue`、`templateFieldSearch.js`、`searchRanking.js`、`fieldDefinitionAutocomplete.js`、`oidValidation.js`、`CodelistQuickEditDialog.vue`、`formDesignerPropertyEditor.js`、`FormDesignerTab.vue`、`App.vue` 相关区段；cross-stack §12、归档的 aCRF PRD 与研究文档。
- **只读数据库统计**：模板库用 SQLite 只读且不改文件的方式打开（`mode=ro&immutable=1`），只输出统计数字。主库有未合并 WAL，这种方式读出的结果不可靠，已弃用、未报告。
- **外部核验**：WebFetch COSMoS 目录、README、表头、归档；OSB 的 README、licenses.md 和两个组件 LICENSE.md；curl 管道流式解析三个 CSV 计数，全程未落盘。未访问 CDISC Library API（需要账号）。
- **未运行**：任何测试或构建。没有创建、修改、删除任何文件，没有任何 git 写操作。

---

## 7. 关键文件（绝对路径）

- `.trellis/tasks/10-13-cdisc-standard-reference/prd.md`
- `backend/src/models/form.py`、`field_definition.py`、`form_field.py`、`codelist.py`
- `backend/src/schemas/form.py`、`_common.py`
- `backend/src/routers/template_fields.py`、`forms.py`
- `backend/src/services/template_field_index_service.py`、`import_service.py`、`export_service.py`、`word_table_parity.py`、`ai_review_service.py`、`field_type_policy.py`
- `backend/src/config.py`
- `frontend/src/components/TemplateFieldSearchDialog.vue`、`FormDesignerTab.vue`、`FieldsTab.vue`、`CodelistQuickEditDialog.vue`、`App.vue`
- `frontend/src/composables/templateFieldSearch.js`、`searchRanking.js`、`fieldDefinitionAutocomplete.js`、`formDesignerPropertyEditor.js`
- `.trellis/spec/guides/cross-stack-contracts.md`
- `LICENSE`

**下一步建议**：先拍板 4 个决策点，再把结论回填到 PRD（要写文件，需授权）：① MVP 是否包含 domain 入口（C1/C2）？② domain 用什么格式（单值、多值还是自由文本）？③ 中文别名归谁维护？④ 标准数据存在哪里，导出 CSV 的许可是否已核实？可用 trellis-brainstorm 进行。
