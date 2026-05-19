import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    base: './',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    },
    sourcemap: true
  },
  server: {
    port: 5173,
    host: true
  },
  // Ensure public assets are copied
  publicDir: 'public',
  // Base URL for production (relative for Electron)
  base: process.env.NODE_ENV === 'production' ? './' : '/'
})
