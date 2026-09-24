import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit der Build auch unter github.io/<Repo>/ läuft
  base: './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 4000 },
});
