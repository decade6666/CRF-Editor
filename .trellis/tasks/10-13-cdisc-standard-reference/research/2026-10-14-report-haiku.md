# 子代理原始报告 — haiku 路

> 2026-10-14 独立同题发散分析，与 [sonnet](./2026-10-14-report-sonnet.md) / [opus](./2026-10-14-report-opus.md) / [fable](./2026-10-14-report-fable.md) 互不共享结论。汇总见 [analysis-synthesis](./2026-10-14-analysis-synthesis.md)。仅只读分析，未改任何文件。

# CDISC 标准参考数据（COSMoS / OpenStudyBuilder）接入 CRF-Editor 功能探索分析报告

## 一句话通俗结论

**通过把 CDISC 国际标准数据作为本地只读字典引入系统，不仅能立即补齐表单 SDTM 域这一历史遗漏入口并提供即时标准查阅，更能在不破坏现有字段标识体系的前提下，将 CRF-Editor 从单纯的排版制表工具，逐步演进为具备标准自动联想、临床概念字段组拼装、整项目合规体检与 aCRF 自动标注的临床数据标准化设计平台。**

---

## 术语通俗解释（首次出现）

- **CDISC（临床数据交换标准协会）**：全球通用的临床试验数据标准组织，药监部门（如 NMPA、FDA）通常要求申报数据符合其规范。
- **SDTM（研究数据制表模型）**：CDISC 针对临床试验提交给药监局的分析前原始数据库标准，数据按业务主题组织为不同的"域"（Domain，如人口学 DM、生命体征 VS、不良事件 AE）。
- **CDASH（临床数据采集标准）**：CDISC 针对临床医生和研究护士在病例报告表（CRF）上采集原始数据时的字段与问题设计规范。
- **COSMoS（CDISC 开放标准模型服务）**：CDISC 官方推出的标准化数字资源库，以机器可读形式（CSV/JSON/LinkML）提供 SDTM 规范特化规则与采集概念映射。
- **Biomedical Concepts（生物医学概念，简称 BC）**：对临床指标的语义抽象（如"收缩压"、"体温"），一个概念下聚合了该指标采集时所需的目标变量、值类型、测量条件及单位。
- **OID（唯一对象标识符）**：系统内字段、表单等实体的唯一技术编码；CRF-Editor 中用于唯一区分每一个字段定义，具有严格的唯一性约束。
- **aCRF（带注释的病例报告表，annotated CRF）**：在空白 CRF 页面上标注每个输入框对应哪个 SDTM 域和变量的 PDF/Word 交付物，是药物申报必交的关键文件。

---

## 一、代码现状与架构基线事实

1. **表单级 Domain 已在后端完整就绪，但前端面板存在断点**：
   - 数据库与数据模型：`/home/decade/CRF-Editor/backend/src/models/form.py` 中的 `Form` 模型已具备 `domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)`。
   - 请求模型与路由：`/home/decade/CRF-Editor/backend/src/schemas/form.py`（`FormCreate`、`FormUpdate`、`FormResponse`）以及 `/home/decade/CRF-Editor/backend/src/routers/forms.py` 均完整透传并持久化 `domain`。
   - aCRF 预览引用：`/home/decade/CRF-Editor/frontend/src/components/FormDesignerTab.vue` 中函数 `getFormDomainAnnotationText(form)` 已经消费 `form?.domain` 生成表单域标注。
   - **断点所在**：`/home/decade/CRF-Editor/frontend/src/components/FormDesignerTab.vue` 的表单属性面板（`data-test="designer-form-property-form"`）仅渲染并提交了 `code`（OID）、`name`（名称）、`paper_orientation`（纸张方向），**并未提供 `domain` 输入框**，保存方法 `persistFormProps` 亦未传递 `domain`。
