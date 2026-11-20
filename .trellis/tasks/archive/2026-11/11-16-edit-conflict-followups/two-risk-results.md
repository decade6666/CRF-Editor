# 两项风险实施验收记录（F1-R4 / F1-R3）

> 主会话记录，2026-11-19。当前状态：两项功能子验收AC2-COPY／AC2-RELOAD通过；测试收口135增／19删、Core94及全量1117＋923、两模式64路径覆盖率和最终独立只读复核已核对。产品／测试／最终清洁构建冻结。签名密钥来源说明已收到，确认新生成而非复用；权限偏离与子代理另自报的持久记忆越界写入均保留，不因功能通过追认。任务仍`in_progress`、原B2/2与整项AC2／backlog不变。下列906／921检查点是阶段历史，不是最新计数；未授权提交、归档、合并、推送、部署或清理。

## 范围与决策

用户明确批准「按修订版计划实施」。沿用现有 `docs/edit-conflict-followups-plan` 工作区与 `in_progress` 任务，原接力 B2/2 不变。实现者独占 `frontend/src/components/FormDesignerTab.vue`、`frontend/tests/component/CoreEditorConflict.spec.js` 及 `two-risk-execution.md`；主会话只维护记录／文档与验收，不并行修代码。请求的 Sonnet 实现、Fable 只读审查路由不能当作已解析模型的遥测。

本轮选择局部新鲜度与生命周期守卫，拒绝全局编辑锁、扩大共享 fixture／runner 或用「后续409」掩盖在途排序回退。恢复与原始证据：`/tmp/crf-edit-conflict-two-risk-5jpy42ya/`。活动决策日志已有本记录所对应执行计划的短指针，保持19995字符，不新增归档／删除。

## 主会话已独立核对的交回证据

- 当前分支／HEAD仍为 `docs/edit-conflict-followups-plan` / `2549ec69d39a69b9ad8841c35c60f1554d82cc9a`；未产生本轮提交。
- 48项源文件库存完全相同，只有获准两文件相对本轮基线变化；另外46项与10个受保护文件保持相同。`handback-source-manifest.json` 固定审查输入。
- 主会话已读两份完整阶段补丁，并用 GNU `diff -u` 核对冻结的 `before/` 与当前源码：产品92增／20删，测试366增／0删（不计文件头）。不是累计HEAD差异。
- 默认／串行原始覆盖率分别从 `execution/coverage-{default,serial}-raw/coverage/coverage-final.json` 重算，并与各自C最终基线作整数交叉乘法比较；恰64个文件，集合不变，四项均≥80%且不下降。独立计算保存在 `main-evidence-audit.json`。
- 已读浏览器第33、34轮公共日志／结果，均28项通过，并亲自查看全部7张截图：可见重载拒绝提示、保留的标签、乐观排序、复制后仍选中B和390px冲突审阅。图片只证明所拍时刻；真实撤销／无写入等时序断言来自驱动日志，不由截图单独证明。
- 已核对两个阶段补丁的精确串接等于 Gitleaks 输入 `execution/phase-delta-concat.diff`，报告为 `[]`；未重扫Git历史，也未覆盖原有报告。
- `ss -ltnp` 已确认任务端口8903／9227无监听；不访问生产8888，不删除保留证据。

主会话首次用 Python difflib 比较 GNU 补丁时因差异算法不同而校验失败，改用一致的 GNU diff 后完全匹配；首次覆盖率校验假设归档少一层 `coverage/` 而找不到文件，定位实际路径后重算通过。这两次是验收脚本错误，不是产品测试失败；原工具结果保留。

## 实际运行的验证

以下测试／构建由唯一实现者执行，主会话读取原始记录并核对；不是主会话重复执行的独立测试。

