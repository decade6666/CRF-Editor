// 访视预览拆分任务内浏览器 QA driver（copy-adapt 自 archive/2026-10/10-08-designer-split/research/qa/qa_driver.mjs）。
// 只驱动真实页面：登录固定种子库 → 打开访视流程 → 单访视视图 → 预览弹窗，采集截图 / DOM 指纹 /
// 注解探针 / 序号快照 / console / 网络摘要，并在最后写入 behaviour.json（7 条行为断言，每条含 pass）。
// 不注入 Vue 内部状态、不修改被测源码。baseline 上若干断言因 F1 缺陷必然为 false，driver 以
// BASELINE_KNOWN_RED 记录而不中断运行（原样记录，不迁就断言）。
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [label, backendPortRaw, chromePortRaw, runDirRaw, secretsPath] = process.argv.slice(2);
if (!label || !backendPortRaw || !chromePortRaw || !runDirRaw || !secretsPath) {
  throw new Error('Usage: node qa_driver.mjs <label> <backend-port> <chrome-port> <run-dir> <secrets-file>');
}

const backendPort = Number(backendPortRaw);
const chromePort = Number(chromePortRaw);
const runDir = path.resolve(runDirRaw);
const origin = `http://127.0.0.1:${backendPort}`;
const debuggerOrigin = `http://127.0.0.1:${chromePort}`;
const VIEWPORT = { width: 1600, height: 1800, deviceScaleFactor: 1, mobile: false };

const VISIT_NAME = '筛选访视';
const PORTRAIT_FORM = 'Legacy portrait controls'; // GOLD_LEGACY_PORTRAIT, domain DM, _form y=25, GOLD_TEXT_UNIT y=-40
const LANDSCAPE_FORM = 'Legacy forced landscape'; // GOLD_FORCE_LANDSCAPE, paper_orientation=landscape, 备注种子表单
const FIELD_OID = 'GOLD_TEXT_UNIT';
const SEEDED_NOTES = 'QA 备注第一行\n第二行';
// baseline 上因 F1（预览只拿到矩阵行的 {id,name}，丢失 domain / design_notes / paper_orientation /
// annotation_positions）必然失败的断言。final 全部必须 pass；baseline 的记录保持原样。
const BASELINE_KNOWN_RED = new Set([
  'visit-preview-landscape-class',
  'visit-preview-notes-aside',
  'visit-preview-annotation-offset',
  'visit-preview-drag-persist',
]);

const STYLE_PROPERTIES = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'text-align', 'vertical-align', 'white-space', 'word-break', 'overflow-wrap',
  'overflow', 'visibility', 'z-index', 'table-layout', 'border-collapse',
  '--word-page-margin-x', '--word-page-margin-y', '--acrf-annotation-top', '--acrf-annotation-width',
  '--acrf-annotation-height', '--acrf-annotation-max-width', '--acrf-annotation-padding-x',
  '--acrf-annotation-padding-y',
];

function readSecrets(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('export ') || !line.includes('=')) continue;
    const [key, rawValue] = line.slice(7).split('=', 2);
    values[key] = rawValue.replace(/^'|'$/g, '');
  }
  if (!values.QA_USERNAME || !values.QA_PASSWORD) throw new Error('Private QA credentials are incomplete');
  return { username: values.QA_USERNAME, password: values.QA_PASSWORD };
}

function redact(value) {
  return String(value ?? '')
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, '[redacted-token]')
    .replace(/"(access_token|password)":"[^"]*"/g, '"$1":"[redacted]"');
}

// 与前端 acrfAnnotationGeometry.formatCssNumber / resolveAnnotationTopCm 同源，
// 用于把持久化 delta 换算成期望的 --acrf-annotation-top 文本。
const ACRF_DEFAULT_OFFSET_EMU = -26940;
const ACRF_EMU_PER_01CM = 3600;
const EMU_PER_CM = 914400 / 2.54;
const CSS_PX_PER_01CM = 96 / 2.54 / 100;
function expectedAnnotationTopCm(deltaY01cm) {
  const cm = (ACRF_DEFAULT_OFFSET_EMU + deltaY01cm * ACRF_EMU_PER_01CM) / EMU_PER_CM;
  return `${Number(cm.toFixed(4))}cm`;
}
function pxTo01Cm(deltaPx) {
  return Math.round(deltaPx / CSS_PX_PER_01CM);
}

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket.addEventListener('message', (event) => this._onMessage(event.data));
    this.socket.addEventListener('error', () => this._rejectPending(new Error('CDP websocket failed')));
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
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const list = this.listeners.get(method) || new Set();
    list.add(listener);
    this.listeners.set(method, list);
    return () => list.delete(listener);
  }

  waitForEvent(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(params);
      });
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
    this._rejectPending(new Error('CDP connection closed'));
  }

  _onMessage(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.id != null) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
  }

  _rejectPending(error) {
    for (const item of this.pending.values()) item.reject(error);
    this.pending.clear();
  }
}

