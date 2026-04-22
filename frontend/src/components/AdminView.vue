<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../composables/useApi'

const emit = defineEmits(['logout'])
const adminApiBase = '/api/admin'

const users = ref([])
const loadingUsers = ref(false)
const showRecycleBin = ref(false)
const recycleBinProjects = ref([])
const loadingRecycle = ref(false)

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

const showBatchMove = ref(false)
const showBatchCopy = ref(false)
const showBatchDelete = ref(false)
const batchTargetUserId = ref(null)
const batchSourceUserId = ref(null)
const sourceUserProjects = ref([])
const selectedProjectIds = ref([])
const batchActionTitle = computed(() => {
  if (showBatchMove.value) return '批量迁移项目'
  if (showBatchCopy.value) return '批量复制项目'
  return '批量删除项目'
})
const batchActionConfirmText = computed(() => {
  if (showBatchMove.value) return '确定迁移'
  if (showBatchCopy.value) return '确定复制'
  return '确定删除'
})

function onProjectSelectionChange(rows) {
  selectedProjectIds.value = rows.map(item => item.id)
}

function resetBatchActionState() {
  batchTargetUserId.value = null
  batchSourceUserId.value = null
  sourceUserProjects.value = []
  selectedProjectIds.value = []
  showBatchMove.value = false
  showBatchCopy.value = false
  showBatchDelete.value = false
}

async function loadUserProjects(user) {
  batchSourceUserId.value = user.id
  selectedProjectIds.value = []
  sourceUserProjects.value = await api.get(`/api/projects?user_id=${user.id}`)
}

async function openBatchMove(user) {
  try {
    await loadUserProjects(user)
    batchTargetUserId.value = null
    showBatchMove.value = true
  } catch (e) {
    ElMessage.error('加载项目失败')
  }
}

async function openBatchCopy(user) {
  try {
    await loadUserProjects(user)
    batchTargetUserId.value = null
    showBatchCopy.value = true
  } catch (e) {
    ElMessage.error('加载项目失败')
  }
}

async function openBatchDelete(user) {
  try {
    await loadUserProjects(user)
    showBatchDelete.value = true
  } catch (e) {
    ElMessage.error('加载项目失败')
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
    resetBatchActionState()
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
    resetBatchActionState()
    await loadUsers()
  } catch (e) {
    ElMessage.error('复制失败: ' + e.message)
  }
}

async function executeBatchDelete() {
  if (!selectedProjectIds.value.length) return
  try {
    await api.post(`${adminApiBase}/projects/batch-delete`, {
      project_ids: selectedProjectIds.value,
    })
    ElMessage.success('删除成功')
    resetBatchActionState()
    await Promise.all([loadUsers(), loadRecycleBin()])
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

function closeBatchActionDialog() {
  resetBatchActionState()
}

async function openRecycleBin() {
  showRecycleBin.value = true
  await loadRecycleBin()
}

async function restoreProject(project) {
  try {
    await api.post(`${adminApiBase}/projects/${project.id}/restore`)
    ElMessage.success('已恢复')
    await Promise.all([loadRecycleBin(), loadUsers()])
  } catch (e) {
    ElMessage.error('恢复失败: ' + e.message)
  }
}

async function hardDeleteProject(project) {
  try {
    await ElMessageBox.confirm(`确定彻底删除项目 "${project.name}" 吗？此操作不可逆！`, '彻底删除', { type: 'warning' })
    await api.del(`${adminApiBase}/projects/${project.id}/hard-delete`)
    ElMessage.success('已彻底删除')
    await Promise.all([loadRecycleBin(), loadUsers()])
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message)
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
      </div>
    </div>

    <el-table :data="users" v-loading="loadingUsers" border stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column label="密码状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.has_password ? 'success' : 'warning'">
            {{ row.has_password ? '已设密码' : '未设密码' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="project_count" label="项目数" width="100" />
      <el-table-column label="操作" width="540">
        <template #default="{ row }">
          <el-button size="small" @click="openRenameUser(row)">改名</el-button>
          <el-button size="small" type="primary" @click="openResetPassword(row)">重置密码</el-button>
          <el-button size="small" type="primary" plain @click="openBatchMove(row)">批量迁移</el-button>
          <el-button size="small" type="success" plain @click="openBatchCopy(row)">批量复制</el-button>
          <el-button size="small" type="warning" plain @click="openBatchDelete(row)">批量删除</el-button>
          <el-button size="small" type="danger" plain @click="deleteUser(row)" :disabled="row.project_count > 0">删除</el-button>
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
      :model-value="showBatchMove || showBatchCopy || showBatchDelete"
      :title="batchActionTitle"
      width="560px"
      append-to-body
      @close="closeBatchActionDialog"
    >
      <div v-if="showBatchMove || showBatchCopy" class="batch-target-row">
        选择目标用户：
        <el-select v-model="batchTargetUserId" placeholder="请选择用户">
          <el-option
            v-for="user in users.filter(item => item.id !== batchSourceUserId || showBatchCopy)"
            :key="user.id"
            :label="user.username"
            :value="user.id"
          />
        </el-select>
      </div>
      <el-table :data="sourceUserProjects" @selection-change="onProjectSelectionChange" border max-height="320">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="项目名称" />
      </el-table>
      <template #footer>
        <el-button @click="closeBatchActionDialog">取消</el-button>
        <el-button
          v-if="showBatchMove"
          type="primary"
          :disabled="!batchTargetUserId || !selectedProjectIds.length"
          @click="executeBatchMove"
        >{{ batchActionConfirmText }}</el-button>
        <el-button
          v-else-if="showBatchCopy"
          type="primary"
          :disabled="!batchTargetUserId || !selectedProjectIds.length"
          @click="executeBatchCopy"
        >{{ batchActionConfirmText }}</el-button>
        <el-button
          v-else
          type="danger"
          :disabled="!selectedProjectIds.length"
          @click="executeBatchDelete"
        >{{ batchActionConfirmText }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRecycleBin" title="项目回收站" width="760px" append-to-body>
      <div class="tab-header">
        <span class="workspace-subtitle">仅显示已软删除项目</span>
        <el-button @click="loadRecycleBin" :loading="loadingRecycle">刷新</el-button>
      </div>
      <el-table :data="recycleBinProjects" v-loading="loadingRecycle" border>
        <el-table-column prop="name" label="项目名称" />
        <el-table-column prop="owner_id" label="所有者ID" width="100" />
        <el-table-column prop="deleted_at" label="删除时间" width="180" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="restoreProject(row)">恢复</el-button>
            <el-button size="small" type="danger" @click="hardDeleteProject(row)">彻底删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="recycleBinProjects.length === 0" class="empty-tip">回收站空空如也</div>
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
.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.batch-target-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.empty-tip { text-align: center; color: var(--color-text-muted); padding: 40px 0; }
</style>