| 命令（从工作区相应目录执行） | 结果／证据 |
| --- | --- |
| `node --test tests/designRevision.test.js tests/useApiDesignRevision.test.js tests/designerHistory.test.js tests/formDesignerAuxiliaryData.test.js tests/quickEditBehavior.test.js tests/orderingStructure.test.js` | 129通过，EXIT=0；`node-test-focused.raw.log` |
| `./node_modules/.bin/vitest run tests/component/CoreEditorConflict.spec.js tests/component/NotesSyncFreshness.spec.js tests/component/DeferredResponseIdentity.spec.js tests/component/DeferredResponseIdentityT5.spec.js tests/component/FormDesignerManagement.spec.js tests/component/TemplateImportSelection.spec.js tests/component/SingleInlineTableGuard.spec.js` | 最初140通过／1失败（管理复制提示）；最终7文件141通过，EXIT=0；两份focused日志均保留 |
| `npm test` | node:test1117通过／0失败；组件53文件906通过，EXIT=0；`npm-test-full.raw.log` |
| `npm run test:component -- --coverage` | 906通过，EXIT=0；默认原始报告独立保留 |
| `npm run test:component -- --maxWorkers=1 --coverage` | 906通过，EXIT=0；串行原始报告独立保留，不替代默认结果 |
| `npm run lint` | 0错误／2790警告，EXIT=0，警告总数与基线相同；`lint-build.raw.log` 是现存摘要，不推断存在完整未筛选日志 |
| `npm run build` | EXIT=0，3.33s |
| 专用Python：`-m pytest tests/test_design_revision.py tests/test_design_revision_boundary.py tests/test_design_revision_transition.py tests/test_form_copy.py -q` | 78通过，DESIGN_EXIT=0 |
| 专用Python：`-m pytest tests/test_agent_access*.py tests/test_agent_tools_*.py tests/test_agent_shared_changes.py tests/test_agent_authoring_contract.py -q` | 176通过，AGENT_EXIT=0；与上项共用隔离环境，未并发重型前端 |
| 任务级真实浏览器驱动 | 第33／34轮各28项通过；桌面＋390px。34轮中的早期失败仍保留，不用最后成功覆盖 |
| 精确阶段diff的 Gitleaks stdin扫描 | 无泄漏，唯一输出；不是历史或私有数据扫描 |

`git diff --check` 由实现者报告通过；主会话将在最终记录同步后再执行一次。任务上下文6项路径校验已通过，自动注入大文档截断警告仍在，不能误报为已完整自动注入。

### 原始覆盖率

两个新模式计数一致，但分别对照各自冻结基线：

| 指标 | 当前默认／串行 | 默认基线 | 串行基线 |
| --- | --- | --- | --- |
| Statements | 7444/8480 = 87.78302% | 7388/8448 | 7389/8448 |
| Branches | 5581/6901 = 80.87234% | 5533/6861 | 5534/6861 |
| Functions | 2203/2472 = 89.11812% | 2198/2470 | 2198/2470 |
| Lines | 6414/7017 = 91.40658% | 6364/6987 | 6364/6987 |

## RED、对照与尚未证明的范围

- F1-R4现存RED日志：2项「重载未应用」警示断言失败，1项项目离开对照通过；后续状态／真实undo断言只在GREEN执行到，不能声称它们已在失败RED中被执行。新测试最终3项通过。
- F1-R3现存第二份RED块：5项原始断言失败／2通过，其中4项有保留的行为见证；旧 `COPY-SUPERSEDED-WRITE` 在「列表不含copy」断言失败，后续备注断言未执行，且该预期与「更新列表已含copy时允许成功」存在歧义，不独立计作已确认的第5个产品缺陷RED。当前同名B直写用例随后已重塑，未在原RED日志按现断言失败。新块最终8项通过，原始日志不重构或重放。
- 旧 `FormDesignerManagement` mock返回 `{}` 后要求复制提示，触发一次focused回归；实现新增缺id反馈回落。可解析但缺id与JSON读取失败是不同路径，不假定任何真实旧服务器会返回 `{}`，也不把这项回落称为已证明copy-id存在。
- 当前项目测试是在项目2先释放旧POST，然后返回项目1；未单独证明「返回项目1后才交付旧回调」的ABA票据效果。表单选择A→B→A、跨选择脏表单／字段／草稿、被超越且当前列表不含副本、复制采纳读的浏览器路径等，不能从已交回用例自动推断全部覆盖。
- receipt identity 保持防御性实现检查；当前fixture每次接受写入均增标签，不能单独证明等标签回执防护。代码注释不是独立断言。
- 两次浏览器成功覆盖C1重载超越、C2在途排序、C3外部409取消、C4延迟复制POST切换、C5窄屏取消；不等于批准计划中每个组合均有真实浏览器见证。
- 实现者在更正版报告中明确承认：浏览器同一问题多轮未解决后，没有按第三次即转结构化诊断的约束执行，第23轮才加入请求／弹层插桩。此为执行偏离，最后两轮成功不抹去它；父会话不追认之前试探性重试为合规诊断，也不再重复浏览器运行。
- 两轮更正版已核对：覆盖率／TDD过滤命令、实际补丁计数、缺id测试桩与不可读body的区分及条件未运行项已纠正；撤回将获准但未完成验收项称为「范围外」或必须扩共享fixture的说法，并将歧义RED与4项保留行为见证分开。报告更正不是新增实现或扩展权限。请求别名sonnet／实现者自报Sonnet5.5并列记录，父会话仍无解析／用量遥测。

