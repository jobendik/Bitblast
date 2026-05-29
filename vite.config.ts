import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: '.',
  // '/' for local dev; the GitHub Pages workflow sets BASE_PATH=/Bitblast/.
  base: process.env.BASE_PATH || '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 600, // Three.js is ~578KB, this is expected
    rollupOptions: {
      output: {
        manualChunks: {
          // Core 3D engine
          'three': ['three'],
          // AI and pathfinding
          'yuka': ['yuka'],
          // Networking (if used)
          'network': ['socket.io-client'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@entities': fileURLToPath(new URL('./src/entities', import.meta.url)),
      '@systems': fileURLToPath(new URL('./src/systems', import.meta.url)),
      '@config': fileURLToPath(new URL('./src/config', import.meta.url)),
      '@types': fileURLToPath(new URL('./src/types', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0', // Allow network access for mobile testing
    port: 5200,
    open: true,
  },
});
