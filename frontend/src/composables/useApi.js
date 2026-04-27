// 解析后端错误响应
// 兼容 FastAPI/Pydantic 的数组型 detail（422 Unprocessable Content）
async function _parseError(r) {
  const text = await r.text()
  try {
    const j = JSON.parse(text)
    const detail = j.detail
    if (!detail) return text
    // Pydantic 验证错误：detail 是数组，每项含 loc/msg/type
    if (Array.isArray(detail)) {
      return detail.map((e) => {
        const loc = Array.isArray(e.loc) ? e.loc.join(' → ') : ''
        return loc ? `${loc}: ${e.msg}` : e.msg
      }).join('；')
    }
    // 普通字符串 detail
    return typeof detail === 'string' ? detail : text
  } catch {
    return text
  }
}

function _getAuthHeaders() {
  const token = localStorage.getItem('crf_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export { _getAuthHeaders as getAuthHeaders }

function _handle401() {
  localStorage.removeItem('crf_token')
  window.dispatchEvent(new CustomEvent('crf:auth-expired'))
}

function _createHttpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

async function _checkStatus(r) {
  if (r.status === 401) {
    _handle401()
    throw _createHttpError('登录已过期，请重新登录', r.status)
  }
  if (r.status === 429) {
    const detail = await _parseError(r)
    throw _createHttpError(detail || '操作过于频繁，请稍后重试', r.status)
  }
  if (!r.ok) throw _createHttpError(await _parseError(r), r.status)
}

// ── 内存缓存层 ──
const _cache = new Map()   // key → { data, ts }
const _pending = new Map() // key → Promise（去重并发请求）

// 按URL前缀清除缓存
function invalidateCache(urlPrefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(urlPrefix)) _cache.delete(key)
  }
  for (const key of _pending.keys()) {
    if (key.startsWith(urlPrefix)) _pending.delete(key)
  }
}

// 清除全部缓存
function clearAllCache() {
  _cache.clear()
  _pending.clear()
}

// 数据变更后自动失效相关缓存
function _autoInvalidate(url) {
  // /api/projects/1/field-definitions → 失效 /api/projects/1/
  // /api/projects/1 → 失效 /api/projects
  const parts = url.split('/')
  if (parts.length >= 4) {
    // 失效到 /api/projects/{id}/ 级别
    invalidateCache(parts.slice(0, 4).join('/'))
  }
  // 同时失效完整URL
  invalidateCache(url)
}

// 安全解析 JSON 响应，处理代理/网关返回非 JSON 内容的情况
async function _safeJsonParse(r) {
  const text = await r.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`服务器返回非 JSON 格式: ${text.slice(0, 100)}...`)
  }
}

// API 请求工具
export const api = {
  async get(url) {
    const r = await fetch(url, { headers: _getAuthHeaders() })
    await _checkStatus(r)
    return _safeJsonParse(r)
  },

  // 带缓存的GET，TTL默认30秒
  async cachedGet(url, ttl = 30000) {
    const cached = _cache.get(url)
    if (cached && Date.now() - cached.ts < ttl) return cached.data

    // Promise去重：同一URL并发只发一次请求
    if (_pending.has(url)) return _pending.get(url)

    const p = fetch(url, { headers: _getAuthHeaders() }).then(async (r) => {
      await _checkStatus(r)
      const data = await _safeJsonParse(r)
      _cache.set(url, { data, ts: Date.now() })
      _pending.delete(url)
      return data
    }).catch((err) => {
      _pending.delete(url)
      throw err
    })
    _pending.set(url, p)
    return p
  },

  invalidateCache,
  clearAllCache,
  async post(url, data) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeaders() },
      body: JSON.stringify(data),
    })
    await _checkStatus(r)
    _autoInvalidate(url)
    return r.status === 204 ? null : _safeJsonParse(r)
  },
  async put(url, data) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeaders() },
      body: JSON.stringify(data),
    })
    await _checkStatus(r)
    _autoInvalidate(url)
    return r.status === 204 ? null : _safeJsonParse(r)
  },
  async patch(url, data) {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeaders() },
      body: JSON.stringify(data),
    })
    await _checkStatus(r)
    _autoInvalidate(url)
    return r.status === 204 ? null : _safeJsonParse(r)
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE', headers: _getAuthHeaders() })
    await _checkStatus(r)
    _autoInvalidate(url)
  },
}

// 生成6位大写字母+数字随机后缀（36^6 ≈ 21亿种，大幅降低同秒批量碰撞概率）
function _genRandSuffix() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('')
}

// 生成字段变量名：FIELD_YYYYMMDDHHmmss_XXXXXX
export function genFieldVarName() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `FIELD_${ts}_${_genRandSuffix()}`
}

// 生成实体默认 code：PREFIX_YYYYMMDDHHmmss_XXXXXX
export function genCode(prefix) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${prefix}_${ts}_${_genRandSuffix()}`
}

// 截断引用列表显示
export function truncRefs(arr, max = 5, sep = '\n') {
  if (arr.length <= max) return arr.join(sep)
  return arr.slice(0, max).join(sep) + sep + `...等共${arr.length}条`
}

// 通用全选/取消全选工具函数
export function toggleSelectAll(listRef, selectedRef, keyFn) {
  const list = listRef.value || []
  if (list.length === 0) {
    selectedRef.value = []
    return
  }

  const targetKeys = list.map(keyFn)
  const currentSelected = selectedRef.value || []
  // 类型安全比较：统一转字符串避免 number/string 不匹配
  const selectedStrs = new Set(currentSelected.map(String))
  const isAllSelected = targetKeys.every((k) => selectedStrs.has(String(k)))

  // 强制替换为新数组引用，确保 Vue 响应式检测到变化
  selectedRef.value = isAllSelected ? [] : [...targetKeys]
}
