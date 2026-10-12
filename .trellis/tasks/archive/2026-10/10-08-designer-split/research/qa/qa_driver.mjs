import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runBehaviorChecks } from './qa_behaviour.mjs';

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
const STYLE_PROPERTIES = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'flex', 'flex-basis', 'flex-grow', 'flex-shrink', 'grid-template-columns',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing', 'word-spacing',
  'color', 'background-color', 'text-align', 'vertical-align', 'white-space', 'word-break', 'overflow-wrap',
  'text-overflow', 'overflow', 'overflow-x', 'overflow-y', 'border-collapse', 'border-spacing', 'table-layout',
  'transform', 'opacity', 'cursor', 'z-index', 'visibility',
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

function redact(value) {
  return String(value ?? '').replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, '[redacted-token]');
}

let cdp;
const consoleErrors = [];
const networkRequests = new Map();
const networkResponses = [];
const networkFailures = [];
const captures = [];
let projectId;
let forms = [];

async function evaluate(expression, { awaitPromise = true, timeout = 30000 } = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
    timeout,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'page evaluation failed';
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
  await evaluate(`(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return true})()`);
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

async function doubleClick(point) {
  if (!point) throw new Error('Cannot double-click a missing or hidden UI element');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  for (const clickCount of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount });
  }
}

async function clickSelector(selector, index = 0) {
  const expression = `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))[${index}]`;
  await mouseClick(await rectForExpression(expression));
}

async function clickExactText(selector, text) {
  const expression = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  await mouseClick(await rectForExpression(expression));
}

