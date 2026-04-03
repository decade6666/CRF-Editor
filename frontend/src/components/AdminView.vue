<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../composables/useApi'

const emit = defineEmits(['logout'])

const activeTab = ref('users')
const users = ref([])
const loadingUsers = ref(false)

async function loadUsers() {
  loadingUsers.value = true
  try {
    users.value = await api.get('/admin/users')
  } catch (e) {
    ElMessage.error('加载用户失败: ' + e.message)
  } finally {
    loadingUsers.value = false
  }
}

// 用户编辑
const showUserEdit = ref(false)
const userForm = reactive({ id: null, username: '' })

function openAddUser() {
  userForm.id = null
  userForm.username = ''
  showUserEdit.value = true
}

function openRenameUser(u) {
  userForm.id = u.id
  userForm.username = u.username
  showUserEdit.value = true
}

async function saveUser() {
  if (!userForm.username) return
  try {
    if (userForm.id) {
      await api.patch(`/admin/users/${userForm.id}`, { username: userForm.username })
      ElMessage.success('修改成功')
    } else {
      await api.post('/admin/users', { username: userForm.username })
      ElMessage.success('添加成功')
    }
    showUserEdit.value = false
    loadUsers()
  } catch (e) {
    ElMessage.error('操作失败: ' + e.message)
  }
}

async function deleteUser(u) {
  try {
    await ElMessageBox.confirm(`确定删除用户 "${u.username}" 吗？`, '删除用户', { type: 'warning' })
    await api.del(`/admin/users/${u.id}`)
    ElMessage.success('删除成功')
    loadUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message)
  }
}

// 批量操作
const selectedUserIds = ref([])
const showBatchMove = ref(false)
const showBatchCopy = ref(false)
const batchTargetUserId = ref(null)
const batchSourceUserId = ref(null)
const sourceUserProjects = ref([])
const selectedProjectIds = ref([])

async function openBatchMove(u) {
  batchSourceUserId.value = u.id
  batchTargetUserId.value = null
  selectedProjectIds.value = []
  try {
    sourceUserProjects.value = await api.get(`/api/projects?user_id=${u.id}`)
    showBatchMove.value = true
  } catch (e) {
    ElMessage.error('加载项目失败')
  }
}

async function openBatchCopy(u) {
  batchSourceUserId.value = u.id
  batchTargetUserId.value = null
  selectedProjectIds.value = []
  try {
    sourceUserProjects.value = await api.get(`/api/projects?user_id=${u.id}`)
    showBatchCopy.value = true
  } catch (e) {
    ElMessage.error('加载项目失败')
  }
}

async function executeBatchMove() {
  if (!batchTargetUserId.value || !selectedProjectIds.value.length) return
  try {
    await api.post('/admin/projects/batch-move', {
      project_ids: selectedProjectIds.value,
      target_user_id: batchTargetUserId.value
    })
    ElMessage.success('迁移成功')
    showBatchMove.value = false
    loadUsers()
  } catch (e) {
    ElMessage.error('迁移失败: ' + e.message)
  }
}

async function executeBatchCopy() {
  if (!batchTargetUserId.value || !selectedProjectIds.value.length) return
  try {
    const res = await api.post('/admin/projects/batch-copy', {
      project_ids: selectedProjectIds.value,
      target_user_id: batchTargetUserId.value
    })
    const successCount = res.filter(r => r.status === 'success').length
    ElMessage.success(`成功复制 ${successCount} 个项目`)
    showBatchCopy.value = false
    loadUsers()
  } catch (e) {
    ElMessage.error('复制失败: ' + e.message)
  }
}

