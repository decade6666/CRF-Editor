import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// 归一化部署 base：未设置或 '/' 保持根路径；'/crf' / 'crf/' 均归一为 '/crf/'；
// 绝对 URL base（CDN 部署，如 https://cdn.example.com/crf/）原样透传
function normalizeBase(raw) {
  if (!raw) return '/'
  let b = String(raw).trim()
  if (!b || b === '/') return '/'
  if (b.includes('://')) return b
  if (!b.startsWith('/')) b = '/' + b
  if (!b.endsWith('/')) b += '/'
  return b.replace(/\/{2,}/g, '/')
}

export default defineConfig(({ mode }) => {
  // loadEnv 会合并 process.env 中带 VITE_ 前缀的变量，故 shell 内联与 .env.local 均生效
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const base = normalizeBase(env.VITE_BASE_PATH)
  // '/crf/' → '/crf'；根路径 → ''（dev proxy 退化为原来的 '/api' 且无需 rewrite）；
  // 绝对 URL base（CDN）下 dev proxy 无本地前缀可剥，保持原 '/api'
  const basePrefix = base.startsWith('/') && base !== '/' ? base.slice(0, -1) : ''

  return {
    base,
    plugins: [vue()],
    build: {
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-vue': ['vue'],
            'vendor-ep': ['element-plus'],
            'vendor-misc': ['sortablejs', 'vuedraggable'],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: ['test.decadej.com'],
      proxy: {
        // 跟随 base：根路径代理 /api，子路径代理 /crf/api 并剥掉前缀
        [`${basePrefix}/api`]: {
          target: 'http://127.0.0.1:8888',
          changeOrigin: true,
          ...(basePrefix ? { rewrite: (p) => p.slice(basePrefix.length) } : {}),
        },
      },
    },
  }
})
