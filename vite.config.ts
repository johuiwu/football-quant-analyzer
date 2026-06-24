/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Electron 生产模式: 使用相对路径确保 Express 能正确托管
    base: "./",
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    optimizeDeps: {
      include: ['lucide-react'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true'
        ? { port: 24679 }
        : false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? undefined : {
        ignored: ['**/debug/**', '**/debug-*', '**/debug_*', '**/src/data/worldcup_team_stats.json', '**/src/data/worldcup_standings.json']
      },
      // API 代理配置：将 /api 请求转发到后端服务器
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/__tests__/vitest.setup.ts'],
      css: true,
    },
  };
});
