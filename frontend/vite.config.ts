import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import react from '@vitejs/plugin-react-swc' // <- plus rapide, optionnel
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  envPrefix: ['VITE_'], // n'expose que les vars qui commencent par VITE_
  server: {
    host: true, // 0.0.0.0
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5174,
  },
  build: {
    target: 'es2020',
    sourcemap: true, // utile pour déboguer en prod si besoin -> mets false si tu veux plus léger
    outDir: 'dist',
    assetsDir: 'assets',
    cssMinify: true,
  },
  // optimise les deps au premier démarrage (optionnel)
  optimizeDeps: {
    include: [],
  },
})