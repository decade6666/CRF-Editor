# 标准参考数据查验与提示可行性（COSMoS / OpenStudyBuilder）

> 状态：占位草案（2026-10-13）。本文件仅记录外部项目地址与初步预期目标；详细需求、范围与验收标准待后续讨论填充。

## Goal

评估并规划把 CDISC 标准参考数据接入 CRF-Editor，用于域名（SDTM domain）、变量名等查验与提示。第一阶段为只读标准查询与提示，不自动改 OID、不建立 SDTM 映射、不引入 Neo4j。

## 外部项目地址

| 项目 | 地址 | 推荐用途 | 许可 |
| --- | --- | --- | --- |
| COSMoS | https://github.com/cdisc-org/COSMoS | 参考数据源：`export/cdisc_sdtm_dataset_specializations_latest.csv`（正式）、`export/cdisc_crf_specializations_draft.csv`（草案）、`export/cdisc_biomedical_concepts_latest.csv`；提供"采集概念 → 域 → 目标变量 → 单位/字典/标注条件"关联 | 代码 MIT；内容 CC-BY-4.0（需保留署名） |
| OpenStudyBuilder | https://github.com/NovoNordisk-OpenSource/openstudybuilder-solution | 借鉴对象：版本化标准库管理、SDTM/SDTMIG/CDASH/CDASHIG 元数据导入、变量映射模型（`import_standards/`）。不整套接入 | 前端/API/标准导入 GPLv3；db 组件 MIT（复制代码前必须单独核对许可兼容性） |

## 初步预期目标

1. **只读标准查询与提示**：按域、变量、概念、英文标签查询标准元数据；结果区分"匹配 / 疑似不匹配 / 参考库未覆盖（自定义）"，并显示来源、适用标准版本、正式/草案状态。
2. **不改变现有标识体系**：编辑器字段 OID（`FieldDefinition.variable_name`，项目内唯一）≠ SDTM 目标变量（如身高/体重同为 `VSORRES`，靠 `VSTESTCD` 区分）；不自动改写 OID、不替换字段绑定、不默认阻止保存。
3. **补齐域名入口（待确认）**：后端已有 `Form.domain` 但设计器表单属性面板无编辑入口（`FormDesignerTab.vue`）；如做域联想需一并补齐。
4. **架构约束**：保持 SQLite + FastAPI + Vue 3 现有架构，标准参考数据作为独立本地索引，不引入 Neo4j。

## 已知边界（来自 2026-10-13 只读评估）

- COSMoS 不是完整合规校验器；CRF 特化数据是 DRAFT，只能作提示不作强制规则。
- 现有 OID 校验仅字符集（`^[A-Za-z0-9._-]+$`），无 CDISC 语义校验。
- 中文检索需自行维护中文别名，英文参考数据不天然支持中文语义匹配。
- 可复用 `TemplateFieldSearchDialog.vue` 的只读查询/复制/模糊排序交互；设计器现有自动完成是字段换绑路径，不能混入标准记录。
- CDISC 标准数据本身的使用权限需与源码许可分开核对。

## Requirements

- TBD（待后续讨论填充）

## Acceptance Criteria

- [ ] TBD（待后续讨论填充）
