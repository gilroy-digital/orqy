import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev ports are registered in ~/coding/PORTS.md: 3458 vite, 3457 backend.
// Overridable so a second instance can be run without editing this file.
const PORT = Number(process.env.VITE_PORT) || 3458;
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3457';

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