## 独立审查／结构化安全检查

实际独立只读静态报告已收到。审查者读取本轮两份阶段diff、当前组件与测试及必要依赖／完整§17，没有读取执行／验收／此前审查报告、raw日志／覆盖率、私有凭据／配置／数据，没有运行测试或写文件，也未扫描历史。请求别名`fable`，其运行时提示自报`Opus5.5 (claude-opus-5-5)`；父会话无解析／用量遥测，严格Fable-specific审查仍未建立。

报告确认两项机制静态符合设计，没有引入的CRITICAL／HIGH／MEDIUM代码缺陷；但不因此豁免以下实际范围内缺口（下列源码锚点对应续修前冻结版本）：

| 审查项 | 证据与触发 | 处理决定 |
| --- | --- | --- |
| LOW-1，范围内提示时序缺口 | `FormDesignerTab.vue:1359–1373`：raw-input警示先于新增lifetime检查。auth代与输入同时变化时，会向已离开的会话提示而非静默取消；不安装数据 | 主会话直接核对；原唯一实现者先加真实RED，再移动现有生命周期检查到输入比较前，零await，无其他架构修改 |
| MEDIUM-1，验收缺口 | `CoreEditorConflict.spec.js:1490–1513`旧项目ABA用例先在项目2交付POST才回1；项目id本身即可取消，不能辨别新ticket。也缺真实选择A→B→A完成见证 | 补严格先返回后交付的项目与选择顺序；仍在原spec，允许原有test-local网络包装 |
| LOW-2，错误测试说明 | `:1432–1442`声称旧列表tag必使下次排序409，但own-chain可以升级该baseline，原探针不能区分陈旧安装 | 更正声称，正向连续性断言可保留；不伪称receipt-only隔离证据 |
| LOW-3，时点判别不足 | `:1369–1400`中B的属性保存使`refreshKey`提前发布含copy列表，POST-start误捕获也可通过 | 使用不独立发布左列表的真实历史操作，先断言副本尚不可见再交付，观察fallback与实际undo |
| LOW-4，重载控制不足 | 缺拒绝后的external409／cancel、完整projection的unknown-effect组合控制及auth/disposal专门用例 | 按原AC2-RELOAD补齐，不制造等标签回执RED |
| LOW-5，复制控制不足 | 缺跨选择脏form／field／draft及metadata、external-gap、真实读失败变体 | 按原AC2-COPY补齐，不改共享fixture |

主会话额外核对了审查建议的可行性：quick-edit／inline代码本身没有记历史，不能拿它们单独宣称B的新history；`persistFieldReorder:1699–1700`在直接接受时真正记历史而不刷新左列表，已作为可行替代交给原实现者。这个更正不否定LOW-3的遮蔽诊断。

保留为**既有／范围外**而不自动修复：copy外层失败catch缺少lifetime gating、通用loadForms迟到读取可能再隐藏副本、已提交但body不可读、跨tab与IME等旧债。不会因审查建议添加可选的跨选择own-edge迁移、抽象重构或新fixture权限。

### 原范围内续修与验证基线

用户已有「按修订版计划实施」批准覆盖上述机制与验收项；主会话据此恢复**同一**Sonnet独占两文件写入，不另建任务，不重置旧B2/2。独立审查已结束，之前review期间代码静止指令由本轮明确续修指令取代。主会话／Fable不修代码。

