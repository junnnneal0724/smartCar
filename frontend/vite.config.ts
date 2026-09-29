import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 地图数据唯一真实来源：项目根 assets/map.json（与后端共用）
      '@map': fileURLToPath(new URL('../assets/map.json', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    // 允许读取 frontend 之外的 assets/map.json
    fs: { allow: ['..'] },
    watch: {
      // 编辑器/工具链的原子写入临时目录会被 Windows 短暂锁住，监听它们会让 dev server 直接崩掉
      ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/node_modules/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
