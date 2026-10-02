import preact from '@preact/preset-vite'
import { resolve } from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [preact()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        stage: resolve(import.meta.dirname, 'stage.html'),
        party: resolve(import.meta.dirname, 'party.html'),
      }
    }
  },
  server: {
    port: 3001,
  }
})
