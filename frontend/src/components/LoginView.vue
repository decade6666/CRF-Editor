<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['login-success'])

const username = ref(localStorage.getItem('crf_last_username') || '')
const loading = ref(false)

async function handleLogin() {
  if (!username.value.trim()) {
    ElMessage.error('请输入用户名')
    return
  }
  loading.value = true
  try {
    const r = await fetch('/api/auth/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value.trim() }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      ElMessage.error(err.detail || '登录失败，请重试')
      return
    }
    const { access_token } = await r.json()
    localStorage.setItem('crf_token', access_token)
    localStorage.setItem('crf_last_username', username.value.trim())
    emit('login-success')
  } catch {
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <el-card class="login-card">
      <template #header>
        <span class="login-title">CRF 编辑器</span>
      </template>
      <el-form @submit.prevent="handleLogin" label-position="top">
        <el-form-item label="用户名">
          <el-input
            v-model="username"
            placeholder="请输入用户名"
            autocomplete="username"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button type="primary" :loading="loading" native-type="submit" style="width: 100%">
          进入
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--el-bg-color-page, #f5f7fa);
}
.login-card {
  width: 360px;
}
.login-title {
  font-size: 18px;
  font-weight: 600;
}
</style>
