import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Ensure production builds warn if staging credentials are used
  if (mode === 'production') {
    const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (supabaseUrl && supabaseUrl.includes('txrktvlfrbtuerabpqpe') && !process.env.ALLOW_STAGING_IN_PROD) {
      console.warn('\n⚠️  WARNING: Staging Supabase URL detected in production build mode! Configure production environment variables in your deployment pipeline.\n')
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'BillMate POS',
          short_name: 'BillMate',
          description: 'Offline-First Point of Sale Platform',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any'
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
        }
      })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-icons': ['lucide-react'],
            'vendor-scanner': ['html5-qrcode'],
            'vendor-dexie': ['dexie']
          }
        }
      }
    }
  }
})
