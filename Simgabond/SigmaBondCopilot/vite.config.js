import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Chunk size warning threshold raised — this is a large single-file app by design
    chunkSizeWarningLimit: 2000,
  },
})