2. **只读模板索引架构模式成熟可复用**：
   - 后端路由 `/home/decade/CRF-Editor/backend/src/routers/template_fields.py` 与服务 `/home/decade/CRF-Editor/backend/src/services/template_field_index_service.py` 建立了使用 `PRAGMA query_only` 安全只读打开独立 SQLite 数据库并构建轻量只读索引的范式。
   - 前端组件 `/home/decade/CRF-Editor/frontend/src/components/TemplateFieldSearchDialog.vue` 实现了非模态（`:modal="false"`）、可穿透（`modal-penetrable`）、可拖拽（`draggable`）、分页及点击单元格一键复制的查询交互，配合 `/home/decade/CRF-Editor/frontend/src/composables/searchRanking.js` 多阶梯匹配算法，为 CDISC 标准查询提供了现成的交互参考模板。
3. **字段 OID 体系是不可侵犯的硬边界**：
   - 数据模型约束：`/home/decade/CRF-Editor/backend/src/models/field_definition.py` 具有唯一键约束 `UniqueConstraint("project_id", "variable_name", name="uq_field_def_var_name")`。
   - 临床业务事实：SDTM 变量存在"一对多"重用特征（例如身高和体重在 SDTM 中均为 `VSORRES`，依靠 `VSTESTCD="HEIGHT"` 或 `"WEIGHT"` 区分）。若将字段 OID 强制改成 SDTM 变量名，会导致同表单内指标发生 OID 冲突；因此 OID 保持现有体系，CDISC SDTM 变量只作为元数据提示与标注层。

---

## 二、CDISC 标准功能全景清单

按实施周期与价值维度，将功能规划为六大模块、共 15 个功能点：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CRF-Editor CDISC 功能全景                        │
├────────────────────────────────┬───────────────────────────────────────┤
│ 近期（MVP 与快速见效）          │ 中期（深度融合与提效）                │
│ 1. 表单域（Domain）输入与补全  │ 5. 受控术语（CT）标准库引用与校验     │
│ 2. 独立 CDISC 标准参考检索弹窗 │ 6. 字段属性标准配置一键反填           │
│ 3. 字段属性编辑页标准匹配徽标  │ 7. Biomedical Concepts 概念字段组模板  │
│ 4. aCRF 自动标准标注增强       │ 8. 表单级 CDASH 预置模板脚手架        │
│                                │ 9. 表单内字段跨域错位预警             │
│                                │ 10. 中文临床别名与同义词联想          │
├────────────────────────────────┴───────────────────────────────────────┤
│ 远期（合规体检与生命周期）                                             │
│ 11. 整项目 CDISC 覆盖度与合规差距体检报告                              │
│ 12. SDTM 数据集就绪度清单（Readiness Spec）导出                        │
│ 13. CDISC 标准版本升级变更差异与影响面对比                             │
│ 14. 机构/申办方私有标准库覆盖层（Sponsor Overlay）                     │
├────────────────────────────────────────────────────────────────────────┤
│ 越界方案（显式隔离）                                                   │
│ 15. 【越界，需用户另行决策】字段 OID 自动批量重命名为 SDTM 变量        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 三、逐条功能明细表

### 1. 表单域（Domain）输入与标准补全
- **一句话通俗描述**：在表单属性编辑区增加 SDTM 域输入框，输入时支持标准域名（如 AE、VS、LB）下拉联想。
- **用户价值**：补齐当前前端遗留断点，让表单具备标准归属信息，为 aCRF 标注和后续校验提供锚点。
- **实现要点**：
  - 修改 `/home/decade/CRF-Editor/frontend/src/components/FormDesignerTab.vue`：在 `editFormProp` 增加 `domain` 属性；在 `data-test="designer-form-property-form"` 中增加 `el-autocomplete` 或 `el-select`；在 `persistFormProps` 中透传 `domain`。
  - 后端 `/home/decade/CRF-Editor/backend/src/models/form.py` 与 `/home/decade/CRF-Editor/backend/src/routers/forms.py` 已原生支持，无需变更后端接口。
