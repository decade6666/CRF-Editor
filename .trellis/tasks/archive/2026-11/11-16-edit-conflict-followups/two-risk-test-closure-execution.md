# 测试收口执行报告（最后一组 test-only 补正）— two-risk-test-closure-execution.md

> 执行者：trellis-implement 子代理（派单请求别名 `sonnet`；实际自报 Claude Sonnet 5.5 / `claude-sonnet-5-5`）。
> 基线：worktree `docs/edit-conflict-followups-plan`（非回退基线 `/tmp/crf-edit-conflict-two-risk-test-closure-tzspmela/`，pre-closure manifest 全 48 MATCH）。
> 日期：2026-11-19。本轮唯一写入文件：`frontend/tests/component/CoreEditorConflict.spec.js` + 本报告；证据仅写 `/tmp/crf-edit-conflict-two-risk-test-closure-tzspmela/execution/`。`two-risk-execution.md` 未动；followup 报告仅保留已完成更正/clean22 信息。

## 结论

按派单 A–E 五项完成最后一组有据可查的 test-only 补正，全部通过：A 项 helper 保真度以真实 RED（旧包装器对缺失/陈旧 If-Match 无条件 204）→ 最小 GREEN 落地；B 项 unknown-effect 见证从 known 效果（备注 PUT /api/forms/7）改写为真实 unknown 效果路径（instance-only toggleInline→binding-profile，完整快照下 `applyOwnDesignWrite` 返回 null）；C 项补 disposal 判别控制；D 项四处断言小范围加强（含跨选择 FALLBACK-READ-FAIL）；E 项 ABA 用例补真实源历史前提并收紧声明。净新增 2 例 + 改写 3 例 + 加强 3 例 + helper 修复。全部门禁通过：Core spec 94/94、七组件 focused 158、node focused 129/0、npm test 1117+923（921+2）、两模式覆盖率与 921 基线逐项相同且 64 文件集合一致、lint 0 errors、`git diff --check` 干净。48 源码仅 Core spec 变；产品文件 hash 与 followup-handback manifest 逐一相同；10 保护文件不变。源/测试现已再冻结，交主会话核对后由同一只读审查者做最终复核。

## 写入边界

- 仅 `frontend/tests/component/CoreEditorConflict.spec.js`（净 diff **+135/−19**，不含 `+++`/`---` 头：`closure-diff-CoreEditorConflict.diff`）。
- 产品/共享 fixture/helper/setup/clock/auth/config/schema/依赖/runner/coverage 范围：未触碰；无 build/浏览器/后端/secret 扫描重跑（产品与最终清洁 bundle 不变）；未触生产 8888/真实数据/凭据值；无新账号/密钥/凭据；无提交/归档/合并/推送/部署/删除/清理；未派代理。

## A 项：局部重排包装器保真度（真实 RED → 最小 GREEN）

**旧缺陷（真实 RED 先行）**：`installForm8ReorderSupport` 不检查调用方 `options.headers['If-Match']`，且把 server 当前标签冒充请求头记入 `calls.revision`——缺失/陈旧条件的撤销重放也被无条件 204，会掩盖 stale history/baseline 回归。RED：`form8-ifmatch-red.raw.log`（EXIT=1，`expected 204 to be 409`），在改 helper 前捕获。

**最小修复**（保持 spec 局部 helper，未触共享 fixture）：先比对调用方真实 `If-Match` 头与 fixture 当前标签——缺失或不等 → 记录真实请求头 + `accepted:false`，返回与共享 fixture 相同的 `409 {detail:'设计已更新，请核对', code:'STALE_STATE'}`（无 revision 响应头），不推进序列、不改字段顺序、不执行包装器内部序列推进 PUT；成功路径同样记录真实请求头。不替调用方取最新 If-Match（包装器自身的序列推进 PUT 按需取当前值，属 helper 内部写入，注释已说明）。

**自测**（`FORM8-REORDER-IFMATCH`，直接以裸 fetch 驱动 helper）：缺失头/陈旧标签各一控制断言 409+STALE_STATE+无 revision 头+不推进+不改序+按真实头记录 `accepted:false`；正确标签 204+新标签+真实改序+记录真实请求头。GREEN：`form8-ifmatch-green.raw.log` EXIT=0。真实拖排流经修复后 wrapper 仍通过（`adopt-after-ifmatch.raw.log`：COPY-SWITCH-ADOPT 与 COPY-COMMITTED-NOT-VISIBLE 各 1 passed）。

