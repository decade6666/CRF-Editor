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

test('admin entry still mounts a single AdminView dialog without tab dead links', () => {
  assert.match(appSource, /@click="showAdmin = true"/)
  assert.match(appSource, /<AdminView @logout="logout" \/>/)
  assert.equal(adminViewSource.includes('activeTab'), false)
  assert.equal(adminViewSource.includes('name="recycle"'), false)
  assert.equal(adminViewSource.includes('label="项目回收站" name="recycle"'), false)
})

test('AdminView uses /api/admin routes for admin API calls', () => {
  assert.match(adminViewSource, /const adminApiBase = '\/api\/admin'/)
  assert.equal(/api\.(?:get|post|patch|del)\((`|'|")\/admin\//.test(adminViewSource), false)

  const adminApiBaseCalls = [...adminViewSource.matchAll(/api\.(?:get|post|patch|del)\(`\$\{adminApiBase\}\//g)]
  assert.ok(adminApiBaseCalls.length >= 8)
})

test('App.vue shows copy button without hover condition', () => {
  const copyButtonTag = appSource.match(/<el-button class="project-action-btn" link @click\.stop="copyProject\(p\)"[^>]*title="复制项目">/)?.[0]

  assert.ok(copyButtonTag)
  assert.equal(/v-if=|v-show=/.test(copyButtonTag), false)
  assert.match(appSource, /:loading="copyingProjectId === p\.id"/)
})
