<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DeleteFilled } from '@element-plus/icons-vue'
import { api } from '../composables/useApi'
import { formatBytes } from '../composables/byteSize'
import { confirmDelete, confirmFinalProjectDelete } from '../composables/projectDeleteConfirmation'
import OrganizationPresetsDialog from './OrganizationPresetsDialog.vue'

const adminApiBase = '/api/admin'

const users = ref([])
const loadingUsers = ref(false)
const showRecycleBin = ref(false)
const showOrgPresets = ref(false)
const recycleBinProjects = ref([])
const loadingRecycle = ref(false)

const showCleanupPolicy = ref(false)
const loadingCleanupPolicy = ref(false)
const previewingCleanup = ref(false)
const cleanupPreviewItems = ref([])
const cleanupPolicyBaseline = ref(null)
const cleanupPolicyForm = reactive({
  interval_minutes: 60,
  min_retain_hours: 24,
  age: {
    enabled: false,
    value: 30,
    unit: 'day',
  },
  size: {
    enabled: false,
    value: 500,
    unit: 'MB',
  },
  total_estimated_size_bytes: 0,
  recycled_project_count: 0,
})

async function loadUsers() {
  loadingUsers.value = true
  try {
    users.value = await api.get(`${adminApiBase}/users`)
  } catch (e) {
    ElMessage.error('加载用户失败: ' + e.message)
  } finally {
    loadingUsers.value = false
  }
}

async function loadRecycleBin() {
  loadingRecycle.value = true
  try {
    recycleBinProjects.value = await api.get(`${adminApiBase}/projects/recycle-bin`)
  } catch (e) {
    ElMessage.error('加载回收站失败')
  } finally {
    loadingRecycle.value = false
  }
}

function applyCleanupPolicy(payload) {
  cleanupPolicyForm.interval_minutes = payload.interval_minutes ?? 60
  cleanupPolicyForm.min_retain_hours = payload.min_retain_hours ?? 24
  cleanupPolicyForm.age.enabled = Boolean(payload.age?.enabled)
  cleanupPolicyForm.age.value = payload.age?.value ?? 30
  cleanupPolicyForm.age.unit = payload.age?.unit ?? 'day'
  cleanupPolicyForm.size.enabled = Boolean(payload.size?.enabled)
  cleanupPolicyForm.size.value = payload.size?.value ?? 500
  cleanupPolicyForm.size.unit = payload.size?.unit ?? 'MB'
  cleanupPolicyForm.total_estimated_size_bytes = payload.total_estimated_size_bytes ?? 0
  cleanupPolicyForm.recycled_project_count = payload.recycled_project_count ?? 0
  cleanupPolicyBaseline.value = JSON.stringify({
    interval_minutes: cleanupPolicyForm.interval_minutes,
    min_retain_hours: cleanupPolicyForm.min_retain_hours,
    age: { ...cleanupPolicyForm.age },
    size: { ...cleanupPolicyForm.size },
  })
}

async function loadCleanupPolicy() {
  loadingCleanupPolicy.value = true
  try {
    const payload = await api.get(`${adminApiBase}/recycle-bin/cleanup-policy`)
    applyCleanupPolicy(payload)
  } catch (e) {
    ElMessage.error('加载清理策略失败: ' + e.message)
  } finally {
    loadingCleanupPolicy.value = false
  }
}

function buildCleanupPolicyPayload() {
  return {
    interval_minutes: cleanupPolicyForm.interval_minutes,
    min_retain_hours: cleanupPolicyForm.min_retain_hours,
    age: {
      enabled: cleanupPolicyForm.age.enabled,
      value: cleanupPolicyForm.age.value,
      unit: cleanupPolicyForm.age.unit,
    },
    size: {
      enabled: cleanupPolicyForm.size.enabled,
      value: cleanupPolicyForm.size.value,
      unit: cleanupPolicyForm.size.unit,
    },
  }
}

function isCleanupPolicyDirty() {
  return cleanupPolicyBaseline.value !== JSON.stringify(buildCleanupPolicyPayload())
}

const showUserEdit = ref(false)
const showResetPassword = ref(false)
const userForm = reactive({ id: null, username: '', password: '' })
const passwordForm = reactive({ id: null, username: '', password: '' })

