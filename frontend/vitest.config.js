import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// 组件挂载测试专用配置：只收集 tests/component/**/*.spec.js，与 node --test 的 tests/*.test.js 不相交。
// 独立文件不继承 vite.config.js（构建 / 开发服务器配置保持零改动），故需显式加载 Vue 插件编译 .vue。
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/component/**/*.spec.js'],
    setupFiles: ['tests/component/setup.js'],
  },
});
