<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../composables/useApi'

const emit = defineEmits(['logout'])

const users = ref([])
const loading = ref(false)
const showAddUser = ref(false)
const newUsername = ref('')
const showRename = ref(false)
const renameTarget = ref(null)
const renameUsername = ref('')

async function loadUsers() {
  loading.value = true
  try {
    users.value = await api.get('/api/admin/users')
  } catch (e) {
    ElMessage.error('加载用户列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

async function addUser() {
  if (!newUsername.value.trim()) return ElMessage.warning('请输入用户名')
  try {
    await api.post('/api/admin/users', { username: newUsername.value.trim() })
    ElMessage.success('用户创建成功')
    showAddUser.value = false
    newUsername.value = ''
    loadUsers()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function openRename(user) {
  renameTarget.value = user
  renameUsername.value = user.username
  showRename.value = true
}

async function doRename() {
  if (!renameUsername.value.trim()) return ElMessage.warning('请输入用户名')
  try {
    await api.patch(`/api/admin/users/${renameTarget.value.id}`, { username: renameUsername.value.trim() })
    ElMessage.success('改名成功')
    showRename.value = false

    // 如果改的是当前登录用户，强制登出
    const me = await api.get('/api/auth/me').catch(() => null)
    if (!me) {
      // token 已失效（被改名的是自己）
      localStorage.removeItem('crf_token')
      emit('logout')
      return
    }
    loadUsers()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function deleteUser(user) {
  try {
    await ElMessageBox.confirm(`删除用户「${user.username}」？`, '确认', { type: 'warning' })
    await api.del(`/api/admin/users/${user.id}`)
    ElMessage.success('用户已删除')
    loadUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}
</script>

<template>
  <div style="max-width:800px;margin:0 auto;padding:20px">
    <el-alert type="warning" :closable="false" style="margin-bottom:16px">
      管理员模式：当前使用用户名入口，不提供强安全保护
    </el-alert>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">用户管理</h3>
      <el-button type="primary" size="small" @click="showAddUser = true">新增用户</el-button>
    </div>

    <el-table :data="users" size="small" border v-loading="loading">
      <el-table-column prop="username" label="用户名" />
      <el-table-column prop="project_count" label="项目数" width="100" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" link @click="openRename(row)">改名</el-button>
          <el-button
            type="danger"
            size="small"
            link
            :disabled="row.project_count > 0"
            :title="row.project_count > 0 ? '请先转移或删除该用户的项目' : ''"
            @click="deleteUser(row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增用户弹窗 -->
    <el-dialog v-model="showAddUser" title="新增用户" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="用户名"><el-input v-model="newUsername" @keyup.enter="addUser" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddUser = false">取消</el-button>
        <el-button type="primary" @click="addUser">确定</el-button>
      </template>
    </el-dialog>

    <!-- 改名弹窗 -->
    <el-dialog v-model="showRename" title="修改用户名" width="360px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="新用户名"><el-input v-model="renameUsername" @keyup.enter="doRename" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRename = false">取消</el-button>
        <el-button type="primary" @click="doRename">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
