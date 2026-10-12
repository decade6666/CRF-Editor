// 两次运行（baseline vs baseline2 / baseline vs final）的确定性对照（copy-adapt 自归档
// qa_compare.mjs）。逐张截图先做字节比较；字节不同时启动自己的 headless Chrome 用 canvas
// 统计差异像素（归档规则：字节不同即已构成差异，像素数仅用于定性）。同时严格比较指纹 / 探针 /
// 场景记录 / 行为结果 / 网络失败 / console。
//
// 差异归属规则（PLAN §Evidence & comparison，design §4）：baseline 与 final 之间的每一处差异
// 都必须落在已声明 D8 变更面（F1 四处：备注 / 显式纸张方向 / 表单域注解 / 持久化字段偏移；
// Loading 图标；重置按钮 aria-label 文案）。本脚本不猜测归属，只把逐场景差异如实列出并输出
// 未覆盖的场景清单，由 lead 对照 D8 判定。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

for (const name of ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) delete process.env[name];

const QA_ROOT = '/tmp/visits-preview-qa';
const CHROME =
  '/home/decade/.cache/browsers/chrome-headless-shell/linux-153.0.8010.47/chrome-headless-shell-linux64/chrome-headless-shell';
const PROXY_NAMES = ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'];

const [labelA, labelB] = process.argv.slice(2);
if (!labelA || !labelB || labelA === labelB || ![labelA, labelB].every((label) => /^[A-Za-z0-9_-]+$/.test(label))) {
  throw new Error('Usage: node qa_compare.mjs <labelA> <labelB>');
}

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id == null) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
    for (const request of this.pending.values()) request.reject(new Error('CDP connection closed'));
    this.pending.clear();
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function captureMap(captures) {
  return new Map(captures.map((item) => [item.key, item]));
}

function findFreeChromePort() {
  const occupied = new Set(
    execFileSync('ss', ['-H', '-ltnp'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/)[3])
      .filter(Boolean)
      .map((address) => Number(address.slice(address.lastIndexOf(':') + 1))),
  );
  for (let port = 9311; port <= 9399; port += 1) {
    if (port !== 9222 && !occupied.has(port)) return port;
  }
  throw new Error('No free headless browser port is available in the QA range');
}