async function executeBatchDelete(u) {
  batchSourceUserId.value = u.id
  selectedProjectIds.value = []
  try {
    sourceUserProjects.value = await api.get(`/api/projects?user_id=${u.id}`)
    await ElMessageBox.confirm(`请选择要删除的项目`, '批量删除项目', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    // 这里简单实现：如果用户确认，则弹出选择框
    // 实际 UI 建议在 Table 中增加勾选
  } catch (e) {}
}

// 回收站管理
const recycleBinProjects = ref([])
const loadingRecycle = ref(false)

async function loadRecycleBin() {
  loadingRecycle.value = true
  try {
    recycleBinProjects.value = await api.get('/admin/projects/recycle-bin')
  } catch (e) {
    ElMessage.error('加载回收站失败')
  } finally {
    loadingRecycle.value = false
  }
}

async function restoreProject(p) {
  try {
    await api.post(`/admin/projects/${p.id}/restore`)
    ElMessage.success('已恢复')
    loadRecycleBin()
  } catch (e) {
    ElMessage.error('恢复失败')
  }
}

async function hardDeleteProject(p) {
  try {
    await ElMessageBox.confirm(`确定彻底删除项目 "${p.name}" 吗？此操作不可逆！`, '彻底删除', { type: 'warning' })
    await api.del(`/admin/projects/${p.id}/hard-delete`)
    ElMessage.success('已彻底删除')
    loadRecycleBin()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(() => {
  loadUsers()
})

watch(activeTab, (val) => {
  if (val === 'users') loadUsers()
  if (val === 'recycle') loadRecycleBin()
})
</script>

<template>
  <div class="admin-view">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="用户管理" name="users">
        <div class="tab-header">
          <el-button type="primary" @click="openAddUser">新增用户</el-button>
          <el-button @click="loadUsers" :loading="loadingUsers">刷新</el-button>
        </div>
        
        <el-table :data="users" v-loading="loadingUsers" border stripe>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="username" label="用户名" />
          <el-table-column prop="project_count" label="项目数" width="100" />
          <el-table-column label="操作" width="380">
            <template #default="{ row }">
              <el-button size="small" @click="openRenameUser(row)">改名</el-button>
              <el-button size="small" type="primary" plain @click="openBatchMove(row)">批量迁移</el-button>
              <el-button size="small" type="success" plain @click="openBatchCopy(row)">批量复制</el-button>
              <el-button size="small" type="danger" plain @click="deleteUser(row)" :disabled="row.project_count > 0">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="项目回收站" name="recycle">
        <div class="tab-header">
          <el-button @click="loadRecycleBin" :loading="loadingRecycle">刷新</el-button>
        </div>
        <el-table :data="recycleBinProjects" v-loading="loadingRecycle" border>
          <el-table-column prop="name" label="项目名称" />
          <el-table-column prop="owner_id" label="所有者ID" width="100" />
          <el-table-column prop="deleted_at" label="删除时间" width="160" />
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button size="small" type="success" @click="restoreProject(row)">恢复</el-button>
              <el-button size="small" type="danger" @click="hardDeleteProject(row)">彻底删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="recycleBinProjects.length === 0" class="empty-tip">回收站空空如也</div>
      </el-tab-pane>
    </el-tabs>

    <!-- 用户编辑弹窗 -->
    <el-dialog v-model="showUserEdit" :title="userForm.id ? '修改用户名' : '新增用户'" width="400px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="userForm.username" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUserEdit = false">取消</el-button>
        <el-button type="primary" @click="saveUser">确定</el-button>
      </template>
    </el-dialog>

    <!-- 批量迁移/复制选择弹窗 -->
    <el-dialog v-model="showBatchMove" title="批量迁移项目" width="500px" append-to-body>
      <div style="margin-bottom:12px">
        选择目标用户：
        <el-select v-model="batchTargetUserId" placeholder="请选择用户">
          <el-option v-for="u in users.filter(x => x.id !== batchSourceUserId)" :key="u.id" :label="u.username" :value="u.id" />
        </el-select>
      </div>
      <el-table :data="sourceUserProjects" @selection-change="val => selectedProjectIds = val.map(x => x.id)" border max-height="300">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="项目名称" />
      </el-table>
      <template #footer>
        <el-button @click="showBatchMove = false">取消</el-button>
        <el-button type="primary" @click="executeBatchMove" :disabled="!batchTargetUserId || !selectedProjectIds.length">确定迁移</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBatchCopy" title="批量复制项目" width="500px" append-to-body>
      <div style="margin-bottom:12px">
        选择目标用户：
        <el-select v-model="batchTargetUserId" placeholder="请选择用户">
          <el-option v-for="u in users" :key="u.id" :label="u.username" :value="u.id" />
        </el-select>
      </div>
      <el-table :data="sourceUserProjects" @selection-change="val => selectedProjectIds = val.map(x => x.id)" border max-height="300">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="项目名称" />
      </el-table>
      <template #footer>
        <el-button @click="showBatchCopy = false">取消</el-button>
        <el-button type="primary" @click="executeBatchCopy" :disabled="!batchTargetUserId || !selectedProjectIds.length">确定复制</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-view { padding: 8px; }
.tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.empty-tip { text-align: center; color: var(--color-text-muted); padding: 40px 0; }
</style>
