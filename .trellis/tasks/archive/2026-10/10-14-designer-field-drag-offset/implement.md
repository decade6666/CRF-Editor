# Sonnet 执行清单：字段拖拽落点修复

## 本轮权限与交接目录

- 当前阶段只完成排查与规划。**没有实施授权，不运行 `task.py start`，不修改业务代码，不提交／合并／推送。**
- 工作目录：`/home/decade/crf-editor-designer-field-drag-plan`。
- 分支：`plan/designer-field-drag-offset`；基线：`0bd2ec1`。
- 任务：`.trellis/tasks/10-14-designer-field-drag-offset`，保持 `planning`。
- 阅读顺序：`prd.md` → `design.md` → 本文件 → `research/drag-root-cause.md` / `research/test-coverage.md`；JSONL 上下文另提供项目契约。
- 后续用户明确要求实施并审阅本计划后，才能在上述目录启动任务。主目录已有未跟踪任务不属于本次工作，不移动、不删除。

## 排查任务板

- [x] 确认任务资料写入权限，读取项目规则和 prefs。
- [x] 创建独立 worktree／分支和 planning 任务。
- [x] 跟踪加载、草稿／新增、原生拖放、可见顺序、API 保存与历史链路。
- [x] 检查现有测试，定位缺失的落点行为断言。
- [x] 用未改原函数和虚构字段完成临时运行时 RED 复现。
- [x] 保存研究、最小修复设计和收敛后的 PRD。
- [x] 校验规划文件／上下文路径及写入范围，交接资料准备完成；交付给用户后仍保持 `planning`，不代表代码已修复。

## 1. 实施前检查（等待用户明确实施授权）

```bash
cd /home/decade/crf-editor-designer-field-drag-plan
git status --short
git rev-parse --short HEAD
git worktree list
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-14-designer-field-drag-offset
# 仅在用户已要求实施后执行：
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-14-designer-field-drag-offset
```

- 先确认规划文件仍在、来源版本是否变化、是否有其他会话占用组件；不要套用历史工作树全量补丁。
- 需要刷新开发规范时使用 `trellis-before-dev`。保留 `.context/prefs/`、前端模块规范和 designer busy/session 契约。
- 新工作树尚未安装 `frontend/node_modules`。后续测试／运行需要时可安装锁文件声明的既有依赖（`cd frontend && npm ci`）；不改 package.json／lockfile，不增加 coverage provider 或其他依赖，新增依赖先向用户确认。
- 浏览器验收前确认可用的**非生产测试数据与测试登录方案**；不要主动读取／生成凭据或使用真实临床数据。

## 2. RED：先添加落点行为回归

建议新增 `frontend/tests/designerFieldReorder.test.js`。参照 `designerFieldCopy.test.js:44-110` 的原函数提取执行惯例；调用真正的 `onDragStart` / `onDragOver` / `onDrop`、`normalizeFormFieldOrder`、`persistFieldReorder` 和必要的实际 history 闭包。API／消息／受控重载是外部边界，可 mock；不能替换被测排序／持久化逻辑后声称验证回滚。

- 当前临时脚本只用于**旧代码 RED 证据**，不能直接当修复后 GREEN 套件：它固定旧 `@drop(..., idx)` 接线，还包含“当前错误结果”的基线对照。
- 永久测试按下表中的正确用户契约写期望；若目标参数改为 ID，同步调整测试驱动，而不是保留旧下标契约。
- 名称描述行为，按 Arrange → Act → Assert，各例独立。

