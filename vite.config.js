// Импортируем утилиты из стандартных пакетов
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { APP_THEME_COLORS, APP_STATUS_BAR_COLORS } from './src/constants/appearance.js'

// Импортируем плагины для Vue и Vuetify
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

import { VitePWA } from 'vite-plugin-pwa'; // Импортируем

import { visualizer } from 'rollup-plugin-visualizer' // Импортируем

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Плагин для поддержки однофайловых компонентов Vue (.vue)
    vue({ 
      template: { transformAssetUrls }
    }),
    // visualizer только для production build (фильтруем false значения)
    ...(process.env.NODE_ENV === 'production' ? [visualizer({
      filename: 'reports/bundle-stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })] : []),
    // Плагин для Vuetify, который обеспечивает tree-shaking (удаление неиспользуемых компонентов)
    // и другие оптимизации.
    // Ссылка на документацию: https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vite-plugin
    vuetify({
      // autoImport: true говорит плагину автоматически импортировать компоненты Vuetify,
      // которые он находит в ваших шаблонах.
      autoImport: true,

      // Эта опция позволяет вам использовать переменные Sass из Vuetify (например, цвета)
      // в ваших собственных .scss файлах.
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),

    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'Каталіцкі малітоўнік',
        short_name: 'Малітоўнік',
        description: 'Каталіцкі малітоўнік для штодзённай малітвы',
        // These colours are used by Android before the app JavaScript starts.
        // They must stay static: the browser reads the manifest before it can
        // determine the current liturgical period or the saved user theme.
        theme_color: APP_STATUS_BAR_COLORS.light,
        background_color: APP_THEME_COLORS.light.background,
        display: 'standalone',
        orientation: 'portrait',
        lang: 'be',
        start_url: '.',
        icons: [
          {
            src: 'web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'web-app-manifest-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'web-app-manifest-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        importScripts: ['/priest-cache-cleanup.js'],
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,txt,woff2,webmanifest}'],
        // Admin/login code remains route-lazy and network-loaded. It must not
        // consume every reader's offline install budget.
        globIgnores: [
          'app-icon-master.png',
          'maria-menu-logo.svg',
          '**/vendor-firebase-auth-*.js',
          '**/vendor-quill-*.{js,css}',
          '**/vendor-markdown-editor-*.js',
          '**/{Admin,DayEditor,ParsedReadingEditor,SongEditor,PrayerCategories,PriestAccess,PrayerForm,Login}-*.{js,css}',
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
              },
            },
          },
          { urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
          {
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-realtime-db',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
              },
              networkTimeoutSeconds: 10,
            },
          },
          { urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
              },
            },
          },
        ],
      }
    }),
  ],
  
  // Этот блок нужен для некоторых старых зависимостей, которые ожидают `process.env`.
  // Оставляем его пустым, чтобы избежать ошибок.
  define: { 'process.env': {} },

  // ✅ НАСТРОЙКА CSS ДЛЯ РЕШЕНИЯ ПРОБЛЕМЫ С SASS
  css: {
    preprocessorOptions: {
      scss: {
        // Эта опция явно указывает использовать современный Javascript API для Sass,
        // что убирает предупреждение 'Deprecation Warning [legacy-js-api]'.
        api: 'modern',
      },
    },
  },

  resolve: {
    // Настройка псевдонима '@' для удобного импорта из папки 'src'
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    // Расширения файлов, которые Vite будет пытаться распознать при импорте без расширения
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },

  // Vuetify's auto-import plugin adds these imports only when the lazy route is
  // transformed. Bundle them at startup to keep the dependency hash stable.
  optimizeDeps: {
    include: [
      'vuetify/components/VAvatar',
      'vuetify/components/VBadge',
      'vuetify/components/VSkeletonLoader',
      'vuetify/components/transitions',
    ],
  },
  
  // Настройки сервера для разработки
  server: {
    port: 3000,
  },

  build: {
    // The Markdown editor is route-lazy and intentionally kept in one chunk:
    // CodeMirror and Lezer contain cycles that break when manually separated.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Split the main bundle into smaller vendor chunks to improve
        // initial load time. Each chunk is loaded on-demand by the router.
        manualChunks(id) {
          // Quill rich-text editor (~200 kB) — only used in edit forms
          if (id.includes('node_modules/quill') || id.includes('node_modules/@vueup/vue-quill')) {
            return 'vendor-quill';
          }
          // CodeMirror packages and Lezer parsers have circular dependencies.
          // Splitting them into separate manual chunks can make an imported
          // binding execute before it is initialized in production builds.
          if (
            id.includes('node_modules/codemirror') ||
            id.includes('node_modules/@codemirror') ||
            id.includes('node_modules/@lezer')
          ) {
            return 'vendor-markdown-editor';
          }
          // moment.js with locales (~300 kB)
          if (id.includes('node_modules/moment')) {
            return 'vendor-moment';
          }
          // The component library is used on the first screen, but separating it
          // from Vue lets the browser cache the two libraries independently.
          if (id.includes('node_modules/vuetify')) {
            return 'vendor-vuetify';
          }
          // Firebase services are sizeable and have different loading paths:
          // authentication is deferred, while Firestore is used by the public app.
          if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth')) {
            return 'vendor-firebase-auth';
          }
          if (id.includes('node_modules/@firebase/firestore') || id.includes('node_modules/firebase/firestore')) {
            return 'vendor-firebase-firestore';
          }
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')) {
            return 'vendor-firebase-core';
          }
          if (id.includes('node_modules/@sentry')) {
            return 'vendor-sentry';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'vendor-date-fns';
          }
          if (id.includes('node_modules/markdown-it') || id.includes('node_modules/entities')) {
            return 'vendor-markdown';
          }
          // Vue ecosystem (vue, vue-router, pinia, vuefire)
          if (
            id.includes('node_modules/vue') ||
            id.includes('node_modules/@vue') ||
            id.includes('node_modules/pinia') ||
            id.includes('node_modules/vuefire')
          ) {
            return 'vendor-vue';
          }
        },
      },
    },
  },
})
