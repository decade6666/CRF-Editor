// agent-access 父/子接线守卫（先例 visitPreviewSplit.test.js）：
//   - ProjectInfoTab.vue 只保留小型懒挂载入口（按钮 + showAgentAccess/agentAccessMounted），
//     按 v-model + project-id 转发渲染一个 <AgentAccessDialog>，不转发 @close；
//   - AgentAccessDialog.vue 自持两段式 UI（凭据 / 共享提案），令牌遮罩 + 一次性显示，
//     复制走唯一剪贴板入口 clipboardCopy.js，API 一律走 useApi.js 的 api；
//   - useAgentAccess.js 是每次调用独立的无模块级可变状态工厂（effectScope 可释放）；
//   - 四个相关源文件都不含裸 fetch(、不触碰 localStorage。
// 组件缺失时读文件降级为空串，让存在性断言先失败，而不是抛出 ENOENT 导入错误。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectInfoTabPath = path.resolve(currentDir, '../src/components/ProjectInfoTab.vue');
const dialogPath = path.resolve(currentDir, '../src/components/AgentAccessDialog.vue');
const composablePath = path.resolve(currentDir, '../src/composables/useAgentAccess.js');
const wiringPath = path.resolve(currentDir, 'agentAccessWiring.test.js');

function readSourceOrNull(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

const tabSource = readSourceOrNull(projectInfoTabPath) ?? '';
const dialogCode = readSourceOrNull(dialogPath) ?? '';
const composableSource = readSourceOrNull(composablePath) ?? '';
const wiringSource = readSourceOrNull(wiringPath) ?? '';

function countMatches(source, pattern) {
  const global = pattern.flags.includes('g') ? pattern : new RegExp(pattern, pattern.flags + 'g');
  return [...source.matchAll(global)].length;
}

test('ProjectInfoTab imports and renders exactly one AgentAccessDialog', () => {
  assert.match(tabSource, /import AgentAccessDialog from '\.\/AgentAccessDialog\.vue'/);
  assert.equal(countMatches(tabSource, /<AgentAccessDialog/), 1, 'AgentAccessDialog 应只渲染一次');
});

test('ProjectInfoTab dialog wiring forwards model-value and project-id only', () => {
  const call = tabSource.match(/<AgentAccessDialog([\s\S]*?)\/>/)?.[1] ?? '';
  assert.match(call, /v-if="agentAccessMounted"/, '对话框必须懒挂载（首次打开才渲染）');
  assert.match(call, /:model-value="showAgentAccess"/);
  assert.match(call, /:project-id="project\.id"/);
  assert.match(call, /@update:model-value/);
  assert.doesNotMatch(call, /@close/, '不得转发 @close（Element Plus afterLeave/beforeLeave 双触发陷阱）');
});

test('ProjectInfoTab lazy entry button opens the dialog once', () => {
  assert.match(tabSource, /data-test="agent-access-entry"/);
  assert.match(tabSource, /agentAccessMounted/);
  assert.match(tabSource, /function openAgentAccess\(/);
  assert.match(tabSource, /showAgentAccess/);
});

test('AgentAccessDialog uses the composable and clipboard helper', () => {
  assert.match(dialogCode, /useAgentAccess\(/);
  assert.match(dialogCode, /copyTextToClipboard\(/);
  assert.match(dialogCode, /defineEmits\(\['update:modelValue'\]\)/, '只声明 update:modelValue 一个 emit');
});

test('AgentAccessDialog masks the one-time token by default', () => {
  assert.match(dialogCode, /data-test="issued-token-panel"/);
  assert.match(dialogCode, /data-test="issued-token-toggle"/);
  assert.match(dialogCode, /data-test="issued-token-copy"/);
  assert.match(dialogCode, /tokenVisible/);
});

test('AgentAccessDialog clears the token when the dialog closes', () => {
  // 关闭（modelValue→false）走 watcher 清令牌，不走 @close（双触发陷阱）
  assert.match(dialogCode, /clearIssuedToken\(\)/);
});

test('useAgentAccess is a per-invocation factory with no module-level mutable state', () => {
  assert.match(composableSource, /export function useAgentAccess\(/);
  // 模块顶层不允许出现可变 ref/computed/reactive 单例（只允许 import 与函数/常量定义）
  const topLevel = composableSource.split(/^export function useAgentAccess\(/m)[0];
  assert.doesNotMatch(topLevel, /^ref\(|^reactive\(|^computed\(/m);
  assert.match(composableSource, /onScopeDispose\(/, '卸载时必须停止迟到响应并清除令牌');
});

test('composable coordinates project switch with a stale-response guard', () => {
  assert.match(composableSource, /watch\(\s*projectId/);
  assert.match(composableSource, /watch\(\s*projectId[\s\S]{0,400}clearIssuedToken\(\)/, '项目切换必须清除一次性令牌');
});

test('agent-access sources route every request through useApi (no bare fetch)', () => {
  // ProjectInfoTab 的 3 处 fetch( 是 §9 既有 apiUrl() 边界（Logo/资料保存），保持数量不变
  for (const [name, source] of [
    ['AgentAccessDialog', dialogCode],
    ['useAgentAccess', composableSource],
  ]) {
    assert.ok(!/\bfetch\(/.test(source), `${name} 不得绕过 useApi 直接 fetch`);
  }
  assert.equal(
    countMatches(tabSource, /\bfetch\(/),
    3,
    'ProjectInfoTab 不得因 agent 入口新增裸 fetch 边界'
  );
});

test('agent-access sources never touch localStorage', () => {
  for (const [name, source] of [
    ['ProjectInfoTab', tabSource],
    ['AgentAccessDialog', dialogCode],
    ['useAgentAccess', composableSource],
  ]) {
    assert.ok(!/localStorage/.test(source), `${name} 不得持久化任何 agent 状态`);
  }
});

test('composable hits every owner endpoint', () => {
  for (const endpoint of [
    '/agent-access/credentials`',
    '/agent-access/credentials',
    '/revoke`',
    '/agent-access/changes?',
    '/approve`',
    '/reject`',
  ]) {
    assert.ok(composableSource.includes(endpoint), `composable 应包含端点片段 ${endpoint}`);
  }
  assert.match(composableSource, /\/agent-access\/changes\/\$\{changeId\}/);
});

test('new UI sources keep the digest binding on approve/reject calls', () => {
  assert.match(composableSource, /decideChange\(/);
  assert.match(composableSource, /proposal_digest/);
});

test('wiring guard itself stays intact (self-check)', () => {
  assert.match(wiringSource, /agentAccessMounted/);
});

test('AgentAccessDialog bounds width to the viewport while keeping the desktop max', () => {
  // Element Plus 把 width prop 写成 .el-dialog 的内联 --el-dialog-width 变量（真实渲染元素，
  // 主题以 width: var(--el-dialog-width) 解析）；实测 scoped :deep 祖先选择器命中不了
  // 该元素（390px 视口下 computed max-width 仍为 none），禁止再回退到它。
  assert.match(dialogCode, /:width="dialogWidth"/, '弹窗宽度必须经 width prop 绑定到真实 el-dialog 元素');
  assert.match(
    dialogCode,
    /const dialogWidth = 'min\(860px, calc\(100vw - 24px\)\)'/,
    '桌面保持 860px 上限，同时以 CSS min() 按视口宽度封顶'
  );
  assert.doesNotMatch(dialogCode, /:deep\(\.el-dialog\)/, 'scoped :deep 祖先选择器无法命中真实 el-dialog，不得依赖它');
});

test('AgentAccessDialog long content wraps inside its own region', () => {
  // 详情头部与操作行换行；长 digest/JSON/标签在自身区域内断行
  assert.match(dialogCode, /\.agent-access-detail-head\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(dialogCode, /\.agent-access-detail-line code\s*\{[^}]*word-break:\s*break-all/);
  assert.match(dialogCode, /overflow-wrap:\s*anywhere/);
});

test('AgentAccessDialog execution status comes from server-applied evidence', () => {
  // 真实执行指示来自服务端 applied 字段；不得再出现内部 status 的误导性文案
  assert.match(dialogCode, /executionLabel\(/);
  assert.match(dialogCode, /applied\s*\?\s*'已执行'\s*:\s*'未执行'/);
  assert.doesNotMatch(dialogCode, /尚未执行，仅预览/, '不得硬编码“尚未执行，仅预览”');
  assert.doesNotMatch(dialogCode, /statusLabel\(/, '内部 status 不得再用于展示执行状态');
});
