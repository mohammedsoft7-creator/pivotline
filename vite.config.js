import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'TELEGRAM_')
  return {
    base: './',
    plugins: [react()],
    server: {
      proxy: {
        '/api/telegram': 'http://127.0.0.1:' + (env.TELEGRAM_PORT || 8787),
      },
    },
  }
})
