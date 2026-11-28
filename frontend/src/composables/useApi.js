// 解析后端错误响应
// 兼容 FastAPI/Pydantic 的数组型 detail（422 Unprocessable Content）
async function _parseError(r) {
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    const detail = j.detail;
    if (!detail) return { message: text, code: j.code };
    // Pydantic 验证错误：detail 是数组，每项含 loc/msg/type
    if (Array.isArray(detail)) {
      return {
        message: detail
          .map((e) => {
            const loc = Array.isArray(e.loc) ? e.loc.join(' → ') : '';
            return loc ? `${loc}: ${e.msg}` : e.msg;
          })
          .join('；'),
        code: j.code,
      };
    }
    // 普通字符串 detail
    return { message: typeof detail === 'string' ? detail : text, code: j.code };
  } catch {
    return { message: text };
  }
}

const _REFRESHED_TOKEN_HEADER = 'x-refreshed-token';

// ── 部署 base ──
// Vite 构建期注入 BASE_URL（等于 vite.config.js 的 base，默认 '/'）。
// node --test 直接 import 本模块时 import.meta.env 不存在 → 退回根路径，apiUrl 为恒等函数。

// 工厂：'/' 或相对 base（如 './'）→ 恒等；'/crf/' → 前缀 '/crf'
export function makeApiUrl(base) {
  const _basePrefix = /^\/.+/.test(String(base)) ? String(base).replace(/\/+$/, '') : '';
  // 给同源 API 路径补部署前缀：'/api/x' → '/crf/api/x'；根路径部署下原样返回
  return function apiUrl(path) {
    if (!_basePrefix || typeof path !== 'string') return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path;
    if (!path.startsWith('/')) return path;
    if (path === _basePrefix || path.startsWith(_basePrefix + '/')) return path;
    return _basePrefix + path;
  };
}

const _viteEnv = typeof import.meta !== 'undefined' && import.meta ? import.meta.env : undefined;
const apiUrl = makeApiUrl((_viteEnv && _viteEnv.BASE_URL) || '/');

// 会话令牌守卫（跨栈契约 §3 第 4、5 条）：请求先记下发起时用的令牌，
// 响应到达时只有令牌未变（未登出 / 未换用户 / 无他标签页登录）才允许写回刷新令牌或触发登出，
// 免得迟到的响应污染新会话。未带令牌的请求捕获值为 null，按普通值参与比较。
let _knownSessionToken;
let _sessionGeneration = 0;

// 刷新令牌仍属于同一会话；登出/换账号则使缓存和编辑中异步回调一起失效。
export function getApiSessionGeneration() {
  const current = localStorage.getItem('crf_token');
  if (current !== _knownSessionToken) {
    _knownSessionToken = current;
    _sessionGeneration += 1;
    clearAllCache();
  }
  return _sessionGeneration;
}

function _buildRequestAuth(extraHeaders = {}) {
  getApiSessionGeneration();
  const sentToken = localStorage.getItem('crf_token');
  return {
    sentToken,
    headers: sentToken ? { ...extraHeaders, Authorization: `Bearer ${sentToken}` } : { ...extraHeaders },
  };
}

function _isCurrentSession(sentToken) {
  return localStorage.getItem('crf_token') === sentToken;
}

function _getAuthHeaders() {
  return _buildRequestAuth().headers;
}

export { _getAuthHeaders as getAuthHeaders, apiUrl };

function _storeRefreshedToken(r) {
  const refreshedToken = r.headers.get(_REFRESHED_TOKEN_HEADER);
  if (refreshedToken) {
    localStorage.setItem('crf_token', refreshedToken);
    _knownSessionToken = refreshedToken;
  }
}

function _handle401() {
  localStorage.removeItem('crf_token');
  window.dispatchEvent(new CustomEvent('crf:auth-expired'));
}

function _createHttpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (typeof code === 'string') error.code = code;
  return error;
}

async function _checkStatus(r, sentToken) {
  if (r.status === 401) {
    if (_isCurrentSession(sentToken)) _handle401();
    throw _createHttpError('登录已过期，请重新登录', r.status);
  }
  if (!r.ok) {
    const { message, code } = await _parseError(r);
    throw _createHttpError(message || (r.status === 429 ? '操作过于频繁，请稍后重试' : '请求失败'), r.status, code);
  }
  if (_isCurrentSession(sentToken)) _storeRefreshedToken(r);
}

