以下是针对 `/root/github/CRF-Editor` 仓库中未提交的 aCRF 标注竖直拖动与持久化相关改动的独立审查报告。

---

# 重点审查项分析与结论

1. **跨栈同源正确性**：
   - **换算与符号**：后端公式 `posOffset = -120000 + Δy×3600 EMU` 与前端 `resolveAnnotationTopCm` （计算式为 `default + Δy * 3600` 转化为 cm）在符号（`+Δy` 向下）、换算单位（`0.01cm = 3600 EMU`）以及几何常数上完全同源一致。固定换算比使用 CSS 规范 `96px = 1in = 914400 EMU`，保证了屏幕坐标与 Word 导出的物理尺寸一致。
   - **默认位置**：当 Δy=0 时，前后端均指向 `-120000` EMU（约 `-0.333cm`）默认相对段落顶部向上偏移，同源契约成立。
   - **漏实现**：PRD 要求“按 normal field / inline header / form-domain **三类分别设默认 anchor**”，但在前端 [acrfAnnotationGeometry.js](file:///root/github/CRF-Editor/frontend/src/composables/acrfAnnotationGeometry.js#L23) 中，`ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND` 硬编码将这三类均设置为了 `-120000`，数值上未做实际区分。

2. **schema fail-closed 一致性**：
   - **校验与范围**：`schemas/form.py` 中的 `y: StrictInt` 正确拒绝了浮点数/布尔值/字符串；`clamp[-200, 200]` 限制了最大偏移；`ConfigDict(extra="forbid")` 阻止了多余属性，同时对 `_` 开头的保留键做了限制（仅允许 `_form`）。
   - **读取/写入隔离**：写入入口（PATCH/POST）均执行 Pydantic 校验。读取入口（FormResponse）在反序列化时同样会触发校验，若数据库内存在脏数据则在读取层 Fail-closed（报错 409）。导出服务在加载偏移时如遇 ValueError 会触发 `ExportError` 强行终止，同时导出 XML 时也有二次 clamp 保护，不会破坏 OOXML 结构，非常安全。

3. **透传完整性**：
   - **数据流覆盖**：`models/form.py` 新增列，`database.py` 提供了单列轻量迁移及 backfill。表单复制（`copy_form`）与项目克隆（`ProjectCloneService`）均实现了 `annotation_positions` 的强校验拷贝。项目导入（`ProjectDbImportService`）在 legacy 表结构变动与必需列检查中补充了该列，避免了旧库 select 崩溃。
   - **遗漏路径**：[import_service.py](file:///root/github/CRF-Editor/backend/src/services/import_service.py#L680)（从其他项目导入表单模板）在构造新 `Form` 实例时，遗漏了 `annotation_positions` 列的透传。

4. **前端拖动竞态/泄漏**：
   - **节流与串行**：[useAcrfAnnotationDrag.js](file:///root/github/CRF-Editor/frontend/src/composables/useAcrfAnnotationDrag.js) 采用 220ms 防抖，多字段拖拽修改均能在 `pendingSnapshots` 中按表单键合并。`savePromise` 实现了串行化 PATCH，在网络请求积压时保证了数据不覆盖。
   - **泄漏与生命周期**：在 `FormDesignerTab.vue` 与 `VisitsTab.vue` 组件的 `onBeforeUnmount` 钩子中均调用了 `annotationDrag.dispose()`，清理了定时器，并强制刷入（flush）了未落盘的乐观状态。指针监听器 `pointermove / pointerup` 在拖动结束后能做到即时解绑，不存在内存泄漏。门控条件（editMode && aCRF 视图 && 持有 formId/key）设计非常严谨。

5. **VisitsTab 同源一致性**：
   - **状态同步**：`VisitsTab.vue` 的 `mergeFormIntoState` 对 `allForms` 等多处 reactive 状态进行了同步更新。两个 Tab 的读写均指向同一个 `Form.annotation_positions`，单源同步逻辑正常。
   - **无冲突原因**：由于 `App.vue` 对切换 Tab 采用了 `v-if` 条件渲染（销毁旧 Tab 并触发 `dispose()` 强刷，挂载新 Tab 并重新 fetch 数据库最新状态），使得两个 Tab 不在 DOM 中共存，因此完全杜绝了双写冲突。

6. **parity 安全**：
   - **比对排除**：aCRF 标注矩形基于 `w:drawing / wp:anchor` 浮动框渲染。由于 python-docx 内部的 `cell.text` / `paragraph.text` 仅抓取段落直接 runs 的 `<w:t>`，并不向深层 `<wps:txbxContent>` 递归提取，因此 `word_table_parity.py` 自动排除了解析标注文字。经 pytest 验证，带有 annotated 标注的 Word 文档与 plain 文档进行 `word_table_parity` 提取对比能完全通过。
   - **前端安全**：前端绝对定位的 HTML 标注元素不参与表格文本段落提取，两端均保证了 parity 文本提取比对的安全。

7. **安全**：
   - **鉴权隔离**：新增的 `PATCH /api/forms/{form_id}` 路由已接入 `verify_form_owner` 鉴权依赖。
   - **测试覆盖**：[test_permission_guards.py](file:///root/github/CRF-Editor/backend/tests/test_permission_guards.py#L326) 中补全了针对未登录用户与越权用户操作 `PATCH /api/forms/{form_id}` 路由的拦截测试。外部 `.db` 导入的字段已在导入层和导出层提供了双重 fail-closed 强校验。

8. **代码质量**：
   - 后端路由 `routers/forms.py` 整理了排版和空行，包含少量的格式化 Churn。
   - 新增的测试文件 `test_form_annotation_positions.py` 编写中存在严重的设计缺陷（详见下文 Critical 1），导致克隆/拷贝等 3 个核心测试函数运行失败。

---

# 代码审查报告 (REVIEW REPORT)

## Critical（必须修复）

1. [backend/tests/test_form_annotation_positions.py:157, 174, 186](file:///root/github/CRF-Editor/backend/tests/test_form_annotation_positions.py#L157) — **测试代码 Bug：在内存中错误地 mutate 了 Pydantic Response 模型而非 SQLAlchemy Model，导致测试运行失败。**
   - **问题**：在测试用例 `test_project_clone_preserves_form_annotation_positions`、`test_copy_form_rejects_invalid_annotation_positions` 和 `test_project_clone_rejects_invalid_form_annotation_positions` 中，`_create_owned_form(session)` 返回的是由 FastAPI 序列化的 Pydantic `FormResponse` 对象。测试中执行 `form.annotation_positions = '...'` 并执行 `session.flush()` 只是更改了内存中的 Pydantic 属性，并未更新数据库，导致数据库存储的值依旧为 NULL，进而导致相关的 Clone/Copy 校验逻辑失效或断言报错。
   - **建议**：
     在测试中获取底层 SQLAlchemy 模型实例后再修改值，或使用 API PATCH 路由模拟持久化，例如：
     ```python
     # 方案：获取数据库中的实体
     db_form = session.get(Form, form.id)
     db_form.annotation_positions = '{"_form":{"y":18},"AEVAR":{"y":-12}}'
     session.flush()
     ```

## Warning（建议修复）

1. [backend/src/services/import_service.py:680-687](file:///root/github/CRF-Editor/backend/src/services/import_service.py#L680) — **表单模板导入服务遗漏了 `annotation_positions` 列的复制。**
   - **问题**：当用户从另一个项目（模板）导入表单时，`import_service.py` 仅拷贝了 `name`, `code`, `domain`, `paper_orientation`，未能拷贝 `annotation_positions` 字段。这将导致导入的表单丢失源表单中调整过的 aCRF 标注拖动坐标。
   - **建议**：在 `import_service.py` 的 `Form` 实例构造中，补充对该属性的拷贝：
     ```python
     new_form = Form(
         project_id=target_project_id,
         name=new_name,
         code=generate_code("FORM"),
         domain=sf.domain,
         order_index=max_form_order + form_idx,
         paper_orientation=sf.paper_orientation,
         annotation_positions=sf.annotation_positions,  # 补上此列的透传
     )
     ```

2. [frontend/src/composables/acrfAnnotationGeometry.js:23-27](file:///root/github/CRF-Editor/frontend/src/composables/acrfAnnotationGeometry.js#L23) — **PRD 中“按 normal field / inline header / form-domain 三类分别设默认 anchor”未在数值上真正实现。**
   - **问题**：前端定义的 `ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND` 中将三类的默认 EMU 偏移全部硬编码指向了同一个常数 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` (-120000)，没有实现真正的数值分离配置。
   - **建议**：应根据产品定位或物理位置，给三类 Kind 定义真正不同的默认偏移 EMU（如 Domain 放在 0.35cm，常规字段放在 -0.35cm），或显式注明“Phase 1 中该数值故意设为相同”。

## Info（供参考）

1. [frontend/src/composables/acrfAnnotationGeometry.js:15-17](file:///root/github/CRF-Editor/frontend/src/composables/acrfAnnotationGeometry.js#L15) — **色彩配置重复声明（JS 导出但 CSS 中硬编码）。**
   - **问题**：在 `acrfAnnotationGeometry.js` 中导出了 `ACRF_ANNOTATION_BORDER_COLOR` = `#C00000` 等颜色常量，但在 `FormDesignerTab.vue` 和 `VisitsTab.vue` 的 `<style>` 代码块中却依然硬编码写死了 `#c00000` 和 `#fff2f2`，使得颜色规范存在双源头。
   - **建议**：在 CSS 中使用 CSS 变量，或者在 `buildAnnotationStyle` 动态生成 CSS 变量以映射这三个色彩，保持前端常量的 Single Source of Truth。

2. [backend/src/database.py:443-462](file:///root/github/CRF-Editor/backend/src/database.py#L443) — **代码格式 PEP8 违规（迁移函数内部存在双空行）。**
   - **问题**：新加入的 `_migrate_add_form_annotation_positions` 方法内有多行多余的双空行，不符合 PEP8 中“方法体内部只能存在单空行”的规范。
   - **建议**：清理该方法内部的多余空行。

---

总计: 1 Critical, 2 Warning, 2 Info

### 维度评分与总体结论

REVIEW REPORT
=============
Correctness:    20/25 - 后端测试用例编写错误导致 3 个核心克隆/拷贝测试失败；模板表单导入过程遗漏了标注偏移值的复制。
Security:       25/25 - PATCH 路由受 verify_form_owner 限制，鉴权隔离完备；数据库读写及导出层包含双重 fail-closed clamp 保护。
Performance:    25/25 - 前端引入了 220ms 合并防抖和串行化 patch Promise 队列，不会造成高频重复提交和网络重叠。
Maintainability: 22/25 - 跨栈几何换算清晰且由 contract 固化；色彩配置在 CSS 中硬编码，且迁移脚本中存在局部 PEP8 空行编写问题。

TOTAL SCORE: 92/100

一句话总体结论：本次改动在前后端交互、数学模型、单位变换、fail-closed 和 parity 安全校验的设计上非常扎实，但后端测试代码存在模型误用的 Bug 且模板表单导入时存在一处拷贝遗漏。

是否可提交：REQUEST_CHANGES （需先修复测试用例 Bug 及导入拷贝遗漏）
