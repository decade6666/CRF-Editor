# 执行指令:导出Word 悬停下拉(eCRF / aCRF)

> 已通过 Codex + Antigravity 双模型评审,方案定稿。**只允许修改下面两个文件,不要碰其它任何文件,不要 git commit/push。**

## 允许修改的文件(仅此两个)
1. `frontend/src/App.vue`
2. `frontend/tests/appSettingsShell.test.js`

## 改动 1:App.vue 模板(顶栏 `header-right` 内的导出按钮,约 L913-917)
把现有这一行:
```html
<el-button v-if="selectedProject" type="warning" size="small" :loading="exportWordLoading" @click="exportWord">导出Word</el-button>
```
替换为 `el-dropdown` 悬停下拉(触发器即原按钮,**不要保留独立 `@click`**):
```html
<el-dropdown
  v-if="selectedProject"
  trigger="hover"
  :disabled="exportWordLoading"
  @command="onExportCommand"
>
  <el-button type="warning" size="small" :loading="exportWordLoading" aria-label="导出">导出Word</el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="ecrf">导出eCRF</el-dropdown-item>
      <el-dropdown-item command="acrf">导出aCRF</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```
- 保留同级的「导入模板」按钮(`@click="openImportDialog"`)不动。
- Element Plus 已在 `main.js` 全量注册,`el-dropdown` / `el-dropdown-menu` / `el-dropdown-item` 无需额外 import。

## 改动 2:App.vue 脚本(在 `exportWord` 函数附近新增分发函数)
```js
function onExportCommand(command) {
  if (command === 'ecrf') {
    exportWord();
  } else if (command === 'acrf') {
    ElMessage.info('导出aCRF 功能即将上线');
  }
}
```
- `exportWord()` 函数体**保持原样,一行都不改**。
- `ElMessage` 已在文件内 import(`exportWord` 已在用),不要重复 import。

## 改动 3:更新测试 `frontend/tests/appSettingsShell.test.js`
只改 `test('header keeps template import and word export only', ...)`(约 L55-64)这一条。原内容:
```js
test('header keeps template import and word export only', () => {
  const headerSection = appSource.match(/<div class="header-right">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(headerSection, /@click="openImportDialog">导入模板<\/el-button>/);
  assert.match(headerSection, /@click="exportWord"[\s\S]*>导出Word<\/el-button\s*>/);
  assert.doesNotMatch(headerSection, /导入Word/);
  assert.match(
    appSource,
    /<el-button v-if="selectedProject" type="warning" size="small" @click="openImportDialog">导入模板<\/el-button>/,
  );
});
```
注意:`<div class="header-right">...</div>` 的非贪婪正则在引入嵌套 `<template #dropdown>` 后会在第一个 `</div>` 截断,**不要再依赖 headerSection 去匹配 dropdown 内部**。改为基于完整 `appSource` 断言 dropdown 结构。改写为(语义等价、覆盖新结构):
```js
test('header keeps template import and word export only', () => {
  const headerSection = appSource.match(/<div class="header-right">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(headerSection, /@click="openImportDialog">导入模板<\/el-button>/);
  assert.doesNotMatch(appSource, /导入Word/);
  // 导出入口改为悬停下拉:eCRF 复用 exportWord,aCRF 占位
  assert.match(appSource, /<el-dropdown\s+v-if="selectedProject"[\s\S]*trigger="hover"[\s\S]*@command="onExportCommand"/);
  assert.match(appSource, /:loading="exportWordLoading"[\s\S]*>导出Word<\/el-button>/);
  assert.match(appSource, /command="ecrf">导出eCRF<\/el-dropdown-item>/);
  assert.match(appSource, /command="acrf">导出aCRF<\/el-dropdown-item>/);
  assert.match(appSource, /function onExportCommand\(command\)\s*\{[\s\S]*command === 'ecrf'[\s\S]*exportWord\(\)[\s\S]*command === 'acrf'[\s\S]*ElMessage\.info/);
});
```
- 其余测试用例(尤其 `word export uses a single loading guard` 那条)**不要改**,它们对 `exportWord` 的断言仍然成立。

## 自检(改完执行,把结果贴出来)
```bash
cd /root/github/CRF-Editor/frontend && node --test tests/appSettingsShell.test.js && node --test tests/*.test.js && npm run lint
```
- 全绿才算完成。若某条测试失败,优先修正实现/测试正则使其与真实改动一致,不要用 `|| true` 掩盖失败。
- **不要 git add / commit / push。** 完成后报告改了哪几处 + 自检结果。