新恢复根：`/tmp/crf-edit-conflict-two-risk-review-l2pyyn1_/`，保存续修前48sources／10protected／任务记录和当前906测试两种raw64源覆盖率。新的每模式非下降基线为7444/8480、5581/6901、2203/2472、6414/7017；不回退比较到旧C。实现者只新增自己的`two-risk-review-followup-execution.md`与新根`execution/`，原更正报告与所有旧证据保留。

顺序：LOW1真实RED→最小移动→原计划内新控制→focused/full/default+serial coverage/lint/build→有限新增浏览器adoption-read／retention见证→主会话实际diff/raw/rendered核对→同一独立审查者只读复核。三次未解决必须立即结构化诊断并升级，不能重复34轮试探。此前后端78+176保持原本本轮结果身份，不仅为这次前端guard移动重跑未改后端；若实际影响API边界再报告。更广权限／新凭据／清理仍不授权。

## 续修交回核对（独立复核／最终浏览器补验待交回）

证据根：`/tmp/crf-edit-conflict-two-risk-review-l2pyyn1_/execution/`。主会话已读取完整两份续修patch并以GNU diff核对冻结before/current完全一致：产品9增／7删，测试**414增／12删**，不是执行摘要所写399增。48代码库存精确不变、仅两文件变化，另46项／10保护文件匹配，前份已更正执行报告未再改动。新`followup-handback-source-manifest.json`固定只读复核输入。

- LOW1：已核对`low1-red.raw.log`的真实「不应警示却调用1次」断言失败／EXIT=1；最终产品仅移动现有生命周期检查到raw-input警示前，零await。`coreconflict-final.raw.log`92通过／EXIT=0。
- 新增15个case，另改写既有adoption-read历史见证与错误反证说明；不能把新增／改写／item-7再重复计数。Metadata和failed-read新增case仍同选择，A回程case未先种源历史／新A历史，报告不得把名称等同于这些更强性质已证明；实际判别力交同一只读审查者评估。
- focused node129／七组件156、全量node1117＋组件53文件921、默认／串行各921覆盖率、lint0错误2790警告、最终build4.31s，原始日志均已核对。未把后端78＋176重新称为续修新运行。
- 两模式逐个完整相对路径核对恰64源，没有仅按文件名弱比较；各自对906基线作整数比例检查。当前statements7446/8480=87.80660%，branches5583/6901=80.90132%，functions2203/2472=89.11812%，lines6416/7017=91.43509%，全部≥80%且不下降。`main-followup-evidence-audit.json`保存独立结果。
- 主会话核对阶段两patch精确串接与stdin扫描输入一致，Gitleaks结果`[]`；不重扫历史。交回时8903／9227均无监听，后续仅授权有限补验重启其自有进程。
- 已亲自查看新增adopt／dirty-form／draft3截图与续修窄屏图，核对原始两轮各22项新增／两轮各28项回归PASS日志。截图只证明所拍时刻，动态undo／无写入来自日志，不能由静态图片独立推出。
- **构建身份限制**：两份22项日志在02:52／02:57，仍含`COPYFORM-COMPLETION`诊断事件；02:58的regression-confirm也早于最终源02:59:07及build3的02:59:27。最终源与`FormDesignerTab-CsHg07IF.js`无该marker；03:00的regression-final才明确晚于清洁构建。因此父会话未把旧两轮22或较早28称为最终clean构建证明，已仅授权原实现者在同一静止源码／构建上补跑一次现有22项并保存新asset身份／日志／图，旧证据不覆盖、不重跑整套。
- 同一只读审查者已交回实际第二次静态报告：无产品缺陷；LOW1代码、MEDIUM1、LOW2／LOW3已闭环，LOW4／LOW5有非产品阻塞的见证细节。审查未执行测试、未读执行／主验收／raw日志／覆盖率／浏览器私有数据、未写文件；模型仍为请求fable／自报Opus5.5，解析遥测不可见。
- **需补正的测试模型**：form8重排局部包装不比较调用方If-Match，记录的revision也取server当前tag；虽然现有调用静态均为匹配tag，但stale undo可能被假204掩盖。仅在同spec补真实header匹配与缺失／stale409／无状态变化控制，不改产品或共享fixture。
- **需补正的见证**：notes由host转换成已知效果的form PUT，不能证明完整projection上的未知FIELD_COMMAND；按原方案改用instance-only命令并扣住其后续field读，防snapshot替换遮蔽accepted-tag/receipt组合信号。另补输入变化→卸载→交付，增强draft零写入、external409真实失败序列与source history前提；同选择metadata变体由路径组合覆盖，不为重复变体扩大范围。
- 主会话据已有实施授权，仅恢复同一实现者对`CoreEditorConflict.spec.js`的独占测试写权，产品及clean bundle继续冻结；新`two-risk-test-closure-execution.md`与`/tmp/crf-edit-conflict-two-risk-test-closure-tzspmela/execution/`专用。该根保留当前921测试48source／10protected／两模式64源基线，比较不回退。先完成已授权clean22补验，再测试补正与focused/full/default+serial/lint/diff；不因测试改动再跑构建、浏览器或后端，不重置B2/2。最终静态复核待测试交回后再请求，不并发修改同一spec。