| 编号 | 场景 | 正确结果／关键断言 |
| --- | --- | --- |
| T1 | 首次加载 `[A,B,C,D]`，A 放到 C 上方 | `[B,A,C,D]`；不先进行暖场拖动。 |
| T2 | 新增保存后的字段响应加载完，再向下拖动 | 最终序列严格位于目标之前；模拟响应要标明模拟，真实 Save→drag 另做浏览器／集成验收。 |
| T3 | 连续两次向下拖动 | 每次都符合提示边界，不能只修第一次。 |
| T4 | D 放到 B 上方 | `[A,D,B,C]`，原本正确的向上方向不退化。 |
| T5 | A 放到 B 上方、放到自己 | 原顺序；零 POST、零历史。 |
| T6 | 任意字段放到第一行之前 | 成为第一行。 |
| T7 | A 放到 D 上方 vs 绝对末尾落点 | 分别 `[B,C,A,D]` 和 `[B,C,D,A]`；两种边界必须区别。 |
| T8 | 源／可见数组下标不同，目标按 ID 定位 | 按可见逻辑顺序正确移动，不移动错行。 |
| T9 | 有效排序成功 | 完整正确排列、一条 POST、一条排序历史、连续序号；成功不重载旧列表。 |
| T10 | 真正的 undo/redo 闭包 | 结果 → 原顺序 → 结果；检查精确重放 POST 和无额外历史记录。 |
| T11 | POST 拒绝 | 恢复旧字段与顺序，既有 warning，失败不入历史、busy 释放，可继续操作。 |
| T12 | 草稿存在、busy、无效 source/target | 不持久化、不污染历史；保持现有守卫行为。 |
| T13 | Ctrl+↑／↓ 与方向键焦点 | 一次移动一行／仅移动焦点；不套用行前插入的修正公式。 |
| T14 | 首次 API 响应有稀疏序号／原输入乱序 | 正常排序后源／显示一致；不能把这个对照写成已证实病因。 |

注意 T11：当前失败分支调用 `loadFormFields(formId)` **未 await**（`FormDesignerTab.vue:1156`）。用可控制的 promise 区分“立即回滚”和“后续重载落地”，不能因重载恰好完成而漏掉回滚错误。

```bash
cd /home/decade/crf-editor-designer-field-drag-plan/frontend
node --test tests/designerFieldReorder.test.js
```

先确认 T1／T3／T5 的正确位置期望在当前源码下失败，再写修复；记录 RED 输出。

## 3. GREEN：最小修改组件

按 `design.md` 修改 `frontend/src/components/FormDesignerTab.vue`，优先限定于原生拖放处理及字段列表末尾接线：

- [ ] 行 `@drop` 传 `ff.id`，明确含义是“插到该字段之前”；同步所有直接调用点。
- [ ] 按 `sortFormFieldsByOrder(formFields.value)` 的统一逻辑顺序定位源和目标；以可见旧顺序做 previous snapshot／历史。
- [ ] 计算 `insertIndex = boundaryIndex - (sourceIndex < boundaryIndex ? 1 : 0)`；同位直接返回。
- [ ] 末尾边界使用明确 end 语义，保留拖到绝对末尾，提示线与命中位置一致。
- [ ] 行落点与末尾落点不要因事件冒泡执行两次；若添加容器落点，使用恰当 `.self`／`.stop` 或专用末尾区域。
- [ ] 复用 `normalizeFormFieldOrder` → `persistFieldReorder`；不要复制 API／cache／history 逻辑。
- [ ] 保持草稿／busy／会话守卫、成功乐观排序、失败回滚、undo/redo 与键盘语义。拖拽结束／取消时清理提示状态；不要顺带改变其他交互。
- [ ] 如源码接线断言需要更新，仅更新确实改变的模板契约，并用行为测试锁住含义；不要弱化原有守卫检查。

不改后端、通用 SortableJS composable、数据库、依赖、build script 或发布流程。不进行全文件格式化或整体重写。

## 4. 集成与真实浏览器验收

### 组件接线

如需要自动化证明行事件、响应式列表与 DOM 顺序同步，沿既有 vitest 增加 `frontend/tests/component/FormDesignerFieldReorder.spec.js`：挂载真实父组件，spy 实际导出的 `api` 对象，注入项目 refs，通过现有 `selectFormById` 进入表单，触发原生事件，比较 DOM 顺序和独立期望 POST 排列。保留 Vue-warning gate，不添加 polyfill／运行器来绕过失败。

happy-dom 没真实布局；挂载测试不能证明鼠标落点、提示线物理位置或原始“只在首次”的时序。无需为了测试新增生产 expose。

### 浏览器矩阵（关键流程）

在非生产测试环境，运行项目并使用真实鼠标拖动；每次记录提示线、释放后字段列表、预览、POST 排列、重开后的顺序：

1. 首次进入已有表单，立即向下拖动，再向上拖动。
2. 真正新建并保存一个字段，待保存／加载结束，立即拖动。
3. 普通字段复制草稿保存后与日志行新增后重复测试，保持未保存草稿不能排序。
4. 连续拖动、相邻 no-op、首位与末尾落点。
5. 撤销／重做；受控模拟排序请求失败后的恢复。
6. 简洁／完整模式主要流程；键盘 Ctrl+↑／↓ 不退化。