function openAddUser() {
  userForm.id = null
  userForm.username = ''
  userForm.password = ''
  showUserEdit.value = true
}

function openRenameUser(user) {
  userForm.id = user.id
  userForm.username = user.username
  userForm.password = ''
  showUserEdit.value = true
}

function openResetPassword(user) {
  passwordForm.id = user.id
  passwordForm.username = user.username
  passwordForm.password = ''
  showResetPassword.value = true
}

async function saveUser() {
  if (!userForm.username) return
  if (!userForm.id && !userForm.password) {
    ElMessage.error('请输入初始密码')
    return
  }
  try {
    if (userForm.id) {
      await api.patch(`${adminApiBase}/users/${userForm.id}`, { username: userForm.username })
      ElMessage.success('修改成功')
    } else {
      await api.post(`${adminApiBase}/users`, {
        username: userForm.username,
        password: userForm.password,
      })
      ElMessage.success('添加成功')
    }
    showUserEdit.value = false
    await loadUsers()
  } catch (e) {
    ElMessage.error('操作失败: ' + e.message)
  }
}

async function submitPasswordReset() {
  if (!passwordForm.password) {
    ElMessage.error('请输入新密码')
    return
  }
  try {
    await api.put(`${adminApiBase}/users/${passwordForm.id}/password`, {
      password: passwordForm.password,
    })
    ElMessage.success('密码重置成功')
    showResetPassword.value = false
    await loadUsers()
  } catch (e) {
    ElMessage.error('密码重置失败: ' + e.message)
  }
}

async function deleteUser(user) {
  try {
    await ElMessageBox.confirm(`确定删除用户 "${user.username}" 吗？`, '删除用户', { type: 'warning' })
    await api.del(`${adminApiBase}/users/${user.id}`)
    ElMessage.success('删除成功')
    await loadUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message)
  }
}

const showProjectList = ref(false)
const projectListUser = ref(null)
const loadingProjects = ref(false)
const batchMode = ref('move')
const batchTargetUserId = ref(null)
const sourceUserProjects = ref([])
const selectedProjectIds = ref([])

const needsTargetUser = computed(() => batchMode.value !== 'delete')
const canExecuteBatchAction = computed(() => {
  return selectedProjectIds.value.length > 0 && (!needsTargetUser.value || !!batchTargetUserId.value)
})
const batchConfirmText = computed(() => {
  if (batchMode.value === 'move') return '确定迁移'
  if (batchMode.value === 'copy') return '确定复制'
  return '确定删除'
})

function onProjectSelectionChange(rows) {
  selectedProjectIds.value = rows.map(item => item.id)
}

function resetProjectListState() {
  projectListUser.value = null
  loadingProjects.value = false
  batchMode.value = 'move'
  batchTargetUserId.value = null
  sourceUserProjects.value = []
  selectedProjectIds.value = []
  showProjectList.value = false
}

async function openProjectList(user) {
  projectListUser.value = { id: user.id, username: user.username }
  batchMode.value = 'move'
  batchTargetUserId.value = null
  sourceUserProjects.value = []
  selectedProjectIds.value = []
  showProjectList.value = true
  loadingProjects.value = true
  try {
    sourceUserProjects.value = await api.get(`/api/projects?user_id=${user.id}`)
  } catch (e) {
    ElMessage.error('加载项目失败')
  } finally {
    loadingProjects.value = false
  }
}

async function executeBatchMove() {
  if (!batchTargetUserId.value || !selectedProjectIds.value.length) return
  try {
    await api.post(`${adminApiBase}/projects/batch-move`, {
      project_ids: selectedProjectIds.value,
      target_user_id: batchTargetUserId.value,
    })
    ElMessage.success('迁移成功')
    resetProjectListState()
    await loadUsers()
  } catch (e) {
    ElMessage.error('迁移失败: ' + e.message)
  }
}

async function executeBatchCopy() {
  if (!batchTargetUserId.value || !selectedProjectIds.value.length) return
  try {
    const results = await api.post(`${adminApiBase}/projects/batch-copy`, {
      project_ids: selectedProjectIds.value,
      target_user_id: batchTargetUserId.value,
    })
    const successCount = results.filter(result => result.status === 'success').length
    ElMessage.success(`成功复制 ${successCount} 个项目`)
    resetProjectListState()
    await loadUsers()
  } catch (e) {
    ElMessage.error('复制失败: ' + e.message)
  }
}