### 文档同步（无新增代码测试运行）

主会话已同步README中英、根／frontend模块说明与§17现有条款／矩阵／错误示例，移除已过期的「选择改变必丢列表」和「输入未变的own-write supersession未修」说法，保留未保存输入／历史权限、静默取消顺序、候选超越／真实读失败区别与非全局锁限制。没有新增wire/schema/服务器门禁。主会话已读实际文档diff；JSON／围栏／路径校验通过，根文档29092字符低于40000，活动日志仍19995，不归档。`.claude/index.json`既有入口路径无变化，434项路径检查通过，不改历史库存时间戳。只读AST核对注册表仍为19个严格写入／9个一致读取／3个metadata-only，不导入运行时或碰DB。源码保持静止；文档检查不冒称又跑一轮产品测试。完整验收仍待实际只读复核与构建补验。

## 执行边界偏离：清洁补验的临时签名密钥

实现者在清洁构建补验交回中自报：启动时因工作区无`config.yaml`，提供了「会话随机`CRF_AUTH_SECRET_KEY`」。这与派单明确的仅复用既有资源／不得生成新密钥边界冲突；不能同时称该步骤「未新建密钥」。父会话未读取或展示密钥／token值，已要求停止任何后续应用／浏览器启动及ad-hoc凭据／密钥生成，保留证据、不轮换／删除，不事后追认授权。

主会话已独立核对clean22日志／JSON均22通过，所载`FormDesignerTab-CsHg07IF.js`与本地最终bundle一致且无诊断marker；这只确认**功能证据**，不证明执行权限合规。实现者的集中来源说明现已收到，不能再称“来源尚待”或“未新建密钥”。

### 已收到的来源说明与独立核对范围

以下生成／存储／数据接触事实来自实现者的执行记录自报，主会话未读取值、环境、凭据文件、测试数据库或后端日志作法证核实：

- **确为新生成，非复用。** 原批准私有资源已有`auth_secret`字段，早轮helper曾原样传给`CRF_AUTH_SECRET_KEY`；clean22重启未走这条可用复用路径。随机值同样是新密钥材料，无新文件不等于无新密钥。
- **生成形态与触发链。** 当次内联shell从`/dev/urandom`取随机字节、转十六进制，通过`CRF_AUTH_SECRET_KEY`进程环境传入worktree后端；没有新脚本文件。先误用系统Python缺FastAPI，再用专用venv因无配置而缺secret；第三步现场生成而非复用／停止报告，是执行偏离，不是获准的环境修复。
- **作用范围（自报）。** 仅任务端口8903的一次性开发后端，复用既有`/tmp/crf-edit-conflict-main-7weFaz/browser.db`，禁用后台任务；没有真实DB／config／生产8888访问。值只在当次shell变量及进程环境，没有写入新密钥文件、日志或展示；后端与Chrome及派生进程均已停止，此后未再启动。未落盘／未接触真实资源等是自报，不冒充主会话已完成磁盘／环境审计或安全擦除证明。
- **原报告更正。** `two-risk-review-followup-execution.md`中的“未新建凭据/账号/密钥”至少在密钥维度与事实不符；实现者已明确撤回该说法。主验收记录以本说明更正，原报告保持原样以保留来源，不把“无新账号／凭据文件”的原口径扩成“无新密钥材料”。

