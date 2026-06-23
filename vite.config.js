import { defineConfig } from 'vite'

export default defineConfig({
  base: '/lacdemo/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})