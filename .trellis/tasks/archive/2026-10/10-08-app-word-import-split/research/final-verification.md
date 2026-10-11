# 最终验证记录 — app-word-import-split

## 1. 验证命令与结果对比（P1 基线 vs P6 最终门禁）

P6 源码验证基于 `47ac218`；随后仅以 `fd97dd6` 回填文档证据，源码/测试未再变化，worktree 干净。main 仍为 `6090a81`，未合并、推送、归档或清理 worktree。

| 验证项 | P1 基线（6090a81） | P6 最终门禁（47ac218） | 差异与日志路径 |
|---|---|---|---|
| `npm ci` | 退出码 0 | 退出码 0 | 依赖无变动；日志见 `/tmp/app-word-import-split-final/` |
| `node:test` | 944 passed | 954 passed | +10（新增选择桥接与来源测试） |
| 组件挂载测试 | 5 文件 / 26 用例 | 6 文件 / 50 用例 | +1 文件 / +24 用例（`WordImportDialog.spec.js`） |
| `eslint` | 0 errors / 3546 warnings | 0 errors / 3546 warnings | 零新增 warning，代码风格基线一致 |
| Vite 构建 | 构建成功 | 构建通过（耗时 4.12s） | 产物正常生成，无模块缺失 |
| 后端 `pytest` | 1210 passed | 1210 passed / 893 warnings | 全部通过；日志见 `/tmp/app-word-import-split-final/` |

## 2. RED/GREEN 与变异验证摘要
- **Group A（表单选中桥接）**：`useDesignerFormSelection.test.js` 经历 RED（模块缺失及旧 App 导航断言失败）→ GREEN（7 条用例：6 条行为测试 + 1 条源码断言），覆盖空引用排队、就绪立即调用、最新排队请求优先、消费后不重放及 `null` 透传。
- **Group B（向导组件与逻辑抽离）**：`WordImportDialog.spec.js` 经历 RED → GREEN（24 条组件/逻辑用例，涵盖 10 MiB 拦截、AI 轮询与建议接受、`getAuthHeaders()` 绑定、`open-designer` 事件及真实 composable 的卸载后状态保护），3 个既有源码测试完成重定向并补齐反向守卫。移除成功/失败响应的卸载守卫会使两条状态快照用例失败；移除消费后清空待选 id 的逻辑会使重挂载用例失败，均在隔离 `/tmp` 副本验证。

## 3. 审查项闭环与本地 CSS 探针
- **审查闭环**：`trellis-check`、Haiku、`/review-code` 及只读安全审查发现的问题全部闭环（补上 `refreshKey` 注入默认值、补齐组件卸载与轮询清理生命周期测试）。
- **本地 CSS 差异探针**（`finalDifferential.spec.js`）：证实无新选择器丢失。`[App scope] .el-dialog` 与 `.el-dialog__header` 在前后均因缺乏 App scope ID 而不匹配（既有未匹配样式），移动后的子组件表单与复选框选择器在 `WordImportDialog` 作用域内正常匹配。

## 4. 警告与未运行项说明
- **npm 引擎与废弃警告**：基线与最终均出现 Node 24.14.1 下 `abbrev 5` / `nopt 10` 的 `EBADENGINE`（来自 `@vue/test-utils` → `js-beautify` → `nopt` → `abbrev`，仅限开发/测试工具链）及 6 处 deprecated 提示。
- **Lint 与 Pytest 警告**：3546 处 ESLint 警告与 893 处 Pytest 警告（Starlette anyio Deprecation + PyJWT InsecureKeyLength）均为历史既有基线。
- **依赖审计限制**：基线 `npm ci` 报告 13 项依赖漏洞告警（11 high / 1 moderate / 1 low）；最终原样执行 `npm ci`，未加 audit 参数或环境覆盖，日志未输出漏洞计数，原因未核实，不能据此认定漏洞已清零。额外的外部 `npm audit` 查询被权限策略拦截；依赖未升级，也未声称漏洞已修复。
- **未运行项**：前端无 coverage provider，覆盖率未运行；实机浏览器被环境的临时测试凭据生成策略拦截，尚无可用隔离凭据（未运行，也未豁免验收要求）。
- **状态提示**：非整任务完成归档；后续访视预览相关工作仍待 `designer-split` 合并后推进。
