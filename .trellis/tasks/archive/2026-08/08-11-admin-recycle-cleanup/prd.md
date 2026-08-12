# 回收站定时清理与用户管理页重构

## Goal

给管理员「用户管理」页做四项改动：回收站加可配置定时清理、删掉无用的密码状态列、把三个批量按钮收敛成一个「项目列表」弹窗、整页内容收窄到一半并居中。最终让回收站不再单向膨胀、用户管理页更紧凑易用。

## Background

- 项目软删除后写入 `project.deleted_at`（naive 本地时间），代码库里没有任何自动清理机制，回收站只进不出，数据库单向变大。
- 「密码状态」列恒为「已设密码」（系统已强制新建用户必设初始密码），无信息价值，占 120px。
- 每行 6 个按钮，「批量迁移/复制/删除」三个按钮打开的是同一个弹窗，入口重复，操作列固定 540px。
- 表格铺满整屏，宽屏上信息密度低。

## Requirements

### R1 回收站定时清理（后端 + 前端配置 UI）
- 管理员可配置两条**相互独立**的清理规则，可分别启停：
  - 年龄规则：删除 `deleted_at` 距今超过 N 天/月/年的回收站项目（月按 30 天、年按 365 天计算，不做日历月/闰年）。
  - 容量规则：回收站内所有项目的**估算总大小**超过 N MB/GB 时，从最早删除的项目开始逐个彻底删除，直到总量回落到上限以内。
- 容量规则受「最短保留时间」（小时，默认 24，可设 0 关闭）保护：删除时间不足该时长的项目不参与容量清理，避免刚误删的大项目立即被清掉。
- 巡检间隔可配置（分钟，1..1440），后台循环每轮重读配置，改动在下一轮生效，无需重启。
- 两条规则默认关闭。
- 配置持久化到 `config.yaml` 的 `recycle_bin` 段，**不走环境变量覆盖**（UI 可改，env 覆盖会让 UI 与实际行为不一致）。
- 前端在「项目回收站」弹窗里提供「清理策略」按钮打开独立配置弹窗，含「预览将删除」试运行按钮（只读，不执行），任一规则从关闭切到启用时需二次确认。
- 后台循环必须有环境变量开关（`CRF_DISABLE_BACKGROUND_JOBS`），测试环境默认关闭，避免 pytest 对真实库执行不可逆删除。
- 删除不可逆，每次彻底删除打 INFO 日志（id/name/owner/deleted_at/估算大小）。

### R2 删除「密码状态」列
- 仅删前端 `AdminView.vue` 的密码状态列。后端 `has_password` 字段及其测试保持不变，重置密码入口保持不变。

### R3 批量入口收敛为「项目列表」
- 每个非管理员用户行一个「项目列表」按钮，点击打开弹窗列出该用户的项目（带勾选）。
- 弹窗内选择操作方式（迁移/复制/删除），迁移与复制显示目标用户下拉，删除走原有二次确认。
- 后端批量接口（batch-move/copy/delete）零改动。`executeBatchMove/Copy/Delete` 函数体行为保持不变。

### R4 整页内容减半居中
- 标题 + 按钮栏 + 用户表格整块内容宽度为视口一半，水平居中。
- 单元格内文本对齐方式不变（表头居中、body 左对齐原样）。
- 不得出现横向滚动条；最小宽度兜底防止列挤窄。

## Acceptance Criteria

- [ ] `config.yaml` 出现 `recycle_bin` 段，默认两条规则关闭，字段含 `interval_minutes`/`min_retain_hours`/`age`/`size`。
- [ ] `GET/PUT /api/admin/recycle-bin/cleanup-policy` 与 `POST /api/admin/recycle-bin/cleanup/preview` 三个接口存在且需管理员权限，非管理员 403。
- [ ] 后台循环在 `CRF_DISABLE_BACKGROUND_JOBS=1` 时不启动；默认配置下即使循环运行也是 no-op。
- [ ] 年龄规则只删超过 cutoff 的回收站项目，不误伤 `deleted_at IS NULL` 的项目；cutoff 用 naive 本地时间。
- [ ] 容量规则按 `deleted_at ASC` 逐个删到阈值以下；已被年龄规则选中的不重复计入；受 `min_retain_hours` 保护的项目不被选中。
- [ ] 每个 `RecycleBinProjectResponse` 含 `estimated_size_bytes`；体积估算查询条数与项目数无关。
- [ ] 用户表无「密码状态」列；操作列只剩 改名/重置密码/项目列表/删除 四个按钮，宽度 300。
- [ ] 「项目列表」弹窗可完成迁移/复制/删除三条路径，删除仍有 `confirmFinalProjectDelete` 二次确认。
- [ ] `.admin-shell` 宽度 50% 且 `margin-inline: auto`；无横向滚动条；`tableHeaderStyle.test.js` 不受影响。
- [ ] 回收站弹窗有「大小（估算）」列与「清理策略」按钮；策略弹窗有预览试运行 + 启用二次确认。
- [ ] 后端全量 pytest 通过，前端全量 `node --test` 通过，`npm run lint` 0 errors，`npm run build` 通过。

## Out of Scope

- 不改造 `/api/settings` 接口（清理策略走独立 admin 接口）。
- 不引入 APScheduler/Celery 等外部调度依赖（用进程内 asyncio 循环）。
- 不做物化的项目体积列（按需估算）。
- 不做多实例部署的后台任务去重（与现有限流器同属单节点限制，文档说明即可）。
- 不改桌面打包流程。

## Notes

- 详细技术设计见 `design.md`，执行清单见 `implement.md`。