let cdp;
const consoleMessages = [];
const consoleErrors = [];
const networkRequests = new Map();
const networkResponses = [];
const networkFailures = [];
const captures = [];
const scenarios = [];
const checks = [];
let projectId;
let forms = [];
let visitId;
const apiSamples = {};

async function evaluate(expression, { awaitPromise = true, timeout = 30000 } = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
    timeout,
  });
  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'page evaluation failed';
    throw new Error(redact(description).slice(0, 500));
  }
  return result.result?.value;
}

async function waitUntilPage(condition, description, timeoutMs = 15000) {
  const expression = `(async()=>{
    const deadline=performance.now()+${timeoutMs};
    while(!(${condition})){
      if(performance.now()>deadline) throw new Error(${JSON.stringify(`Timed out waiting for ${description}`)});
      await new Promise(requestAnimationFrame);
    }
    return true;
  })()`;
  await evaluate(expression, { timeout: timeoutMs + 2000 });
}

async function waitForVisible(selector, timeoutMs = 20000) {
  const escaped = JSON.stringify(selector);
  await waitUntilPage(
    `(()=>{const e=document.querySelector(${escaped});if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'})()`,
    `visible ${selector}`,
    timeoutMs,
  );
}

async function waitStable() {
  await evaluate(
    `(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return true})()`,
  );
}

async function finishAnimations(selector = 'body') {
  const escaped = JSON.stringify(selector);
  await evaluate(`(async()=>{
    const root=document.querySelector(${escaped});
    if(root){
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const animations=root.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity);
      await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
    }
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return true;
  })()`);
}

async function rectForExpression(expression) {
  return evaluate(`(()=>{
    const e=${expression};
    if(!e)return null;
    const r=e.getBoundingClientRect();
    if(r.width<=0||r.height<=0||getComputedStyle(e).visibility==='hidden')return null;
    return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
  })()`);
}

async function mouseClick(point) {
  if (!point) throw new Error('Cannot click a missing or hidden UI element');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function clickExpression(expression, description) {
  const point = await rectForExpression(expression);
  if (!point) throw new Error(`Cannot click missing/hidden element: ${description}`);
  await mouseClick(point);
}

async function clickExactText(selector, text) {
  await clickExpression(
    `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(text)})`,
    `${selector} == ${text}`,
  );
}

async function parkMouse() {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await waitStable();
}

function addBrowserObservers() {
  cdp.on('Runtime.consoleAPICalled', (event) => {
    const text = (event.args || []).map((item) => item.value ?? item.description ?? '').join(' ');
    const entry = { type: event.type, text: redact(text).slice(0, 600) };
    consoleMessages.push(entry);
    if (event.type === 'error') consoleErrors.push({ kind: 'console.error', text: entry.text });
  });
  cdp.on('Runtime.exceptionThrown', (event) => {
    const details = event.exceptionDetails || {};
    const text = details.exception?.description || details.text || 'uncaught page exception';
    consoleErrors.push({ kind: 'exception', text: redact(text).slice(0, 600) });
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry?.level !== 'error') return;
    consoleErrors.push({ kind: 'browser.log.error', text: redact(entry.text || entry.url || '') });
  });
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    try {
      const url = new URL(request.url);
      networkRequests.set(requestId, {
        method: request.method,
        path: url.pathname,
        postData: request.postData ? redact(request.postData).slice(0, 2000) : null,
      });
    } catch {
      // Ignore non-HTTP targets; no headers are retained.
    }
  });
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    const request = networkRequests.get(requestId);
    if (request) networkResponses.push({ ...request, status: response.status });
  });
  cdp.on('Network.loadingFailed', ({ requestId, errorText }) => {
    const request = networkRequests.get(requestId);
    if (request) networkFailures.push({ ...request, error: redact(errorText) });
  });
}

