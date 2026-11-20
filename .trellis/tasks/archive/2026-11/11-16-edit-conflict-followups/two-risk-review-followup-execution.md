# 续修执行报告（审查后 LOW/MEDIUM 缺口 + 获批计划未完成项）— two-risk-review-followup-execution.md

> 执行者：trellis-implement 子代理，派单请求别名 `sonnet`；本代理实际模型自报为 Claude Sonnet 5.5（模型 ID `claude-sonnet-5-5`）。两者如实并列，不做推断。
> 基线：worktree `docs/edit-conflict-followups-plan` @ `2549ec6`（非回退基线 `/tmp/crf-edit-conflict-two-risk-review-l2pyyn1_/`，manifest 全 MATCH）
> 日期：2026-11-19。本报告为独立新增；前一份 `two-risk-execution.md` 未再改动。

## 结论

续修完成：唯一确认的产品续修 LOW-1（重载读取中鉴权代变化且输入已变时，在已离开会话发警示）以真实 RED → 最小 GREEN 落地，产品增量恰为生命周期检查移到原始输入比较之前（+9/−7，含注释行，零新机制）；MEDIUM-1 真 ABA、LOW-3 读开始基线判别、committed-not-visible 构造、LOW-2 错误判别纠正、AC2-COPY 保留/变体、AC2-RELOAD 控制共 **15 项净新增 + 1 项改写组件测试**全部通过；获批计划此前未完成的浏览器见证（adoption-read 在途切换、dirty/draft 保持）以真实浏览器补齐（22 项断言：诊断构建两轮 + 主会话指令后的最终清洁构建补验一轮，三轮全过）；既有 28 项回归中唯一确证运行于最终清洁构建的是 `browser-regression-final.log`（其余几次为更早构建，见浏览器章节）。全部静态门禁通过；gitleaks 阶段增量零泄漏；`git diff --check` 干净。源/测试现已再次静止，交回主会话检查实际差异与独立复审。

## 写入边界与代码静止

- 产品：仅 `frontend/src/components/FormDesignerTab.vue`，净增量为 LOW-1 检查顺序移动；调试期临时 console 诊断已全部移除（grep 归零），移除后重建并复跑证据。
- 测试：仅 `frontend/tests/component/CoreEditorConflict.spec.js`。
- 报告：本文件。证据：`/tmp/crf-edit-conflict-two-risk-review-l2pyyn1_/execution/`（唯一新路径；旧证据全保留）。
- 后端/共享 fixture/helper/setup/clock/warning-gate/auth/config/schema/依赖/runner/coverage 范围：未触碰；无新 task/worktree/凭据/账号/密钥；未触真实数据库配置/上传/生产 8888；无 Git 历史扫描/提交/合并/推送/删除/清理；未递归派发。

## LOW-1 产品续修（唯一产品改动）

**真实 RED（任何产品编辑前捕获）**：`/tmp/.../execution/low1-red.raw.log`（EXIT=1）——`RELOAD-AUTH-CHANGE：读取在途鉴权代变化且编辑内容已变化，静默放弃不警示（LOW-1 续修前预期RED）`失败于「重新载入未应用：读取期间编辑内容已变化…」警示在鉴权代已变化后仍发出。

**最小 GREEN**：`reloadDesignerContext` 中现有生命周期检查（dispose/历史上下文/项目/鉴权代）整体移到原始输入比较之前，注释更新说明时序理由；零 await、零新锁、零重试；原 current-lifetime `RELOAD-INPUT` 反馈文案与 LOW-2 时机不变。

**控制（现代码先通过，非 RED）**：`RELOAD-AUTH-ONLY`（仅鉴权变化，输入不变→静默）、`RELOAD-DISPOSED-ONLY`（仅卸载→静默）。项目 departure 对照（RELOAD-DEPART）不声称证明新 guard。

## 新增/改写测试清单（全部位于 CoreEditorConflict.spec.js）