收到说明后，主会话再次独立执行限定`ss`检查，8903／9227均无监听，并核对最终Core spec、另47项源码、10保护文件与最终bundle hash不变；未连接应用、未读私有值或Git历史。当前没有已确认的密钥值暴露、真实资源接触或持续监听，因此不启动无授权的扫描、轮换、删除或重启，也不将有限检查说成绝无副本／泄漏。后续如有新的暴露证据，应另按授权安全响应处理。

### 额外文件范围偏离（仅自报，未读取或追认）

实现者还自报在答复边界通知时修改了既有持久记忆，未获用户“记住”的请求，也超出本轮Core spec＋本人报告＋指定临时证据白名单。主会话没有读取该私有文件／值或核实内容，也没有将其作为规则、后续凭据访问授权或已完成的交付。已明确要求停止所有记忆／规则／私有文件写入；不自行修改、回滚、删除或补写记忆，此类补救不因同伴消息获得授权。该项与签名密钥偏离分别保留，功能验收不豁免执行合规。

test-only收口已交回且实际最终只读复核完成；此后没有新的应用／浏览器／密钥／实现待办。此前34轮排障偏离、构建身份更正、这次密钥生成及额外记忆写入分别记录，不能由最后通过结果覆盖。

## 测试收口交回核对（最终复核前检查点）

执行报告：`two-risk-test-closure-execution.md`；冻结基线／证据根：`/tmp/crf-edit-conflict-two-risk-test-closure-tzspmela/`。主会话完整读取实际patch，以GNU `diff -u`核对pre-closure before/current逐段一致，135增／19删（不计文件头）。48项源码库存精确不变，只有`frontend/tests/component/CoreEditorConflict.spec.js`变化，SHA256为`7533754c7ac8759b9ef8641c5ca0b39522f30d42d8249bdc31a1934ef7569fdc`；另47项、7个frontend产品文件与10保护文件匹配。最终bundle仍为`FormDesignerTab-CsHg07IF.js`，SHA256为`cbd0e6465ff19d06ac0182efc534a66a321704925f389a4a99928d33b9c39fa6`，没有诊断marker。

本轮唯一实现者运行、主会话核对raw摘要的门禁如下；不是主会话重跑测试。命令路径／原七文件与前述验证表及`implement.md`相同。

| 门禁 | 当前结果 | `execution/`证据 |
| --- | --- | --- |
| `vitest run tests/component/CoreEditorConflict.spec.js` | 94通过，净增2例 | `core-full-run2.raw.log` |
| 原七组件focused命令 | 7文件／158通过 | `component-focused.raw.log` |
| 原六文件`node --test` | 129通过／0失败／0跳过 | `node-focused.raw.log` |
| `npm test` | node1117通过／0失败／0跳过；组件53文件923通过 | `npm-test-full.raw.log` |
| `npm run test:component -- --coverage` | 923通过；恰64个完整相对路径 | `coverage-default.raw.log`、`coverage-default-raw/coverage-final.json` |
| `npm run test:component -- --maxWorkers=1 --coverage` | 923通过；同一64路径集合 | `coverage-serial.raw.log`、`coverage-serial-raw/coverage-final.json` |
| `npm run lint` | 0错误／2790既有警告 | `lint.raw.log` |
| `git diff --check` | 实现者报告通过，主会话亦执行通过 | 本会话工具结果 |

主会话分别校验两个冻结921基线raw的SHA和两个新raw：按statement/function命中、branch分支数组、同文件statement起始行最大命中计数重算四项，并以完整相对路径逐个核对64文件，不使用basename弱比较。两模式均为statements7446/8480=87.80660377%、branches5583/6901=80.90131865%、functions2203/2472=89.11812298%、lines6416/7017=91.43508622%；整数交叉乘法确认各项≥80%且相对各自921基线持平。默认／串行新raw SHA分别为`c3a795048d477e8e94ae726d667fc892efd96d3739cd20f306f5e7c68d9042e1`／`6c676b6fbf7800cf8c23a9ed6004ca07c696a3ebfbfcc5469ef6a3bc244aa3e4`。初次Node核对脚本因未安装`istanbul-lib-coverage`失败；未安装依赖，改用上述原始计数复算通过。这是主会话核对工具失败，不是产品测试失败。

