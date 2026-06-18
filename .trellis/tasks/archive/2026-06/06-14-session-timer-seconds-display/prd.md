# feat: 会话倒计时改为显示原始剩余秒数（如 `3600(s)`）

## Goal

把右上角会话计时器的展示文案从 `会话剩余 mm:ss` 改为**原始剩余秒数 + `(s)` 后缀**，例如 `3600(s)`、`45(s)`。每秒刷新时秒数实时递减。

## Context（为什么做 + 根因）

用户反馈"右上角倒计时又变成了 `会话剩余XX:XX`，之前的修改又被回退了"。经全分支 `-S "会话剩余"` 历史 + 工作区 + stash + reflog 追查：

- 当前 `useSessionTimer.js:37` = `` `会话剩余 ${minutes}:${ss}` ``，工作区干净。
- 这一行只改过两次：`2b0baed`（引入"会话剩余 X 分钟"）→ `ff77b0e`（改成实时"会话剩余 X:XX"），两次都保留前缀。
- **从未存在过用户期望的"纯秒数"版本**——那次改动根本没进版本库（很可能停留在上一会话工作区未 commit，新会话拿到干净副本即丢失）。
- 隐性锁：`frontend/tests/sessionTimer.test.js` 用 5 处断言把旧文案锁死。只改源码不改测试，回归必失败——这是改动反复"被拉回"的真正根因。

因此本任务的关键不只是改文案，而是**源码 + 测试同步改**，并在 draft 分支 commit，防止再次丢失。

## What I already know

* 唯一展示入口：`frontend/src/composables/useSessionTimer.js` 的 `formatRemainingSeconds(remainingSeconds)`（约 31-38 行）。`displayText` 计算属性（127 行）唯一消费它。
* `remainingSeconds` 已是整数秒（`getTokenRemainingSeconds` 返回 `Math.floor(exp - now/1000)`）。
* 刷新节拍 `TIMER_INTERVAL_MS = 1000`（每秒重算），无需改动即可让秒数实时跳动。
* 组件 `SessionTimer.vue:14` 渲染 `{{ displayText }}`，`:26` 的 `buttonTitle` 用 `` `${displayText.value}，点击续期` ``——会自动变成 `3600(s)，点击续期`，无需改组件。
* 颜色状态 `resolveTimerStatus`（40-45 行）独立于文案、warning 弹窗 `message.warning`（97 行）由 5 分钟阈值 guard 驱动，均与展示文案无关，保持不动。
* `displayText` 引用点：`frontend/src/components/SessionTimer.vue`、`frontend/tests/sessionTimer.test.js`（5 处断言）。无其它消费者。

## Requirements

### R1 改写展示函数
`frontend/src/composables/useSessionTimer.js` 的 `formatRemainingSeconds` 改为：

```js
function formatRemainingSeconds(remainingSeconds) {
  if (!Number.isFinite(remainingSeconds)) return '';
  if (remainingSeconds <= 0) return '已过期';
  return `${remainingSeconds}(s)`;
}
```

* 保留 `!Number.isFinite → ''`（无 token 时隐藏按钮，`SessionTimer.vue` 的 `v-if="displayText"` 依赖此返回值）。
* 保留 `<= 0 → '已过期'`（比 `0(s)`/负数更清晰）。
* **删除** `< 60 → '会话即将过期'` 这条展示分支：改为直接显示精确秒数（如 `45(s)`）。
* 删除随之无用的 `minutes` / `seconds` 局部变量。

### R2 同步测试断言（关键，防回退）
`frontend/tests/sessionTimer.test.js` 更新 `displayText` 断言：

| 行 | 旧断言 | 新断言 | 剩余秒 |
|---|---|---|---|
| 65 | `会话剩余 1:00` | `60(s)` | 60 |
| 69 | `会话即将过期` | `59(s)` | 59（时间推进 1s） |
| 73 | `已过期` | 不变 | -1 |
| 108 | `会话剩余 30:00` | `1800(s)` | 1800 |
| 115 | `会话剩余 60:00` | `3600(s)` | 3600 |

其余测试（JWT 解码、warning guard 去重、refresh 调用 `/api/auth/me`）不改。

### R3 不做项
* 不改 `SessionTimer.vue`（`buttonTitle` 自动适配）。
* 不改 `resolveTimerStatus` 颜色逻辑、`createSessionWarningGuard`、`message.warning` 弹窗。
* 不改 `TIMER_INTERVAL_MS`、续期路径、`useApi.js`、后端任何文件。
* 不改 JWT TTL、`X-Refreshed-Token` 协议、401 处理。

## Acceptance Criteria

* [ ] 登录后右上角显示如 `3540(s)`，每秒递减肉眼可见。
* [ ] 剩余 ≤ 0 时显示 `已过期`；无 token 时按钮隐藏。
* [ ] hover/title 显示 `<秒数>(s)，点击续期`，点击仍可续期。
* [ ] 临期变色（warning/danger）仍生效，warning 弹窗仍只弹一次。
* [ ] `cd frontend && node --test tests/sessionTimer.test.js` 全绿。
* [ ] `cd frontend && node --test tests/*.test.js` 全绿（无其它测试受影响）。
* [ ] 改动已在 `draft` 分支 commit（防止再次丢失）。

## Files In Scope

| 改动 | 文件 |
|---|---|
| 修改 | `frontend/src/composables/useSessionTimer.js`（`formatRemainingSeconds`）|
| 修改 | `frontend/tests/sessionTimer.test.js`（5 处 `displayText` 断言）|

## Files Out of Scope（不要碰）

* `frontend/src/components/SessionTimer.vue`
* `frontend/src/composables/useApi.js`
* 后端全部文件、`config.yaml`、JWT/续期/限流相关逻辑

## Risks / Notes

* 文档 `frontend/.claude/CLAUDE.md` / 根 `CLAUDE.md` 中"会话剩余时间展示"为描述性措辞、非契约，可按需顺手改为"剩余秒数展示"，属次要项。
* 务必 commit：上次改动丢失的根因就是停留在工作区未提交。
