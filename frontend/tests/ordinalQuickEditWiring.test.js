import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')
const unitsSource = readFileSync(path.resolve(currentDir, '../src/components/UnitsTab.vue'), 'utf8')
const fieldsSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')
const formsSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length
}

test('CodelistsTab wires quick ordinal edit for codelists and options', () => {
  assert.match(codelistsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/)
  assert.match(codelistsSource, /startEdit: startCodelistOrdinalEdit/)
  assert.match(codelistsSource, /startEdit: startOptionOrdinalEdit/)
  assert.match(codelistsSource, /@dblclick\.stop="startCodelistOrdinalEdit\(row\)"/)
  assert.match(codelistsSource, /@dblclick\.stop="startOptionOrdinalEdit\(row\)"/)
  assert.match(codelistsSource, /v-if="editingCodelistId === row\.id"/)
  assert.match(codelistsSource, /v-if="editingOptionId === row\.id"/)
  assert.match(codelistsSource, /@keyup\.enter\.stop="commitCodelistOrdinalEdit"/)
  assert.equal(countMatches(codelistsSource, /:controls="false"/g), 2)
  assert.match(codelistsSource, /@keydown\.esc\.stop\.prevent="cancelCodelistOrdinalEdit"/)
  assert.match(codelistsSource, /@blur="cancelCodelistOrdinalEdit"/)
  assert.match(codelistsSource, /@keyup\.enter\.stop="commitOptionOrdinalEdit"/)
  assert.match(codelistsSource, /@keydown\.esc\.stop\.prevent="cancelOptionOrdinalEdit"/)
  assert.match(codelistsSource, /@blur="cancelOptionOrdinalEdit"/)
})

test('UnitsTab wires quick ordinal edit for unit rows', () => {
  assert.match(unitsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/)
  assert.match(unitsSource, /startEdit: startUnitOrdinalEdit/)
  assert.match(unitsSource, /@dblclick\.stop="startUnitOrdinalEdit\(row\)"/)
  assert.match(unitsSource, /v-if="editingUnitId === row\.id"/)
  assert.match(unitsSource, /@keyup\.enter\.stop="commitUnitOrdinalEdit"/)
  assert.equal(countMatches(unitsSource, /:controls="false"/g), 1)
  assert.match(unitsSource, /@keydown\.esc\.stop\.prevent="cancelUnitOrdinalEdit"/)
  assert.match(unitsSource, /@blur="cancelUnitOrdinalEdit"/)
})

test('FieldsTab wires quick ordinal edit for visible field-definition rows only', () => {
  assert.match(fieldsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/)
  assert.match(fieldsSource, /renderList: visibleFields/)
  assert.match(fieldsSource, /startEdit: startFieldOrdinalEdit/)
  assert.match(fieldsSource, /@dblclick\.stop="startFieldOrdinalEdit\(row\)"/)
  assert.match(fieldsSource, /v-if="editingFieldId === row\.id"/)
  assert.match(fieldsSource, /@keyup\.enter\.stop="commitFieldOrdinalEdit"/)
  assert.equal(countMatches(fieldsSource, /:controls="false"/g), 1)
  assert.match(fieldsSource, /@keydown\.esc\.stop\.prevent="cancelFieldOrdinalEdit"/)
  assert.match(fieldsSource, /@blur="cancelFieldOrdinalEdit"/)
})

test('VisitsTab wires quick ordinal edit for visits and visit forms', () => {
  assert.match(visitsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/)
  assert.match(visitsSource, /orderKey: 'sequence'/)
  assert.match(visitsSource, /startEdit: startVisitOrdinalEdit/)
  assert.match(visitsSource, /startEdit: startVisitFormOrdinalEdit/)
  assert.match(visitsSource, /@dblclick\.stop="startVisitOrdinalEdit\(row\)"/)
  assert.match(visitsSource, /@dblclick\.stop="startVisitFormOrdinalEdit\(row\)"/)
  assert.match(visitsSource, /v-if="editingVisitId === row\.id"/)
  assert.match(visitsSource, /v-if="editingVisitFormId === row\.id"/)
  assert.match(visitsSource, /@keyup\.enter\.stop="commitVisitOrdinalEdit"/)
  assert.equal(countMatches(visitsSource, /:controls="false"/g), 2)
  assert.match(visitsSource, /@keydown\.esc\.stop\.prevent="cancelVisitOrdinalEdit"/)
  assert.match(visitsSource, /@blur="cancelVisitOrdinalEdit"/)
  assert.match(visitsSource, /@keyup\.enter\.stop="commitVisitFormOrdinalEdit"/)
  assert.match(visitsSource, /@keydown\.esc\.stop\.prevent="cancelVisitFormOrdinalEdit"/)
  assert.match(visitsSource, /@blur="cancelVisitFormOrdinalEdit"/)
})

test('FormDesignerTab wires quick ordinal edit only for the left-side forms table', () => {
  assert.match(formsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/)
  assert.match(formsSource, /startEdit: startFormOrdinalEdit/)
  assert.match(formsSource, /@dblclick\.stop="startFormOrdinalEdit\(row\)"/)
  assert.match(formsSource, /v-if="editingFormId === row\.id"/)
  assert.match(formsSource, /@keyup\.enter\.stop="commitFormOrdinalEdit"/)
  assert.equal(countMatches(formsSource, /:controls="false"/g), 1)
  assert.match(formsSource, /@keydown\.esc\.stop\.prevent="cancelFormOrdinalEdit"/)
  assert.match(formsSource, /@blur="cancelFormOrdinalEdit"/)
  assert.match(formsSource, /ff\._displayOrder/)
  assert.doesNotMatch(formsSource, /startFieldOrdinalEdit/)
})