async function waitForNetworkResponse(startIndex, method, requestPath, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = networkResponses.slice(startIndex).find((item) => item.method === method && item.path === requestPath);
    if (found) return found;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${method} ${requestPath}`);
}

async function fetchJson(urlPath) {
  const result = await evaluate(`(async()=>{
    const response=await fetch(${JSON.stringify(urlPath)},{headers:{Authorization:'Bearer '+localStorage.getItem('crf_token')}});
    let payload=null;try{payload=await response.json()}catch{}
    return {status:response.status,payload};
  })()`);
  if (result.status < 200 || result.status >= 300) throw new Error(`GET ${urlPath} returned HTTP ${result.status}`);
  return result.payload;
}

// ---------------------------------------------------------------- app navigation

async function waitForApp() {
  await waitForVisible('.project-select-btn');
  await waitStable();
}

async function ensureEditMode() {
  const current = await evaluate(`localStorage.getItem('crf_edit_mode')==='true'`);
  if (current) return;
  await clickExpression(`document.querySelector('button[aria-label="打开设置"]')`, 'settings button');
  await waitForVisible('.el-dialog .el-dialog__title');
  const toggle = `(()=>{
    const item=Array.from(document.querySelectorAll('.el-form-item')).find(e=>e.querySelector('.el-form-item__label')?.textContent.trim()==='编辑模式');
    return item?.querySelector('.el-switch');
  })()`;
  await clickExpression(toggle, '编辑模式 switch');
  await waitUntilPage(`localStorage.getItem('crf_edit_mode')==='true'`, 'complete edit mode');
  await clickExactText('.el-dialog button', '关闭');
  await finishAnimations('body');
  await waitUntilPage(
    `!Array.from(document.querySelectorAll('.el-dialog__title')).some(e=>e.textContent.trim()==='设置'&&e.getBoundingClientRect().width>0)`,
    'settings dialog close',
    5000,
  );
}

async function enterProject() {
  if (!(await evaluate(`Boolean(document.querySelector('.main-content-tabs'))`))) {
    await waitForApp();
    await clickExpression(`document.querySelector('.project-select-btn')`, 'project select button');
    await waitForVisible('.main-content-tabs');
  }
  await waitStable();
}

function singleViewCondition() {
  return `(()=>{const s=document.querySelector('.visit-flow-header .el-switch');return Boolean(s&&s.classList.contains('is-checked'))})()`;
}

async function ensureVisitFlowSingleView() {
  if (!(await evaluate(`Boolean(document.querySelector('.visit-flow-header'))`))) {
    await clickExactText('.el-tabs__item', '访视流程');
    await waitForVisible('.visit-flow-header');
    await waitStable();
  }
  if (!(await evaluate(singleViewCondition()))) {
    await clickExpression(`document.querySelector('.visit-flow-header .el-switch')`, '访视流程 列表 switch');
    await waitUntilPage(singleViewCondition(), '访视流程 单访视视图', 10000);
    await finishAnimations('.visit-flow-header .el-switch');
    await waitStable();
  }
}

async function selectVisit(name) {
  const expression = `(()=>{
    const row=Array.from(document.querySelectorAll('.el-table__row')).find(r=>!r.querySelector('button[aria-label="预览"]')&&r.textContent.includes(${JSON.stringify(name)}));
    return row;
  })()`;
  await clickExpression(expression, `visit row ${name}`);
  const visitFormsLoaded = await waitUntilPage(
    `Array.from(document.querySelectorAll('.el-table__row')).some(r=>r.querySelector('button[aria-label="预览"]'))`,
    `visit ${name} forms loaded`,
    5000,
  ).then(
    () => true,
    () => false,
  );
  if (!visitFormsLoaded) throw new Error(`右侧访视表单列表未出现预览入口（访视 ${name} 未选中？）`);
  await waitStable();
}

async function openPreviewForForm(formName) {
  const expression = `(()=>{
    const row=Array.from(document.querySelectorAll('.el-table__row')).find(r=>r.querySelector('button[aria-label="预览"]')&&r.textContent.includes(${JSON.stringify(formName)}));
    return row?.querySelector('button[aria-label="预览"]');
  })()`;
  await clickExpression(expression, `preview button for ${formName}`);
  await waitUntilPage(previewVisibleCondition(), 'visit preview page visible');
  await finishAnimations('.el-dialog');
  await waitStable();
}

function visiblePageExpr() {
  return `Array.from(document.querySelectorAll('.el-dialog .word-page')).find(p=>{const r=p.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(p).visibility!=='hidden'})`;
}

function previewVisibleCondition() {
  return `Boolean(${visiblePageExpr()})`;
}

async function setPreviewViewMode(mode) {
  const current = await evaluate(`localStorage.getItem('crf_view_mode')||'eCRF'`);
  if (current === mode) {
    await waitStable();
    return;
  }
  const switchExpr = `(()=>{
    const page=${visiblePageExpr()};
    const dialog=page?.closest('.el-dialog');
    return dialog?.querySelector('.el-switch');
  })()`;
  await clickExpression(switchExpr, `preview ${mode} switch`);
  await waitUntilPage(`(localStorage.getItem('crf_view_mode')||'eCRF')===${JSON.stringify(mode)}`, `preview view mode ${mode}`);
  await finishAnimations('.el-dialog .el-switch');
  await waitStable();
}

async function closePreview() {
  if (!(await evaluate(previewVisibleCondition()))) return;
  const closeExpr = `(()=>{
    const page=${visiblePageExpr()};
    return page?.closest('.el-dialog')?.querySelector('.el-dialog__headerbtn');
  })()`;
  await clickExpression(closeExpr, 'preview dialog close button');
  await waitUntilPage(`!${previewVisibleCondition()}`, 'preview dialog closed', 10000);
  await finishAnimations('body');
  await waitStable();
}

// ---------------------------------------------------------------- probes / capture

async function measurePageRect() {
  return evaluate(`(async()=>{
    const page=${visiblePageExpr()};
    if(!page) throw new Error('preview page is missing');
    const scroller=page.closest('.word-preview');
    if(scroller) scroller.scrollTop=0;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const raw=page.getBoundingClientRect();
    return {
      x:Math.round(raw.left),y:Math.round(raw.top),
      width:Math.round(raw.width),height:Math.round(raw.height),
      right:Math.round(raw.right),bottom:Math.round(raw.bottom),
    };
  })()`);
}

// 弹窗重开时「加载中 → 内容就绪」的布局切换与过渡会让同一张页面出现 1px 级的竖直漂移
// （观测到 y=192 与 y=193 交替）。裁剪起点随采样时刻变化会让整幅 PNG 平移 1px，破坏
// 逐字节确定性；这里要求连续两次采样完全一致才返回，最多重试 60 次。
async function preparePageForCapture() {
  let previous = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await measurePageRect();
    if (previous && JSON.stringify(previous) === JSON.stringify(current)) return current;
    previous = current;
    await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  }
  throw new Error('Preview page geometry did not stabilize');
}

function clipWithinViewport(rect) {
  return (
    rect.x >= -0.5 && rect.y >= -0.5 && rect.right <= VIEWPORT.width + 0.5 && rect.bottom <= VIEWPORT.height + 0.5
  );
}

async function captureScreenshot(screenshotPath, format = 'png') {
  const rect = await preparePageForCapture();
  await parkMouse();
  const options = {
    format,
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  };
  if (format === 'jpeg') options.quality = 70;
  const shot = await cdp.send('Page.captureScreenshot', options);
  fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
  return rect;
}

async function pageFingerprint() {
  const properties = JSON.stringify(STYLE_PROPERTIES);
  return evaluate(`(()=>{
    const root=${visiblePageExpr()};
    if(!root)throw new Error('preview page is missing');
    const styleProps=${properties};
    const half=value=>Math.round(value*2)/2;
    const visit=element=>{
      const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      const styles={};
      for(const key of styleProps)styles[key]=style.getPropertyValue(key).trim();
      const className=typeof element.className==='string'?element.className:(element.className?.baseVal||'');
      const ownText=Array.from(element.childNodes).filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.nodeValue||'').join('');
      return {
        tag:element.tagName.toLowerCase(),
        className,
        ownText,
        rect:{x:half(rect.x),y:half(rect.y),width:half(rect.width),height:half(rect.height)},
        styles,
        children:Array.from(element.children).map(visit),
      };
    };
    return visit(root);
  })()`);
}

async function pageProbe() {
  return evaluate(`(()=>{
    const page=${visiblePageExpr()};
    if(!page)throw new Error('preview page is missing');
    const notes=page.querySelector('aside.wp-notes');
    const rows=Array.from(page.querySelectorAll('table tr'));
    const cells=Array.from(page.querySelectorAll('td'));
    return {
      pageClass: typeof page.className==='string'?page.className:'',
      titleText: page.querySelector('.wp-form-title')?.textContent.trim()||'',
      notes: notes?{
        ariaLabel: notes.getAttribute('aria-label'),
        title: notes.querySelector('.wp-notes-title')?.textContent.trim()||'',
        contentText: notes.querySelector('.wp-notes-content')?.innerText||'',
      }:null,
      tableCount: page.querySelectorAll('table').length,
      rowCount: rows.length,
      cellCount: cells.length,
      annotations: Array.from(page.querySelectorAll('.wp-acrf-annotation')).map(root=>({
        className: typeof root.className==='string'?root.className:'',
        text: root.querySelector('.wp-acrf-annotation__text')?.textContent.trim()||'',
        top: getComputedStyle(root).getPropertyValue('--acrf-annotation-top').trim(),
        interactive: root.classList.contains('wp-acrf-annotation--interactive'),
        cursor: getComputedStyle(root).cursor,
        resetAriaLabel: root.querySelector('.wp-acrf-annotation-reset')?.getAttribute('aria-label')||null,
        resetDisabled: root.querySelector('.wp-acrf-annotation-reset')?.disabled??null,
      })),
    };
  })()`);
}

async function sequenceSnapshot() {
  const dom = await evaluate(`Array.from(document.querySelectorAll('.el-table__row')).filter(r=>r.querySelector('button[aria-label="预览"]')).map(r=>{
    const cells=Array.from(r.querySelectorAll('td .cell')).map(c=>c.textContent.trim());
    return {sequence:cells[1]??null,name:cells[2]??null,all:cells};
  })`);
  return dom;
}

async function matrixSnapshot() {
  const matrix = await fetchJson(`/api/projects/${projectId}/visit-form-matrix`);
  const visit = matrix.visits.find((item) => item.name === VISIT_NAME);
  const entries = Object.entries(matrix.matrix[visit?.id] ?? {})
    .map(([formId, sequence]) => ({ formId: Number(formId), sequence }))
    .sort((a, b) => a.sequence - b.sequence);
  return { visitId: visit?.id ?? null, entries };
}

async function recordScenario(key, title, captureKeys, detail = {}) {
  const record = { key, title, captures: captureKeys, ...detail };
  scenarios.push(record);
  return record;
}

async function captureScenario(key, title, { jpeg = true, detail = {} } = {}) {
  const rect = await captureScreenshot(path.join(runDir, 'screenshots', `${key}.png`));
  const fingerprint = await pageFingerprint();
  const probe = await pageProbe();
  const capture = {
    key,
    screenshot: `${key}.png`,
    rect,
    clipWithinViewport: clipWithinViewport(rect),
    fingerprint,
    probe,
  };
  captures.push(capture);
  if (jpeg) {
    await captureScreenshot(path.join(runDir, `${label}-${key}.jpg`), 'jpeg');
  }
  await recordScenario(key, title, [key], detail);
  return capture;
}

// 场景 7 不落在预览页上：整页截图（访视流程单访视视图），因此单独走一个整视口抓取路径。
async function captureViewportScenario(key, title, { detail = {} } = {}) {
  await parkMouse();
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: 1 },
  });
  fs.writeFileSync(path.join(runDir, 'screenshots', `${key}.png`), Buffer.from(shot.data, 'base64'));
  const capture = { key, screenshot: `${key}.png`, rect: null, clipWithinViewport: true, fingerprint: null, probe: null };
  captures.push(capture);
  await recordScenario(key, title, [key], detail);
  return capture;
}

// ---------------------------------------------------------------- behaviour checks

function pushCheck(name, detail) {
  const knownRed = BASELINE_KNOWN_RED.has(name) && ['baseline', 'baseline2'].includes(label);
  const record = { name, ...detail, pass: detail.pass === true };
  if (knownRed) record.knownRed = true;
  checks.push(record);
  return record;
}

function annotationByKind(probe, classNamePart) {
  return probe.annotations.filter((item) => item.className.includes(classNamePart));
}

async function checkLandscapeClass(landscapeProbe, portraitProbe) {
  const landscapeClass = landscapeProbe.pageClass.split(/\s+/).filter(Boolean);
  const portraitClass = portraitProbe.pageClass.split(/\s+/).filter(Boolean);
  const landscapeHasClass = landscapeClass.includes('landscape');
  const portraitHasClass = portraitClass.includes('landscape');
  pushCheck('visit-preview-landscape-class', {
    landscapeFormClass: landscapeClass,
    portraitFormClass: portraitClass,
    landscapeHasClass,
    portraitHasClass,
    pass: landscapeHasClass && !portraitHasClass,
  });
}

function checkNotesAside(probe) {
  const notes = probe.notes;
  const content = notes?.contentText ?? '';
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  pushCheck('visit-preview-notes-aside', {
    notes,
    expectedLines: SEEDED_NOTES.split('\n'),
    pass: Boolean(notes) && lines.includes('QA 备注第一行') && lines.includes('第二行'),
  });
}

async function checkAnnotations(portraitAcrfProbe) {
  const fieldAnnotations = annotationByKind(portraitAcrfProbe, 'wp-acrf-annotation--field');
  const texts = [...new Set(fieldAnnotations.map((item) => item.text))].sort();
  // 期望集合直接从 API 派生：表单 1 的字段（排除 标签 结构行）的 variable_name。
  const formId = forms.find((item) => item.name === PORTRAIT_FORM)?.id;
  const fields = await fetchJson(`/api/forms/${formId}/fields`);
  const expectedTexts = [
    ...new Set(
      fields
        .filter((item) => item.field_definition?.field_type !== '标签')
        .map((item) => String(item.field_definition?.variable_name ?? '').trim())
        .filter(Boolean),
    ),
  ].sort();
  pushCheck('visit-preview-acrf-annotations', {
    fieldAnnotationCount: fieldAnnotations.length,
    fieldAnnotationTexts: texts,
    expectedFieldAnnotationTexts: expectedTexts,
    exactSetMatch: JSON.stringify(texts) === JSON.stringify(expectedTexts),
    pass: fieldAnnotations.length > 0 && JSON.stringify(texts) === JSON.stringify(expectedTexts),
  });
}

function checkAnnotationOffset(probe) {
  const formAnnotations = annotationByKind(probe, 'wp-acrf-annotation--form');
  const fieldAnnotations = annotationByKind(probe, 'wp-acrf-annotation--field');
  const unitAnnotation = fieldAnnotations.find((item) => item.text === FIELD_OID) || null;
  const expectedFormTop = expectedAnnotationTopCm(25);
  const expectedUnitTop = expectedAnnotationTopCm(-40);
  pushCheck('visit-preview-annotation-offset', {
    formAnnotationCount: formAnnotations.length,
    formAnnotation: formAnnotations[0] ?? null,
    expectedFormTop,
    unitAnnotation,
    expectedUnitTop,
    pass: formAnnotations.length === 1 && formAnnotations[0].top === expectedFormTop && unitAnnotation?.top === expectedUnitTop,
  });
}

async function dragFrom(expression, dx, dy, description) {
  const point = await rectForExpression(expression);
  if (!point) throw new Error(`Cannot locate drag source: ${description}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + dx, y: point.y + dy, buttons: 1 });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x + dx,
    y: point.y + dy,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await waitStable();
  return point;
}