若仍出现“向上也下移”或真实“只有首次异常”，采集 sourceId、hover marker、release targetId、visible IDs、submitted IDs 和请求时序，先定位再决定扩展范围。不要提前把缓存／初始化当根因。

若登录／测试凭据／浏览器工具受限，明确标记未运行并说明替代范围，不能宣称浏览器验收通过。

## 5. 验证命令与覆盖率边界（实施后执行）

```bash
cd /home/decade/crf-editor-designer-field-drag-plan/frontend
node --test tests/designerFieldReorder.test.js tests/orderingStructure.test.js tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js
# 如果创建了上面的挂载测试：
npm run test:component -- tests/component/FormDesignerFieldReorder.spec.js
npm test
npm run lint
npm run build
```

- 每次修复后先跑新增／受影响测试，再跑全量。失败如实报告，第三次同一阻塞转入结构化调试，不重复盲改。
- 当前前端没有 coverage script／provider 配置（`frontend/package.json:12-13,22-33`、`vitest.config.js:8-12`）。本轮未测覆盖率，不能声称 ≥80%。后续同样不能把函数提取 VM 或测试文件覆盖率冒充 Vue SFC 覆盖率；需新增 provider／依赖时先取得确认。测试矩阵和边界穷举有价值，但不替代仪表化覆盖率统计。
- 后端代码不改，本任务无需把后端全量套件当 RED/GREEN 门槛。若意外必须改排序接口／服务，先停止扩展并确认范围，重新规划后端 `test_order_service.py` / `test_phase0_ordering_contracts.py` 与前后端契约检查。
- 检查实际 `git diff`。独立审查如无法进行，明确标注只有自审，不以测试研究代替独立代码审查。

## 6. 文档与收尾边界

- 若末尾落点或新增测试改变用户可见交互／测试入口，按项目规则同步 `README.md`、`README.en.md`、`frontend/.claude/CLAUDE.md`、`.claude/index.json` 的相关最小描述，不扩写历史。
- `.trellis/spec/guides/cross-stack-contracts.md:114-133` 的排序示例有已验证的冲突：实际为完整 `{ordered_ids}` 请求／HTTP 204，而非 `{field_id,new_index}`／字段列表响应。后续只纠正该例，以独立 Trellis 改动处理；不要匹配旧例去改 API。
- 本轮保持 worktree 和 planning 任务供接手，未提交／合并／清理／推送。后续用户明确请求提交后，代码与 Trellis 资料分开提交，检查实际 diff 和其他会话写入；合并／删除／推送各自仍遵循授权规则。

## 本轮实际验证（非修复完成报告）

| 状态 | 命令／检查 | 结果 |
| --- | --- | --- |
| 已跑，预期 RED | `node --test /tmp/crf-designer-field-drag.CtPhyA/repro.test.mjs`（原函数、虚构数据、API mock） | 7 例；3 PASS、4 FAIL；已复现偏移，无代码修复。 |
| 已跑，通过 | main 同基线：`node --test tests/orderingStructure.test.js tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js` | 91 PASS。 |
| 已跑，通过 | 独立测试研究批次：61 / 5 / 53 例，完整命令见 `research/test-coverage.md` | 均 PASS；与 91 批次重叠，不能累计成去重总数。 |
| 已跑，通过 | `node --input-type=module` 穷举拟定边界换算与独立 ID-anchor 参考模型 | 长度 1..8、所有 source／boundary（含末尾），240 例 PASS；仅验证设计模型，不是修复后产品测试。 |
| 已跑，通过 | `task.py validate`、任务路径／Markdown 锚点／字符数、实际差异与主目录状态 | 8 份任务文件；两 manifest 各 6 条有效上下文；33 处完整路径锚点通过；Markdown 围栏完整，无 TBD；业务源代码与主目录原状态未改。 |
| 未跑 | 新永久 RED/GREEN、组件套件、完整前端套件、lint/build、真实浏览器/E2E、后端测试、覆盖率 | 当前仅诊断与规划；无真实浏览器证据／覆盖率声明。 |

临时原函数脚本保留在仓库外，供接手先复跑 RED；不纳入 Git。本轮不删除工作树或临时证据；清理须按既有授权与可恢复移除规则处理。
