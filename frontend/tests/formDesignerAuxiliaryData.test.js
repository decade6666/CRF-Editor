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
  assert.match(formDesignerSource, /await Promise\.all\(\[loadFieldDefinitions\(projectId\), loadCodelists\(projectId\), loadUnits\(projectId\)\]\)/)
  assert.match(formDesignerSource, /onMounted\(async \(\) => \{[\s\S]*await loadForms\(\)[\s\S]*nextTick\(\(\) => initFormsSortable\(\)\)[\s\S]*\}\)/)
  assert.match(formDesignerSource, /@click="openDesigner"/)
  assert.match(formDesignerSource, /await ensureDesignerAuxiliaryDataLoaded\(\{ refreshFieldDefs: true \}\)/)
})


test('FormDesignerTab refreshes field definitions cache when designer opens', () => {
  assert.match(
    formDesignerSource,
    /async function refreshDesignerFieldDefinitions\(projectId = props\.projectId\) \{[\s\S]*api\.invalidateCache\(`\/api\/projects\/\$\{projectId\}\/field-definitions`\);[\s\S]*return loadFieldDefs\(projectId\);[\s\S]*\}/,
  )
  assert.match(
    formDesignerSource,
    /async function ensureDesignerAuxiliaryDataLoaded\(\{ refreshFieldDefs = false \} = \{\}\)/,
  )
  assert.match(
    formDesignerSource,
    /if \(designerAuxiliaryLoaded\.value\) \{[\s\S]*if \(!refreshFieldDefs\) return;[\s\S]*await refreshDesignerFieldDefinitions\(projectId\);[\s\S]*return;[\s\S]*\}/,
  )
  assert.match(
    formDesignerSource,
    /const loadFieldDefinitions = refreshFieldDefs \? refreshDesignerFieldDefinitions : loadFieldDefs[\s\S]*await Promise\.all\(\[loadFieldDefinitions\(projectId\), loadCodelists\(projectId\), loadUnits\(projectId\)\]\)/,
  )
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
  assert.match(
    formDesignerSource,
    /if \(loaded\.some\(\(item\) => item === false\) \|\| isStaleLoad\(\)\) throw new Error\('项目已切换，请重新打开设计器'\)/,
  )
})


test('FormDesignerTab reports auxiliary loading failures without opening designer', () => {
  assert.match(formDesignerSource, /ElMessage\.error\(`设计器辅助数据加载失败：\$\{error\?\.message \|\| designerAuxiliaryLoadError\.value \|\| '未知错误'\}`\)/)
})