async function performDragCheck() {
  const formId = forms.find((item) => item.name === PORTRAIT_FORM)?.id;
  if (formId == null) throw new Error('Portrait form id is missing from the project API');
  const detail = { formId, stage: 'form-annotation' };
  const formAnnotationExpr = `Array.from(document.querySelectorAll('.wp-acrf-annotation--form')).find(a=>a.getBoundingClientRect().width>0)`;
  const hasFormAnnotation = Boolean(await rectForExpression(formAnnotationExpr));
  detail.formAnnotationPresent = hasFormAnnotation;
  let targetExpr = hasFormAnnotation
    ? `Array.from(document.querySelectorAll('.wp-acrf-annotation--form')).find(a=>a.getBoundingClientRect().width>0)?.querySelector('.wp-acrf-annotation__text')`
    : `Array.from(document.querySelectorAll('.wp-acrf-annotation--field')).find(a=>a.getBoundingClientRect().width>0&&a.querySelector('.wp-acrf-annotation__text')?.textContent.trim()===${JSON.stringify(FIELD_OID)})?.querySelector('.wp-acrf-annotation__text')`;
  if (!hasFormAnnotation) {
    detail.stage = 'field-annotation-fallback';
    detail.note = 'baseline: form-domain annotation is not rendered, so the drag falls back to the field annotation';
  }
  const before = await fetchJson(`/api/projects/${projectId}/forms`);
  const beforeForm = before.find((item) => item.id === formId);
  const key = hasFormAnnotation ? '_form' : FIELD_OID;
  const startY = Number(beforeForm?.annotation_positions?.[key]?.y ?? 0);
  detail.key = key;
  detail.startY = startY;
  detail.expectedPersistedY = startY + pxTo01Cm(12);

  const responseStart = networkResponses.length;
  await dragFrom(targetExpr, 0, 12, `${detail.stage} drag`);
  let patch = null;
  let patchError = null;
  try {
    patch = await waitForNetworkResponse(responseStart, 'PATCH', `/api/forms/${formId}`);
  } catch (error) {
    patchError = redact(error.message);
  }
  detail.patch = patch ? { status: patch.status, postData: patch.postData } : null;
  detail.patchError = patchError;
  let bodyOk = false;
  if (patch?.postData) {
    try {
      const body = JSON.parse(patch.postData);
      bodyOk = Boolean(body.annotation_positions && body.annotation_positions[key]);
      detail.patchBodyPositions = body.annotation_positions;
    } catch {
      detail.patchBodyUnparsable = true;
    }
  }
  await delay(400);
  const after = await fetchJson(`/api/projects/${projectId}/forms`);
  const afterForm = after.find((item) => item.id === formId);
  detail.observedPersistedY = Number(afterForm?.annotation_positions?.[key]?.y ?? 0);
  detail.persistedMatches = detail.observedPersistedY === detail.expectedPersistedY;

  await closePreview();
  await openPreviewForForm(PORTRAIT_FORM);
  await setPreviewViewMode('aCRF');
  await captureScenario('s6-drag-persist', '访视预览：注解拖拽 → PATCH → 关闭重开后的持久化位置', {
    detail: { reOpened: true },
  });
  const reopenedProbe = await pageProbe();
  const reopenedFormAnnotations = annotationByKind(reopenedProbe, 'wp-acrf-annotation--form');
  const reopenedUnit = annotationByKind(reopenedProbe, 'wp-acrf-annotation--field').find(
    (item) => item.text === FIELD_OID,
  );
  const expectedTop = expectedAnnotationTopCm(detail.expectedPersistedY);
  const reopenedTop = (hasFormAnnotation ? reopenedFormAnnotations[0] : reopenedUnit)?.top ?? null;
  detail.reopenedTop = reopenedTop;
  detail.expectedReopenedTop = expectedTop;
  detail.reopenedMatches = reopenedTop === expectedTop;
  detail.pass = Boolean(
    patch && patch.status === 200 && bodyOk && detail.persistedMatches && detail.reopenedMatches,
  );
  return detail;
}

