import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// api.typesafe.ai doesn't send CORS headers, so browsers can't call it directly.
// The dev and preview servers forward /typesafe/* to it from the same origin.
const proxy: Record<string, ProxyOptions> = {
  '/typesafe': {
    target: 'https://api.typesafe.ai',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/typesafe/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
