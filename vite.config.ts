import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/reddit-api': {
        target: 'https://www.reddit.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/reddit-api/, ''),
        headers: {
          'User-Agent': 'RedditPainPointExtractor/1.0 (research tool)',
        },
      },
    },
  },
});