## B 项：真正 unknown-effect 见证（改写 RELOAD-CLEAN-UNKNOWN-EFFECT）

**旧见证无效原因**：备注保存走 host 映射 `PUT /api/forms/7`，`designRevision.js:196–199` 是 known 效果——身份改变本身就能拒旧读，不能称 unknown-effect。

**新路径（已批准 §2.7(3)，characterization 直接通过、不伪造 RED/不回滚源）**：干净完整 reload 投影（历史空）→ `holdReadsAfterNextWrite(2)` 预扣该命令写后的一致字段重读（forms+fields 2 读）→ 再发起 toolbar 重读（holdReads(5)）→ 读取在途执行 instance-only 命令（画布横向表格标记切换 → `PUT /api/form-fields/{id}/binding-profile`；FIELD_COMMAND_URL 在完整快照下 `applyOwnDesignWrite` 返回 null = 效果未知，两个快照身份不变、无独立忙标记）→ 断言写入已接受且写后读被扣 → 先放行旧 toolbar 候选：组合信号判定被超越 → `RELOAD_SUPERSEDED_MESSAGE` 警示 → 放行写后字段读收敛（inline 标记落地）→ 实际 unknown 写后的 own-save 控制保留。

**实际观察（characterization 如实记录）**：unknown 写后表单名直存**直接接受**（`acceptedWrites == [true, true]`，无 409 审阅）——写后一致重读已收敛宿主基线；confirm 恰 2 次 = 两次工具栏重载确认，第 3 次不存在 = 最终直存无冲突审阅。观察日志：`unknown-effect-obs1.raw.log`（首预期 [true,false,true] 被实际 [true,true] 否定，按观察修正）→ `unknown-effect-final2.raw.log` EXIT=0。等标签 receipt 仍不可隔离，测试注释明示只刻画组合守卫整体行为。

## C 项：disposal 判别控制（新增 RELOAD-DISPOSED-CHANGE）

镜像 AUTH-CHANGE 前提：读取在途 → 先改字段标签 → 卸载 → 放行 → 断言零警示。原 `RELOAD-DISPOSED-ONLY` 保持不变输入，是合法但不判别的控制（报告不冒充 new-guard 测试）；新控制按构造判别——移除 disposed 检查则原始输入比较先行命中并发警示 → 用例失败。现代码先通过（characterization 控制，无源码回滚证明）。

## D 项：既有断言小范围加强

1. **COPY-RETAIN-DRAFT**：release 后断言 `server.writes()` 恰 1 条且为复制 POST（真实零草稿保存写入）。
2. **COPY-EXTERNAL-GAP-CANCEL**：复制仍扣住时断言 `acceptedWrites == [false]`（真实 409 凭据，不以 confirm 次数替代）。
3. **COPY-RETAIN-DIRTY-FIELD**：按钮 enabled 之外实际点击保存——复制回退只刷左列表、不升级脏字段基线，保存按冻结的复制前基线提交 → 真实 409 审阅 → 取消静默放弃、输入保留（`acceptedWrites == [true, false]`），不迁移新副本权限。
4. **COPY-FALLBACK-READ-FAIL 改写为跨选择**：POST 被 `armCopyPostHold`（只扣复制 POST 的既有局部包装）扣住时切 B → `failReads(true)` → 放行 → 恰一次「已复制，但列表刷新失败」警示、不重发 POST。初始失败：`core-full-run1.raw.log` 中该用例过早断言 `copyCalls` 长度——结构化定位：包装层扣住的 POST 尚未到达 fixture（未入 `server.calls`），与 fixture 内 `holdWrites`（先记录后扣）不同；移除过早断言并在注释说明，`core-full-run2.raw.log` 全绿（1 次定位修复，未盲试）。
5. AFTER-ONLY / MALFORMED 同选择保留不动（review 确认跨选择在读 metadata 前已 skip adoption，现有组合足够，不做重复变体）。

## E 项：ABA 用例补真实前提

**COPY-ABA-FORM-RETURN**：复制前先造真实源历史（共享 fixture 支持的 form7 画布拖排，断言撤销可用）→ A→B→A 真实行点击 → 断言旧历史随切换清空且回 A 不复活（撤销仍不可用）+ A 新会话输入保留 → 放行交付（副本可见、成功恰一次、单次 POST）。用例内与注释均声明：不预种/不创建 A 的新历史，「新 A 历史保留」不由本用例证明；新当前选择的真实拖排历史/撤销由 COPY-SWITCH-ADOPT 承担。