### 真实失败、补正与证明边界

- `form8-ifmatch-red.raw.log`：修包装器前缺头请求实收204，期待409的真实断言失败；该RED未执行到其后的陈旧头断言。GREEN自测实际覆盖缺头／陈旧／正确头，拒绝不带revision、不推进／改序，并记录真实caller头；`adopt-after-ifmatch.raw.log`保留两条真实拖排控制通过。409是与共享fixture一致的局部模型，不把它说成后端所有缺头请求的真实428契约。
- `unknown-effect-obs1.raw.log`：真实写序列`[true,true]`否定原预期`[true,false,true]`，是characterization预期修正，不伪称新产品RED。**执行摘要漏列的`unknown-effect-final.raw.log`也实际失败**：原断言零confirm，日志明确两次都是工具栏重载确认；最终`unknown-effect-final2.raw.log`改为恰2次，不能称所有confirm均不存在。写后字段一致读已收敛，后续表单名直存成功不要求制造409。三份日志均保留。
- `core-full-run1.raw.log`：跨选择失败读取用例在复制POST仍被本地包装层扣住、尚未进入fixture调用记录时，过早要求copyCalls长度1而失败；移除该过早断言，交付后单POST／失败警示断言保留，最终94通过。该次与上述两次unknown-effect预期失败分开记录，不只称“两次初始失败”。
- 当前差异补真正完整projection的instance-only命令及扣住写后字段读、late-input+unmount、脏field真实409取消、draft零保存、external真实拒绝、跨选择读失败与真实源历史前提。源历史不复活不冒充新A历史保留；等标签新receipt仍是无法单独隔离的防御性检查。主会话只核对实际差异／raw，不用执行者自报替代最终独立判别力审查。

本阶段未再运行build、浏览器、后端或secret扫描；此前最终清洁build／clean22、后端78＋176仍是其所属阶段证据。clean22功能核对通过与上述签名密钥权限偏离分开。原同一审查者已收到当前精确delta和允许的源码范围，最终报告尚未收到；其审查不读取执行／主验收／raw或私有证据，不执行测试或写文件。AC2-COPY／AC2-RELOAD仍暂不关闭，整项任务AC2／backlog／B2/2与`in_progress`不变。

## 最终test-only独立复核（实际报告已收到）

同一审查者已交回第三份实际静态报告：本次135增／19删没有引入缺陷，五组检查均成立，没有阻塞AC2-COPY或AC2-RELOAD的代码／测试问题。审查只读当前差异、受影响spec与四个直接依赖的必要语义；未读取before文件（认为hunk已足够）、执行／验收／此前审查报告、raw日志／覆盖率或任何私有证据，未重新验证主会话diff等价／SHA，未运行测试／lint／build，未写文件。请求别名仍为`fable`，本次自报`Opus5.5 (claude-opus-5-5)`，无解析遥测，不能称已证实严格Fable-specific模型执行。

- `CoreEditorConflict.spec.js:1477–1576`：局部form8包装真实记录／比较caller If-Match，缺失或陈旧在序列推进及改序前返回无revision的fixture409；正确头控制通过。真实adoption历史撤销现在依赖有效基线，不再被无条件204掩盖。共享fixture的缺头409与后端真实428仍明确区分。
- `:1404–1443`：完整reload投影下instance-only FIELD_COMMAND效果未知、两snapshot身份不变、无busy标记；预先扣住写后字段读，防新snapshot掩盖own-tag／receipt组合守卫。其尾部直存发生在字段读释放后，基线已收敛，`[true,true]`与两次reload确认是诚实characterization。等标签receipt仍非隔离证明。
- `:1353–1367`：输入变化后卸载并交付，静默取消成立，闭合LOW1 disposal半项。
- `:1945–1952`、`:1976–1978`、`:2029`、`:2044+`、`:1834–1869`：脏field真实409取消、draft恰一copy写、external真实拒绝、跨选择read failure、真实源历史前提均非空洞；新选择历史的保持／实际undo由ADOPT另案承担。
- 审查中的“删除某守卫会使测试失败”是**静态反证推演**，未做源码mutation或重跑RED；运行证据仍来自唯一实现者，主会话核对raw，不能冒称审查者独立执行。