// ── 内存缓存层 ──
const _cache = new Map(); // key → { data, ts }
const _pending = new Map(); // key → Promise（去重并发请求）
// 缓存世代：任何 invalidate/clear 都会自增，在途 cachedGet 写回前比对世代，
// 防止「写操作先失效缓存、旧请求后到」把过期数据重新写进 30s TTL 缓存（2.10 根因 b）
let _cacheGeneration = 0;

// 按URL前缀清除缓存
function invalidateCache(urlPrefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(urlPrefix)) _cache.delete(key);
  }
  for (const key of _pending.keys()) {
    if (key.startsWith(urlPrefix)) _pending.delete(key);
  }
  _cacheGeneration += 1;
}

// 清除全部缓存
function clearAllCache() {
  _cache.clear();
  _pending.clear();
  _cacheGeneration += 1;
}

// 数据变更后自动失效相关缓存
function _autoInvalidate(url) {
  // /api/projects/1/field-definitions → 失效 /api/projects/1/
  // /api/projects/1 → 失效 /api/projects
  const parts = url.split('/');
  if (parts.length >= 4) {
    // 失效到 /api/projects/{id}/ 级别
    invalidateCache(parts.slice(0, 4).join('/'));
  }
  // 同时失效完整URL
  invalidateCache(url);
}

// 安全解析 JSON 响应，处理代理/网关返回非 JSON 内容的情况
async function _safeJsonParse(r) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`服务器返回非 JSON 格式: ${text.slice(0, 100)}...`);
  }
}

function _metadataOptions(options = {}) {
  if (typeof options.revision !== 'string' || !options.revision) {
    throw _createHttpError(
      '缺少已加载的设计版本，请刷新页面后重试（未提交输入不会自动保存）',
      428,
      'PRECONDITION_REQUIRED',
    );
  }
  return { ...options, withMetadata: true, headers: { ...options.headers, 'If-Match': options.revision } };
}

async function _readResponse(r, options = {}, { mutation = false } = {}) {
  try {
    if (options.responseType === 'original') {
      const sha256 = r.headers.get('X-CRF-Original-SHA256');
      if (!/^[0-9a-f]{64}$/.test(sha256 || '')) {
        throw _createHttpError('未收到原件校验信息，未下载文件', 500, 'BASELINE_INTEGRITY_FAILED');
      }
      const blob = await r.blob();
      if (!blob.size || blob.size > 64 * 1024 * 1024) {
        throw _createHttpError('原件大小无效，未下载文件', 500, 'BASELINE_INTEGRITY_FAILED');
      }
      return { blob, sha256 };
    }
    const data = r.status === 204 ? null : await _safeJsonParse(r);
    if (!options.withMetadata) {
      // F1 过渡元数据：仅随响应原样取回前后标签；缺失/不完整是“无链边”的成功业务响应，
      // 绝不报错、不补读、不重试。链路校验交给 designRevision 侧。
      if (options.withTransitionMetadata) {
        return {
          data,
          beforeRevision: r.headers.get('X-CRF-Design-Before-Revision') || null,
          revision: r.headers.get('X-CRF-Design-Revision') || null,
        };
      }
      return data;
    }
    const revision = r.headers.get('X-CRF-Design-Revision');
    if (mutation && !revision) {
      throw _createHttpError(
        '操作已提交，但未收到设计版本，请刷新后核对，勿重复提交',
        r.status,
        'REVISION_UNAVAILABLE',
      );
    }
    return { data, revision };
  } catch (error) {
    if (mutation && (options.withMetadata || options.withTransitionMetadata)) error.committed = true;
    throw error;
  }
}

