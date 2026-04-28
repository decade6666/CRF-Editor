# Spec 04: 前端认证集成

## 1. LoginView.vue（frontend/src/components/LoginView.vue）

### 1.1 组件接口

```
Props:   无
Emits:   'login-success'  — 登录成功后触发，App.vue 监听后切换至主界面
```

### 1.2 完整组件结构

```vue
<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <h2 style="margin: 0; text-align: center;">CRF Editor</h2>
      </template>
      <el-form @submit.prevent="handleLogin" label-width="70px">
        <el-form-item label="用户名">
          <el-input v-model="username" placeholder="请输入用户名" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['login-success'])

const username = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('请填写用户名和密码')
    return
  }
  loading.value = true
  try {
    // OAuth2PasswordRequestForm 要求 application/x-www-form-urlencoded
    const body = new URLSearchParams({
      username: username.value,
      password: password.value,
    })
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      ElMessage.error(err.detail || '登录失败')
      return
    }
    const { access_token } = await res.json()
    localStorage.setItem('crf_token', access_token)
    emit('login-success')
  } catch {
    ElMessage.error('网络错误，请检查连接')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--el-bg-color-page);
}
.login-card {
  width: 380px;
}
</style>
```

---

## 2. useApi.js 变更（frontend/src/composables/useApi.js）

### 2.1 新增辅助函数（在现有 `_parseError` 之后添加）

```javascript
// 读取 localStorage 中的 token，构造 Authorization 请求头
function _getAuthHeaders() {
  const token = localStorage.getItem('crf_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// 处理 401 响应：清除 token，触发全局过期事件
function _handle401() {
  localStorage.removeItem('crf_token')
  window.dispatchEvent(new CustomEvent('crf:auth-expired'))
}
```

### 2.2 api.get 变更

现有：
```javascript
async get(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(await _parseError(r))
  return r.json()
},
```

变更后：
```javascript
async get(url) {
  const r = await fetch(url, { headers: _getAuthHeaders() })
  if (r.status === 401) { _handle401(); throw new Error('未授权，请重新登录') }
  if (!r.ok) throw new Error(await _parseError(r))
  return r.json()
},
```

### 2.3 cachedGet 变更

现有 `fetch(url)` 改为 `fetch(url, { headers: _getAuthHeaders() })`，并在 `if (!r.ok)` 前添加：

```javascript
if (r.status === 401) { _pending.delete(url); _handle401(); throw new Error('未授权，请重新登录') }
```

### 2.4 写操作方法（post / put / delete / patch）变更规则

所有写操作的 `fetch` 调用，在现有 options 的 `headers` 中合并 `_getAuthHeaders()`：

```javascript
// 示例：api.post
async post(url, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ..._getAuthHeaders() },
    body: JSON.stringify(data),
  })
  if (r.status === 401) { _handle401(); throw new Error('未授权，请重新登录') }
  if (!r.ok) throw new Error(await _parseError(r))
  return r.status === 204 ? null : r.json()
},
```

> put / delete / patch 按同样规则处理。

### 2.5 新增导出函数

在文件末尾的 `export` 块中添加：

```javascript
export function clearAuthToken() {
  localStorage.removeItem('crf_token')
}
```

---

## 3. App.vue 变更（frontend/src/App.vue）

### 3.1 新增导入

```javascript
import { ref, onMounted } from 'vue'
import LoginView from './components/LoginView.vue'
```

### 3.2 新增响应式状态与事件监听

```javascript
// 检查启动时是否已有 token
const isLoggedIn = ref(!!localStorage.getItem('crf_token'))

onMounted(() => {
  // 监听 useApi.js 触发的 token 过期事件
  window.addEventListener('crf:auth-expired', () => {
    isLoggedIn.value = false
  })
})

function onLoginSuccess() {
  isLoggedIn.value = true
}
```

### 3.3 模板守卫

在现有模板的最外层包裹条件渲染：

```html
<template>
  <LoginView v-if="!isLoggedIn" @login-success="onLoginSuccess" />
  <div v-else>
    <!-- 现有 App.vue 全部内容保持不变 -->
  </div>
</template>
```

> 现有 `<template>` 内容整体不动，仅在外层添加 `v-if="!isLoggedIn"` 判断。

---

## 4. 不需要变更的文件

- `src/router/`（项目无 Vue Router，无需路由守卫）
- `src/main.js`（无需修改，LoginView 由 App.vue 控制）
- 其他 composables（均通过 useApi.js 发请求，已统一注入 headers）
