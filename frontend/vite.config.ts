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
            '@fullcalendar/core', '@fullcalendar/daygrid', '@fullcalendar/interaction',
            '@fullcalendar/list', '@fullcalendar/react', '@fullcalendar/rrule',
            '@fullcalendar/timegrid', 'rrule',
          ],
        },
      },
    },
  },
})
