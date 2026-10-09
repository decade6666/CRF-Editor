// Vue 警告门禁（「警告即失败」策略）：挂载测试期间出现的任何 Vue 警告（含卸载阶段）都会让当前用例失败。
// 警告经两条互不覆盖的通道到达，必须同时把守：
// 1. app 级 warnHandler（collectVueWarning）：带组件实例的警告走各 mount 应用的 app.config.warnHandler；
//    但 el-select 等组件挂载期间会用自带包装器替换 warnHandler，包装器只转发给接管前已存在的处理函数，
//    所以必须先把 collectVueWarning 装进 config.global.config，让包装器捕获到我们的收集函数；
// 2. console 通道（spyConsoleVueWarnings）：无组件实例的警告（如对 readonly 响应式对象赋值）不经过
//    warnHandler，直接 console.warn('[Vue warn] …')；spy 只拦截带 '[Vue warn]' 前缀的调用并始终透传原始输出。
import { vi } from 'vitest';

// 遵循不可变更新约定：每次写入都替换为新数组，清空则整体换新（见 resetVueWarnings / assertNoVueWarnings）。
let vueWarnings = [];
// 模块加载时取原始 console.warn：若某用例卸载抛错跳过了 restoreAllMocks，下个用例的 spyOn 会复用旧 spy，
// 届时在 beforeEach 里取到的「原始」函数就是 spy 自身，透传会无限递归。
const originalWarn = console.warn;

// app 级 warnHandler：收集带组件实例的警告（trace 为组件树定位，非空时一并记录）。
export function collectVueWarning(message, instance, trace) {
  vueWarnings = [...vueWarnings, `[Vue warn]: ${message}${trace ? `\n${trace}` : ''}`];
}

// beforeEach 首先调用：清空残留警告。只有上一个用例的 afterEach 链被抛错打断（如卸载抛错，门禁未执行）时才会残留，
// 那个用例已因该错误失败；这里丢弃残留，避免把它们误记到当前用例头上。
export function resetVueWarnings() {
  vueWarnings = [];
}

// beforeEach 调用：接管 console.warn，收集无组件实例、绕过 warnHandler 的 '[Vue warn]' 前缀警告。
export function spyConsoleVueWarnings() {
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[Vue warn]')) {
      vueWarnings = [...vueWarnings, args.filter((arg) => typeof arg === 'string').join(' ')];
    }
    originalWarn.apply(console, args);
  });
}

// afterEach 调用：drain 收集数组，非空即抛错并逐条列出警告（setup.js 最先注册它，afterEach 逆序执行，故它最后运行）。
export function assertNoVueWarnings() {
  const collected = vueWarnings;
  vueWarnings = [];
  if (collected.length > 0) {
    const list = collected.map((warning) => `  - ${warning}`).join('\n');
    throw new Error(
      `挂载测试期间出现 ${collected.length} 个 Vue 警告（策略：任何 Vue 警告都视为用例失败，请修复根因，绝不消音）：\n${list}`,
    );
  }
}