async function executeBatchDelete() {
  if (!selectedProjectIds.value.length) return
  try {
    await confirmFinalProjectDelete(ElMessageBox.confirm, {
      projectCount: selectedProjectIds.value.length,
    })
    await api.post(`${adminApiBase}/projects/batch-delete`, {
      project_ids: selectedProjectIds.value,
    })
    ElMessage.success('删除成功')
    resetProjectListState()
    await Promise.all([loadUsers(), loadRecycleBin()])
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message)
  }
}

async function executeBatchAction() {
  if (!canExecuteBatchAction.value) return
  if (batchMode.value === 'move') return executeBatchMove()
  if (batchMode.value === 'copy') return executeBatchCopy()
  return executeBatchDelete()
}

async function openRecycleBin() {
  showRecycleBin.value = true
  await Promise.all([loadRecycleBin(), loadCleanupPolicy()])
}

async function restoreProject(project) {
  try {
    await api.post(`${adminApiBase}/projects/${project.id}/restore`)
    ElMessage.success('已恢复')
    await Promise.all([loadRecycleBin(), loadUsers(), loadCleanupPolicy()])
  } catch (e) {
    ElMessage.error('恢复失败: ' + e.message)
  }
}

async function hardDeleteProject(project) {
  try {
    await ElMessageBox.confirm(`确定彻底删除项目 "${project.name}" 吗？此操作不可逆！`, '彻底删除', { type: 'warning' })
    await confirmFinalProjectDelete(ElMessageBox.confirm, {
      actionText: '彻底删除',
      confirmButtonText: '确认彻底删除',
      projectName: project.name,
    })
    await api.del(`${adminApiBase}/projects/${project.id}/hard-delete`)
    ElMessage.success('已彻底删除')
    await Promise.all([loadRecycleBin(), loadUsers(), loadCleanupPolicy()])
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message)
  }
}

async function previewCleanup() {
  previewingCleanup.value = true
  try {
    cleanupPreviewItems.value = await api.post(`${adminApiBase}/recycle-bin/cleanup/preview`, {})
  } catch (e) {
    ElMessage.error('预览失败: ' + e.message)
  } finally {
    previewingCleanup.value = false
  }
}