## 验证门禁（实际命令与退出码）

| 门禁 | 证据 | 结果 |
| --- | --- | --- |
| A 项 RED（helper 修复前） | `form8-ifmatch-red.raw.log` | EXIT=1（expected 204 to be 409） |
| A 项 GREEN + 真实流复验 | `form8-ifmatch-green.raw.log`、`adopt-after-ifmatch.raw.log` | EXIT=0；ADOPT/CNV 各 1 passed |
| B 项观察→终版 | `unknown-effect-obs1.raw.log`（EXIT=1，按实际修正）→ `unknown-effect-final2.raw.log` | EXIT=0 |
| 完整 Core spec | `core-full-run1.raw.log`（EXIT=1，FALLBACK 过早断言）→ `core-full-run2.raw.log` | **94 passed / 94**（92+2 新增），EXIT=0 |
| 七组件 focused（原七文件） | `component-focused.raw.log`：Core + NotesSyncFreshness + DeferredResponseIdentity + DeferredResponseIdentityT5 + FormDesignerManagement + TemplateImportSelection + SingleInlineTableGuard | 7 files / **158 passed**（156+2），EXIT=0 |
| node focused 六文件 | `node-focused.raw.log`：designRevision / useApiDesignRevision / designerHistory / formDesignerAuxiliaryData / quickEditBehavior / orderingStructure | 129/129，EXIT=0 |
| 全量 `npm test` | `npm-test-full.raw.log` | node:test 1117/0 fail；vitest 53 files / **923 passed**（921+2），EXIT=0 |
| 覆盖率 default | `coverage-default.raw.log` EXIT=0，raw 立即拷贝 `coverage-default-raw/coverage-final.json` | 见下 |
| 覆盖率 serial | `--maxWorkers=1`，EXIT=0，raw 立即拷贝 `coverage-serial-raw/coverage-final.json` | 见下 |
| Lint | `lint.raw.log` | 0 errors / 2790 warnings（与基线持平） |
| git 卫生 | `git diff --check` | 退出码 0 |

### 覆盖率（对照本轮 921 基线；64 文件集合经 worktree 根前缀归一后逐一相同，default=serial）

| 指标 | 921 基线 | 本轮 default = serial（923 测试） | ≥80% | 整数交叉乘法不低于基线 |
| --- | --- | --- | --- | --- |
| statements | 7446/8480 | **7446/8480 = 87.80660%** | ✓ | ✓（持平） |
| branches | 5583/6901 | **5583/6901 = 80.90132%** | ✓ | ✓（持平） |
| functions | 2203/2472 | **2203/2472 = 89.11812%** | ✓ | ✓（持平） |
| lines | 6416/7017 | **6416/7017 = 91.43509%** | ✓ | ✓（持平） |

纯断言/helper-局部补正未新增未覆盖源码路径，四项分子分母与基线逐位相同。

## 状态与清单校验

- **48 源码**：`pre-closure-source-manifest.json` 全 48 MATCH 后仅 `frontend/tests/component/CoreEditorConflict.spec.js` 不同（本轮唯一合法写入）。
- **产品文件**：`followup-handback-source-manifest.json` 中 7 个 `frontend/src/*` 产品文件 hash 逐一相同（LOW-1 续修 +9/−7 版本原样静止）。
- **10 保护文件**：`protected-manifest.json` ALL_MATCH。
- 精确 before/current：`closure-diff-CoreEditorConflict.diff`（+135/−19，非累计 HEAD）。
- git status 的其他 M 项为对基提交 `2549ec6` 的累计视图（此前各轮合法改动）；本轮相对 pre-closure 快照仅 Core spec 一处变化。

## NOT RUN（如实区分）

- build / 浏览器 / 后端 / secret-history 扫描：按派单不重跑（产品与最终清洁 bundle 不变）。既有证据：最终清洁构建 build3 4.31s、clean22 补验 22/22、backend 78+176（均为上轮证据，本轮未重跑）。
- 后端全量 / ruff / Bandit / adapter E2E：未触及边界，NOT RUN。
- 生产 8888、真实数据、凭据值：未接触。

## 遗留与下一步

1. 主会话核对实际差异（以 `closure-diff-CoreEditorConflict.diff` 为起点），随后同一只读审查者做最终只读复核；本执行不参与、不回应评审。
2. 全部证据（含 RED、两次初始失败日志）保留于 `/tmp/crf-edit-conflict-two-risk-test-closure-tzspmela/execution/`；清理须待用户单独批准。
