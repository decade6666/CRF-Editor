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
})

test('AdminView keeps batch project actions inside user management actions', () => {
  assert.match(adminViewSource, /@click="openBatchMove\(row\)"/)
  assert.match(adminViewSource, /@click="openBatchCopy\(row\)"/)
  assert.match(adminViewSource, /@click="openBatchDelete\(row\)"/)
  assert.match(adminViewSource, /@selection-change="onProjectSelectionChange"/)
})

test('admin shell mounts AdminView directly without normal workspace content', () => {
  assert.match(appSource, /<template v-else-if="isAdmin">/)
  assert.match(appSource, /<div class="admin-shell">[\s\S]*<AdminView @logout="logout" \/>/)
  assert.doesNotMatch(appSource, /showAdmin = true/)
  assert.doesNotMatch(appSource, /<el-dialog v-model="showAdmin"/)
})

test('AdminView uses /api/admin routes for admin API calls', () => {
  assert.match(adminViewSource, /const adminApiBase = '\/api\/admin'/)
  assert.equal(/api\.(?:get|post|patch|put|del)\((`|'|")\/admin\//.test(adminViewSource), false)

  const adminApiBaseCalls = [...adminViewSource.matchAll(/api\.(?:get|post|patch|put|del)\(`\$\{adminApiBase\}\//g)]
  assert.ok(adminApiBaseCalls.length >= 9)
})

test('AdminView shows password state column and password reset entry', () => {
  assert.match(adminViewSource, /label="密码状态"/)
  assert.match(adminViewSource, /row\.has_password \? '已设密码' : '未设密码'/)
  assert.match(adminViewSource, /@click="openResetPassword\(row\)"/)
  assert.match(adminViewSource, /api\.put\(`\$\{adminApiBase\}\/users\/\$\{passwordForm\.id\}\/password`/)
})

test('AdminView requires password when creating a user', () => {
  assert.match(adminViewSource, /label="初始密码"/)
  assert.match(adminViewSource, /if \(!userForm\.id && !userForm\.password\)/)
  assert.match(adminViewSource, /password: userForm\.password/)
})

test('App.vue shows copy button without hover condition', () => {
  const copyButtonTag = appSource.match(/<el-button class="project-action-btn" link @click\.stop="copyProject\(p\)"[^>]*title="复制项目">/)?.[0]

  assert.ok(copyButtonTag)
  assert.equal(/v-if=|v-show=/.test(copyButtonTag), false)
  assert.match(appSource, /:loading="copyingProjectId === p\.id"/)
})
