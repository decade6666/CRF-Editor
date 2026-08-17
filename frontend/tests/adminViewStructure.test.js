import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const adminViewSource = readFileSync(path.resolve(currentDir, '../src/components/AdminView.vue'), 'utf8')
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('App.vue admin branch exposes top-level users/orgs entry switch', () => {
  const adminBranch = appSource.match(/<template v-else-if="isAdmin">[\s\S]*?<\/template>/)?.[0] ?? ''
  assert.match(adminBranch, /用户管理/)
  assert.match(adminBranch, /机构管理/)
  assert.match(adminBranch, /el-radio-group/)
  assert.match(adminBranch, /el-radio-button/)
  assert.match(adminBranch, /activeAdminPage/)
  assert.match(adminBranch, /activeAdminPage === 'users'/)
  assert.match(adminBranch, /value="orgs"/)
})

test('App.vue admin branch renders no dialog-form entry switch', () => {
  assert.doesNotMatch(appSource, /showOrgPresets/)
  assert.doesNotMatch(appSource, /OrganizationPresetsDialog/)
})

test('App.vue caches admin pages while preserving the page switch and logout event', () => {
  const adminBranch = appSource.match(/<template v-else-if="isAdmin">[\s\S]*?<\/template>/)?.[0] ?? ''
  assert.match(
    adminBranch,
    /<KeepAlive>[\s\S]*?<AdminView v-if="activeAdminPage === 'users'" @logout="logout"\s*\/>[\s\S]*?<OrganizationManagementView v-else\s*\/>[\s\S]*?<\/KeepAlive>/
  )
})

test('App.vue admin branch uses one shared wide shell for both pages', () => {
  assert.match(appSource, /\.admin-shell\s*\{[\s\S]*width:\s*100%[\s\S]*max-width:\s*1200px[\s\S]*margin-inline:\s*auto[\s\S]*\}/)
  assert.doesNotMatch(appSource, /\.admin-org-shell/)
  assert.doesNotMatch(appSource, /width:\s*50%/)
  assert.match(appSource, /class="admin-shell"/)
})

test('AdminView keeps batch project actions inside a single two-step project list dialog', () => {
  assert.match(adminViewSource, /@click="openProjectList\(row\)"/)
  assert.match(adminViewSource, /项目列表/)
  assert.match(adminViewSource, /v-model="showProjectList"/)
  assert.match(adminViewSource, /@selection-change="onProjectSelectionChange"/)
  assert.match(adminViewSource, /<el-table-column type="selection" width="50" align="center"\s*\/>/)
  // 第一步：项目表格 + 三个动作按钮（取消 右侧）；复制/迁移进入第二步
  assert.match(adminViewSource, /@click="startBatchAction\('copy'\)"/)
  assert.match(adminViewSource, /@click="startBatchAction\('move'\)"/)
  assert.match(adminViewSource, /@click="startBatchAction\('delete'\)"/)
  assert.match(adminViewSource, /projectListStep === 'select'/)
  assert.match(adminViewSource, /projectListStep\.value = 'target'/)
  // 第二步：目标用户选择 + 上一步
  assert.match(adminViewSource, /@click="backToProjectSelection"/)
  assert.match(adminViewSource, /batchTargetUserId/)
  assert.match(adminViewSource, /v-for="user in users\.filter\(item => item\.id !== projectListUser\?\.id\)"/)
  assert.doesNotMatch(adminViewSource, /batchMode === 'copy'/)
  // 删除路径保留最终二次确认
  assert.match(adminViewSource, /confirmFinalProjectDelete/)
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

  assert.match(adminViewSource, /<el-tooltip v-if="!row\.is_admin"[\s\S]*?aria-label="项目列表"[\s\S]*?@click="openProjectList\(row\)"\s*\/>/)
  assert.match(adminViewSource, /<el-tooltip v-if="!row\.is_admin"[\s\S]*?aria-label="删除"[\s\S]*?@click="deleteUser\(row\)"\s*\/>/)
  assert.match(adminViewSource, /:disabled="row\.project_count > 0"[^\n>]*@click="deleteUser\(row\)"/)
})

test('admin shell mounts AdminView directly without normal workspace content', () => {
  assert.match(appSource, /<template v-else-if="isAdmin">/)
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
  assert.match(adminViewSource, /<el-table-column label="用户名" min-width="160">/)
  assert.doesNotMatch(adminViewSource, /<el-table-column label="用户名" width=/)
  assert.doesNotMatch(adminViewSource, /统一管理用户、批量项目操作与回收站入口/)
  assert.match(adminViewSource, /label="操作" width="130"/)
  assert.match(adminViewSource, /<el-table[\s\S]*?size="small"/)
})

test('App.vue shows copy button without hover condition', () => {
  const copyButtonTag = appSource.match(
    /<el-button(?=[^>]*class="project-action-btn project-action-btn--copy")(?=[^>]*\blink\b)(?=[^>]*aria-label="复制项目")(?=[^>]*@click\.stop="copyProject\(p\)")(?=[^>]*title="复制项目")[^>]*>/
  )?.[0]

  assert.ok(copyButtonTag)
  assert.equal(/v-if=|v-show=/.test(copyButtonTag), false)
  assert.match(appSource, /:loading="copyingProjectId === p\.id"/)
})