**净新增 15 例 + 改写 1 例（COPY-SWITCH-ADOPT），共 16 处名称级变化**（921 − 906 = 15 净新增；RELOAD-REFUSAL-AFTERMATH 与 RELOAD-CLEAN-UNKNOWN-EFFECT 即 item-7 两例，已含在 15 净新增内，不另计）。focused 组件七文件 141 → **156 passed**（+15）。

| 用例 | 类别 | 说明 |
| --- | --- | --- |
| RELOAD-AUTH-CHANGE | LOW-1 真 RED→GREEN | 见上 |
| RELOAD-AUTH-ONLY | 控制（现代码先通过） | 仅鉴权变化静默 |
| RELOAD-DISPOSED-ONLY | 控制（现代码先通过） | 仅卸载静默 |
| RELOAD-REFUSAL-AFTERMATH | item-7 控制 | 拒绝后撤销真实回放；外部推进后表单名保存 409 审阅、取消保留输入（写入序列 [true,true,true,false]，含撤销回放写） |
| RELOAD-CLEAN-UNKNOWN-EFFECT | item-7 characterization | 干净重读投影后备注保存（原始输入看不到的已接受写入）仍被拒；明确标注依赖组合信号、不声称隔离等标签回执 |
| COPY-ABA-SETTLE | MEDIUM-1a | hold 复制 POST→项目2 settle→项目1 settle→**之后**放行：旧回调零 toast/零新增 GET/恰一次 POST |
| COPY-ABA-FORM-RETURN | MEDIUM-1b | 真实行点击 A→B→A 后交付：成功恰一次、副本行可见、A 新会话输入保留。**范围声明：未预种源历史与新 A 历史**，两个 undo 不可用观察是「未发生历史复活/错绑」的弱见证，不是源历史与 A 新历史保留的独立证明 |
| COPY-COMMITTED-NOT-VISIBLE | item-4 | 回退读扣住时 B 直受拖排推进→陈旧候选拒装 + 恰一次「已复制但当前列表未显示」+ 单次 POST 不重发 |
| COPY-SWITCH-ADOPT（改写） | LOW-3 | B 侧改用 persistFieldReorder 真实拖排历史（不 refreshKey/不发布左列表），先断言副本不可见，释放→fallback→可见+成功恰一次+真实撤销 |
| COPY-RETAIN-DIRTY-FORM | item-6 | 复制窗口 B 脏表单名保留 |
| COPY-RETAIN-DIRTY-FIELD | item-6 | 复制窗口 B 脏字段标签保留且可保存 |
| COPY-RETAIN-DRAFT | item-6 | 复制窗口 B 本地草稿保留、零保存写入 |
| COPY-METADATA-AFTER-ONLY | item-6 | 仅后标签（无过渡证据）→**同选择**回退、成功恰一次。**范围声明：仅覆盖同选择，未证明跨选择变体** |
| COPY-METADATA-MALFORMED | item-6 | 过渡证据畸形→**同选择**回退、成功恰一次。**范围声明：仅覆盖同选择，未证明跨选择变体** |
| COPY-EXTERNAL-GAP-CANCEL | item-6 | 复制窗口内外部推进→B 标签保存 409 审阅取消（静默放弃、输入保留；含既有「影响提醒」确认）→复制照常完成 |
| COPY-FALLBACK-READ-FAIL | item-6 | 回退读真实失败→恰一次「已复制但列表刷新失败」警示、不重发 POST。**范围声明：仅覆盖同选择，未证明跨选择变体** |

**LOW-2 判别纠正**：`COPY-SUPERSEDED-WRITE` 内原「反证探针：若陈旧回退被安装…下一次表单排序写入将 409 审阅」的说法已删除/改写——own-chain R1→R2 会升级基线，该探针原理上检测不到陈旧安装，不能称反证/独立证明防超越；现标注为「正向连续性控制」（流程结束后排序仍零审阅直接提交），防超越由组合信号（快照身份/最近本页写入标签/accepted 凭据，等标签 receipt 不单独证明）与 COPY-COMMITTED-NOT-VISIBLE 的拒装断言共同承担。原「RED5 中 4 有效 + 1 歧义」的结论保留不变。

