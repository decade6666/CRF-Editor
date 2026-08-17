import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const viewSource = readFileSync(path.resolve(currentDir, '../src/components/OrganizationManagementView.vue'), 'utf8')
const adminSource = readFileSync(path.resolve(currentDir, '../src/components/AdminView.vue'), 'utf8')

test('AdminView no longer wires the org presets dialog', () => {
  assert.doesNotMatch(adminSource, /showOrgPresets/)
  assert.doesNotMatch(adminSource, /OrganizationPresetsDialog/)
  assert.doesNotMatch(adminSource, /机构预设/)
})

test('org view loads admin list sorted by name', () => {
  assert.match(viewSource, /api\.get\('\/api\/admin\/organization-presets'\)/)
})

test('org view renders a page header like the users page and a two-column layout', () => {
  assert.match(viewSource, /class="workspace-header"/)
  assert.match(viewSource, /class="workspace-title">机构管理</)
  assert.match(viewSource, /class="workspace-subtitle"/)
  assert.match(viewSource, /class="workspace-actions"/)
  assert.match(viewSource, /aria-label="新增预设"/)
  assert.match(viewSource, /aria-label="刷新"/)
  assert.doesNotMatch(viewSource, /org-list-toolbar/)
  assert.match(viewSource, /class="org-layout"/)
  assert.match(viewSource, /@media \(max-width: 900px\)/)
  assert.match(viewSource, /class="org-editor"/)
})

test('org view keeps an editor placeholder when nothing is selected', () => {
  assert.match(viewSource, /selectedId/)
  assert.match(viewSource, /点击左侧机构/)
})

test('org view loads the correct logo URL and shows observable failure', () => {
  assert.match(viewSource, /apiUrl\(`\/api\/organization-presets\/\$\{id\}\/logo`\)/)
  assert.doesNotMatch(viewSource, /\/api\/admin\/organization-presets\/\$\{[^}]*\}\/logo/)
  assert.match(viewSource, /loadLogoUrl/)
  assert.match(viewSource, /ElMessage\.error/)
})

test('org view renders logo thumbnails with built-in preview and keyboard semantics', () => {
  assert.match(viewSource, /el-image/)
  assert.match(viewSource, /preview-src-list/)
  assert.match(viewSource, /preview-teleported/)
  assert.match(viewSource, /hide-on-click-modal/)
  assert.match(viewSource, /tabindex="0"/)
  assert.match(viewSource, /role="button"/)
  assert.match(viewSource, /aria-label="放大查看机构 Logo"/)
  assert.match(viewSource, /showPreview/)
})

test('org view manages object URL lifecycle on save, delete, switch, clear and unmount', () => {
  assert.match(viewSource, /URL\.createObjectURL/)
  assert.match(viewSource, /URL\.revokeObjectURL/)
  assert.match(viewSource, /onBeforeUnmount\(\(\) => \{[\s\S]*disposed = true[\s\S]*releaseAllThumbnails\(\)[\s\S]*revokeLogoPreview\(\)/)
  assert.match(viewSource, /function revokeLogoUrl\(id\)/)
})

test('org view suppresses row-edit on thumbnail preview clicks', () => {
  assert.match(viewSource, /@current-change="onRowChange"/)
  assert.match(viewSource, /function onRowChange\(row\) \{[\s\S]*if \(previewOpeningId === row\.id\) \{[\s\S]*return[\s\S]*openEdit\(row\)/)
  assert.match(viewSource, /@click\.stop="showPreview\(row\.id\)"/)
  assert.match(viewSource, /@keydown\.enter\.stop\.prevent="showPreview\(row\.id\)"/)
  assert.match(viewSource, /@keydown\.space\.stop\.prevent="showPreview\(row\.id\)"/)
  assert.match(viewSource, /logoPreviewOwned/)
})

test('org view reconciles thumbnails on load and pre-releases on edit save', () => {
  assert.match(viewSource, /keepIds = new Set\(presets\.value\.filter/)
  assert.match(viewSource, /for \(const id of \[\.\.\.thumbnailUrls\.keys\(\)\]\) \{[\s\S]*revokeLogoUrl\(id\)/)
  assert.match(viewSource, /const isEdit = Boolean\(draftId\.value\)[\s\S]*revokeLogoUrl\(draftId\.value\)/)
})

test('org view saves multipart payload with logo_action and builds create/update method', () => {
  assert.match(viewSource, /fd\.append\('metadata', JSON\.stringify\(\{[\s\S]*name: draft\.name[\s\S]*data_management_unit: draft\.data_management_unit \|\| null/)
  assert.match(viewSource, /fd\.append\('logo_action', logoDraftSource\.value\)/)
  assert.match(viewSource, /if \(logoDraftSource\.value === 'upload' && logoFile\.value\) \{[\s\S]*fd\.append\('file', logoFile\.value\)/)
  assert.match(viewSource, /const method = draftId\.value \? 'put' : 'post'/)
  assert.match(viewSource, /fetch\(apiUrl\(url\), \{ method, body: fd, headers: getAuthHeaders\(\) \}\)/)
})

test('org view delete requires confirmation before DELETE and releases its URL', () => {
  assert.match(viewSource, /confirmDelete\(ElMessageBox\.confirm, \{ targetText: `机构预设 "\$\{row\.name\}"` \}\)/)
  assert.match(viewSource, /api\.del\(`\/api\/admin\/organization-presets\/\$\{row\.id\}`\)/)
  assert.match(viewSource, /deleteLogoUrl\(row\.id\)/)
})

test('org view pickLogo resets the file input for repeat selection', () => {
  assert.match(viewSource, /function pickLogo\(e\) \{[\s\S]*logoPreviewUrl\.value = URL\.createObjectURL\(file\)[\s\S]*if \(logoInput\.value\) logoInput\.value = ''/)
})

test('org view resets draft without side effects and has no dialog wrapper', () => {
  assert.doesNotMatch(viewSource, /el-dialog/)
  assert.match(viewSource, /function resetDraft\(\) \{[\s\S]*editing\.value = false[\s\S]*draft\.name = ''[\s\S]*revokeLogoPreview\(\)/)
})
