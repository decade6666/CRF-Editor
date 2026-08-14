import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/ProjectInfoTab.vue'), 'utf8')

test('ProjectInfoTab exposes screening number format under protocol number with default fallback', () => {
  assert.match(source, /const DEFAULT_SCREENING_NUMBER_FORMAT = 'S\|__\|__\|\|__\|__\|__\|'/)
  assert.match(source, /screening_number_format: p\.screening_number_format \|\| DEFAULT_SCREENING_NUMBER_FORMAT/)
  assert.match(source, /<el-form-item label="方案编号"><el-input v-model="form\.protocol_number" \/><\/el-form-item>/)
  assert.match(source, /<el-form-item label="筛选号格式"><el-input v-model="form\.screening_number_format" @input="screeningNumberFormatTouched = true" \/><\/el-form-item>/)
  assert.ok(source.indexOf('label="方案编号"') < source.indexOf('label="筛选号格式"'))
  assert.match(source, /const metadata = \{ \.\.\.form \}/)
  assert.match(source, /if \(!screeningNumberFormatTouched\.value && !props\.project\.screening_number_format && metadata\.screening_number_format === DEFAULT_SCREENING_NUMBER_FORMAT\) \{[\s\S]*metadata\.screening_number_format = null/)
})

test('ProjectInfoTab unit input is an el-autocomplete with preset candidates', () => {
  assert.match(source, /import \{ rankFuzzyMatches \} from '\.\.\/composables\/searchRanking'/)
  assert.match(source, /unitCandidates\.value = await api\.get\('\/api\/organization-presets'\)/)
  assert.match(source, /<el-autocomplete[\s\S]*v-model="form\.data_management_unit"[\s\S]*:fetch-suggestions="fetchUnitSuggestions"[\s\S]*:trigger-on-focus="false"/)
  assert.match(source, /rankFuzzyMatches\(unitCandidates\.value, keyword, \(item\) => \[item\.data_management_unit\]\)/)
})

test('ProjectInfoTab preset candidate selection syncs unit and logo draft', () => {
  assert.match(source, /function applyUnitPreset\(item\) \{/)
  assert.match(source, /logoDraft\.source = 'preset'/)
  assert.match(source, /logoDraft\.presetId = item\.preset_id/)
  assert.match(source, /fetch\(apiUrl\(`\/api\/organization-presets\/\$\{item\.preset_id\}\/logo`\)/)
  // 无 Logo 预设：Logo 草稿置 clear
  assert.match(source, /else \{\s*logoDraft\.source = 'clear'/)
})

test('ProjectInfoTab logo draft state machine: upload/clear are local drafts', () => {
  assert.match(source, /logoDraft = reactive\(\{ source: null, presetId: null, file: null, blobUrl: null \}\)/)
  assert.match(source, /function pickLogo\(e\) \{[\s\S]*logoDraft\.source = 'upload'/)
  assert.match(source, /function clearLogoDraft\(\) \{[\s\S]*logoDraft\.source = 'clear'/)
  assert.match(source, /URL\.revokeObjectURL\(logoDraft\.blobUrl\)/)
  assert.match(source, /logoDraft\.blobUrl = URL\.createObjectURL\(file\)/)
})

test('ProjectInfoTab save submits single profile request with logo_action', () => {
  assert.match(source, /fetch\(apiUrl\(`\/api\/projects\/\$\{props\.project\.id\}\/profile`\), \{ method: 'PUT', body: fd, headers: getAuthHeaders\(\) \}\)/)
  assert.match(source, /fd\.append\('metadata', JSON\.stringify\(metadata\)\)/)
  assert.match(source, /fd\.append\('logo_action', logoDraft\.source \|\| 'keep'\)/)
  assert.match(source, /if \(logoDraft\.source === 'preset' && logoDraft\.presetId != null\) \{[\s\S]*fd\.append\('preset_id', String\(logoDraft\.presetId\)\)/)
  assert.match(source, /if \(logoDraft\.source === 'upload' && logoDraft\.file\) \{[\s\S]*fd\.append\('file', logoDraft\.file\)/)
  // 失败保留草稿并报错
  assert.match(source, /ElMessage\.error\('保存失败: ' \+ detail\)/)
  assert.match(source, /let detail = '未知错误'/)
})

test('ProjectInfoTab restricts logo uploads to bitmap formats', () => {
  assert.match(source, /const FILE_ACCEPT = '\.jpg,\.jpeg,\.png,\.gif,\.bmp,\.webp'/)
  assert.match(source, /:accept="FILE_ACCEPT"/)
})

test('ProjectInfoTab editing unit text after preset selection degrades logo draft to keep', () => {
  assert.match(source, /function onUnitInput\(\) \{/)
  assert.match(source, /if \(!matched\) \{\s*logoDraft\.presetId = null\s*logoDraft\.source = 'keep'\s*\}/)
})

test('ProjectInfoTab pickLogo resets the file input for repeat selection', () => {
  assert.match(source, /function pickLogo\(e\) \{[\s\S]*logoDraft\.blobUrl = URL\.createObjectURL\(file\)[\s\S]*if \(logoInput\.value\) logoInput\.value = ''/)
})

test('ProjectInfoTab reset on project switch revokes logo blob and keeps upload state', () => {
  assert.match(source, /function resetLogoDraft\(\) \{/)
  assert.match(source, /onUnmounted\(\(\) => \{\s*revokeLogoBlob\(\)/)
})