async function waitForChrome(port, child) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Headless browser exited with code ${child.exitCode}`);
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Chrome is still starting; the bounded retry below is readiness polling.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for headless browser DevTools');
}

async function startPixelBrowser() {
  const port = findFreeChromePort();
  const profileDir = path.join(QA_ROOT, `compare-profile-${process.pid}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const env = { ...process.env };
  for (const name of PROXY_NAMES) delete env[name];
  const child = spawn(
    CHROME,
    [`--remote-debugging-port=${port}`, '--headless', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profileDir}`, 'about:blank'],
    { detached: true, stdio: 'ignore', env },
  );
  if (!child.pid) throw new Error('Could not start the headless pixel-diff browser');
  try {
    await waitForChrome(port, child);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    if (!targetResponse.ok) throw new Error(`Pixel-diff page creation returned HTTP ${targetResponse.status}`);
    const target = await targetResponse.json();
    const cdp = new DevTools(target.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all(['Page.enable', 'Runtime.enable'].map((method) => cdp.send(method)));
    return { port, pid: child.pid, child, cdp };
  } catch (error) {
    await stopPixelBrowser({ child, pid: child.pid });
    throw error;
  }
}

async function stopPixelBrowser(browser) {
  browser?.cdp?.close();
  if (!browser?.pid) return;
  try {
    process.kill(-browser.pid, 'SIGTERM');
  } catch {
    return;
  }
  await Promise.race([new Promise((resolve) => browser.child.once('exit', resolve)), delay(1500)]);
  try {
    process.kill(-browser.pid, 0);
    process.kill(-browser.pid, 'SIGKILL');
  } catch {
    // The task-owned process group has exited.
  }
}

async function pixelDiff(cdp, bytesA, bytesB) {
  const expression = `(async(aSrc,bSrc)=>{
    const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='data:image/png;base64,'+src});
    const [a,b]=await Promise.all([load(aSrc),load(bSrc)]);
    const width=Math.max(a.width,b.width),height=Math.max(a.height,b.height);
    const canvasA=document.createElement('canvas'),canvasB=document.createElement('canvas');
    canvasA.width=canvasB.width=width;canvasA.height=canvasB.height=height;
    const contextA=canvasA.getContext('2d',{willReadFrequently:true}),contextB=canvasB.getContext('2d',{willReadFrequently:true});
    contextA.drawImage(a,0,0);contextB.drawImage(b,0,0);
    const dataA=contextA.getImageData(0,0,width,height).data,dataB=contextB.getImageData(0,0,width,height).data;
    let count=0,minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(dataA[i]!==dataB[i]||dataA[i+1]!==dataB[i+1]||dataA[i+2]!==dataB[i+2]||dataA[i+3]!==dataB[i+3]){
        count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
    }
    return {widthA:a.width,heightA:a.height,widthB:b.width,heightB:b.height,differingPixels:count,
      boundingBox:count?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null};
  })(${JSON.stringify(bytesA.toString('base64'))},${JSON.stringify(bytesB.toString('base64'))})`;
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 120000 });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Canvas pixel diff failed');
  return result.result.value;
}

function firstDifference(a, b, pathParts = []) {
  if (isDeepStrictEqual(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { path: pathParts.join('.'), a, b };
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const diff = firstDifference(a[key], b[key], [...pathParts, key]);
    if (diff) return diff;
  }
  return { path: pathParts.join('.'), a: '<structural>', b: '<structural>' };
}

async function main() {
  const dirA = path.join(QA_ROOT, labelA);
  const dirB = path.join(QA_ROOT, labelB);
  const captureDataA = loadJson(path.join(dirA, 'captures.json'));
  const captureDataB = loadJson(path.join(dirB, 'captures.json'));
  const capturesA = captureMap(captureDataA.captures || []);
  const capturesB = captureMap(captureDataB.captures || []);
  const keysA = [...capturesA.keys()].sort();
  const keysB = [...capturesB.keys()].sort();
  const captureKeysIdentical = isDeepStrictEqual(keysA, keysB);
  const sharedKeys = keysA.filter((key) => capturesB.has(key));
  const needsPixelBrowser = sharedKeys.some((key) => {
    const a = fs.readFileSync(path.join(dirA, 'screenshots', capturesA.get(key).screenshot));
    const b = fs.readFileSync(path.join(dirB, 'screenshots', capturesB.get(key).screenshot));
    return !a.equals(b);
  });
  const browser = needsPixelBrowser ? await startPixelBrowser() : null;

  const imageResults = [];
  try {
    for (const key of keysA) {
      const a = capturesA.get(key);
      const b = capturesB.get(key);
      if (!b) continue;
      const bytesA = fs.readFileSync(path.join(dirA, 'screenshots', a.screenshot));
      const bytesB = fs.readFileSync(path.join(dirB, 'screenshots', b.screenshot));
      const byteIdentical = bytesA.equals(bytesB);
      const pixels = byteIdentical
        ? { differingPixels: 0, boundingBox: null }
        : await pixelDiff(browser.cdp, bytesA, bytesB);
      const fingerprintComparable = a.fingerprint != null && b.fingerprint != null;
      const probeComparable = a.probe != null && b.probe != null;
      imageResults.push({
        key,
        byteIdentical,
        ...pixels,
        clipWithinViewport: [a.clipWithinViewport, b.clipWithinViewport],
        fingerprintIdentical: fingerprintComparable ? isDeepStrictEqual(a.fingerprint, b.fingerprint) : null,
        probeIdentical: probeComparable ? isDeepStrictEqual(a.probe, b.probe) : null,
        fingerprintDiff: fingerprintComparable ? firstDifference(a.fingerprint, b.fingerprint) : null,
        probeDiff: probeComparable ? firstDifference(a.probe, b.probe) : null,
      });
    }
  } finally {
    if (browser) await stopPixelBrowser(browser);
  }

  const scenariosA = loadJson(path.join(dirA, 'scenarios.json')).scenarios || [];
  const scenariosB = loadJson(path.join(dirB, 'scenarios.json')).scenarios || [];
  const behaviourA = loadJson(path.join(dirA, 'behaviour.json'));
  const behaviourB = loadJson(path.join(dirB, 'behaviour.json'));
  const consoleA = loadJson(path.join(dirA, 'console.json'));
  const consoleB = loadJson(path.join(dirB, 'console.json'));
  const networkA = loadJson(path.join(dirA, 'network-summary.json'));
  const networkB = loadJson(path.join(dirB, 'network-summary.json'));

  const behaviourSummary = (data) =>
    (data.checks || []).map((item) => ({ name: item.name, pass: item.pass, knownRed: item.knownRed === true }));
  const behavioursIdentical = isDeepStrictEqual(behaviourSummary(behaviourA), behaviourSummary(behaviourB));
  const differences = imageResults.filter(
    (item) => !item.byteIdentical || item.fingerprintIdentical === false || item.probeIdentical === false,
  );
  const scenariosIdentical = isDeepStrictEqual(scenariosA, scenariosB);
  const scenarioDiff = scenariosIdentical ? null : firstDifference(scenariosA, scenariosB);
  const errorCounts = (data) => ({
    consoleErrors: data.errors?.length ?? null,
    browserErrors: (data.errors || []).filter((item) => item.kind !== 'console.error').length,
    warnings: data.warnings?.length ?? null,
    strictModeWarnings: (data.warnings || []).filter((item) =>
      /Vue received a Component that was made a reactive object/.test(item.text || ''),
    ).length,
  });
  const consoleCountsA = errorCounts(consoleA);
  const consoleCountsB = errorCounts(consoleB);
  const comparison = {
    labels: [labelA, labelB],
    viewport: captureDataA.viewport,
    captureCount: imageResults.length,
    captureKeysIdentical,
    screenshotsPixelIdentical: imageResults.length === keysA.length && imageResults.every((item) => item.differingPixels === 0),
    byteIdenticalImageCount: imageResults.filter((item) => item.byteIdentical).length,
    differingImages: imageResults
      .filter((item) => !item.byteIdentical || item.fingerprintIdentical === false || item.probeIdentical === false)
      .map((item) => ({
        key: item.key,
        byteIdentical: item.byteIdentical,
        differingPixels: item.differingPixels,
        boundingBox: item.boundingBox,
        fingerprintIdentical: item.fingerprintIdentical,
        fingerprintDiff: item.fingerprintDiff,
        probeIdentical: item.probeIdentical,
        probeDiff: item.probeDiff,
      })),
    differenceCount: differences.length,
    scenariosIdentical,
    scenarioDiff,
    behavioursIdentical,
    behaviourA: behaviourSummary(behaviourA),
    behaviourB: behaviourSummary(behaviourB),
    consoleCountsA,
    consoleCountsB,
    networkFailuresA: networkA.failures?.length ?? null,
    networkFailuresB: networkB.failures?.length ?? null,
    patchRequestsA: networkA.patchRequests ?? [],
    patchRequestsB: networkB.patchRequests ?? [],
    attributionNote:
      'baseline vs final 的每一处差异都必须由 lead 对照 design.md §D8 归属；本脚本只报告，不判定归属。',
  };
  comparison.pass =
    captureKeysIdentical &&
    comparison.screenshotsPixelIdentical &&
    scenariosIdentical &&
    behavioursIdentical &&
    consoleCountsB.consoleErrors === 0 &&
    (networkB.failures?.length ?? 0) === 0;
  const outputPath = path.join(QA_ROOT, `compare-${labelA}-${labelB}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(comparison, null, 2)}\n`);

  const changedPixels = imageResults.reduce((sum, item) => sum + item.differingPixels, 0);
  console.log(
    `${comparison.pass ? 'PASS' : 'FAIL'} ${labelA} vs ${labelB}: ${imageResults.length} screenshots, ` +
      `${imageResults.filter((item) => item.byteIdentical).length} byte-identical, ${changedPixels} differing pixels, ` +
      `${differences.length} scene(s) with differences.`,
  );
  console.log(`Scenarios identical: ${scenariosIdentical}; behaviours identical: ${behavioursIdentical}.`);
  console.log(
    `Console: ${labelA}=${JSON.stringify(consoleCountsA)}; ${labelB}=${JSON.stringify(consoleCountsB)}.`,
  );
  for (const item of comparison.differingImages) {
    console.log(`  diff ${item.key}: pixels=${item.differingPixels} fingerprint=${item.fingerprintIdentical} probe=${item.probeIdentical}`);
  }
  console.log(`Report: ${outputPath}`);
  return comparison.pass ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`QA comparison failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
