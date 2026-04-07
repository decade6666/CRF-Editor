import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')

test('CodelistsTab wires left list drag sorting through useSortableTable', () => {
  assert.match(codelistsSource, /const codelistsTableRef = ref\(null\)/)
  assert.match(codelistsSource, /const codelistsReorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/codelists\/reorder`\)/)
  assert.match(codelistsSource, /useSortableTable\(/)
  assert.match(codelistsSource, /ref="codelistsTableRef"/)
  assert.match(codelistsSource, /<el-table-column width="32" v-if="!isCodelistsFiltered">/)
})

test('CodelistsTab disables option drag when search filter is active', () => {
  assert.match(codelistsSource, /<draggable v-model="selected\.options" item-key="id" handle="\.drag-handle" :disabled="Boolean\(searchOpt\.trim\(\)\)"/)
})

test('VisitsTab wires visit form drag sorting through useOrderableList', () => {
  assert.match(visitsSource, /import draggable from 'vuedraggable'/)
  assert.match(visitsSource, /const visitFormReorderUrl = computed\(\(\) => selectedVisit\.value \? `\/api\/visits\/\$\{selectedVisit\.value\.id\}\/forms\/reorder` : ''\)/)
  assert.match(visitsSource, /const \{ dragging: draggingVisitForms, handleDragEnd: handleVisitFormDragEnd \} = useOrderableList\(visitFormReorderUrl\)/)
  assert.match(visitsSource, /<draggable v-else v-model="visitForms" item-key="id" handle="\.drag-handle" @start="draggingVisitForms = true" @end="onVisitFormDragEnd">/)
})
