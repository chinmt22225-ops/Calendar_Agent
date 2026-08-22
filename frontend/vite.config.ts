import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-markdown': ['react-markdown'],
          'vendor-calendar': [
            '@schedule-x/calendar', '@schedule-x/drag-and-drop', '@schedule-x/event-recurrence',
            '@schedule-x/react', '@schedule-x/resize', '@schedule-x/theme-default',
            'temporal-polyfill',
          ],
        },
      },
    },
  },
})
