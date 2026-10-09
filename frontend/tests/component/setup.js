// 组件挂载测试的共享 setup：由 vitest.config.js 的 setupFiles 加载，只作用于 tests/component/*.spec.js，
// 不影响 node --test 的 tests/*.test.js 套件。
//
// 约定（详见 .trellis/spec/frontend/quality-guidelines.md「Component Mount Tests」）：
// - Element Plus 组件经下方 config.global.plugins 全局注册，各用例 mount() 无需重复安装；
// - ElMessage 是挂载了 success/error/… 方法的函数对象（方法在 element-plus/es/components/message/src/method.mjs
//   里直接赋值到函数上），所以可 spyOn；这里统一 spy 成 no-op，用例直接断言 ElMessage.success 等；
//   ElMessageBox.confirm 不做全局 mock，需要用例自行 vi.spyOn(ElMessageBox, 'confirm')；
// - 默认不添加 DOM polyfill，仅在用例证明缺少某 API 时按需补充并注明组件与 API。
import { afterEach, beforeEach, vi } from 'vitest';
import ElementPlus, { ElMessage } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { config, enableAutoUnmount } from '@vue/test-utils';

// 与 src/main.js 保持一致的全局注册：每个 mount() 都能解析 el-* 组件（默认不带 CSS，DOM 环境无布局）。
config.global.plugins = [[ElementPlus, { locale: zhCn }]];

// 先注册还原钩子，再注册 enableAutoUnmount：vitest 的 after 钩子默认按注册逆序执行，
// 保证 wrapper 卸载（组件内部定时器随卸载停止）发生在 useRealTimers / restoreAllMocks 之前。
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

// 每个用例结束后自动卸载 mount() 产生的 wrapper，避免 teleport 弹层 / 定时器泄漏到下一个用例。
enableAutoUnmount(afterEach);

// 静默 ElMessage 的四个常用方法；用例断言直接引用同一个 ElMessage 对象。
beforeEach(() => {
  for (const method of ['success', 'error', 'warning', 'info']) {
    vi.spyOn(ElMessage, method).mockImplementation(() => {});
  }
});