非阻塞备注不自动修复：unknown-effect一行注释多列了本例未触发的busy信号；脏字段标题“可保存”可更精确；局部重排helper未来若与并发／`holdWrites`组合，内部bump失败未传播可能失真，当前调用不触发；当前选择对象身份未另加独立运行断言。copy外层catch／通用loadForms新鲜度仍是范围外旧债。以上不是引入的阻塞缺陷，也不授权扩修、加新组合或再跑工具。

## 两项功能子验收结论

主会话依据用户原「按修订版计划实施」授权、实际阶段差异／运行日志／原始覆盖率／渲染证据及三份实际独立静态报告，对以下两项作**有边界的功能验收**，不是因同伴消息获得新权限：

- **AC2-RELOAD／F1-R4：通过。** 已接受本页写入或仍在途的编辑／排序可超越旧工具栏读取，旧候选不得安装、重置输入或清历史；实际保留undo、后续own-save／external409取消、auth与输入变化／卸载静默取消均有相应证据。等标签receipt identity仍是防御性静态检查，非独立RED证明；不承诺通用loader全局新鲜度。
- **AC2-COPY／F1-R3：通过。** 同项目真实选择变化后，单次复制POST的列表／反馈可完成，而编辑采纳仍绑定原选择；项目／选择ABA、fallback读开始时点、当前列表含副本／未显示／实际读失败、脏form／field／draft与新选择实际undo等见证已核对。保守字段／历史权限不跨未经证明的外部或legacy缺口迁移。正常响应含id的列表成员判定与缺id测试桩兼容分支严格区分；不把通用copy响应体／其他loadForms问题纳入已修。

签名密钥生成、额外持久记忆写入自报及此前排障／构建证据偏离均不计为权限合规通过，不追认、不删除。范围说明已收到、无已确认的持续监听或值暴露；私有文件／环境未作法证核实。整项AC2、backlog、`in_progress`与原B2/2不变；产品／测试及clean bundle保持冻结，没有新实现、补测、审查、凭据、Git／部署／清理授权。

## 本轮记录校验（未追加产品测试）

主会话执行`git diff --check`、任务JSON／Markdown围栏／当前报告路径检查及最终源文件hash校验均通过；HEAD与`in_progress`／completedAt=null不变。索引按实际字段校验434项模块数组入口＋8项根／模块文档路径，共442项均存在，未改`.claude/index.json`。首次通用路径检查误把语言值／排除模式／已记录缺口当必需路径，第二次混用434入口与442总引用而断言失败；按schema分开两类后通过，未为消除报错修改索引。根上下文仍29092字符，活动日志19995，既有批准归档SHA不变；没有新归档／删除。当前记录更新没有运行新的产品代码测试，也没有重启应用或接触凭据值。

## 未运行与保留限制

- **Bandit：因环境缺少工具未运行**；未安装，其他检查不能冒充Bandit通过。
- **后端全量套件／全量覆盖率、backend ruff、adapter stdio E2E：本轮未运行**。后端／适配器代码未变，按实际边界只重跑受保护面与Agent回归；不是默认转交主会话的待补全量门禁。历史1785通过／9886/11071覆盖率不是本轮新结果，旧1784通过＋1unauthorized setup错误及环境假说仍保留。
- 前端无独立typecheck脚本；未新增或伪称类型检查通过。未执行全仓格式化、依赖更新或配置变更。
- 更广的复制响应体处理、其他LOW／IME／跨tab问题、通用卸载审计不在本轮自动扩展范围。
- 原接力、旧报告与失败记录均保留。AC2-COPY／AC2-RELOAD在上述限定功能范围内通过；未豁免执行偏离或更广残余限制，全任务AC2及任务仍`in_progress`。
- 不授权新凭据、真实数据／生产8888访问、提交／任务归档／合并／推送／部署或清理。临时文件／工作区／分支删除仍需用户单独确认。

下一步：查看本记录的两项功能验收、执行偏离与范围外残余，再由用户另行指定其余AC2／backlog或Git收尾范围。本切片没有待执行的实现／测试／审查／应用动作；不读取私有记忆或凭据，不自行回滚、轮换、清理或追加提交／合并／推送／部署。
