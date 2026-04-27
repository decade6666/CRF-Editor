import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, defineAsyncComponent, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'

import { createLazyTabState } from '../src/composables/useLazyTabs.js'

function createCounters() {
  return { loader: 0, api: 0, mount: 0 }
}

function createAsyncTab(name, counters) {
  return defineAsyncComponent(async () => {
    counters.loader += 1
    counters.api += 1
    return {
      name,
      setup() {
        counters.mount += 1
        return () => h('section', { 'data-name': name }, name)
      },
    }
  })
}

async function renderHarness(ctx) {
  const app = createSSRApp({
    render() {
      return h('div', [
        h('div', { id: 'active-tab' }, ctx.activeTab.value),
        ctx.isTabActivated('fields') ? h(ctx.FieldsTab) : null,
        ctx.isTabActivated('designer') ? h(ctx.DesignerTab) : null,
        ctx.isTabActivated('visits') ? h(ctx.VisitsTab) : null,
        ctx.hasOpenedTemplatePreview.value ? h(ctx.TemplatePreviewDialog) : null,
      ])
    },
  })
  return renderToString(app)
}

test('non-activated tabs do not mount or trigger loader/api until activated', async () => {
  const fields = createCounters()
  const designer = createCounters()
  const visits = createCounters()
  const templatePreview = createCounters()
  const lazyTabs = createLazyTabState('info')
  const hasOpenedTemplatePreview = ref(false)

  const ctx = {
    ...lazyTabs,
    hasOpenedTemplatePreview,
    FieldsTab: createAsyncTab('FieldsTab', fields),
    DesignerTab: createAsyncTab('DesignerTab', designer),
    VisitsTab: createAsyncTab('VisitsTab', visits),
    TemplatePreviewDialog: createAsyncTab('TemplatePreviewDialog', templatePreview),
  }

  await renderHarness(ctx)

  assert.deepEqual(fields, { loader: 0, api: 0, mount: 0 })
  assert.deepEqual(designer, { loader: 0, api: 0, mount: 0 })
  assert.deepEqual(visits, { loader: 0, api: 0, mount: 0 })
  assert.deepEqual(templatePreview, { loader: 0, api: 0, mount: 0 })

  ctx.activateTab('fields')
  await renderHarness(ctx)

  assert.deepEqual(fields, { loader: 1, api: 1, mount: 1 })
  assert.deepEqual(designer, { loader: 0, api: 0, mount: 0 })
  assert.deepEqual(visits, { loader: 0, api: 0, mount: 0 })
  assert.deepEqual(templatePreview, { loader: 0, api: 0, mount: 0 })
})

test('activated tabs stay activated until reset and do not reload chunks repeatedly', async () => {
  const fields = createCounters()
  const designer = createCounters()
  const visits = createCounters()
  const templatePreview = createCounters()
  const lazyTabs = createLazyTabState('info')
  const hasOpenedTemplatePreview = ref(false)

  const ctx = {
    ...lazyTabs,
    hasOpenedTemplatePreview,
    FieldsTab: createAsyncTab('FieldsTab', fields),
    DesignerTab: createAsyncTab('DesignerTab', designer),
    VisitsTab: createAsyncTab('VisitsTab', visits),
    TemplatePreviewDialog: createAsyncTab('TemplatePreviewDialog', templatePreview),
  }

  ctx.activateTab('fields')
  ctx.activateTab('designer')
  await renderHarness(ctx)
  await renderHarness(ctx)

  assert.equal(ctx.isTabActivated('fields'), true)
  assert.equal(ctx.isTabActivated('designer'), true)
  assert.equal(fields.loader, 1)
  assert.equal(designer.loader, 1)

  ctx.reset('info')
  await renderHarness(ctx)

  assert.equal(ctx.activeTab.value, 'info')
  assert.deepEqual([...ctx.activatedTabs.value], ['info'])
  assert.equal(ctx.isTabActivated('fields'), false)
  assert.equal(ctx.isTabActivated('designer'), false)
  assert.equal(fields.loader, 1)
  assert.equal(designer.loader, 1)
})

test('dialog async component loads only after first open flag becomes true', async () => {
  const fields = createCounters()
  const designer = createCounters()
  const visits = createCounters()
  const templatePreview = createCounters()
  const lazyTabs = createLazyTabState('info')
  const hasOpenedTemplatePreview = ref(false)

  const ctx = {
    ...lazyTabs,
    hasOpenedTemplatePreview,
    FieldsTab: createAsyncTab('FieldsTab', fields),
    DesignerTab: createAsyncTab('DesignerTab', designer),
    VisitsTab: createAsyncTab('VisitsTab', visits),
    TemplatePreviewDialog: createAsyncTab('TemplatePreviewDialog', templatePreview),
  }

  await renderHarness(ctx)
  assert.deepEqual(templatePreview, { loader: 0, api: 0, mount: 0 })

  hasOpenedTemplatePreview.value = true
  await renderHarness(ctx)

  assert.deepEqual(templatePreview, { loader: 1, api: 1, mount: 1 })
})
