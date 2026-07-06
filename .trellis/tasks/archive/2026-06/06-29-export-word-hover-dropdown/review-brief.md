# 评审简报:导出Word 悬停下拉(eCRF / aCRF)

> 你是代码评审者,**只读评审,不要修改任何文件**。请基于本简报 + 下列源码,给出方案风险与改进意见。

## 需求
把 `frontend/src/App.vue` 顶栏的单个「导出Word」按钮,改为 Element Plus `el-dropdown`(`trigger="hover"`):
- 悬停展开,出现两项:「导出eCRF」「导出aCRF」。
- 「导出eCRF」点击 = 复用现有 `exportWord()`,行为与改造前完全一致(后端、下载、`exportWordLoading` 防重/loading 全保留)。
- 「导出aCRF」点击 = 仅 `ElMessage.info('导出aCRF 功能即将上线')`,不发起任何网络请求。本期不实现真实导出。
- 保留 `v-if="selectedProject"` 显隐与 `type="warning" size="small"` 风格。

## 当前代码(关键片段)
触发器按钮(App.vue 约 L915):
```html
<el-button v-if="selectedProject" type="warning" size="small" :loading="exportWordLoading" @click="exportWord">导出Word</el-button>
```
导出逻辑 `exportWord()`(App.vue L317-355):校验 `selectedProject`/`exportWordLoading` → 收集 `column_width_overrides` → POST `/api/projects/{id}/export/word` → blob 下载 → `ElMessage` 成功/失败 → finally 复位 `exportWordLoading`。

## 拟定实现方案
1. 顶栏替换为:
```html
<el-dropdown v-if="selectedProject" trigger="hover" @command="onExportCommand">
  <el-button type="warning" size="small" :loading="exportWordLoading">导出Word</el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="ecrf">导出eCRF</el-dropdown-item>
      <el-dropdown-item command="acrf">导出aCRF</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```
2. 新增分发函数 `onExportCommand(cmd)`:`ecrf` → `exportWord()`;`acrf` → `ElMessage.info('导出aCRF 功能即将上线')`。
3. `exportWord()` 函数体保持不变。
4. 同步更新测试 `frontend/tests/appSettingsShell.test.js`(原断言用正则匹配了 `@click="exportWord">导出Word</el-button>` 的精确 markup,改 dropdown 后会失败,需改为匹配新的 dropdown 结构 + `onExportCommand`)。

## 请重点评审
1. `el-dropdown` `trigger="hover"` 触发器内放 `el-button` 是否会有「按钮自身 click 与 dropdown 冲突」「loading 时触发器可点性」等坑?是否需要把按钮 click 行为移除(现按钮无独立 click,仅作触发器)?
2. eCRF 复用 `exportWord()` 是否能保证行为 100% 等价(它内部已自带 `selectedProject`/`exportWordLoading` 守卫)?
3. 是否存在可访问性(键盘可达性、aria)、暗色主题、`el-dropdown` 在 header flex 容器内的对齐/换行风险?
4. 测试断言的改造是否还有其它隐藏耦合(grep `exportWord`/`导出Word` 已知仅 appSettingsShell.test.js)?
5. aCRF 占位:`@command` 分发 vs 各 item 直接 `@click`,哪个更利于「下一步接真实导出」的扩展且更符合 Element Plus 惯例?
6. 任何会破坏 README / frontend `.claude/CLAUDE.md` 既有契约的点。

## 输出要求
分级列出:🔴Blocker / 🟡建议 / 🟢可选。每条一句话,给出明确可执行结论。不要改文件。