async function saveCleanupPolicy() {
  if (cleanupPolicyForm.age.value < 1 || cleanupPolicyForm.size.value < 1) {
    ElMessage.error('阈值必须大于等于 1')
    return
  }
  if (cleanupPolicyForm.interval_minutes < 1 || cleanupPolicyForm.interval_minutes > 1440) {
    ElMessage.error('巡检间隔必须在 1 到 1440 分钟之间')
    return
  }
  if (cleanupPolicyForm.min_retain_hours < 0) {
    ElMessage.error('最短保留时间不能小于 0')
    return
  }

  const previous = cleanupPolicyBaseline.value ? JSON.parse(cleanupPolicyBaseline.value) : null
  const enablingAge = cleanupPolicyForm.age.enabled && !previous?.age?.enabled
  const enablingSize = cleanupPolicyForm.size.enabled && !previous?.size?.enabled

  try {
    if (enablingAge || enablingSize) {
      await confirmDelete(ElMessageBox.confirm, {
        actionText: '启用自动清理',
        targetText: '当前回收站策略',
        title: '启用自动清理',
        firstConfirmButtonText: '继续启用',
      })
    }
    const payload = buildCleanupPolicyPayload()
    const saved = await api.put(`${adminApiBase}/recycle-bin/cleanup-policy`, payload)
    applyCleanupPolicy(saved)
    ElMessage.success('清理策略已保存')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('保存失败: ' + e.message)
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="admin-view">
    <div class="workspace-header">
      <div>
        <div class="workspace-title">用户管理</div>
        <div class="workspace-subtitle">统一管理用户、批量项目操作与回收站入口</div>
      </div>
      <div class="workspace-actions">
        <el-button type="primary" @click="openAddUser">新增用户</el-button>
        <el-button @click="loadUsers" :loading="loadingUsers">刷新</el-button>
        <el-button @click="openRecycleBin">回收站</el-button>
        <el-button @click="showOrgPresets = true">机构预设</el-button>
      </div>
    </div>

    <OrganizationPresetsDialog v-model="showOrgPresets" />

    <el-table :data="users" v-loading="loadingUsers" border stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="用户名" width="160">
        <template #default="{ row }">
          <div class="user-name-cell">
            <span>{{ row.username }}</span>
            <el-tag v-if="row.is_admin" size="small" type="danger">管理员</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="project_count" label="项目数" width="100" />
      <el-table-column label="操作" width="360">
        <template #default="{ row }">
          <el-button size="small" @click="openRenameUser(row)">改名</el-button>
          <el-button size="small" type="primary" @click="openResetPassword(row)">重置密码</el-button>
          <el-button v-if="!row.is_admin" size="small" type="primary" plain @click="openProjectList(row)">项目列表</el-button>
          <el-button v-if="!row.is_admin" size="small" type="danger" plain @click="deleteUser(row)" :disabled="row.project_count > 0">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showUserEdit" :title="userForm.id ? '修改用户名' : '新增用户'" width="400px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="userForm.username" />
        </el-form-item>
        <el-form-item v-if="!userForm.id" label="初始密码">
          <el-input v-model="userForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUserEdit = false">取消</el-button>
        <el-button type="primary" @click="saveUser">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showResetPassword" title="重置密码" width="400px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="用户名">
          <el-input :model-value="passwordForm.username" disabled />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResetPassword = false">取消</el-button>
        <el-button type="primary" @click="submitPasswordReset">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showProjectList"
      :title="`项目列表 - ${projectListUser?.username || ''}`"
      width="600px"
      append-to-body
      @close="resetProjectListState"
    >
      <div class="batch-mode-row">
        <span>操作方式：</span>
        <el-radio-group v-model="batchMode">
          <el-radio-button label="move">迁移</el-radio-button>
          <el-radio-button label="copy">复制</el-radio-button>
          <el-radio-button label="delete">删除</el-radio-button>
        </el-radio-group>
      </div>
      <div v-if="needsTargetUser" class="batch-target-row">
        <span>选择目标用户：</span>
        <el-select v-model="batchTargetUserId" placeholder="请选择用户">
          <el-option
            v-for="user in users.filter(item => item.id !== projectListUser?.id || batchMode === 'copy')"
            :key="user.id"
            :label="user.username"
            :value="user.id"
          />
        </el-select>
      </div>
      <el-table :data="sourceUserProjects" v-loading="loadingProjects" @selection-change="onProjectSelectionChange" border max-height="320">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="项目名称" />
      </el-table>
      <template #footer>
        <el-button @click="resetProjectListState">取消</el-button>
        <el-button :type="batchMode === 'delete' ? 'danger' : 'primary'" :disabled="!canExecuteBatchAction" @click="executeBatchAction">{{ batchConfirmText }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRecycleBin" title="项目回收站" width="860px" append-to-body>
      <div class="tab-header">
        <span class="workspace-subtitle">仅显示已软删除项目</span>
        <div class="tab-header-actions">
          <el-button @click="showCleanupPolicy = true">清理策略</el-button>
          <el-button @click="loadRecycleBin" :loading="loadingRecycle">刷新</el-button>
        </div>
      </div>
      <el-table :data="recycleBinProjects" v-loading="loadingRecycle" border>
        <el-table-column prop="name" label="项目名称" />
        <el-table-column prop="owner_id" label="所有者ID" width="100" />
        <el-table-column label="大小（估算）" width="120">
          <template #default="{ row }">
            {{ formatBytes(row.estimated_size_bytes) }}
          </template>
        </el-table-column>
        <el-table-column prop="deleted_at" label="删除时间" width="180" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="restoreProject(row)">恢复</el-button>
            <el-button size="small" type="danger" @click="hardDeleteProject(row)">彻底删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="recycleBinProjects.length === 0" class="empty-state" :image-size="52">
        <template #image>
          <el-icon aria-hidden="true"><DeleteFilled /></el-icon>
        </template>
        <template #description>
          <p>回收站空空如也</p>
        </template>
      </el-empty>
    </el-dialog>

    <el-dialog v-model="showCleanupPolicy" title="回收站清理策略" width="520px" append-to-body>
      <div v-loading="loadingCleanupPolicy">
        <el-form label-width="120px">
          <el-form-item label="启用过期清理">
            <el-switch v-model="cleanupPolicyForm.age.enabled" />
          </el-form-item>
          <el-form-item label="保留时长">
            <div class="cleanup-inline-row">
              <el-input-number v-model="cleanupPolicyForm.age.value" :min="1" :disabled="!cleanupPolicyForm.age.enabled" />
              <el-select v-model="cleanupPolicyForm.age.unit" :disabled="!cleanupPolicyForm.age.enabled">
                <el-option label="天" value="day" />
                <el-option label="月" value="month" />
                <el-option label="年" value="year" />
              </el-select>
            </div>
            <div class="cleanup-help">月按 30 天、年按 365 天计算。</div>
          </el-form-item>

          <el-form-item label="启用容量清理">
            <el-switch v-model="cleanupPolicyForm.size.enabled" />
          </el-form-item>
          <el-form-item label="容量上限">
            <div class="cleanup-inline-row">
              <el-input-number v-model="cleanupPolicyForm.size.value" :min="1" :disabled="!cleanupPolicyForm.size.enabled" />
              <el-select v-model="cleanupPolicyForm.size.unit" :disabled="!cleanupPolicyForm.size.enabled">
                <el-option label="MB" value="MB" />
                <el-option label="GB" value="GB" />
              </el-select>
            </div>
            <div class="cleanup-help">超出后从最早删除的项目开始逐个彻底删除，直到总量回落到上限以内。大小为估算值，与数据库文件实际增量不等。</div>
          </el-form-item>

          <el-form-item label="最短保留时间">
            <div class="cleanup-inline-row">
              <el-input-number v-model="cleanupPolicyForm.min_retain_hours" :min="0" />
              <span class="cleanup-inline-label">小时</span>
            </div>
          </el-form-item>

          <el-form-item label="巡检间隔">
            <div class="cleanup-inline-row">
              <el-input-number v-model="cleanupPolicyForm.interval_minutes" :min="1" :max="1440" />
              <span class="cleanup-inline-label">分钟</span>
            </div>
          </el-form-item>

          <el-form-item label="当前回收站">
            <div class="cleanup-stats-text">
              {{ cleanupPolicyForm.recycled_project_count }} 个项目，约 {{ formatBytes(cleanupPolicyForm.total_estimated_size_bytes) }}
            </div>
          </el-form-item>
        </el-form>

        <div class="cleanup-preview-actions">
          <el-button @click="previewCleanup" :loading="previewingCleanup">预览将删除</el-button>
        </div>

        <el-table v-if="cleanupPreviewItems.length" :data="cleanupPreviewItems" border max-height="240">
          <el-table-column prop="name" label="项目名称" />
          <el-table-column prop="owner_username" label="所有者" width="100" />
          <el-table-column label="大小（估算）" width="120">
            <template #default="{ row }">{{ formatBytes(row.estimated_size_bytes) }}</template>
          </el-table-column>
          <el-table-column prop="deleted_at" label="删除时间" width="180" />
          <el-table-column label="命中规则" width="120">
            <template #default="{ row }">{{ row.matched_rules.join(', ') }}</template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="showCleanupPolicy = false">取消</el-button>
        <el-button type="primary" :disabled="!isCleanupPolicyDirty()" @click="saveCleanupPolicy">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-view { padding: 8px; }
.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.workspace-title {
  font-size: 18px;
  font-weight: 600;
}
.workspace-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
}
.workspace-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.user-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.user-name-cell > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.tab-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-mode-row,
.batch-target-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.cleanup-inline-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cleanup-inline-label {
  color: var(--color-text-muted);
}
.cleanup-help {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.cleanup-stats-text {
  color: var(--color-text-secondary);
}
.cleanup-preview-actions {
  display: flex;
  justify-content: flex-end;
  margin: 8px 0 12px;
}
.empty-state {
  margin-top: 12px;
}
</style>
