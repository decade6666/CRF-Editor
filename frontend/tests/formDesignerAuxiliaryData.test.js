import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')


test('FormDesignerTab delays auxiliary datasets until designer opens', () => {
  assert.match(formDesignerSource, /const designerAuxiliaryLoaded = ref\(false\)/)
  assert.match(formDesignerSource, /const designerAuxiliaryLoading = ref\(false\)/)
  assert.match(formDesignerSource, /const designerAuxiliaryLoadError = ref\(''\)/)
  assert.match(formDesignerSource, /async function ensureDesignerAuxiliaryDataLoaded\(\{ refreshFieldDefs = false \} = \{\}\)/)
  assert.match(formDesignerSource, /const snapshot = await readProjectDesign\(projectId, \{ formId, auxiliary: true, isCurrent: \(\) => !isStaleLoad\(\) \}\)/)
  assert.match(formDesignerSource, /onMounted\(async \(\) => \{[\s\S]*await loadForms\(\)[\s\S]*nextTick\(\(\) => initFormsSortable\(\)\)[\s\S]*\}\)/)
  assert.match(formDesignerSource, /@click="openDesigner"/)
  assert.match(formDesignerSource, /await ensureDesignerAuxiliaryDataLoaded\(\{ refreshFieldDefs: true \}\)/)
})


test('FormDesignerTab refreshes field definitions cache when designer opens', () => {
  assert.match(formDesignerSource, /if \(refreshFieldDefs\) api\.invalidateCache\(`\/api\/projects\/\$\{projectId\}\/field-definitions`\);/)
  assert.match(formDesignerSource, /async function ensureDesignerAuxiliaryDataLoaded\(\{ refreshFieldDefs = false \} = \{\}\)/)
  assert.match(formDesignerSource, /if \(designerAuxiliaryLoaded\.value && !refreshFieldDefs\) return;/)
  assert.match(formDesignerSource, /readProjectDesign\(projectId, \{ formId, auxiliary: true, isCurrent: \(\) => !isStaleLoad\(\) \}\)/)
  assert.match(formDesignerSource, /await ensureDesignerAuxiliaryDataLoaded\(\{ refreshFieldDefs: true \}\)/)
})


test('FormDesignerTab resets auxiliary loaded state on project switch', () => {
  assert.match(formDesignerSource, /designerAuxiliaryLoadSession \+= 1/)
  assert.match(formDesignerSource, /designerAuxiliaryLoaded\.value = false/)
  assert.match(formDesignerSource, /designerAuxiliaryLoading\.value = false/)
  assert.match(formDesignerSource, /designerAuxiliaryLoadError\.value = ''/)
})


test('FormDesignerTab guards in-flight designer auxiliary loads against project switches', () => {
  assert.doesNotMatch(formDesignerSource, /designerAuxiliaryLoadPromise/)
  assert.doesNotMatch(formDesignerSource, /designerFieldDefinitionsRefreshPromise/)
  assert.match(formDesignerSource, /let designerAuxiliaryLoadSession = 0/)
  assert.match(
    formDesignerSource,
    /const projectId = props\.projectId[\s\S]*const isStaleLoad = \(\) => loadSession !== designerAuxiliaryLoadSession \|\| projectId !== props\.projectId/,
  )
  assert.match(
    formDesignerSource,
    /async function loadFieldDefs\(projectId = props\.projectId\) \{[\s\S]*if \(projectId !== props\.projectId\) return false;[\s\S]*fieldDefs\.value = loadedFieldDefs;[\s\S]*return true;[\s\S]*\}/,
  )
  assert.match(
    formDesignerSource,
    /async function loadCodelists\(projectId = props\.projectId\) \{[\s\S]*if \(projectId !== props\.projectId\) return false;[\s\S]*codelists\.value = loadedCodelists;[\s\S]*return true;[\s\S]*\}/,
  )
  assert.match(formDesignerSource, /if \(isStaleLoad\(\)\) throw new Error\('项目已切换，请重新打开设计器'\)/)
  assert.match(formDesignerSource, /fieldDefs\.value = snapshot\.data\.definitions/)
  assert.match(formDesignerSource, /codelists\.value = snapshot\.data\.codelists/)
  assert.match(formDesignerSource, /units\.value = snapshot\.data\.units/)
})


test('FormDesignerTab reports auxiliary loading failures without opening designer', () => {
  assert.match(formDesignerSource, /ElMessage\.error\(`设计器辅助数据加载失败：\$\{error\?\.message \|\| designerAuxiliaryLoadError\.value \|\| '未知错误'\}`\)/)
})
