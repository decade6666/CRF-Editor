# Settings Export Import Metadata Polish — Tasks

- [x] 1.1 在 `frontend/src/App.vue` 中把“编辑模式”开关改为与主题模式一致的 `inline-prompt` 形式，文案固定为 `简要/完全`，并同步更新设置说明文案，完成证据：`frontend/tests/appSettingsShell.test.js` 断言新开关结构与文案
- [x] 1.2 在 `frontend/src/components/FormDesignerTab.vue` 中放宽“设计表单”按钮可见性，使其仅依赖 `selectedForm`；同时保持“新建表单”与高级编辑入口继续受 `editMode` 约束，完成证据：新增或更新 `frontend/tests/*.test.js` 静态断言覆盖按钮可见性条件
- [x] 1.3 在 `frontend/src/App.vue` 中移除头部 `导入Word` 按钮，只保留 `导入模板` 与 `导出Word`；将 `导入Word` 按钮移动到设置区 `导入项目` 下方，并删除“数据导出”标题文字但保留横向分隔，完成证据：`frontend/tests/appSettingsShell.test.js` 断言头部按钮集合、设置区动作顺序与标题移除
- [x] 1.4 调整头部 `导入模板` 按钮样式，使其与 `导出Word` 保持同级视觉强调且不改变现有点击行为，完成证据：前端静态结构测试覆盖按钮 type/class 变化

- [x] 2.1 在 `backend/src/models/project.py`、`backend/src/schemas/project.py` 中新增 `screening_number_format` 字段；实现空白归一、最大长度 100、禁止换行/控制字符的校验，完成证据：项目 schema/接口相关测试覆盖合法值、空白值与非法输入
- [x] 2.2 在 `backend/src/routers/projects.py`、`backend/src/routers/admin.py`、`frontend/src/components/ProjectInfoTab.vue` 中接通 `screening_number_format` 的读写与显示，并在项目页为空时回退默认串 `S|__|__||__|__|__|`，完成证据：项目更新响应与前端静态测试覆盖新字段展示/提交
- [x] 2.3 在 `backend/src/database.py` 中新增幂等 SQLite 迁移，为 `project` 表补充 `screening_number_format` 列但不强制批量回填历史值，完成证据：迁移相关测试或新增测试验证旧库补列成功
- [x] 2.4 在 `backend/src/services/project_clone_service.py` 中让项目复制保留 `screening_number_format`，完成证据：`backend/tests/test_project_copy.py` 新增断言验证复制后字段值保持一致
- [x] 2.5 在 `backend/src/services/project_import_service.py` 中为旧版项目 `.db` 缺少 `screening_number_format` 提供兼容导入语义，不把该列加入老库硬性必需列，完成证据：`backend/tests/test_project_import.py` 新增 legacy `.db` 缺列仍可导入的回归测试

- [x] 3.2 在 `backend/src/services/export_service.py` 中将封面页 `筛选号` 从硬编码字符串改为读取 `project.screening_number_format`，空值时统一回退默认串，完成证据：`backend/tests/test_export_service.py` 新增/更新封面表断言
- [x] 3.3 在 `backend/src/services/export_service.py` 中把目录尾与访视分布图尾都改为 `WD_SECTION.NEW_PAGE` 分节，令访视分布图页独立使用 landscape，后续表单页恢复 portrait，并对新 section 重新应用页眉页脚，完成证据：`backend/tests/test_export_service.py` 或 `backend/tests/test_export_unified.py` 新增 section/orientation 断言
- [x] 3.6 保持 `doc.tables[0]` 为封面表、`doc.tables[1]` 为访视分布图表，避免破坏 `backend/src/services/docx_import_service.py` 当前前两表跳过前提，完成证据：`backend/tests/test_export_service.py` 或 `backend/tests/test_export_validation.py` 新增/更新前两表结构断言

- [x] 4.1 运行并更新本次变更涉及的后端测试：`cd backend && python -m pytest tests/test_export_service.py tests/test_export_validation.py tests/test_export_unified.py tests/test_project_copy.py tests/test_project_import.py -q`
- [x] 4.2 运行并更新本次变更涉及的前端测试：`cd frontend && node --test tests/appSettingsShell.test.js tests/orderingStructure.test.js tests/sidebarCopyButtonScope.test.js`
- [x] 4.3 变更级自检：确认编辑模式语义、头部/设置入口重排、项目元数据持久化、旧库导入兼容、Word 封面筛选号来源、访视分布图 section/orientation、访视分布图继续保持 `×` 标记语义，均与本次 OpenSpec artifacts 一致
