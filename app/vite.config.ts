import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    proxy: { '/api': 'http://127.0.0.1:8411', '/healthz': 'http://127.0.0.1:8411' },
    fs: {
      deny: [
        '**/.env*',
        '**/*.{crt,pem}',
        '**/.git/**',
        '**/server/**',
        '**/fixtures/**',
        '**/tests/**',
        '**/data/**',
        '**/.runtime/**',
        '**/*.backup-*',
      ],
    },
  },
  build: { outDir: 'public', emptyOutDir: true, sourcemap: false },
});
