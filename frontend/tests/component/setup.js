// 组件挂载测试的共享 setup：由 vitest.config.js 的 setupFiles 加载，只作用于 tests/component/*.spec.js，
// 不影响 node --test 的 tests/*.test.js 套件。
//
// 约定（详见 .trellis/spec/frontend/quality-guidelines.md「Component Mount Tests」）：
// - Element Plus 组件经下方 config.global.plugins 全局注册，各用例 mount() 无需重复安装；
// - 挂载测试期间出现任何 Vue 警告（含卸载阶段）都判为用例失败，收集与断言见 ./vueWarnGate.js，修根因、不消音；
// - ElMessage 是挂载了 success/error/… 方法的函数对象（方法在 element-plus/es/components/message/src/method.mjs
//   里直接赋值到函数上），所以可 spyOn；这里统一 spy 成 no-op，用例直接断言 ElMessage.success 等；
//   ElMessageBox.confirm 不做全局 mock，需要用例自行 vi.spyOn(ElMessageBox, 'confirm')；
// - 默认不添加 DOM polyfill，仅在用例证明缺少某 API 时按需补充并注明组件与 API。
import { afterEach, beforeEach, vi } from 'vitest';
import ElementPlus, { ElMessage } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { config, enableAutoUnmount } from '@vue/test-utils';
import { assertNoVueWarnings, collectVueWarning, resetVueWarnings, spyConsoleVueWarnings } from './vueWarnGate.js';

// 与 src/main.js 保持一致的全局注册：每个 mount() 都能解析 el-* 组件（默认不带 CSS，DOM 环境无布局）。
config.global.plugins = [[ElementPlus, { locale: zhCn }]];
// app 级警告收集：带组件实例的 Vue 警告进入 ./vueWarnGate.js 的收集数组。
config.global.config.warnHandler = collectVueWarning;

// afterEach 按注册逆序执行：本文件按「门禁 → 还原 → 自动卸载」注册，实际执行顺序为「卸载 → 还原 → 门禁」。
// 卸载最先跑：组件内部定时器随卸载停止，卸载阶段发出的警告同样能被收集；
// 门禁最后跑：即使它抛错也不会跳过卸载与还原（vitest 某一 afterEach 抛错会跳过该用例剩余的 afterEach）。
afterEach(assertNoVueWarnings);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  // 清空 body 及其 class/style：teleport 弹层残留、Element Plus 锁滚动（lock-scroll）写入的 class/style 不得泄漏到下一个用例。
  document.body.innerHTML = '';
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
});

// 每个用例结束后自动卸载 mount() 产生的 wrapper，避免 teleport 弹层 / 定时器泄漏到下一个用例。
enableAutoUnmount(afterEach);

// 每个用例开始：清空残留 Vue 警告、开启 console 侧 Vue 警告拦截，并静默 ElMessage 的四个常用方法；用例断言直接引用同一个 ElMessage 对象。
beforeEach(() => {
  resetVueWarnings();
  spyConsoleVueWarnings();
  for (const method of ['success', 'error', 'warning', 'info']) {
    vi.spyOn(ElMessage, method).mockImplementation(() => {});
  }
});
