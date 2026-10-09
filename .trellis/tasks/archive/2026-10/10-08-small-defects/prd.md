# 集中修复六个已核实的小缺陷

## Goal

- 修复审查中核实过的六个小缺陷。每个缺陷先写一个会失败的测试，再修复，单独提交。
- 不顺带做其他重构。

## Background（证据核实于 2026-10-08，`main` = `77e8f3f`）

1. **复制表单会丢失字段样式。**
   - 「复制字段实例」的代码写了三份：
     - `backend/src/services/project_clone_service.py:~315`（项目复制）和 `backend/src/services/import_service.py:~867`（模板导入）都复制全部展示属性；
     - `backend/src/routers/forms.py` 的 `copy_form`（`:~290-320`）漏了 `bg_color`、`text_color`、`label_bold`、`label_font_size`。
   - 结果：复制后背景色、文字色、字号丢失，加粗被重置成默认值。没有测试覆盖。
2. **Word 导出把具体错误吞成笼统的「导出失败」。**
   - 带错误码的 `ExportError`（`backend/src/services/export_service.py:~1039`，`EXPORT_DATA_INCOMPATIBLE`）会被吞两次：
     - 先被 `export_project_to_word` 的 `except Exception: return False`（`:~528`）吞掉；
     - 路由 `backend/src/routers/export.py:~85` 的全捕获再吞一次。
   - 所以 `backend/main.py:481` 专门写的 `ExportError` 处理器永远触发不到。
   - 现有测试 `backend/tests/test_export_acrf.py::test_acrf_export_rejects_invalid_annotation_positions` 断言的正是这个错误行为（`ok is False`）。
   - 前端已经会显示后端返回的 `detail`，不需要改。
3. **登录会话竞态**（竞态：结果取决于两件事谁先完成而导致的错误）。
   - 后端每个成功响应都带新令牌（`backend/src/dependencies.py:31-35`）。
   - `frontend/src/composables/useApi.js` 对任何成功响应都无条件写回令牌（`_storeRefreshedToken`）；对任何 401 都无条件清掉令牌并触发登出（`_handle401`）。
   - 用户 A 的请求如果在登出后才返回，就可能覆盖用户 B 刚登录的令牌，或者把 B 登出。现有的「世代」检查只保护缓存。
   - 这两条行为写在跨栈契约 §3 第 4、5 条（`.trellis/spec/guides/cross-stack-contracts.md:156-157`）里，并由 `frontend/tests/appSettingsShell.test.js` 锁定。
4. **彻底删除项目时，先删 Logo 文件，后提交数据库。**
   - `backend/src/services/project_purge_service.py:30-35` 先 `flush` 再删文件，注释（`:27-28`）写的顺序却正好相反。
   - 两个调用方都在删完文件后才提交：
     - 回收站自动清理 `recycle_bin_cleanup_service.py:~200-201`；
     - 管理员硬删除 `backend/src/routers/admin.py:174`，由 `get_session` 在请求结束时提交。
   - 如果提交失败，项目会回到回收站，但 Logo 已经没了。
5. **未处理的异常返回 500 时，不记录堆栈。** `backend/main.py` 的 `security_headers_middleware`（`:335`，异常分支在 `:339`）直接返回「内部服务器错误」，没有任何日志。
6. **回收站清理计划的「清理后估算总量」重复扣减。**
   - `backend/src/services/recycle_bin_cleanup_service.py:169` 在循环已经扣过一次之后，又扣了一次。
   - 目前没有接口输出这个值，但数据本身是错的。

## Requirements

- **R1 复制表单保留全部展示属性：**
  - 三条复制路径（项目复制、模板导入、表单复制）共用一个复制函数；
  - 要复制的属性从模型的列推导：排除主键、外键和时间戳，以后新增列不会再漏。
- **R2 导出错误原样返回：**
  - Word 导出遇到 `ExportError` 时，返回 400，带上具体的 `detail` 和 `code`；
  - 路由层仍要删除临时文件；
  - 其他未知错误保持现状（500 + 通用提示）。
- **R3 只处理当前会话的响应：**
  - 每个请求记下发起时用的令牌；
  - 响应返回时如果当前令牌已经变了（已登出或换了用户），既不写回新令牌，也不触发登出，但请求本身照常报错或返回；
  - 令牌没变时，行为与现在完全一致。
- **R4 先提交、后删文件：**
  - 两条彻底删除路径都在数据库提交成功之后才删 Logo 文件；删文件失败只记警告；
  - 修正与代码相反的注释；
  - 管理员硬删除改用项目已有的「显式提交」会话 `get_plain_session`；不改动 `database.py` 的会话设计。
- **R5 记录堆栈：** 未处理异常返回 500 时，记录一条带完整堆栈的 ERROR 日志，包括请求方法和路径。返回给前端的内容不变。
- **R6 修正估算：** 「清理后估算总量」只扣一次。
- **R7 文档与契约同步：**
  - 跨栈契约 §3 第 4、5 条改为「只处理与当前令牌一致的响应」，并更新它的验证测试；
  - 可选：在合适的位置补充 Word 导出错误码的说明；
  - 根和模块的 `CLAUDE.md` 变更日志。

## Acceptance Criteria

- [ ] **AC1（R1）**：新测试先失败后通过：复制表单后，四个展示属性与原字段一致。另有一个测试锁定「复制函数覆盖了模型的全部可复制列」。项目复制和模板导入的已有测试仍然通过。
- [ ] **AC2（R2）**：
  - `test_acrf_export_rejects_invalid_annotation_positions` 改为期望抛出 `ExportError`，且错误码为 `EXPORT_DATA_INCOMPATIBLE`。先失败后通过。
  - 新增路由级测试：返回 400，响应体里有 `detail` 和 `code`，临时文件已删除。
- [ ] **AC3（R3）**：新增前端行为测试（`node:test`），先失败后通过：
  - 迟到的成功响应不会覆盖更新的令牌；
  - 迟到的 401 不会清掉更新的令牌，也不会触发登出；
  - 同一令牌下，写回和登出照常。

  `appSettingsShell.test.js` 随契约一起更新，且通过 Haiku 只读审查。
- [ ] **AC4（R4）**：新测试先失败后通过：
  - 在数据库提交的那一刻，Logo 文件仍然存在；
  - 请求结束后，Logo 文件已删除。

  两条删除路径各测一次。
- [ ] **AC5（R5）**：新测试先失败后通过：触发 500 时，日志里有一条带异常信息的 ERROR 记录。
- [ ] **AC6（R6）**：新测试先失败后通过：触发容量规则时，「清理后估算总量」等于两条规则都扣除后的剩余量。
- [ ] **AC7**：
  - 后端全量测试和前端测试没有新增失败；
  - 前端通过 lint 和构建；
  - 改动文件的覆盖率不下降（`test-isolation` 合入后可测）。
- [ ] **AC8（R7）**：文档和契约已同步。

## Out of Scope

- 导出层的其他整理（属于 `export-layer-cleanup`）。
- 合并或修改 `database.py` 的会话类型。
- 其他前端重构；`useApi.js` 之外的绕行请求（经核实，它们不写令牌，也不处理 401）。

## Dependencies and Order

- 第二波。建议在 `test-isolation` 合入之后开工，这样测试不需要一次性配置。不是硬性前置。
- 与 `docx-temp-ownership` 不改同一批文件。
- 阻塞 `legacy-cleanup` 和 `export-layer-cleanup`。