function checkSequenceGuard(before, after, beforeMatrix, afterMatrix) {
  const sameOrder = JSON.stringify(before) === JSON.stringify(after);
  const sameMatrix = JSON.stringify(beforeMatrix) === JSON.stringify(afterMatrix);
  pushCheck('visit-form-sequence-guard', {
    before,
    after,
    beforeMatrix,
    afterMatrix,
    pass: sameOrder && sameMatrix,
  });
}

// ---------------------------------------------------------------- bootstrap

async function beginBrowser() {
  const loginCredentials = readSecrets(secretsPath);
  const loginResponse = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginCredentials),
  });
  if (!loginResponse.ok) throw new Error(`Regular QA user login returned HTTP ${loginResponse.status}`);
  const login = await loginResponse.json();
  const token = login.access_token;
  if (!token) throw new Error('Login response did not contain an access token');
  const projectsResponse = await fetch(`${origin}/api/projects`, { headers: { Authorization: `Bearer ${token}` } });
  if (!projectsResponse.ok) throw new Error(`Project API returned HTTP ${projectsResponse.status}`);
  const projects = await projectsResponse.json();
  if (projects.length !== 1) throw new Error(`Expected exactly one seeded project, received ${projects.length}`);
  projectId = projects[0].id;
  const formsResponse = await fetch(`${origin}/api/projects/${projectId}/forms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!formsResponse.ok) throw new Error(`Forms API returned HTTP ${formsResponse.status}`);
  forms = await formsResponse.json();
  const visitsResponse = await fetch(`${origin}/api/projects/${projectId}/visits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!visitsResponse.ok) throw new Error(`Visits API returned HTTP ${visitsResponse.status}`);
  const visits = await visitsResponse.json();
  visitId = visits.find((item) => item.name === VISIT_NAME)?.id ?? null;
  if (visitId == null) throw new Error(`Seeded visit ${VISIT_NAME} is missing`);
  apiSamples.forms = forms.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    paper_orientation: item.paper_orientation,
    annotation_positions: item.annotation_positions,
    design_notes: item.design_notes,
  }));

  const targetResponse = await fetch(`${debuggerOrigin}/json/new?about:blank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Chrome target creation returned HTTP ${targetResponse.status}`);
  const target = await targetResponse.json();
  cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.connect();
  addBrowserObservers();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT);
  const firstLoad = cdp.waitForEvent('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: origin });
  await firstLoad;
  await evaluate(`(()=>{
    localStorage.clear();
    localStorage.setItem('crf_token',${JSON.stringify(token)});
    localStorage.setItem('crf_edit_mode','false');
    localStorage.setItem('crf_view_mode','eCRF');
    localStorage.setItem('crf_theme','light');
    return true;
  })()`);
  const loaded = cdp.waitForEvent('Page.loadEventFired', 30000);
  await cdp.send('Page.reload', { ignoreCache: true });
  await loaded;
  await waitForApp();
}