- **数据依赖**：COSMoS 标准域清单（`domain` 字段及对应描述，约 40~50 个标准域）。
- **风险**：无明显风险，纯粹补齐已有模型字段的编辑能力。
- **评级**：极高价值 / 极低成本（P0 级首选）。

### 2. 独立 CDISC 标准参考检索弹窗（CDISC Reference Search Dialog）
- **一句话通俗描述**：一个类似模板字段查询的浮动窗口，可随时按域、变量名、标签检索 CDISC 规范，点击直接复制。
- **用户价值**：无需翻阅几百页 PDF 或切换外部网页，在设计 CRF 时就地检索标准定义、格式、受控术语及单位。
- **实现要点**：
  - 新增前端组件 `/home/decade/CRF-Editor/frontend/src/components/CdiscStandardSearchDialog.vue`，复用 `TemplateFieldSearchDialog.vue` 的非模态、穿透、拖拽、分页及点击复制逻辑。
  - 新增后端路由 `/home/decade/CRF-Editor/backend/src/routers/cdisc_standards.py` 及服务 `/home/decade/CRF-Editor/backend/src/services/cdisc_standard_service.py`。
  - 将 COSMoS CSV 预编译为独立的 SQLite 只读数据库（如 `cdisc_standards.db`），开启 FTS5 全文索引。
- **数据依赖**：`cdisc_sdtm_dataset_specializations_latest.csv`（正式版）+ `cdisc_crf_specializations_draft.csv`（草案）。
- **风险**：遵循 COSMoS CC-BY-4.0 许可需保留署名；草案字段需显式标黄/打标区分。
- **评级**：高价值 / 中成本。

### 3. 字段属性编辑区标准匹配徽标与提示（Field Standard Status Badge）
- **一句话通俗描述**：选中字段时，属性面板右上角以绿色、黄色或灰色小标签展示该字段是否为 CDISC 标准变量。
- **用户价值**：给设计者无侵入的即时合规反馈，清楚知道自己设计的字段哪些是国际标准、哪些是自定义衍生字段。
- **实现要点**：
  - 在 `/home/decade/CRF-Editor/frontend/src/components/FormDesignerTab.vue` 的字段属性卡片标题区新增状态徽标。
  - 匹配逻辑由前端缓存的标准只读集合进行轻量比对：变量名匹配为绿色（Standard），相似或前缀匹配为黄色（Variant/Similar），未收录为灰色（Custom）。
  - 点击徽标可弹出 Popover 查看标准中对应的定义与推荐属性。
- **数据依赖**：标准变量集合索引（`sdtm_variable`、`short_name`、`domain`）。
- **风险**：不能把非标准直接视作错误，临床试验允许大量自定义字段（NSV/Supplemental）。
- **评级**：高价值 / 低成本。

### 4. aCRF 自动标准标注增强（Standard aCRF Annotation Enrichment）
- **一句话通俗描述**：在 aCRF 预览和 Word 导出时，不仅显示字段 OID，还能自动补充标准 SDTM 标注（如 `=VSORRES when VSTESTCD='WEIGHT'` 或 `[NOT SUBMITTED]`）。
- **用户价值**：极大减轻临床数据管理与统计程序员手工绘制 aCRF 申报材料的繁琐标注工作。
- **实现要点**：
  - 修改 `/home/decade/CRF-Editor/frontend/src/components/DesignerWordPreview.vue` 与 `DesignerAcrfAnnotation.vue`：在展示标注文本时，若当前字段匹配到标准且配置了 SDTM 标注，则优先或追加展示标准标注文本。
  - 修改 `/home/decade/CRF-Editor/backend/src/services/export_service.py`：在 aCRF 导出 DrawingML 标注框时，写入富化后的 SDTM 标注。
  - 维持现有 `form.annotation_positions` 拖拽与偏移量持久化机制完全兼容。
