import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const adminViewSource = readFileSync(path.resolve(currentDir, '../src/components/AdminView.vue'), 'utf8')
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('AdminView uses a single user management workspace', () => {
  assert.equal(adminViewSource.includes('<el-tabs'), false)
  assert.equal(adminViewSource.includes('<el-tab-pane'), false)
  assert.match(adminViewSource, /@click="openRecycleBin"/)
  assert.match(adminViewSource, /回收站/)
  assert.match(adminViewSource, /@click="showOrgPresets = true"/)
  assert.match(adminViewSource, /机构预设/)
  assert.match(adminViewSource, /<OrganizationPresetsDialog v-model="showOrgPresets" \/>/)
})

test('AdminView keeps batch project actions inside a single project list dialog', () => {
  assert.match(adminViewSource, /@click="openProjectList\(row\)"/)
  assert.match(adminViewSource, /项目列表/)
  assert.match(adminViewSource, /v-model="showProjectList"/)
  assert.match(adminViewSource, /@selection-change="onProjectSelectionChange"/)
  assert.match(adminViewSource, /type="selection"/)
  assert.match(adminViewSource, /v-if="needsTargetUser"/)
})

test('AdminView highlights admin users and restricts admin-only actions', () => {
  assert.match(adminViewSource, /row\.is_admin/)
  assert.match(adminViewSource, /管理员/)
  assert.match(adminViewSource, /v-if="row\.is_admin"/)

  const renameButtonTag = adminViewSource.match(/<el-button[^>]*@click="openRenameUser\(row\)"[^>]*>/)?.[0]
  const resetPasswordButtonTag = adminViewSource.match(/<el-button[^>]*@click="openResetPassword\(row\)"[^>]*>/)?.[0]

  assert.ok(renameButtonTag)
  assert.ok(resetPasswordButtonTag)
  assert.equal(/v-if=|v-show=/.test(renameButtonTag), false)
  assert.equal(/v-if=|v-show=/.test(resetPasswordButtonTag), false)

  assert.match(adminViewSource, /v-if="!row\.is_admin"[^\n>]*@click="openProjectList\(row\)"/)
  assert.match(adminViewSource, /v-if="!row\.is_admin"[^\n>]*@click="deleteUser\(row\)"/)
  assert.match(adminViewSource, /@click="deleteUser\(row\)"[^\n>]*:disabled="row\.project_count > 0"/)
})

test('admin shell mounts AdminView directly without normal workspace content', () => {
  assert.match(appSource, /<template v-else-if="isAdmin">/)
  assert.match(appSource, /<div class="admin-shell">[\s\S]*<AdminView @logout="logout" \/>/)
  assert.match(appSource, /\.admin-shell\s*\{[\s\S]*width:\s*50%[\s\S]*margin-inline:\s*auto[\s\S]*\}/)
  assert.doesNotMatch(appSource, /showAdmin = true/)
  assert.doesNotMatch(appSource, /<el-dialog v-model="showAdmin"/)
})

test('AdminView uses /api/admin routes for admin API calls', () => {
  assert.match(adminViewSource, /const adminApiBase = '\/api\/admin'/)
  assert.equal(/api\.(?:get|post|patch|put|del)\((`|'|")\/admin\//.test(adminViewSource), false)

  const adminApiBaseCalls = [...adminViewSource.matchAll(/api\.(?:get|post|patch|put|del)\(`\$\{adminApiBase\}\//g)]
  assert.ok(adminApiBaseCalls.length >= 12)
})

test('AdminView drops password state column but keeps password reset entry', () => {
  assert.doesNotMatch(adminViewSource, /label="密码状态"/)
  assert.doesNotMatch(adminViewSource, /has_password/)
  assert.match(adminViewSource, /@click="openResetPassword\(row\)"/)
  assert.match(adminViewSource, /api\.put\(`\$\{adminApiBase\}\/users\/\$\{passwordForm\.id\}\/password`/)
})

test('AdminView requires password when creating a user', () => {
  assert.match(adminViewSource, /label="初始密码"/)
  assert.match(adminViewSource, /if \(!userForm\.id && !userForm\.password\)/)
  assert.match(adminViewSource, /password: userForm\.password/)
})

test('AdminView shows recycle bin size and cleanup policy entry points', () => {
  assert.match(adminViewSource, /estimated_size_bytes/)
  assert.match(adminViewSource, /大小（估算）/)
  assert.match(adminViewSource, /清理策略/)
  assert.match(adminViewSource, /recycle-bin\/cleanup-policy/)
  assert.match(adminViewSource, /recycle-bin\/cleanup\/preview/)
  assert.match(adminViewSource, /label="用户名" width="160"/)
  assert.match(adminViewSource, /label="操作" width="360"/)
})

test('App.vue shows copy button without hover condition', () => {
  const copyButtonTag = appSource.match(
    /<el-button(?=[^>]*class="project-action-btn project-action-btn--copy")(?=[^>]*\blink\b)(?=[^>]*aria-label="复制项目")(?=[^>]*@click\.stop="copyProject\(p\)")(?=[^>]*title="复制项目")[^>]*>/
  )?.[0]

  assert.ok(copyButtonTag)
  assert.equal(/v-if=|v-show=/.test(copyButtonTag), false)
  assert.match(appSource, /:loading="copyingProjectId === p\.id"/)
})
