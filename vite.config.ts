import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 4340, strictPort: true },
  build: { sourcemap: false, target: 'es2022' },
  define: { __HEXIVERSE_VERSION__: JSON.stringify('0.1.0-alpha.1') }
});