- **数据依赖**：`cdisc_crf_specializations_draft.csv` 中的 `sdtm_annotation` 和 `sdtm_target_variable`。
- **风险**：若用户修改了字段含义但沿用了标准变量名，自动标注可能不准；需支持用户自由修改或重置为 OID。
- **评级**：高价值 / 中成本。（汇总注：opus/fable 判此为越界灰区——映射语义 + 监管交付物 + 单行 4.6cm 放不下；倾向只做预览层只读参考。）

### 5. 受控术语（CT）标准库快捷引用与比对（Standard Controlled Terminology Picker）
- **一句话通俗描述**：新建字典或编辑字典时，可从 CDISC 标准受控术语列表（如性别 SEX、种族 RACE、不良事件严重度 AETOXGR）中一键导入标准选项及 NCI 代码。
- **用户价值**：杜绝手工录入字典选项时的拼写错误，从源头确保临床编码与解码与药监库一致。
- **实现要点**：
  - 改造 `/home/decade/CRF-Editor/frontend/src/components/CodelistQuickEditDialog.vue` 与 `CodelistsTab.vue`，增加"从 CDISC 术语库导入"快捷入口。
  - 检查现有字典选项的 Code/Decode 是否偏离标准受控词汇，并在界面提供一键对齐建议。
- **数据依赖**：COSMoS 中的 `codelist`, `codelist_submission_value`, `value_list`。
- **风险**：申办方常有自主扩展项（Extended Terms），导入功能必须允许用户在标准项基础上自行增删，不能写死。
- **评级**：高价值 / 中成本。

### 6. 字段属性标准配置一键反填（Standard Field Attribute Autofill）
- **一句话通俗描述**：在新建字段或选定标准变量后，提供按钮一键带出标准推荐的字段标签、控件类型、数值精度和单位。
- **用户价值**：将单个字段的参数配置时间从几分钟缩短至 2 秒，大幅降低手工配置漏项概率。
- **实现要点**：
  - 在 `/home/decade/CRF-Editor/frontend/src/components/FormDesignerTab.vue` 的字段属性编辑面板内增加「应用标准推荐配置」按钮。
  - 触发后，将标准库中的 `question_text` 填入 `label`、`data_type` 映射为 `field_type`、`length/significant_digits` 填入 `integer_digits/decimal_digits`。
  - **核心约束**：绝不自动修改现有的 `variable_name`（OID），防止触发 `uq_field_def_var_name` 冲突或污染引用。
- **数据依赖**：`cdisc_crf_specializations_draft.csv` (question_text, data_type, length, significant_digits)。
- **风险**：CRF 特化数据为 DRAFT 状态，部分推荐数据类型（如 date 格式）可能与本地业务库的格式存在细微出入，需经过中间层适配器做安全映射。
- **评级**：高价值 / 中成本。

### 7. Biomedical Concepts（BC）驱动的标准字段组模板（BC-Driven Field Group Template）
- **一句话通俗描述**：按临床医学概念（如"体温测量"、"血压与脉搏"、"心电图"）一键批量插入包含整套标准字段的表单块。
- **用户价值**：避免临床表单设计中"采了数值漏了体位"、"采了检查漏了时间"的系统性设计缺陷。
- **实现要点**：
  - 借鉴 OpenStudyBuilder 将概念分解为 DEC 属性的设计理念。利用 COSMoS 中的 `cdisc_biomedical_concepts_latest.csv`，将一个 BC ID 关联的所有变量组织为字段组。
  - 前端在设计器工具栏新增「插入医学概念字段组」对话框，用户勾选后，批量构造局部 draft 字段，通过现有的 `addField` / `saveDraftField` 机制安全持久化。
  - 必须与 `/home/decade/CRF-Editor/frontend/src/composables/useDesignerHistory.js` 适配，将批量插入包装为单次可撤销操作。
- **数据依赖**：`cdisc_biomedical_concepts_latest.csv` (bc_id, dec_id, dec_label) ↔ `cdisc_crf_specializations_draft.csv`。
- **风险**：批量插入容易产生 OID 碰撞，必须通过 `/home/decade/CRF-Editor/backend/src/services/unique_name.py` 机制做递增编号。
- **评级**：中高价值 / 中高成本。

