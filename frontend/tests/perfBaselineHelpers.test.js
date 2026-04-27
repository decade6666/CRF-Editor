import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
const perfSource = readFileSync(path.resolve(currentDir, '../src/composables/usePerfBaseline.js'), 'utf8')

test('FormDesignerTab delays auxiliary datasets until designer opens', () => {
  assert.match(formDesignerSource, /const designerAuxiliaryLoaded = ref\(false\)/)
  assert.match(formDesignerSource, /const designerAuxiliaryLoading = ref\(false\)/)
  assert.match(formDesignerSource, /const designerAuxiliaryLoadError = ref\(''\)/)
  assert.match(formDesignerSource, /async function ensureDesignerAuxiliaryDataLoaded\(\)/)
  assert.match(formDesignerSource, /await Promise\.all\(\[loadFieldDefs\(\), loadCodelists\(\), loadUnits\(\)\]\)/)
  assert.match(formDesignerSource, /onMounted\(async \(\) => \{[\s\S]*await loadForms\(\)[\s\S]*nextTick\(\(\) => initFormsSortable\(\)\)[\s\S]*\}\)/)
  assert.match(formDesignerSource, /@click="openDesigner"/)
  assert.match(formDesignerSource, /await ensureDesignerAuxiliaryDataLoaded\(\)/)
})

test('FormDesignerTab resets auxiliary loaded state on project switch', () => {
  assert.match(formDesignerSource, /designerAuxiliaryLoaded\.value = false/)
  assert.match(formDesignerSource, /designerAuxiliaryLoading\.value = false/)
  assert.match(formDesignerSource, /designerAuxiliaryLoadError\.value = ''/)
})

test('FormDesignerTab reports auxiliary loading failures without opening designer', () => {
  assert.match(formDesignerSource, /ElMessage\.error\(`设计器辅助数据加载失败：\$\{error\?\.message \|\| designerAuxiliaryLoadError\.value \|\| '未知错误'\}`\)/)
})

test('usePerfBaseline stays inert unless perf mode is enabled', () => {
  assert.match(perfSource, /function isPerfBaselineEnabled\(\)/)
  assert.match(perfSource, /search\?\.get\('perf'\) === '1'/)
  assert.match(perfSource, /window\.localStorage\.getItem\(PERF_STORAGE_KEY\) === '1'/)
  assert.match(perfSource, /if \(!isPerfBaselineEnabled\(\)\) return null/)
})

test('usePerfBaseline exports sanitized project ids only in perf mode', () => {
  assert.match(perfSource, /function sanitizeProjectId\(value\)/)
  assert.match(perfSource, /normalized\.project_id = sanitizeProjectId\(normalized\.project_id\)/)
  assert.match(perfSource, /window\[PERF_EXPORT_KEY\] = exportPerfEvents/)
})

test('App and FormDesigner record required perf event names', () => {
  assert.match(appSource, /markPerfStart\('app_project_load'/)
  assert.match(appSource, /markPerfEnd\('app_project_load'/)
  assert.match(appSource, /name: `tab_\$\{name\}_first_activate`/)
  assert.match(formDesignerSource, /designer_select_form/)
  assert.match(formDesignerSource, /designer_switch_form/)
  assert.match(formDesignerSource, /designer_open_fullscreen/)
  assert.match(formDesignerSource, /designer_edit_label/)
  assert.match(formDesignerSource, /designer_toggle_inline/)
  assert.match(formDesignerSource, /designer_reorder_field/)
})
