import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const dialogSource = readFileSync(path.resolve(currentDir, '../src/components/OrganizationPresetsDialog.vue'), 'utf8')
const adminSource = readFileSync(path.resolve(currentDir, '../src/components/AdminView.vue'), 'utf8')

test('AdminView exposes an organization presets entry', () => {
  assert.match(adminSource, /import OrganizationPresetsDialog from '\.\/OrganizationPresetsDialog\.vue'/)
  assert.match(adminSource, /const showOrgPresets = ref\(false\)/)
  assert.match(adminSource, /<el-button @click="showOrgPresets = true">机构预设<\/el-button>/)
  assert.match(adminSource, /<OrganizationPresetsDialog v-model="showOrgPresets" \/>/)
})

test('presets dialog loads admin list sorted by name', () => {
  assert.match(dialogSource, /api\.get\('\/api\/admin\/organization-presets'\)/)
})

test('presets dialog list row actions are iconized with tooltips', () => {
  assert.match(dialogSource, /import \{ Plus, Delete, EditPen, UploadFilled, CircleCloseFilled \} from '@element-plus\/icons-vue'/)
  assert.match(dialogSource, /<el-tooltip content="编辑"[\s\S]*:icon="EditPen"[\s\S]*aria-label="编辑"/)
  assert.match(dialogSource, /<el-tooltip content="删除"[\s\S]*type="danger"[\s\S]*:icon="Delete"[\s\S]*aria-label="删除"/)
  assert.match(dialogSource, /<el-button size="small" type="primary" :icon="Plus" @click="openAdd">新增预设<\/el-button>/)
})

test('presets dialog keeps logo draft local and commits only on save', () => {
  assert.match(dialogSource, /logoDraftSource = ref\('keep'\)/)
  assert.match(dialogSource, /function pickLogo\(e\) \{[\s\S]*logoDraftSource\.value = 'upload'/)
  assert.match(dialogSource, /function clearLogoDraft\(\) \{[\s\S]*logoDraftSource\.value = 'clear'/)
  assert.match(dialogSource, /URL\.revokeObjectURL\(logoPreviewUrl\.value\)/)
})

test('presets dialog save builds multipart payload with logo_action', () => {
  assert.match(dialogSource, /fd\.append\('metadata', JSON\.stringify\(\{[\s\S]*name: draft\.name[\s\S]*data_management_unit: draft\.data_management_unit \|\| null/)
  assert.match(dialogSource, /fd\.append\('logo_action', logoDraftSource\.value\)/)
  assert.match(dialogSource, /if \(logoDraftSource\.value === 'upload' && logoFile\.value\) \{[\s\S]*fd\.append\('file', logoFile\.value\)/)
  assert.match(dialogSource, /const method = draftId\.value \? 'put' : 'post'/)
  assert.match(dialogSource, /fetch\(apiUrl\(url\), \{ method, body: fd, headers: getAuthHeaders\(\) \}\)/)
})

test('presets dialog delete requires confirmation before DELETE', () => {
  assert.match(dialogSource, /confirmDelete\(ElMessageBox\.confirm, \{ targetText: `机构预设 "\$\{row\.name\}"` \}\)/)
  assert.match(dialogSource, /api\.del\(`\/api\/admin\/organization-presets\/\$\{row\.id\}`\)/)
})

test('presets dialog pickLogo resets the file input for repeat selection', () => {
  assert.match(dialogSource, /function pickLogo\(e\) \{[\s\S]*logoPreviewUrl\.value = URL\.createObjectURL\(file\)[\s\S]*if \(logoInput\.value\) logoInput\.value = ''/)
})

test('presets dialog cancel resets draft without side effects', () => {
  assert.match(dialogSource, /function resetDraft\(\) \{[\s\S]*editing\.value = false[\s\S]*draft\.name = ''[\s\S]*revokeLogoPreview\(\)/)
  assert.match(dialogSource, /@closed="resetDraft"/)
})
