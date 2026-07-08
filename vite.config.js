import { defineConfig } from 'vite';

const host = process.env.SMART_MISTAKE_LAB_HOST || '127.0.0.1';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://${host}:8765`,
        changeOrigin: true,
      },
    },
  },
});