async function main() {
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
  await beginBrowser();
  await enterProject();
  await ensureEditMode();
  await ensureVisitFlowSingleView();
  await selectVisit(VISIT_NAME);

  const sequenceBefore = await sequenceSnapshot();
  const matrixBefore = await matrixSnapshot();
  apiSamples.sequenceBefore = sequenceBefore;
  apiSamples.matrixBefore = matrixBefore;

  // 场景 1：竖版表单 eCRF
  await openPreviewForForm(PORTRAIT_FORM);
  await setPreviewViewMode('eCRF');
  const s1 = await captureScenario('s1-portrait-ecrf', '访视预览：竖版表单 eCRF');
  const ecrfAnnotationCount = s1.probe.annotations.length;
  pushCheck('visit-preview-ecrf-renders', {
    titleText: s1.probe.titleText,
    expectedTitle: PORTRAIT_FORM,
    pageClass: s1.probe.pageClass.split(/\s+/).filter(Boolean),
    rowCount: s1.probe.rowCount,
    cellCount: s1.probe.cellCount,
    ecrfAnnotationCount,
    pass:
      s1.probe.titleText === PORTRAIT_FORM &&
      s1.probe.cellCount > 0 &&
      !s1.probe.pageClass.includes('landscape') &&
      ecrfAnnotationCount === 0,
  });

  // 场景 2：同表单 aCRF
  await setPreviewViewMode('aCRF');
  const s2 = await captureScenario('s2-portrait-acrf', '访视预览：竖版表单 aCRF');
  await checkAnnotations(s2.probe);

  // 场景 3：强制横向表单（aCRF off）
  await closePreview();
  await openPreviewForForm(LANDSCAPE_FORM);
  await setPreviewViewMode('eCRF');
  const s3 = await captureScenario('s3-landscape-ecrf', '访视预览：强制横向表单 eCRF');
  checkLandscapeClass(s3.probe, s1.probe);

  // 场景 4：备注种子表单（= 横向表单）
  const s4 = await captureScenario('s4-notes-ecrf', '访视预览：设计备注 aside');
  checkNotesAside(s4.probe);

  // 场景 5：竖版表单的持久化注解偏移（声明 D8 差异面）
  await closePreview();
  await openPreviewForForm(PORTRAIT_FORM);
  await setPreviewViewMode('aCRF');
  const s5 = await captureScenario('s5-annotation-offset', '访视预览：aCRF 注解持久化偏移');
  checkAnnotationOffset(s5.probe);

  // 场景 6：拖拽 → PATCH → 关闭重开（会改写表单 1 的 annotation_positions）
  const dragDetail = await performDragCheck();
  pushCheck('visit-preview-drag-persist', dragDetail);

  // 场景 7：右侧访视表单序号守卫
  await closePreview();
  await waitStable();
  const sequenceAfter = await sequenceSnapshot();
  const matrixAfter = await matrixSnapshot();
  await captureViewportScenario('s7-sequence-guard', '访视流程：预览与拖拽后的右侧访视表单序号');
  apiSamples.sequenceAfter = sequenceAfter;
  apiSamples.matrixAfter = matrixAfter;
  checkSequenceGuard(sequenceBefore, sequenceAfter, matrixBefore, matrixAfter);

  fs.writeFileSync(path.join(runDir, 'captures.json'), `${JSON.stringify({ viewport: VIEWPORT, captures }, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'scenarios.json'), `${JSON.stringify({ scenarios }, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'behaviour.json'), `${JSON.stringify({ checks }, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'api-samples.json'), `${JSON.stringify(apiSamples, null, 2)}\n`);
  fs.writeFileSync(
    path.join(runDir, 'network-summary.json'),
    `${JSON.stringify(
      {
        responses: networkResponses.map((item) => ({ method: item.method, path: item.path, status: item.status })),
        failures: networkFailures,
        patchRequests: networkResponses
          .filter((item) => item.method === 'PATCH')
          .map((item) => ({ path: item.path, status: item.status, postData: item.postData })),
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(runDir, 'console.json'),
    `${JSON.stringify(
      {
        messages: consoleMessages,
        errors: consoleErrors,
        warnings: consoleMessages.filter((item) => item.type === 'warning'),
        networkFailures,
      },
      null,
      2,
    )}\n`,
  );

  const failed = checks.filter((item) => !item.pass && !item.knownRed);
  if (failed.length) {
    throw new Error(`Behaviour checks failed (not declared baseline-red): ${failed.map((item) => item.name).join(', ')}`);
  }
  const knownRed = checks.filter((item) => !item.pass && item.knownRed).map((item) => item.name);
  console.log(
    `Behaviour: ${checks.filter((item) => item.pass).length}/${checks.length} pass` +
      (knownRed.length ? `; baseline known-red: ${knownRed.join(', ')}` : ''),
  );
}

try {
  await main();
} finally {
  if (cdp) cdp.close();
}
