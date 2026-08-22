import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2434,
    host: '0.0.0.0'  // Allow external connections
  },
  // Add this for production build
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})