// 旧方法默认仍返回业务响应体；新增方法将同一响应的 body/tag 作为一个整体返回。
export const api = {
  async get(url, options = {}) {
    const { sentToken, headers } = _buildRequestAuth();
    const r = await fetch(apiUrl(url), {
      headers,
      ...(options.responseType === 'original' ? { cache: 'no-store' } : {}),
    });
    await _checkStatus(r, sentToken);
    return _readResponse(r, options);
  },

  async cachedGet(url, ttl = 30000, options = {}) {
    getApiSessionGeneration();
    const cached = _cache.get(url);
    if (cached && Date.now() - cached.ts < ttl) {
      return options.withMetadata ? { data: cached.data, revision: cached.revision } : cached.data;
    }
    let p = _pending.get(url);
    if (!p) {
      const generation = _cacheGeneration;
      const { sentToken, headers } = _buildRequestAuth();
      p = fetch(apiUrl(url), { headers })
        .then(async (r) => {
          await _checkStatus(r, sentToken);
          const envelope = await _readResponse(r, { withMetadata: true });
          if (generation === _cacheGeneration) {
            _cache.set(url, { ...envelope, ts: Date.now() });
          }
          return envelope;
        })
        .finally(() => {
          // 老请求不能清掉 invalidate 后创建的新请求。
          if (_pending.get(url) === p) _pending.delete(url);
        });
      _pending.set(url, p);
    }
    const envelope = await p;
    return options.withMetadata ? envelope : envelope.data;
  },

  getWithMetadata(url) {
    return api.get(url, { withMetadata: true });
  },
  getOriginal(url) {
    return api.get(url, { responseType: 'original' });
  },
  cachedGetWithMetadata(url, ttl = 30000) {
    return api.cachedGet(url, ttl, { withMetadata: true });
  },
  async postWithMetadata(url, data, options = {}) {
    return api.post(url, data, _metadataOptions(options));
  },
  async putWithMetadata(url, data, options = {}) {
    return api.put(url, data, _metadataOptions(options));
  },
  async patchWithMetadata(url, data, options = {}) {
    return api.patch(url, data, _metadataOptions(options));
  },
  async delWithMetadata(url, options = {}) {
    return api.del(url, _metadataOptions(options));
  },
  // F1 过渡写入：仅用于「仅失效」管理写入（快捷新增字典/单位、整表复制）。
  // 不携带 If-Match、不取标签、不重试；复用既有 POST 鉴权/子路径/状态检查/缓存失效边界。
  async postWithTransitionMetadata(url, data) {
    return api.post(url, data, { withTransitionMetadata: true });
  },

  invalidateCache,
  clearAllCache,
  async post(url, data, options = {}) {
    const { sentToken, headers } = _buildRequestAuth({ 'Content-Type': 'application/json', ...options.headers });
    const r = await fetch(apiUrl(url), {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    await _checkStatus(r, sentToken);
    _autoInvalidate(url);
    return _readResponse(r, options, { mutation: true });
  },
  async put(url, data, options = {}) {
    const { sentToken, headers } = _buildRequestAuth({ 'Content-Type': 'application/json', ...options.headers });
    const r = await fetch(apiUrl(url), {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    await _checkStatus(r, sentToken);
    _autoInvalidate(url);
    return _readResponse(r, options, { mutation: true });
  },
  async patch(url, data, options = {}) {
    const { sentToken, headers } = _buildRequestAuth({ 'Content-Type': 'application/json', ...options.headers });
    const r = await fetch(apiUrl(url), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    await _checkStatus(r, sentToken);
    _autoInvalidate(url);
    for (const prefix of options.invalidate || []) {
      invalidateCache(prefix);
    }
    return _readResponse(r, options, { mutation: true });
  },
  async del(url, options = {}) {
    const hasData = Object.prototype.hasOwnProperty.call(options, 'data');
    const { sentToken, headers } = _buildRequestAuth({
      ...(hasData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    });
    const request = { method: 'DELETE', headers };
    if (hasData) request.body = JSON.stringify(options.data);
    const r = await fetch(apiUrl(url), request);
    await _checkStatus(r, sentToken);
    _autoInvalidate(url);
    if (options.withMetadata || options.withResponse) return _readResponse(r, options, { mutation: true });
  },
};

// 生成6位大写字母+数字随机后缀（36^6 ≈ 21亿种，大幅降低同秒批量碰撞概率）
function _genRandSuffix() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// 生成字段变量名：FIELD_YYYYMMDDHHmmss_XXXXXX
export function genFieldVarName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `FIELD_${ts}_${_genRandSuffix()}`;
}

// 生成实体默认 code：PREFIX_YYYYMMDDHHmmss_XXXXXX
export function genCode(prefix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${prefix}_${ts}_${_genRandSuffix()}`;
}

// 截断引用列表显示
export function truncRefs(arr, max = 5, sep = '\n') {
  if (arr.length <= max) return arr.join(sep);
  return arr.slice(0, max).join(sep) + sep + `...等共${arr.length}条`;
}

// 通用全选/取消全选工具函数
export function toggleSelectAll(listRef, selectedRef, keyFn) {
  const list = listRef.value || [];
  if (list.length === 0) {
    selectedRef.value = [];
    return;
  }

  const targetKeys = list.map(keyFn);
  const currentSelected = selectedRef.value || [];
  // 类型安全比较：统一转字符串避免 number/string 不匹配
  const selectedStrs = new Set(currentSelected.map(String));
  const isAllSelected = targetKeys.every((k) => selectedStrs.has(String(k)));

  // 强制替换为新数组引用，确保 Vue 响应式检测到变化
  selectedRef.value = isAllSelected ? [] : [...targetKeys];
}
