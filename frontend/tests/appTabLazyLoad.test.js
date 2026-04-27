import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
const mainSource = readFileSync(path.resolve(currentDir, '../src/main.js'), 'utf8')
const lazyTabsSource = readFileSync(path.resolve(currentDir, '../src/composables/useLazyTabs.js'), 'utf8')

test('main.js removes global Element Plus icon registration loop', () => {
  assert.doesNotMatch(mainSource, /Object\.entries\(ElementPlusIconsVue\)/)
  assert.doesNotMatch(mainSource, /app\.component\(key, component\)/)
})

test('App.vue uses explicit icon imports and async tab components', () => {
  assert.match(appSource, /from '@element-plus\/icons-vue'/)
  assert.match(appSource, /defineAsyncComponent/)
  assert.match(appSource, /const VisitsTab = defineAsyncComponent/)
  assert.match(appSource, /const FormDesignerTab = defineAsyncComponent/)
  assert.match(appSource, /const FieldsTab = defineAsyncComponent/)
  assert.match(appSource, /const CodelistsTab = defineAsyncComponent/)
  assert.match(appSource, /const UnitsTab = defineAsyncComponent/)
  assert.match(appSource, /const DocxCompareDialog = defineAsyncComponent/)
  assert.match(appSource, /const TemplatePreviewDialog = defineAsyncComponent/)
})

test('App.vue uses lazy tab state and mounts non-info tabs conditionally', () => {
  assert.match(appSource, /createLazyTabState\('info'\)/)
  assert.match(appSource, /const \{ activeTab, activateTab, isTabActivated, reset: resetLazyTabs \}/)
  assert.match(appSource, /@tab-change="onMainTabChange"/)
  assert.match(appSource, /v-if="isTabActivated\('codelists'\)"/)
  assert.match(appSource, /v-if="isTabActivated\('units'\)"/)
  assert.match(appSource, /v-if="isTabActivated\('fields'\)"/)
  assert.match(appSource, /v-if="isTabActivated\('designer'\)"/)
  assert.match(appSource, /v-if="isTabActivated\('visits'\)"/)
  assert.match(appSource, /v-if="hasOpenedTemplatePreview"/)
  assert.match(appSource, /v-if="hasOpenedDocxCompare"/)
})

test('App.vue resets lazy tabs on project switch and session reset', () => {
  const resetMatches = appSource.match(/resetLazyTabs\('info'\)/g) || []
  assert.ok(resetMatches.length >= 3)
  assert.match(appSource, /function onMainTabChange\(name\) \{[\s\S]*activateTab\(name\)/)
})

test('useLazyTabs exposes activeTab activatedTabs activateTab isTabActivated reset', () => {
  assert.match(lazyTabsSource, /const activeTab = ref\(initialTab\)/)
  assert.match(lazyTabsSource, /const activatedTabs = ref\(new Set\(\[initialTab\]\)\)/)
  assert.match(lazyTabsSource, /function activateTab\(name\)/)
  assert.match(lazyTabsSource, /function isTabActivated\(name\)/)
  assert.match(lazyTabsSource, /function reset\(nextInitialTab = initialTab\)/)
})