**spec 局部 helper（均在 CoreEditorConflict.spec.js 内，未改共享文件）**：
- `installForm8ReorderSupport`：共享 fixture 仅脚本化 `/api/forms/7/fields/reorder`；按派单「所有网络闸门/helper 仅本 spec」授权，局部 fetch 包装补齐 form 8 重排（幂等定义 PUT 经既有 mock 推进修订序列取新标签，不触碰 fixture 内部序列），使 LOW-3/item-4 能用 persistFieldReorder 真实拖排历史（审查建议的产品动作）。
- `armCopyPostHold`：只扣复制 POST 的局部包装（派单明确要求不用全局 holdWrites——全局扣留会把复制窗口内 B 的保存悬空，见「初始失败」第 2 条）。

## 初始失败与修复（如实保留）

1. **改写后的 COPY-SWITCH-ADOPT 首跑失败**：撤销不可用 + 画布未变——共享 fixture 对 `/api/forms/8/fields/reorder` 抛「未脚本化写入」（仅脚本化 form 7）。结构化定位（临时 catch 诊断，捕获后即移除）→ 以 `installForm8ReorderSupport` 补齐（见上）。初始失败日志：`f1r3-run1.raw.log`（EXIT=1）。
2. **COPY-EXTERNAL-GAP-CANCEL 首两跑失败**：全局 `holdWrites` 把复制窗口内 B 的标签保存悬空（零 confirm、零 toast、写入永远 pending）——正是派单警告的陷阱；结构化定位（临时 catch 诊断，捕获后即移除）→ 改用 `armCopyPostHold` 只扣复制 POST。初跑记录：`f1r3-run1.raw.log`。
3. **LOW-1 RED 本身**：见上（真实行为 RED，非环境失败）。
4. **两次断言计数笔误**（RELOAD-REFUSAL-AFTERMATH 未计入撤销回放写、CLEAN-UNKNOWN-EFFECT 多算前置字段保存）：按实际写入序列更正，无产品改动。

## 浏览器见证（获批计划遗漏项补齐；新根 /execution/）

自动化：沿用既有已批准一次性资源（`/tmp/crf-edit-conflict-main-7weFaz/` 凭据文件仅被脚本私密消费、隔离后端 + chrome-headless-shell 复用同端口方案）；**未新建凭据/账号/密钥，未读取/展示/解码 token 值**（token 仅写入 0600 私有文件供复用）。进程均为本轮新拥有并已在收尾停止（端口 8903/9227 均释放）。

