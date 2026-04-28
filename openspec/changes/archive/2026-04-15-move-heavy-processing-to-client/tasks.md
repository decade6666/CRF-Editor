## 1. 契约与边界重定义

- [x] 1.1 定义 `normalized_import_manifest` 数据契约：包含 `schema_version`、`document_fingerprint`、form/field 稳定 `semantic_id`、现有字段语义所需属性，并明确不再包含 `raw_html`
- [x] 1.2 设计新的 DOCX 预览协议：浏览器侧生成 manifest 并渲染语义预览，预览主路径不再依赖服务端 `temp_id` 和服务端临时 DOCX 文件
- [x] 1.3 设计新的 DOCX 执行导入协议：服务端以 manifest 为 authoritative 输入，原始 DOCX 最多作为可选诊断附件
- [x] 1.4 设计 AI 建议和截图映射协议：统一从位置索引迁移到稳定 `semantic_id` 引用

## 2. DOCX 预览与截图路径规划

- [x] 2.1 规划浏览器 + Web Worker 的 DOCX 解析主路径，覆盖当前 `parse_full` 所需的表单、字段、选项、单位、默认值、inline/log_row 语义
- [x] 2.2 规划前端语义预览 UI：先展示 manifest 生成的语义预览，不等待截图完成
- [x] 2.3 规划截图保留方案：截图改为后台延迟触发的增强能力，失败时返回明确 degraded / unsupported 状态，不影响预览成功
- [x] 2.4 明确旧截图主路径的下线范围：不再把截图成功作为进入预览或执行导入的前置条件

## 3. 服务端 authoritative 执行规划

- [x] 3.1 规划服务端 manifest 校验层：校验 schema_version、字段类型白名单、稳定 ID 完整性、业务语义一致性和 owner 权限
- [x] 3.2 规划服务端导入执行层：复用现有导入写库语义与事务回滚边界，但输入改为 manifest 而非原始 DOCX 重解析
- [x] 3.3 规划结构化日志与审计字段：记录 `document_fingerprint`、manifest 版本、截图任务状态、执行结果，补足客户端化后的可观测性

## 4. Word 导出与数据库导入边界规划

- [x] 4.1 明确 Word 导出保持服务端 authoritative 生成，客户端不替代最终 `.docx` 生成与校验
- [x] 4.2 规划数据库导入客户端预检边界：仅 `<= 32MB` 文件允许预检，结果仅 advisory
- [x] 4.3 明确数据库导入对 `> 32MB` 文件直接走服务端 authoritative 导入，不进入客户端 SQLite 预检路径

## 5. 验证与迁移任务

- [x] 5.1 为 manifest 设计属性测试：同一输入在预览与执行间保持 form/field 语义、顺序与稳定 ID 一致
- [x] 5.2 为截图降级路径设计验证：截图失败、超时或不支持时，语义预览仍可成功并明确暴露 degraded 状态
- [x] 5.3 为服务端执行设计验证：非法 manifest、非法字段类型、权限不匹配或事务失败时不产生部分写入
- [x] 5.4 为数据库导入预检边界设计验证：32MB 阈值内外分别命中正确分支，且最终 authoritative 结果始终以服务端为准
- [x] 5.5 为 `raw_html` 移除设计迁移检查：确认新契约与调用方不再依赖该字段
