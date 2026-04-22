import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectInfoSource = readFileSync(path.resolve(currentDir, '../src/components/ProjectInfoTab.vue'), 'utf8')

test('ProjectInfoTab exposes screening number format under protocol number with default fallback', () => {
  assert.match(projectInfoSource, /const DEFAULT_SCREENING_NUMBER_FORMAT = 'S\|__\|__\|\|__\|__\|__\|'/)
  assert.match(projectInfoSource, /screening_number_format: p\.screening_number_format \|\| DEFAULT_SCREENING_NUMBER_FORMAT/)
  assert.match(projectInfoSource, /<el-form-item label="方案编号"><el-input v-model="form\.protocol_number" \/><\/el-form-item>/)
  assert.match(projectInfoSource, /<el-form-item label="筛选号格式"><el-input v-model="form\.screening_number_format" @input="screeningNumberFormatTouched = true" \/><\/el-form-item>/)
  assert.ok(projectInfoSource.indexOf('label="方案编号"') < projectInfoSource.indexOf('label="筛选号格式"'))
  assert.match(projectInfoSource, /const data = \{ \.\.\.form \}/)
  assert.match(projectInfoSource, /if \(!screeningNumberFormatTouched\.value && !props\.project\.screening_number_format && data\.screening_number_format === DEFAULT_SCREENING_NUMBER_FORMAT\) \{[\s\S]*data\.screening_number_format = null/)
})

test('ProjectInfoTab restricts logo uploads to bitmap formats and shows backend error detail', () => {
  assert.match(projectInfoSource, /accept="\.jpg,\.jpeg,\.png,\.gif,\.bmp,\.webp"/)
  assert.match(projectInfoSource, /let detail = '未知错误'/)
  assert.match(projectInfoSource, /if \(typeof body\?\.detail === 'string' && body\.detail\) detail = body\.detail/)
  assert.match(projectInfoSource, /ElMessage\.error\('上传失败: ' \+ detail\)/)
})