### 8. 表单级 CDASH 预置模板脚手架（CDASH Form Template Scaffolding）
- **一句话通俗描述**：新建表单时，除了从空白开始，还可直接套用"不良事件表"、"合并用药表"、"既往病史表"等官方 CDASH 标杆表单。
- **用户价值**：使标准化表单的搭建速度提高 80%，初级数据管理员也能快速拉出规范框架。
- **实现要点**：
  - 基于 COSMoS `crf_group_id`（如 `AE_DENORMALIZED`, `CM_GENERAL`）提取完整的表单定义。
  - 复用现有 `/home/decade/CRF-Editor/backend/src/services/import_service.py` 的表单复制和创建机制，在后台生成标准表单实例。
- **数据依赖**：`cdisc_crf_specializations_draft.csv` 中的 `crf_group_id`、`order_number`、`crf_item`。
- **风险**：草案表单的字段较多，不同科室试验裁剪差异大，生成的模板只作为初稿供用户自由删减。
- **评级**：高价值 / 中成本。

### 9. 表单内字段跨域错位预警（Form-Domain Consistency & Misplacement Warning）
- **一句话通俗描述**：如果表单的域设为 `VS`（生命体征），但内部添加了 `AETERM`（不良事件名称），界面给予温和提醒。
- **用户价值**：防止设计人员在长周期协作中因粗心混淆表单归属，导致后续 SDTM 抽取数据混乱。
- **实现要点**：
  - 纯前端只读检查：计算属性监控当前表单所有字段的 CDISC 标准所属域与当前表单 `domain` 的交集与差集。
  - 仅作为设计器顶栏的状态警告条或图标提示，**绝不拦截保存操作**（因临床上允许在某些概况表中包含伴随字段）。
- **数据依赖**：COSMoS `domain` ↔ `sdtm_variable` 归属表。
- **风险**：低风险；只要遵循"提示不拦截"原则即可。
- **评级**：中价值 / 低成本。

### 10. 中文临床别名与同义词联想（Chinese Alias & Clinical Synonym Search）
- **一句话通俗描述**：在搜索框输入中文"心率"、"不良反应"、"既往病史"，能够准确关联出 HR、AE、MH 相关的标准英文变量。
- **用户价值**：破除国内临床科研人员对纯英文 CDISC 缩写记不准、搜索慢的痛点。
- **实现要点**：
  - COSMoS 原生仅包含英文（`synonyms` 字段含有大量英文同义词如 `6MWT;SIXMW1`）。
  - 在构建本地只读索引时，利用脚本将常用中英对照表预置到 SQLite 的 `standard_term_synonym` 表中。
  - 前端搜索组合 `/home/decade/CRF-Editor/frontend/src/composables/searchRanking.js`，实现拼音/中文/英文缩写的联合召回。
- **数据依赖**：COSMoS `synonyms` 字段 + 维护一份常见临床中英对照表（约 500~1000 词条）。
- **风险**：中文医学术语存在同义不同词现象（如不良事件/不良反应），需持续积累补充。
- **评级**：高价值 / 中成本。

### 11. 整项目 CDISC 覆盖度与合规差距体检报告（Project CDISC Coverage & Gap Audit）
- **一句话通俗描述**：为整个试验项目的 CRF 做一次"一键体检"，出具体检报告说明标准覆盖率以及哪些推荐必采项漏掉了。
- **用户价值**：在项目定稿评审时，帮助数据主管（Data Manager）快速向申办方和质控方汇报标准化程度。
- **实现要点**：
  - 新增后端路由 `GET /api/projects/{project_id}/cdisc-audit`。
  - 遍历当前项目的 `Form` 与 `FormField`，比对本地标准索引，统计：表单域覆盖率；字段标准匹配率（标准字段 vs 自定义字段比例）；必采项遗漏提示。
  - 新增只读弹窗组件 `/home/decade/CRF-Editor/frontend/src/components/CdiscAuditDialog.vue`，图表展示统计饼图与待办表格。