- **browser-verify-followup.mjs**（22 项断言）：N1 采纳读在途（response-stage 扣住采纳候选首读，requestId 精确保留）真实行点击 A→B、B 真实标签保存（含既有「影响提醒」确认）、回退完成副本可见 + 成功恰一次 + 单次 POST + 真实撤销回放；N2 复制窗口脏表单名保留；N2b 脏字段标签保留且可保存；N3 本地草稿保留且零保存写入。
- **browser-verify-regression.mjs**（既有 28 项，复制自旧根并改路径）：回归复跑。
- **构建身份如实区分（主会话核对后更正）**：最终源码 mtime 02:59:07（临时诊断移除），最终清洁构建 build3 完成 02:59:27（`FormDesignerTab-CsHg07IF.js`，无任何 COPYFORM-COMPLETION marker）。早前两轮 followup 22（`browser-followup-run18.log` 02:52:46、`browser-followup-confirm.log` 02:57:36，均 22/22 exit 0）与 `browser-regression-run1.log`、`browser-regression-confirm.log`（02:58:37）均运行于**诊断构建（含已移除的 COPYFORM-COMPLETION 调试输出）或更早构建**，只能作为诊断构建证据；28 项回归中唯一确证运行于最终清洁构建的是 `browser-regression-final.log`（03:00:42，28/28 exit 0）。
- 最终清洁构建补验（主会话指令后新增）：不改源/测试/构建内容，复用既有一次性凭据资源重启本轮自有隔离进程，对当前 dist（即 build3 产物）**补跑一次现有 followup22**：`browser-verify-followup-clean.mjs`（原脚本复制变体，diff 仅三处截图输出路径改名 `-clean`、results 写 `browser-followup-clean-results.json`、末尾追加所载资产身份打印；断言逻辑零改动）。结果 **22/22 全 true、exit 0，首轮一次通过**；日志 `browser-followup-clean.log`。所载 hashed asset 身份：`LOADED-ASSETS ["index-QiI0iDN5.js","index-BEjQbOjJ.css","FormDesignerTab-CsHg07IF.js","FormDesignerTab-CQNx8nKL.css"]`；`FormDesignerTab-CsHg07IF.js` sha256 = `cbd0e6465ff19d06ac0182efc534a66a321704925f389a4a99928d33b9c39fa6`，与 dist 文件一致。新截图：`browser-followup-clean-adopt-done.png`、`browser-followup-clean-retained.png`、`browser-followup-clean-draft.png`。补验后源指纹复验 = `followup-handback-source-manifest.json` 全 48 文件 MATCH；本轮自有进程（后端 + chrome-headless-shell）已停止，端口 8903/9227 均释放；旧日志/截图全部未覆盖。
- 截图（新根）：诊断构建 `browser-followup-adopt-done.png`、`browser-followup-retained.png`、`browser-followup-draft.png`；最终清洁构建见上 `-clean-` 三张。
- 归一化补种：表单 B 原先无字段实例（历史种子即如此），normalize 经 API 补种 1 个实例（绑定 F1 定义），使 B 的真实标签保存有目标；输出仅含布尔与公共 UI 文本。
- 验收脚本自身的中途失败与修复如实保留于 `browser-followup-run1..run17.log`（表单页签未激活、固定 sleep 与异步扣留竞态→改条件等待+drain、drain 误扣候选后续子读→改 requestId 精确保留、全局 holdWrites 陷阱复现→局部包装）。三轮未解决的调试均先做了结构化定位（catch 诊断/网络序列探针）再修复；旧 28 项未盲跑 34 次，仅补必要回归。

## 验证门禁（实际命令与退出码）

| 门禁 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| LOW-1 RED（产品编辑前） | `./node_modules/.bin/vitest run tests/component/CoreEditorConflict.spec.js -t 'RELOAD-AUTH-CHANGE'` | EXIT=1（真实行为 RED） |
| LOW-1 GREEN | `-t 'RELOAD'` | 16 passed，EXIT=0 |
| F1-R3 全块 | `-t 'F1-R3'`（`f1r3-run2.raw.log`） | 18 passed（含 1 项改写），EXIT=0 |
| F1-R4 全块 | `-t 'F1-R4'`（`f1r4-followup2.raw.log`） | 8 passed，EXIT=0 |
| 完整 spec | `vitest run tests/component/CoreEditorConflict.spec.js`（`coreconflict-final.raw.log`，清洁构建后复跑） | **92 passed / 92**，EXIT=0 |
| node:test focused 六文件 | `node --test tests/designRevision.test.js tests/useApiDesignRevision.test.js tests/designerHistory.test.js tests/formDesignerAuxiliaryData.test.js tests/quickEditBehavior.test.js tests/orderingStructure.test.js` | 129/129，EXIT=0 |
| 组件 focused 七文件 | vitest run 七 spec（`component-focused.raw.log`） | 7 files / **156 passed**（141+15），EXIT=0 |
| 全量 | `npm test`（`npm-test-full.raw.log`） | node:test 1117/0 fail；vitest 53 files / **921 passed**（906+15），EXIT=0 |
| 覆盖率 default | `npm run test:component -- --coverage`（EXIT=0） | 见下 |
| 覆盖率 serial | `npm run test:component -- --maxWorkers=1 --coverage`（EXIT=0） | 见下 |
| Lint / Build | `npm run lint`（LINT_EXIT=0）、`npm run build`（BUILD_EXIT=0，清洁构建后复跑 4.31s） | 0 errors / 2790 warnings（与基线持平） |
| gitleaks | 阶段增量 concat（32.4KB）stdin `--pipe` 精确扫描 | `[]` 零泄漏 |
| git 卫生 | `git diff --check` | 退出码 0 |

