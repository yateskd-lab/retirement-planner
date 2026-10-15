import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    port: 3000
  },
  css: {
    devSourcemap: false // Prevents the plugin from reading an undefined property
  }
})
