const FORM_NAME = 'Legacy portrait controls';
const FIELD_OID = 'GOLD_TEXT_UNIT';

function redact(value) {
  return String(value ?? '').replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, '[redacted-token]');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBehaviorChecks(context) {
  const {
    label, cdp, projectId, forms, evaluate, waitStable, activateProjectAndForm, setViewMode,
    openFullscreen, selectPage, getServerForm, networkResponses, waitForNetworkResponse,
    clickSelector, closeFullscreen, waitForApp, rectForExpression, doubleClick, waitUntilPage,
    clickButtonInDialog, finishAnimations, waitForVisible, fillSelector, clickExactText, mouseClick,
  } = context;
  const checks = [];
  const pendingLeavePromptTitles = [];
  const equalRatios = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= 0.0001);

  async function selectorValues(selector) {
    return evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(e=>e.style.width).filter(Boolean).map(v=>Number.parseFloat(v)/100)`);
  }

  async function storageEntries(prefix) {
    return evaluate(`Object.keys(localStorage).filter(key=>key.startsWith(${JSON.stringify(prefix)})).sort().map(key=>[key,localStorage.getItem(key)])`);
  }

  async function startPointerTrace() {
    await evaluate(`(()=>{
      const events=[];
      const listener=event=>{
        if(events.length>=32)return;
        const target=event.target;
        events.push({type:event.type,x:event.clientX,y:event.clientY,pointerId:event.pointerId??null,buttons:event.buttons??null,
          tag:target?.tagName?.toLowerCase()||'',className:typeof target?.className==='string'?target.className:'',text:target?.textContent?.trim().slice(0,40)||''});
      };
      window.__qaPointerTrace={events,listener};
      ['pointerdown','pointermove','pointerup','pointercancel'].forEach(type=>document.addEventListener(type,listener,true));
      return true;
    })()`);
  }

  async function stopPointerTrace() {
    return evaluate(`(()=>{
      const state=window.__qaPointerTrace;
      if(!state)return [];
      ['pointerdown','pointermove','pointerup','pointercancel'].forEach(type=>document.removeEventListener(type,state.listener,true));
      window.__qaPointerTrace=null;
      return state.events;
    })()`);
  }

  async function getPageRect(selector) {
    return evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r?{x:r.left,y:r.top,width:r.width,height:r.height}:null})()`);
  }

  async function dragAt(x, y, dx, dy) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y: y + dy, buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', buttons: 0, clickCount: 1 });
    await waitStable();
  }

  async function dragAndWaitForPatch(coordinate, responseStart, formId, surface, kind) {
    await startPointerTrace();
    await dragAt(coordinate.x, coordinate.y, 0, 12);
    const pointerTrace = await stopPointerTrace();
    try {
      return { patch: await waitForNetworkResponse(responseStart, 'PATCH', `/api/forms/${formId}`), pointerTrace };
    } catch (error) {
      throw new Error(`${error.message}; drag=${JSON.stringify({ surface, kind, coordinate, pointerTrace })}`);
    }
  }

  async function dragAnnotation(surface, kind) {
    const pageSelector = surface === 'main' ? '.fd-canvas .word-page' : '.designer-preview-pane .word-page';
    await activateProjectAndForm(FORM_NAME);
    await setViewMode('main', 'aCRF');
    if (surface === 'fullscreen') await openFullscreen();
    const rect = await selectPage(pageSelector, surface === 'main' ? '.word-preview' : '.designer-preview-viewport');
    const form = forms.find((item) => item.name === FORM_NAME);
    const key = kind === 'form' ? '_form' : FIELD_OID;
    const beforeForm = await getServerForm(form.id);
    const startY = beforeForm.annotation_positions?.[key]?.y ?? 0;
    const annotationSelector = kind === 'form'
      ? `${pageSelector} .wp-acrf-annotation--form`
      : `${pageSelector} .wp-acrf-annotation--field`;
    const coordinate = await evaluate(`(()=>{
      const candidates=Array.from(document.querySelectorAll(${JSON.stringify(annotationSelector)}));
      const root=candidates.find(e=>${kind === 'form' ? 'true' : `e.querySelector('.wp-acrf-annotation__text')?.textContent.trim()===${JSON.stringify(FIELD_OID)}`});
      if(!root)return null;
      const r=root.getBoundingClientRect();
      const x=r.left+r.width/2,y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      return {x,y,hitTag:hit?.tagName?.toLowerCase()||'',hitClass:typeof hit?.className==='string'?hit.className:'',hitText:hit?.textContent?.trim().slice(0,40)||''};
    })()`);
    if (!coordinate || coordinate.y < rect.y || coordinate.y > rect.y + rect.height) {
      throw new Error(`Cannot locate ${kind} annotation on ${surface} preview`);
    }
    const responseStart = networkResponses.length;
    const { patch } = await dragAndWaitForPatch(coordinate, responseStart, form.id, surface, kind);
    const after = await getServerForm(form.id);
    const observedY = after.annotation_positions?.[key]?.y ?? 0;
    const expectedStep = Math.round(12 / (96 / 2.54 * 0.01));
    const expectedY = startY + expectedStep;
    await reloadApplication();
    await activateProjectAndForm(FORM_NAME);
    await setViewMode('main', 'aCRF');
    if (surface === 'fullscreen') await openFullscreen();
    const resetTarget = await evaluate(`(()=>{
      const candidates=Array.from(document.querySelectorAll(${JSON.stringify(annotationSelector)}));
      const root=candidates.find(e=>${kind === 'form' ? 'true' : `e.querySelector('.wp-acrf-annotation__text')?.textContent.trim()===${JSON.stringify(FIELD_OID)}`});
      const button=root?.querySelector('.wp-acrf-annotation-reset')||null;
      if(!button)return null;
      const r=button.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2,disabled:button.disabled};
    })()`);
    if (!resetTarget) throw new Error(`Reset button missing for ${kind} annotation on ${surface}`);
    if (resetTarget.disabled) throw new Error(`Reset button disabled for ${kind} annotation on ${surface} after drag`);
    const resetResponseStart = networkResponses.length;
    await mouseClick(resetTarget);
    let resetPatch;
    try {
      resetPatch = await waitForNetworkResponse(resetResponseStart, 'PATCH', `/api/forms/${form.id}`);
    } catch (error) {
      throw new Error(`${error.message} (reset ${kind} on ${surface})`);
    }
    const resetForm = await getServerForm(form.id);
    const resetHasOverride = Object.hasOwn(resetForm.annotation_positions || {}, key);
    const resetY = resetForm.annotation_positions?.[key]?.y ?? 0;
    await closeFullscreen();
    return {
      surface,
      annotation: kind,
      beforeY: startY,
      expectedPersistedY: expectedY,
      observedPersistedY: observedY,
      persistedDelta01cm: observedY - startY,
      patchStatus: patch.status,
      resetPatchStatus: resetPatch.status,
      resetHasOverride,
      resetY,
      pass: patch.status === 200 && resetPatch.status === 200 && observedY === expectedY && !resetHasOverride && resetY === 0,
    };
  }

  async function reloadApplication() {
    const loaded = cdp.waitForEvent('Page.loadEventFired', 30000);
    await cdp.send('Page.reload', { ignoreCache: true });
    await loaded;
    await waitForApp();
  }

  async function runCheck(name, operation) {
    try {
      const result = await operation();
      checks.push({ name, ...result, pass: result.pass !== false });
    } catch (error) {
      checks.push({ name, pass: false, error: redact(error?.message || error) });
    }
  }

  async function checkAnnotationBehavior() {
    const results = [];
    for (const surface of ['main', 'fullscreen']) {
      for (const kind of ['field', 'form']) results.push(await dragAnnotation(surface, kind));
    }
    return { results, pass: results.every((item) => item.pass) };
  }

  async function openQuickEdit(surface) {
    await activateProjectAndForm(FORM_NAME);
    await setViewMode('main', 'aCRF');
    if (surface === 'fullscreen') await openFullscreen();
    const pageSelector = surface === 'main' ? '.fd-canvas .word-page' : '.designer-preview-pane .word-page';
    const selector = `${pageSelector} td.wp-label`;
    await selectPage(pageSelector, surface === 'main' ? '.word-preview' : '.designer-preview-viewport');
    const target = await rectForExpression(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim().length>0)`);
    await doubleClick(target);
    await waitUntilPage(`Array.from(document.querySelectorAll('.el-dialog__title')).some(e=>e.textContent.trim()==='快速编辑字段')`, `${surface} quick-edit dialog`);
    const dialog = await evaluate(`(()=>{
      const d=Array.from(document.querySelectorAll('.el-dialog')).find(e=>e.querySelector('.el-dialog__title')?.textContent.trim()==='快速编辑字段'&&e.getBoundingClientRect().width>0);
      return {title:d?.querySelector('.el-dialog__title')?.textContent.trim()||'',fieldLabel:d?.querySelector('.el-form-item__label')?.textContent.trim()||''};
    })()`);
    await clickButtonInDialog('快速编辑字段', '取消');
    await finishAnimations('body');
    await closeFullscreen();
    return { surface, dialogTitle: dialog.title, fieldLabel: dialog.fieldLabel, pass: dialog.title === '快速编辑字段' };
  }

  async function dragHandle(selector, dx, dy) {
    const rect = await getPageRect(selector);
    if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error(`Resize handle missing: ${selector}`);
    await dragAt(rect.x + rect.width / 2, rect.y + rect.height / 2, dx, dy);
  }

  async function checkColumnResizeBehavior() {
    await activateProjectAndForm(FORM_NAME);
    await setViewMode('main', 'aCRF');
    const form = forms.find((item) => item.name === FORM_NAME);
    const prefix = `crf:designer:col-widths:${form.id}:`;
    const before = await storageEntries(prefix);
    const mainPage = '.fd-canvas .word-page';
    await selectPage(mainPage, '.word-preview');
    const beforeRatios = await selectorValues(`${mainPage} .col-resize-host table colgroup col`);
    await dragHandle(`${mainPage} .resizer-handle`, 36, 0);
    const after = await storageEntries(prefix);
    const stored = after.length ? JSON.parse(after[0][1]) : null;
    const mainRatios = await selectorValues(`${mainPage} .col-resize-host table colgroup col`);
    await openFullscreen();
    const designerPage = '.designer-preview-pane .word-page';
    await selectPage(designerPage, '.designer-preview-viewport');
    const fullscreenRatios = await selectorValues(`${designerPage} .col-resize-host table colgroup col`);
    await closeFullscreen();
    const mainRoundTripRatios = await selectorValues(`${mainPage} .col-resize-host table colgroup col`);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const pass = changed && Array.isArray(stored) && stored.length > 1 &&
      equalRatios(stored, mainRatios) && equalRatios(mainRatios, fullscreenRatios) &&
      equalRatios(fullscreenRatios, mainRoundTripRatios);
    return {
      formId: form.id, storageKey: after[0]?.[0] || null, beforeRatios, mainRatios,
      storedRatios: stored, fullscreenRatios, mainRoundTripRatios, storageChanged: changed, pass,
    };
  }

  async function rowHeight(selector) {
    return evaluate(`(()=>{
      const row=document.querySelector(${JSON.stringify(selector)});
      if(!row)return null;
      const rect=row.getBoundingClientRect();
      return {height:Math.round(rect.height*100)/100,inlineHeight:row.style.height||null};
    })()`);
  }

  async function checkRowResizeBehavior() {
    await activateProjectAndForm(FORM_NAME);
    await setViewMode('main', 'aCRF');
    const form = forms.find((item) => item.name === FORM_NAME);
    const prefix = `crf:designer:row-heights:${form.id}:`;
    const mainPage = '.fd-canvas .word-page';
    const mainRowSelector = `${mainPage} tr.row-resize-host`;
    await selectPage(mainPage, '.word-preview');
    const beforeMain = await rowHeight(mainRowSelector);
    await dragHandle(`${mainRowSelector} .row-resizer-handle`, 0, 18);
    const afterMain = await rowHeight(mainRowSelector);
    const mainStorage = await storageEntries(prefix);
    await openFullscreen();
    const designerPage = '.designer-preview-pane .word-page';
    const designerRowSelector = `${designerPage} tr.row-resize-host`;
    await selectPage(designerPage, '.designer-preview-viewport');
    const fullBefore = await rowHeight(designerRowSelector);
    await dragHandle(`${designerRowSelector} .row-resizer-handle`, 0, 14);
    const fullAfter = await rowHeight(designerRowSelector);
    const fullStorage = await storageEntries(prefix);
    await closeFullscreen();
    const mainAfterReturn = await rowHeight(mainRowSelector);
    const persistedHeights = fullStorage.length ? JSON.parse(fullStorage[0][1]) : null;
    const changed = afterMain?.height > beforeMain?.height && fullAfter?.height > fullBefore?.height;
    const pass = changed && mainStorage.length > 0 && fullStorage.length > 0 && afterMain.inlineHeight != null &&
      fullAfter.inlineHeight != null && Math.abs(mainAfterReturn.height - fullAfter.height) < 1 && persistedHeights != null;
    return {
      formId: form.id, beforeMain, afterMain, fullBefore, fullAfter, mainAfterReturn,
      storageKeys: fullStorage.map(([key]) => key),
      storedRowHeightCount: persistedHeights ? Object.keys(persistedHeights).length : 0,
      pass,
    };
  }

  const codelistSelectionText = `document.querySelector('[data-test="designer-field-property-form"] .choice-codelist-select .el-select__selection')?.textContent.trim()||''`;
  const newOptionPredicate = `Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(e=>e.textContent.trim()==='QA Added codelist'&&!e.classList.contains('is-disabled')&&e.getBoundingClientRect().height>0)`;

  async function requirePoint(expression, label) {
    const point = await rectForExpression(expression);
    if (!point) {
      const diagnostics = await evaluate(`(()=>{
        let matches=[];
        try{matches=${expression}?[${expression}]:[];}catch(e){matches=['invalid-expression'];}
        return {expressionResult:matches.map(m=>m?{tag:m.tagName?.toLowerCase()||'',rect:(()=>{const r=m.getBoundingClientRect();return {w:r.width,h:r.height};})(),visible:getComputedStyle(m).visibility}:'no-match').slice(0,3)};
      })()`).catch((error) => ({ evaluationError: String(error) }));
      throw new Error(`Cannot click missing/hidden element: ${label}; ${JSON.stringify(diagnostics)}`);
    }
    return point;
  }

  async function quickAddDetail() {
    return evaluate(`(async()=>{
      const dialog=Array.from(document.querySelectorAll('.el-dialog')).find(d=>d.querySelector('.el-dialog__title')?.textContent.trim()==='新增选项'&&d.getBoundingClientRect().width>0);
      const select=document.querySelector('[data-test="designer-field-property-form"] .choice-codelist-select');
      let codelistNames=[];
      try{
        const r=await fetch('/api/projects/${projectId}/codelists',{headers:{Authorization:'Bearer '+localStorage.getItem('crf_token')}});
        codelistNames=(await r.json()).map(c=>c.name);
      }catch(e){codelistNames=['fetch-failed:'+e.message];}
      return {
        dialogOpen:Boolean(dialog),
        dialogText:dialog?dialog.textContent.trim().replace(/\\s+/g,' ').slice(0,240):'',
        selectHtml:select?select.outerHTML.slice(0,700):'',
        selectedText:${codelistSelectionText},
        codelistNames,
      };
    })()`);
  }

  const selectOpenState = `(()=>{
    const input=document.querySelector('[data-test="designer-field-property-form"] .choice-codelist-select input.el-select__input');
    const wrapper=document.querySelector('[data-test="designer-field-property-form"] .choice-codelist-select .el-select__wrapper');
    const rect=input?.getBoundingClientRect();
    const hit=rect?document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2):null;
    return {
      activeTag:document.activeElement?.tagName?.toLowerCase()||'',
      activeClass:typeof document.activeElement?.className==='string'?document.activeElement.className:'',
      expanded:input?.getAttribute('aria-expanded')||null,
      wrapperClass:wrapper?.className||'',
      inputRect:rect?{x:rect.left,y:rect.top,w:rect.width,h:rect.height}:null,
      hitTag:hit?.tagName?.toLowerCase()||'',
      hitClass:typeof hit?.className==='string'?hit.className:'',
      dropdowns:document.querySelectorAll('.el-select-dropdown__item').length,
    };
  })()`;

  async function checkCodelistQuickAdd() {
    await activateProjectAndForm(FORM_NAME);
    await setViewMode('main', 'aCRF');
    await openFullscreen();
    const fieldExpression = `Array.from(document.querySelectorAll('.designer-field-list .ff-item')).find(e=>e.querySelector('.ff-label')?.textContent.trim()==='水平单选')`;
    await mouseClick(await rectForExpression(fieldExpression));
    await waitForVisible('[data-test="designer-field-property-form"] .choice-codelist-select');
    await clickSelector('[data-test="designer-field-property-form"] button[aria-label="新增字典"]');
    await waitUntilPage(`Array.from(document.querySelectorAll('.el-dialog__title')).some(e=>e.textContent.trim()==='新增选项')`, 'quick-add codelist dialog');
    const dialogName = `(()=>{
      const d=Array.from(document.querySelectorAll('.el-dialog')).find(e=>e.querySelector('.el-dialog__title')?.textContent.trim()==='新增选项'&&e.getBoundingClientRect().width>0);
      const item=Array.from(d?.querySelectorAll('.el-form-item')||[]).find(e=>e.querySelector('.el-form-item__label')?.textContent.trim()==='名称');
      return item?.querySelector('input')||null;
    })()`;
    await mouseClick(await rectForExpression(dialogName));
    await cdp.send('Input.insertText', { text: 'QA Added codelist' });
    const optionInputs = '[data-test="codelist-option-add-row"] input';
    await fillSelector(optionInputs, 'QA.1', 0);
    await fillSelector(optionInputs, 'QA option', 1);
    await clickExactText('[data-test="codelist-option-add-row"] button', '添加');
    await clickButtonInDialog('新增选项', '确定');
    const initialSelected = await evaluate(codelistSelectionText);
    try {
      await waitUntilPage(
        `${codelistSelectionText}==='QA Added codelist'`,
        'new codelist selection after host refresh',
      );
    } catch (error) {
      throw new Error(`${error.message}; initialSelected=${JSON.stringify(initialSelected)}; detail=${JSON.stringify(await quickAddDetail())}`);
    }
    let optionState;
    try {
      await waitUntilPage(
        `document.querySelector('[data-test="designer-field-property-form"] .choice-codelist-select input.el-select__input')?.getAttribute('aria-expanded')!=='true'`,
        'codelist select collapsed before open',
      );
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await sleep(250);
        await clickSelector('[data-test="designer-field-property-form"] .choice-codelist-select input.el-select__input');
        let opened = false;
        for (let poll = 0; poll < 12 && !opened; poll += 1) {
          await sleep(100);
          opened = await evaluate(`document.querySelector('[data-test="designer-field-property-form"] .choice-codelist-select input.el-select__input')?.getAttribute('aria-expanded')==='true'`);
        }
        if (opened) break;
      }
      await waitUntilPage(newOptionPredicate, 'new codelist selectable option');
      optionState = await evaluate(`(()=>{
        const e=Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item=>item.textContent.trim()==='QA Added codelist');
        if(!e)return null;
        const r=e.getBoundingClientRect();
        return {text:e.textContent.trim(),disabled:e.classList.contains('is-disabled'),width:r.width,height:r.height};
      })()`);
    } catch (error) {
      const openState = await evaluate(selectOpenState);
      let openAttempts = [];
      try {
        openAttempts = await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).map(e=>({t:e.textContent.trim().slice(0,32),h:Math.round(e.getBoundingClientRect().height),d:e.classList.contains('is-disabled')}))`);
      } catch (innerError) {
        openAttempts = [`diagnostics-failed: ${innerError.message}`];
      }
      throw new Error(`${error.message}; state=${JSON.stringify(openState)}; openAttempts=${JSON.stringify(openAttempts)}; detail=${JSON.stringify(await quickAddDetail())}`);
    }
    const selectable = optionState;
    const selectedOption = await requirePoint(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(e=>e.textContent.trim()==='QA Added codelist')`, 'QA Added codelist option');
    await mouseClick(selectedOption);
    const selectedText = await evaluate(codelistSelectionText);
    await closeFullscreenDiscardingDirtyProps();
    return { createdName: 'QA Added codelist', optionSelectable: Boolean(selectable), selectedText,
      leavePrompts: [...new Set(pendingLeavePromptTitles)],
      withoutReload: true, pass: Boolean(selectable) && selectedText === 'QA Added codelist' };
  }

  // 选择新字典会把 codelist_id 写入未保存的字段属性，关闭全屏设计器前会弹出
  // 「字段属性未保存」确认框；验收只检查「立即可选」，此处选「取消」丢弃绑定，
  // 保证种子库不被这次烟囱检查改写。
  async function closeFullscreenDiscardingDirtyProps() {
    const isClosed = `(()=>{const b=document.querySelector('.designer-dialog .el-dialog__headerbtn');return !b||b.getBoundingClientRect().width===0||getComputedStyle(b).visibility==='hidden'})()`;
    if (await evaluate(isClosed)) return;
    await clickSelector('.designer-dialog .el-dialog__headerbtn');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(150);
      if (await evaluate(isClosed)) return;
      const box = await rectForExpression(`Array.from(document.querySelectorAll('.el-message-box')).find(e=>e.getBoundingClientRect().width>0&&!e.querySelector('.el-message-box__btns button:last-child')?.disabled&&Array.from(e.querySelectorAll('.el-message-box__btns button')).find(b=>b.textContent.trim()==='取消'))`);
      if (box) {
        const cancel = await rectForExpression(`(()=>{
          const e=Array.from(document.querySelectorAll('.el-message-box')).find(b=>b.getBoundingClientRect().width>0);
          return e&&Array.from(e.querySelectorAll('.el-message-box__btns button')).find(b=>b.textContent.trim()==='取消');
        })()`);
        const title = await evaluate(`Array.from(document.querySelectorAll('.el-message-box__title')).map(e=>e.textContent.trim())`);
        await mouseClick(cancel);
        pendingLeavePromptTitles.push(...title);
        await sleep(250);
      }
    }
    await closeFullscreen();
  }

  await runCheck('annotation-drag-persist-reload-reset', checkAnnotationBehavior);
  await runCheck('dblclick-opens-quick-edit', async () => {
    const results = [];
    for (const surface of ['main', 'fullscreen']) results.push(await openQuickEdit(surface));
    return { results, pass: results.every((item) => item.pass) };
  });
  await runCheck('column-resize-main-fullscreen-main', checkColumnResizeBehavior);
  await runCheck('row-resize-persistence-both-previews', checkRowResizeBehavior);
  if (['baseline', 'baseline2', 'final'].includes(label)) {
    await runCheck('codelist-quick-add-immediately-selectable', checkCodelistQuickAdd);
  }
  return checks;
}