- **数据依赖**：`cdisc_sdtm_dataset_specializations_latest.csv` (mandatory_variable, role)。
- **风险**：必须明确声明该报告为系统建议性质的参考指标，不代表官方合规审计结论。
- **评级**：高价值 / 中成本。

### 12. SDTM 数据集就绪度清单导出（SDTM Readiness Spec Export）
- **一句话通俗描述**：一键导出 Excel 格式的 SDTM 变量清单，列出 CRF 各字段对应的域、目标变量、类型、是否标准及 aCRF 标注。
- **用户价值**：直接作为统计编程团队编写 SDTM 映射规范（Mapping Specification）的基础输入文档，打通 CRF 到 SDTM 的交接链路。
- **实现要点**：
  - 新增后端导出接口 `/home/decade/CRF-Editor/backend/src/routers/export.py`：使用 Python 生成包含字段 OID、表单名、对应 Domain、SDTM 目标变量、受控术语、aCRF 标注的规范 Excel。
  - 前端在导出下拉菜单中增加「导出 SDTM 映射清册」。
- **数据依赖**：当前项目字段定义 + CDISC 匹配关系缓存。
- **风险**：低风险，纯只读衍生交付物。
- **评级**：高价值 / 低成本。

### 13. CDISC 标准版本升级变更差异与影响面对比（Standards Version Diff & Impact Report）
- **一句话通俗描述**：当系统升级导入新版 CDISC 标准包时，能够清晰对比新旧版本变动了哪些变量、弃用了哪些字典，并标出当前项目哪些字段受影响。
- **用户价值**：跨周期大项目面临标准版本迭代时，能评估合规升级工作量，避免盲目重构。
- **实现要点**：
  - 借鉴 OpenStudyBuilder 版本化管理思路，在本地 SQLite 数据库中按 `package_date` 或 `standard_version` 保存多版本快照。
  - 编写对比服务计算版本间的 `added`, `deprecated`, `modified` 差集。
- **数据依赖**：多期 COSMoS 发行版本数据文件。
- **风险**：多版本数据导致本地 SQLite 索引体积增大；对初级项目价值有限，偏企业级运维。
- **评级**：中价值 / 高成本（远期考虑）。

### 14. 机构/申办方私有标准库覆盖层（Sponsor-Specific Standards Overlay）
- **一句话通俗描述**：允许企业在官方 CDISC 标准之上，上传导入自己公司的企业级标准库（Sponsor Library），优先匹配公司内部命名习惯。
- **用户价值**：满足 CRO 和大药企严格遵循内部全球库（Global Library SOP）的需求。
- **实现要点**：
  - 借鉴 OpenStudyBuilder `import_sponsor_data/` 的分层设计。
  - 在本地数据库中增加 `cdisc_standard`（官方层）与 `sponsor_standard`（企业层）两套表结构，查询时采用优先级叠加覆盖策略。
- **数据依赖**：企业定制 CSV/Excel 上传文件。
- **风险**：涉及多租户/项目权限隔离，需要严密的权限控制与版本冲突处理。
- **评级**：中价值 / 高成本（远期考虑）。

---

## 四、越界方案警示说明（硬边界控制）

### 15. 【越界，需用户另行决策】字段 OID 自动批量重命名为 SDTM 变量
- **方案设想**：系统自动扫描表单中的所有字段，根据 CDISC 匹配结果，将用户创建的字段 OID（如 `SYS_BP`）自动重命名为标准 SDTM 变量（如 `VSORRES`）。
- **判定结论**：**严禁自动实施！属于越界方案，必须严格禁止自动发生。**
- **技术与业务冲突根因**：
  1. **数据库唯一性约束破坏**：`/home/decade/CRF-Editor/backend/src/models/field_definition.py` 中有 `UniqueConstraint("project_id", "variable_name", name="uq_field_def_var_name")`。在同一项目中，收缩压和舒张压属于两个独立字段，但它们的 SDTM 目标变量均为 `VSORRES`。若自动重命名为 SDTM 变量，将直接触发数据库唯一性约束冲突崩溃！
  2. **引用破坏与排版错乱**：字段 OID 是访视表单、表格排版与 Word 导出绑定的核心技术键，静默改名会导致历史引用的字段实例断裂。
