import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    }
  }
})
