import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Phone demo (see README "Demo on phones"): with VITE_API=/api the browser talks only to Vite,
// and Vite forwards /api to the backend, so one https tunnel (cloudflared) serves the whole
// app to phones. allowedHosts lets the tunnel's hostname through.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    publicDir: 'photo',
    server: {
      allowedHosts: true,
      proxy: { '/api': env.VITE_PROXY_TARGET || 'http://localhost:5001' },
    },
  };
});
