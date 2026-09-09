import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // 把 react / react-dom 单独拆成 vendor chunk:它们几乎不变,
        // 应用代码改动后仍能命中浏览器对该 chunk 的长缓存(/assets/* immutable)
        manualChunks: (id: string) =>
          /node_modules\/(react|react-dom|scheduler)\//.test(id)
            ? 'vendor-react'
            : undefined,
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      // 开发时前后端分开跑,整个 /api 代理到本地服务(npm run dev:server),
      // dev 与生产因此用同一套路径,天气/节假日反代也一并交给服务端。
      // 不开 changeOrigin:后端不靠 Host 头做任何路由判断,开了反而会把 Host
      // 改成 127.0.0.1:8787 而 Origin 仍是 localhost:3000,触发后端的同源校验拦截写请求
      '/api': {
        target: 'http://127.0.0.1:8787',
      },
    },
  },
}));