- **正确边界做法**：
  - 字段 OID（`variable_name`）保持为项目内唯一标识符不变。
  - CDISC SDTM 目标变量（`sdtm_target_variable`）仅作为**附加语义元数据**存储在只读索引或扩展元数据属性中，供界面提示、体检报告和 aCRF 标注提取使用，绝不改写字段主键与 OID。

---

## 五、PRD 缺口分析（占位草案遗漏项）

1. **缺少数据生命周期与部署形态规范**：PRD 未明确 COSMoS 参考数据是以编译好的只读 SQLite 文件随应用打包分发，还是在后台启动时从 CSV 文件动态解析入库。建议采用离线预处理脚本将 CSV 压制为 `cdisc_standards.db`，由应用在启动时只读挂载。
2. **缺少 COSMoS 草案数据（DRAFT）的置信度分级策略**：未定义界面呈现层如何向用户传达"正式标准"与"草案建议"的置信度差异。
3. **缺少交互触点与入口边界定义**：未明确触发查询的入口位置、是否支持快捷键唤出、以及与现有 `TemplateFieldSearchDialog.vue` 的呼应或整合关系。
4. **缺少中文支持的具体实施方案**：别名库由谁维护、存储在何处、如何与 COSMoS 概念建立关联。
5. **缺少定量验收指标（Acceptance Criteria）**：缺少模糊检索的耗时门槛（如 10 万条标准记录下搜索响应需在 150ms 内）、匹配准确率要求、离线免联网保证，以及生产模式下的资源占用限制。

---

## 六、建议的 MVP 切分策略（分阶段推进路线图）

```
Phase 1: MVP（极小改动，闭环核心只读能力）
├── 1. 表单属性面板补齐 Domain 编辑（补齐现有断点）
├── 2. COSMoS CSV 离线导入脚本与本地 SQLite 只读索引（含 FTS5）
└── 3. 独立 CDISC 标准参考查询弹窗（复用现有组件交互）

Phase 2: 交互内嵌（设计器就地辅助）
├── 4. 字段属性编辑区标准状态徽标与推荐提示
├── 5. 字段标准属性配置一键反填（安全不改 OID）
└── 6. aCRF 标注优先读取 SDTM 标注文本

Phase 3: 体系扩展（深度合规与概念驱动）
├── 7. Biomedical Concepts 概念字段组模板
├── 8. 整项目 CDISC 覆盖度与合规差距体检报告
└── 9. SDTM 就绪度清单（Readiness Spec）Excel 导出
```

### MVP（第一阶段）详细范围与工作量预估：

1. **表单 Domain 入口补齐**（前端约 20 行代码）：后端完全无需修改。
2. **标准参考数据只读索引**（离线脚本 + 后端只读服务）：离线构建脚本 `backend/scripts/build_cdisc_index.py`，建立 `cdisc_reference.db` 并构建 FTS5 虚拟表；路由 `GET /api/cdisc-standards/search` 与 `GET /api/cdisc-standards/domains`。
3. **前端只读查询弹窗**：新增 `CdiscStandardSearchDialog.vue`，非模态、可拖拽、点格复制。

---

## 七、建议的下一步行动

1. **补充与完善 PRD**：将 Phase 1 的三个具体功能、边界条件及验收标准回填至 prd.md。
2. **离线数据探查验证**：验证字段完整度与行数规模，设计并确定 SQLite 本地表的表结构模式。
3. **在工作树中启动 Phase 1**：优先实现表单属性面板的 `domain` 补齐与单元测试。

---

*注：本次探索为严格只读分析，未对代码库产生任何修改、创建或删除操作。*