async function clickContainingText(selector, text) {
  const expression = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.includes(${JSON.stringify(text)}))`;
  await mouseClick(await rectForExpression(expression));
}

async function clickTableRow(formName) {
  const expression = `Array.from(document.querySelectorAll('.fd-formlist .el-table__body tr')).find(row=>Array.from(row.querySelectorAll('td .cell')).some(cell=>cell.textContent.trim()===${JSON.stringify(formName)}))`;
  await mouseClick(await rectForExpression(expression));
}

async function dispatchKey(key, code, type, modifiers = 0, windowsVirtualKeyCode) {
  const params = { type, key, code, modifiers };
  if (windowsVirtualKeyCode != null) params.windowsVirtualKeyCode = windowsVirtualKeyCode;
  await cdp.send('Input.dispatchKeyEvent', params);
}

async function fillSelector(selector, value, index = 0) {
  await clickSelector(selector, index);
  await dispatchKey('Control', 'ControlLeft', 'keyDown', 2, 17);
  await dispatchKey('a', 'KeyA', 'keyDown', 2, 65);
  await dispatchKey('a', 'KeyA', 'keyUp', 2, 65);
  await dispatchKey('Control', 'ControlLeft', 'keyUp', 0, 17);
  await cdp.send('Input.insertText', { text: value });
}

async function clickButtonInDialog(dialogTitle, buttonText) {
  const expression = `(()=>{
    const dialog=Array.from(document.querySelectorAll('.el-dialog')).find(d=>d.querySelector('.el-dialog__title')?.textContent.trim()===${JSON.stringify(dialogTitle)}&&d.getBoundingClientRect().width>0);
    return dialog&&Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(buttonText)});
  })()`;
  await mouseClick(await rectForExpression(expression));
}

async function parkMouse() {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await waitStable();
}

function addBrowserObservers() {
  cdp.on('Runtime.consoleAPICalled', (event) => {
    if (event.type !== 'error') return;
    const text = (event.args || []).map((item) => item.value ?? item.description ?? '').join(' ');
    consoleErrors.push({ kind: 'console.error', text: redact(text) });
  });
  cdp.on('Runtime.exceptionThrown', (event) => {
    const details = event.exceptionDetails || {};
    const text = details.exception?.description || details.text || 'uncaught page exception';
    consoleErrors.push({ kind: 'exception', text: redact(text) });
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry?.level !== 'error') return;
    consoleErrors.push({ kind: 'browser.log.error', text: redact(entry.text || entry.url || '') });
  });
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    try {
      const url = new URL(request.url);
      networkRequests.set(requestId, { method: request.method, path: url.pathname });
    } catch {
      // Ignore non-HTTP targets; no request payload or headers are retained.
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

async function fetchJson(urlPath, method = 'GET', body) {
  const bodyValue = body === undefined ? '' : `,body:JSON.stringify(${JSON.stringify(body)})`;
  const result = await evaluate(`(async()=>{
    const response=await fetch(${JSON.stringify(urlPath)},{method:${JSON.stringify(method)},headers:{Authorization:'Bearer '+localStorage.getItem('crf_token'),'Content-Type':'application/json'}${bodyValue}});
    let payload=null;try{payload=await response.json()}catch{}
    return {status:response.status,payload};
  })()`);
  if (result.status < 200 || result.status >= 300) throw new Error(`${method} ${urlPath} returned HTTP ${result.status}`);
  return result.payload;
}

async function fetchForms() {
  return fetchJson(`/api/projects/${projectId}/forms`);
}

async function getServerForm(formId) {
  const allForms = await fetchForms();
  const form = allForms.find((item) => item.id === formId);
  if (!form) throw new Error(`Form id ${formId} is missing from the project API`);
  return form;
}

async function waitForApp() {
  await waitForVisible('.project-select-btn');
  await waitStable();
}

async function ensureEditMode() {
  const current = await evaluate(`localStorage.getItem('crf_edit_mode')==='true'`);
  if (current) return;
  await clickSelector('button[aria-label="打开设置"]');
  await waitForVisible('.el-dialog .el-dialog__title');
  const toggle = `(()=>{
    const item=Array.from(document.querySelectorAll('.el-form-item')).find(e=>e.querySelector('.el-form-item__label')?.textContent.trim()==='编辑模式');
    return item?.querySelector('.el-switch');
  })()`;
  await mouseClick(await rectForExpression(toggle));
  await waitUntilPage(`localStorage.getItem('crf_edit_mode')==='true'`, 'complete edit mode');
  await clickExactText('.el-dialog button', '关闭');
  await finishAnimations('body');
  await waitUntilPage(
    `!Array.from(document.querySelectorAll('.el-dialog__title')).some(e=>e.textContent.trim()==='设置'&&e.getBoundingClientRect().width>0)`,
    'settings dialog close',
    5000,
  );
}

async function ensureDesignerTab() {
  if (await evaluate(`Boolean(document.querySelector('.fd-formlist'))`)) return;
  await clickExactText('.el-tabs__item', '表单');
  await waitForVisible('.fd-formlist .el-table__body tr');
  await waitStable();
}

async function activateProjectAndForm(formName) {
  if (!(await evaluate(`Boolean(document.querySelector('.main-content-tabs'))`))) {
    await waitForApp();
    await clickSelector('.project-select-btn');
    await waitForVisible('.main-content-tabs');
  }
  await ensureEditMode();
  await ensureDesignerTab();
  const selectedName = await evaluate(`document.querySelector('.fd-canvas .wp-form-title')?.textContent.trim()||''`);
  if (selectedName !== formName) {
    await clickTableRow(formName);
    await waitUntilPage(
      `document.querySelector('.fd-canvas .wp-form-title')?.textContent.trim()===${JSON.stringify(formName)}`,
      `selected form ${formName}`,
    );
  }
  await waitStable();
}

async function setViewMode(surface, mode) {
  const current = await evaluate(`localStorage.getItem('crf_view_mode')||'eCRF'`);
  if (current === mode) return;
  const selector = surface === 'main' ? '.fd-canvas-toolbar .el-switch' : '.designer-dialog-header .el-switch';
  await clickSelector(selector);
  await waitUntilPage(`localStorage.getItem('crf_view_mode')===${JSON.stringify(mode)}`, `${surface} ${mode} toggle`);
  await finishAnimations(surface === 'main' ? '.fd-canvas-toolbar .el-switch' : '.designer-dialog-header .el-switch');
  await waitStable();
}

async function openFullscreen() {
  const visible = await evaluate(`(()=>{
    const page=document.querySelector('.designer-dialog .designer-preview-pane .word-page');
    return Boolean(page&&page.getBoundingClientRect().width>0&&getComputedStyle(page).visibility!=='hidden');
  })()`);
  if (visible) return;
  await clickExactText('.fd-canvas-toolbar button', '设计表单');
  await waitForVisible('.designer-dialog .designer-preview-pane .word-page');
  await finishAnimations('.designer-dialog');
  await waitStable();
}

async function closeFullscreen() {
  const visible = await evaluate(`Boolean(document.querySelector('.designer-dialog .designer-preview-pane .word-page')?.getBoundingClientRect().width)`);
  if (!visible) return;
  await clickSelector('.designer-dialog .el-dialog__headerbtn');
  await waitUntilPage(
    `(()=>{const b=document.querySelector('.designer-dialog .el-dialog__headerbtn');return !b||b.getBoundingClientRect().width===0||getComputedStyle(b).visibility==='hidden'})()`,
    'fullscreen designer close',
  );
  await finishAnimations('body');
}

async function selectPage(selector, scrollSelector) {
  const escapedSelector = JSON.stringify(selector);
  const escapedScroll = JSON.stringify(scrollSelector);
  const prepared = await evaluate(`(()=>{
    const page=document.querySelector(${escapedSelector});
    const scroller=document.querySelector(${escapedScroll});
    if(!page||!scroller)return null;
    scroller.scrollTop=0;
    page.scrollIntoView({block:'start',inline:'center'});
    const r=page.getBoundingClientRect();
    const s=scroller.getBoundingClientRect();
    return {x:r.left,y:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scroll:{left:s.left,top:s.top,right:s.right,bottom:s.bottom},viewport:{width:innerWidth,height:innerHeight}};
  })()`);
  if (!prepared) throw new Error(`Cannot locate preview page ${selector}`);
  await waitStable();
  await finishAnimations(selector);
  await parkMouse();
  const rect = await evaluate(`(()=>{const r=document.querySelector(${escapedSelector}).getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`);
  if (rect.x < -0.5 || rect.y < -0.5 || rect.right > VIEWPORT.width + 0.5 || rect.bottom > VIEWPORT.height + 0.5) {
    throw new Error(`Preview page does not fit viewport: ${JSON.stringify(rect)}`);
  }
  return rect;
}

async function pageFingerprint(selector) {
  const properties = JSON.stringify(STYLE_PROPERTIES);
  return evaluate(`(()=>{
    const root=document.querySelector(${JSON.stringify(selector)});
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

async function waitForElementAnimations(selector, index) {
  const expression = `(async()=>{
    const element=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if(!element)return false;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const animations=element.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity);
    await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
    await new Promise(requestAnimationFrame);
    return true;
  })()`;
  await evaluate(expression);
}

async function probePage(selector) {
  await cdp.send('DOM.enable');
  const annotationSelector = `${selector} .wp-acrf-annotation`;
  const annotationInfo = await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(annotationSelector)})).map((root,index)=>({
    index,
    text:root.querySelector('.wp-acrf-annotation__text')?.textContent.trim()||'',
    interactive:root.classList.contains('wp-acrf-annotation--interactive'),
    cursor:getComputedStyle(root).cursor,
    disabled:root.querySelector('.wp-acrf-annotation-reset')?.disabled??null,
  }))`);
  const documentNode = await cdp.send('DOM.getDocument', { depth: 1 });
  const annotationNodes = await cdp.send('DOM.querySelectorAll', {
    nodeId: documentNode.root.nodeId,
    selector: annotationSelector,
  });
  const hoveredReset = {};
  for (const disabled of [false, true]) {
    const info = annotationInfo.find((item) => item.disabled === disabled);
    if (!info) {
      hoveredReset[disabled ? 'disabled' : 'enabled'] = null;
      continue;
    }
    const nodeId = annotationNodes.nodeIds[info.index];
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
    await waitForElementAnimations(annotationSelector, info.index);
    const opacity = await evaluate(`(()=>getComputedStyle(document.querySelectorAll(${JSON.stringify(annotationSelector)})[${info.index}].querySelector('.wp-acrf-annotation-reset')).opacity)()`);
    hoveredReset[disabled ? 'disabled' : 'enabled'] = { text: info.text, opacity };
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    await waitForElementAnimations(annotationSelector, info.index);
  }

  const handleSelector = `${selector} .resizer-handle`;
  const resizerNodes = await cdp.send('DOM.querySelectorAll', {
    nodeId: documentNode.root.nodeId,
    selector: handleSelector,
  });
  let resizerAfter = null;
  if (resizerNodes.nodeIds.length > 0) {
    const nodeId = resizerNodes.nodeIds[0];
    const style = async () => evaluate(`(()=>{
      const s=getComputedStyle(document.querySelectorAll(${JSON.stringify(handleSelector)})[0],'::after');
      return {content:s.content,backgroundColor:s.backgroundColor,width:s.width,height:s.height,opacity:s.opacity,transitionDuration:s.transitionDuration};
    })()`);
    const normal = await style();
    const states = {};
    for (const state of ['hover', 'active']) {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });
      await waitForElementAnimations(handleSelector, 0);
      states[state] = await style();
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      await waitForElementAnimations(handleSelector, 0);
    }
    resizerAfter = { normal, ...states };
  }
  return {
    annotations: {
      count: annotationInfo.length,
      interactiveCursors: [...new Set(annotationInfo.filter((item) => item.interactive).map((item) => item.cursor))].sort(),
      hoveredReset,
    },
    resizerAfter,
  };
}

async function captureScreenshot(selector, outputPath, format = 'png') {
  const rect = await selectPage(selector, selector.startsWith('.fd-canvas') ? '.word-preview' : '.designer-preview-viewport');
  await parkMouse();
  const options = {
    format,
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  };
  if (format === 'jpeg') options.quality = 70;
  const shot = await cdp.send('Page.captureScreenshot', options);
  fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
  return rect;
}

async function capturePreview(selector) {
  // 单元格文本按 cross-stack-contracts §5 的文本模型从实时 DOM 推导，不采用 innerText 的 CSS 布局断行：
  // - 注记后代（.wp-acrf-annotation）一律跳过（§6 强制规则）；
  // - <br> 计为一个换行（多行默认值的 \n → <br>）；
  // - 选项组按渲染器契约连接：横向两个 ASCII 空格、纵向每个选项一行；
  // - 自动填写线按行内 min-width（0.5em/字符）还原下划线根数；
  // - 单元格首尾空白裁剪（模板缩进残留），内部空白逐字保留。
  // 已声明的既有基线差异（不改产品代码，仅记录；qa_compare 以 baseline 自身做确定性对照）：
  // 1) 下拉框：预览 === 单选项（○是  ○否），导出 === 纵向单选（○是\n○否）；
  // 2) 空选项单选（GOLD_EMPTY_CHOICES）：预览回落 ○是  ○否，导出下划线占位（§5 Empty-choice placeholder 行）；
  // 3) 混合横向内联组最后一个文本列：自适应填写线 ceil 取整与后端 floor 相差 1 根；
  // 4) 空表单：预览无 <table>，导出保留一行空表（missing_preview_cell）。
  return evaluate(`(()=>{
    const page=document.querySelector(${JSON.stringify(selector)});
    if(!page)throw new Error('preview page is missing');
    const cellText=cell=>{
      const walk=node=>{
        if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
        if(node.nodeType!==Node.ELEMENT_NODE)return '';
        if(node.classList?.contains('wp-acrf-annotation'))return '';
        if(node.classList?.contains('fill-line')){
          // 预览的自动填写线以「仅边框」的 span 呈现；行内 min-width 为 0.5em/字符
          //（buildFillLineHtml），完整填写线使用完全相同的取整方式还原字符数。
          const em=Number.parseFloat((node.style.minWidth||'').replace('em',''));
          return Number.isFinite(em)?'_'.repeat(Math.max(0,Math.round(em*2))):'';
        }
        if(node.tagName==='BR')return '\\n';
        if(node.classList?.contains('choice-group')){
          const atoms=Array.from(node.children).filter(child=>child.classList?.contains('choice-atom'));
          const separator=node.classList.contains('choice-group--vertical')?'\\n':'  ';
          return atoms.map(atom=>walk(atom)).join(separator);
        }
        return Array.from(node.childNodes).map(walk).join('');
      };
      return Array.from(cell.childNodes).map(walk).join('').replace(/\\r\\n?/g,'\\n').trim();
    };
    const name=page.querySelector('.wp-form-title')?.textContent.trim()||'';
    const tables=Array.from(page.querySelectorAll('table')).map(table=>Array.from(table.rows).map(row=>
      Array.from(row.cells).map(cell=>cellText(cell))
    ));
    return {name,tables};
  })()`);
}

async function pageContextExport() {
  const exportPath = `/api/projects/${projectId}/export/word`;
  const result = await evaluate(`(async()=>{
    const response=await fetch(${JSON.stringify(exportPath)},{
      method:'POST',
      headers:{Authorization:'Bearer '+localStorage.getItem('crf_token'),'Content-Type':'application/json'},
      body:JSON.stringify({annotated:false}),
    });
    if(!response.ok)return {status:response.status,base64:null};
    const bytes=new Uint8Array(await response.arrayBuffer());
    let binary='';
    for(let offset=0;offset<bytes.length;offset+=0x8000){binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));}
    return {status:response.status,base64:btoa(binary),size:bytes.length};
  })()`, { timeout: 120000 });
  if (result.status !== 200 || !result.base64) throw new Error(`Word export returned HTTP ${result.status}`);
  fs.writeFileSync(path.join(runDir, 'export.docx'), Buffer.from(result.base64, 'base64'));
  return { status: result.status, bytes: result.size };
}

async function reloadApplication() {
  const loaded = cdp.waitForEvent('Page.loadEventFired', 30000);
  await cdp.send('Page.reload', { ignoreCache: true });
  await loaded;
  await waitForApp();
}

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
  const formsResponse = await fetch(`${origin}/api/projects/${projectId}/forms`, { headers: { Authorization: `Bearer ${token}` } });
  if (!formsResponse.ok) throw new Error(`Forms API returned HTTP ${formsResponse.status}`);
  forms = await formsResponse.json();

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
  await reloadApplication();
}

async function captureForm(form) {
  await activateProjectAndForm(form.name);
  const record = { name: form.name, code: form.code, order: form.order_index, tables: null };
  const scenarios = [
    { surface: 'main', mode: 'ecrf', page: '.fd-canvas .word-page' },
    { surface: 'main', mode: 'acrf', page: '.fd-canvas .word-page' },
    { surface: 'fullscreen', mode: 'acrf', page: '.designer-preview-pane .word-page' },
    { surface: 'fullscreen', mode: 'ecrf', page: '.designer-preview-pane .word-page' },
  ];
  for (const scenario of scenarios) {
    if (scenario.surface === 'fullscreen') await openFullscreen();
    await setViewMode(scenario.surface, scenario.mode === 'acrf' ? 'aCRF' : 'eCRF');
    await waitForVisible(scenario.page);
    const key = `${form.code}--${scenario.surface}--${scenario.mode}`;
    const fileName = `${key}.png`;
    const screenshotPath = path.join(runDir, 'screenshots', fileName);
    const rect = await captureScreenshot(scenario.page, screenshotPath);
    const fingerprint = await pageFingerprint(scenario.page);
    const probes = await probePage(scenario.page);
    const capture = { key, form: form.name, code: form.code, surface: scenario.surface, mode: scenario.mode, screenshot: fileName, rect, fingerprint, probes };
    captures.push(capture);

    if (scenario.surface === 'main' && scenario.mode === 'ecrf') {
      const extracted = await capturePreview(scenario.page);
      if (extracted.name !== form.name) throw new Error(`Preview title mismatch for ${form.name}: ${extracted.name}`);
      record.tables = extracted.tables;
    }
    if (form.code === 'GOLD_LEGACY_PORTRAIT') {
      const jpegName = `${label}-${scenario.surface}-${scenario.mode}.jpg`;
      await captureScreenshot(scenario.page, path.join(runDir, jpegName), 'jpeg');
    }
    if (scenario.surface === 'fullscreen') await closeFullscreen();
  }
  if (!record.tables) throw new Error(`Preview extraction missing for ${form.name}`);
  return record;
}

async function main() {
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
  await beginBrowser();
  const previewForms = [];
  for (const form of forms) previewForms.push(await captureForm(form));
  fs.writeFileSync(path.join(runDir, 'preview.json'), `${JSON.stringify({ forms: previewForms }, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'captures.json'), `${JSON.stringify({ viewport: VIEWPORT, captures }, null, 2)}\n`);
  const exportResult = await pageContextExport();
  fs.writeFileSync(path.join(runDir, 'export-result.json'), `${JSON.stringify(exportResult, null, 2)}\n`);

  const behaviorChecks = await runBehaviorChecks({
    label, cdp, projectId, forms, evaluate, waitStable, activateProjectAndForm, setViewMode,
    openFullscreen, selectPage, getServerForm, networkResponses, waitForNetworkResponse,
    clickSelector, closeFullscreen, waitForApp, rectForExpression, doubleClick, waitUntilPage,
    clickButtonInDialog, finishAnimations, waitForVisible,
    fillSelector, clickExactText, mouseClick,
  });
  fs.writeFileSync(path.join(runDir, 'behaviour.json'), `${JSON.stringify({ checks: behaviorChecks }, null, 2)}\n`);
  const failed = behaviorChecks.filter((item) => !item.pass);
  if (failed.length) throw new Error(`Behavior checks failed: ${failed.map((item) => item.name).join(', ')}`);
}

try {
  await main();
} finally {
  fs.writeFileSync(path.join(runDir, 'console.json'), `${JSON.stringify({ errors: consoleErrors, networkFailures }, null, 2)}\n`);
  if (cdp) cdp.close();
}
