import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const env = { ...loadEnv(mode, root, ''), ...process.env };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.ARCHIMESH_WEB_PORT ?? 5173),
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${Number(env.PORT ?? 3000)}` },
    },
  };
});
