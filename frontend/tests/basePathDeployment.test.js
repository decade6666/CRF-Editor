import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiUrl, makeApiUrl } from '../src/composables/useApi.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const apiSource = readFileSync(path.resolve(currentDir, '../src/composables/useApi.js'), 'utf8');
const viteSource = readFileSync(path.resolve(currentDir, '../vite.config.js'), 'utf8');
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8');
const loginSource = readFileSync(path.resolve(currentDir, '../src/components/LoginView.vue'), 'utf8');
const projectInfoSource = readFileSync(path.resolve(currentDir, '../src/components/ProjectInfoTab.vue'), 'utf8');
const screenshotSource = readFileSync(path.resolve(currentDir, '../src/components/DocxScreenshotPanel.vue'), 'utf8');
const nginxSource = readFileSync(path.resolve(currentDir, '../../deploy/nginx/crf-editor.conf.example'), 'utf8');

test('apiUrl is identity at root deployment (node env without import.meta.env)', () => {
  assert.equal(apiUrl('/api/x'), '/api/x');
  assert.equal(apiUrl('/api/forms/7/fields'), '/api/forms/7/fields');
});

test('apiUrl leaves absolute, protocol-relative and non-root paths untouched', () => {
  assert.equal(apiUrl('https://example.com/api/x'), 'https://example.com/api/x');
  assert.equal(apiUrl('//host/api/x'), '//host/api/x');
  assert.equal(apiUrl('relative/api/x'), 'relative/api/x');
  assert.equal(apiUrl(''), '');
  assert.equal(apiUrl(undefined), undefined);
});

test('makeApiUrl with a subpath base prefixes root-relative API paths', () => {
  const url = makeApiUrl('/crf/');
  assert.equal(url('/api/x'), '/crf/api/x');
  assert.equal(url('/api/forms/7/fields'), '/crf/api/forms/7/fields');
  // 绝对 / 协议相对 / 非根路径保持原样
  assert.equal(url('https://example.com/api/x'), 'https://example.com/api/x');
  assert.equal(url('//host/api/x'), '//host/api/x');
  assert.equal(url('relative/api/x'), 'relative/api/x');
  // 幂等：已带前缀的路径不再重复加
  assert.equal(url('/crf/api/x'), '/crf/api/x');
  // 相似前缀（如 /crfx）不被误判为已带前缀
  assert.equal(url('/crfx/api/x'), '/crf/crfx/api/x');
});

test('makeApiUrl with root base is identity', () => {
  const url = makeApiUrl('/');
  assert.equal(url('/api/x'), '/api/x');
  const url2 = makeApiUrl('');
  assert.equal(url2('/api/x'), '/api/x');
});

test('useApi wraps all six fetch boundaries with apiUrl', () => {
  const matches = apiSource.match(/fetch\(apiUrl\(url\)/g) || [];
  assert.equal(matches.length, 6, 'expected exactly 6 fetch(apiUrl(url) call sites');
});

test('useApi keeps raw paths as cache keys and invalidation prefixes', () => {
  assert.match(apiSource, /_cache\.get\(url\)/);
  assert.match(apiSource, /invalidateCache\(parts\.slice\(0, 4\)\.join\('\/'\)\)/);
});

test('vite config reads VITE_BASE_PATH, normalizes base and keeps dev proxy contract', async () => {
  // 实际执行 vite config 函数（而非仅匹配源码），表驱动断言各输入的归一化与 proxy
  const configModule = await import('../vite.config.js');
  const loadConfig = async (basePath) => {
    if (basePath === undefined) delete process.env.VITE_BASE_PATH;
    else process.env.VITE_BASE_PATH = basePath;
    return configModule.default({ mode: 'development' });
  };

  const rootCfg = await loadConfig(undefined);
  assert.equal(rootCfg.base, '/');
  assert.deepEqual(Object.keys(rootCfg.server.proxy), ['/api']);
  assert.equal(rootCfg.server.proxy['/api'].target, 'http://127.0.0.1:8888');
  assert.equal(rootCfg.server.proxy['/api'].rewrite, undefined);

  for (const input of ['crf', '/crf', '/crf/', '//crf//']) {
    const cfg = await loadConfig(input);
    assert.equal(cfg.base, '/crf/', `normalizeBase('${input}')`);
    const proxy = cfg.server.proxy['/crf/api'];
    assert.ok(proxy, `proxy key '/crf/api' for input '${input}'`);
    assert.equal(proxy.target, 'http://127.0.0.1:8888');
    assert.equal(proxy.rewrite('/crf/api/auth/login'), '/api/auth/login');
  }

  // 绝对 URL base（CDN 部署）原样透传，dev proxy 不剥前缀
  const cdnCfg = await loadConfig('https://cdn.example.com/crf/');
  assert.equal(cdnCfg.base, 'https://cdn.example.com/crf/');
  assert.deepEqual(Object.keys(cdnCfg.server.proxy), ['/api']);

  // 既有端口/代理约定不能被破坏
  assert.equal(rootCfg.server.host, '0.0.0.0');
  assert.equal(rootCfg.server.port, 5173);

  delete process.env.VITE_BASE_PATH;
});

test('bypass fetch sites in components are wrapped with apiUrl', () => {
  assert.match(loginSource, /fetch\(apiUrl\('\/api\/auth\/login'\)/);
  assert.match(appSource, /fetch\(apiUrl\(`\/api\/projects\/\$\{selectedProject\.value\.id\}\/export\/word`\)/);
  assert.match(appSource, /async function _blobDownload\(url, fallbackFilename\) \{[\s\S]*fetch\(apiUrl\(url\), \{ headers: getAuthHeaders\(\) \}\)/);
  assert.match(appSource, /fetch\(apiUrl\('\/api\/projects\/import\/auto'\)/);
  assert.match(appSource, /:action="apiUrl\('/);
  assert.match(projectInfoSource, /fetch\(apiUrl\(`\/api\/projects\/\$\{projectId\}\/logo`\)/);
  assert.match(projectInfoSource, /fetch\(apiUrl\(`\/api\/projects\/\$\{props\.project\.id\}\/logo`\), \{ method: 'POST'/);
  assert.match(screenshotSource, /return apiUrl\(`\/api\/projects\/\$\{props\.projectId\}\/import-docx/);
});

function listSrcFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listSrcFiles(full);
    return /\.(vue|js)$/.test(entry) ? [full] : [];
  });
}

test('no bare root-relative API fetch or action survives anywhere in src', () => {
  const srcDir = path.resolve(currentDir, '../src');
  for (const file of listSrcFiles(srcDir)) {
    const src = readFileSync(file, 'utf8');
    const rel = path.relative(currentDir, file);
    // 覆盖单/双引号与反引号三种字符串形式
    assert.doesNotMatch(src, /fetch\(["'`]\/api\//, `${rel} should not contain a bare fetch('/api/...`);
    assert.doesNotMatch(src, /:action=["']\/api\//, `${rel} should not contain a bare :action="/api/...`);
  }
});

test('nginx example documents the /crf/ subpath deploy with prefix stripping', () => {
  assert.match(nginxSource, /location = \/crf \{/);
  assert.match(nginxSource, /location \/crf\/ \{/);
  assert.match(nginxSource, /proxy_pass http:\/\/127\.0\.0\.1:8888\/;/);
});