### 覆盖率（对照本轮 906 基线；64 文件集合经前缀归一后逐一比对相同）

| 指标 | 本轮基线（906 测试） | default = serial（921 测试） | ≥80% | 整数交叉乘法不低于基线 |
| --- | --- | --- | --- | --- |
| statements | 7444/8480 | **7446/8480 = 87.80660%** | ✓ | ✓（+2） |
| branches | 5581/6901 | **5583/6901 = 80.90132%** | ✓ | ✓（+2） |
| functions | 2203/2472 | **2203/2472 = 89.11812%** | ✓ | ✓（持平） |
| lines | 6414/7017 | **6416/7017 = 91.43%** | ✓ | ✓（+2） |

原始 JSON：`coverage-default-raw/coverage/coverage-final.json`、`coverage-serial-raw/coverage/coverage-final.json`（各模式运行后立即拷贝）。两模式结果完全一致；未以串行替代默认。

### 精确 before/current 阶段增量（非累计 HEAD）

- `phase-diff-FormDesignerTab.diff`：**+9/−7**（不含 `+++`/`---` 头）——仅为 LOW-1 检查顺序移动与注释；调试期临时诊断已进出归零。
- `phase-diff-CoreEditorConflict.diff`：**+414/−12**（主会话核对与保存文件一致）——15 项净新增用例（含 item-7 两例）+ 1 项改写（COPY-SWITCH-ADOPT）+ LOW-2 判别纠正 + spec 局部 helper。
- 合并：`phase-delta-concat.diff`（gitleaks 扫描输入）。

## 后端边界说明

本轮未改任何后端文件/依赖/配置（产品增量仅为前端生命周期检查位置）。已验证的后端 78+176 passed 为**上一轮证据**，本轮未重跑；若主会话复审认为实际 API 受影响再另行安排。全量后端 / ruff / Bandit / adapter E2E：按未触及边界 **NOT RUN**（Bandit 环境不可用、无安装权限；上轮历史参考 1785 passed / 89.29635986%，非本轮结果）。生产 8888 未触碰。

## 安全与数据完整性自查

- 凭据：仅复用既有已批准一次性凭据文件（私有消费、布尔输出）；token 写 0600 文件供脚本复用，未读取/展示/解码其值；未新建凭据/账号/密钥。
- 数据：仅一次性隔离数据库（8903 后端）内的测试项目 2 数据被本轮用例推进；normalize 仅复原标签/表单名与补种 B 字段实例，均为测试自用数据；无真实数据库/上传/生产数据接触。
- gitleaks 阶段增量零泄漏；git diff --check 干净；无提交/推送/合并/删除/清理。
- 证据目录全部保留（含全部初始失败日志）；清理须待用户单独批准。

## NOT RUN（如实区分）

- 后端全量套件 / 后端全量覆盖率 / ruff / Bandit / agent_bridge E2E（`test_stdio_e2e.py`）：按未触及边界 NOT RUN。
- dirty/draft 的组件级参数化合并（当前为三个独立用例，未抽象参数化以避免新框架）；不涉及。

## 遗留与下一步

1. 主会话检查实际差异（以两份 phase diff 为起点），随后由同一只读审查者复审续修差异；本执行不参与、不回应评审。
2. 证据目录全保留；清理须待用户单独批准。
