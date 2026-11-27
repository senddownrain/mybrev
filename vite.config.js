// Импортируем утилиты из стандартных пакетов
import { defineConfig, loadEnv } from 'vite'
import { validateFirebaseWebConfig } from './scripts/lib/firebase-web-config.mjs'
import { fileURLToPath, URL } from 'node:url'
import { APP_THEME_COLORS, APP_PWA_MANIFEST_THEME_COLOR } from './src/constants/appearance.js'

// Импортируем плагины для Vue и Vuetify
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

import { VitePWA } from 'vite-plugin-pwa'; // Импортируем

import { visualizer } from 'rollup-plugin-visualizer' // Импортируем

// Keep the shell and the ordinary readers available across service-worker
// updates. Other hashed assets enter the runtime cache only when opened.
const offlineReaders = new Set([
  'src/layouts/default/Default.vue', 'src/layouts/default/BottomNav.vue',
  'src/layouts/default/ReadingsBottomNav.vue', 'src/layouts/default/NavigationDrawer.vue',
  'src/layouts/default/OraBar.vue', 'src/layouts/simple/One.vue',
  'src/components/ItemsList.vue', 'src/components/OrasList.vue', 'src/components/common/CustomDatePicker.vue',
  'src/components/readings/ReadingsView.vue', 'src/components/prayers/PrayerView.vue',
  'src/components/prayers/PrayersList.vue', 'src/views/Prayers.vue', 'src/views/FavoritePrayers.vue',
  'src/components/BackToTop.vue', 'src/components/common/FeedbackPrompt.vue',
  'src/services/liturgicalContentService.js', 'src/services/readingsService.js',
  // An offline launch still needs to register the calendar's online listener.
  'src/services/ordoCalendarService.js',
]);

function collectOfflineAssets(root, entries) {
  const base = root.replaceAll('\\', '/');
  return {
    name: 'mybrev-offline-assets',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const sources = Object.fromEntries(Object.values(bundle || {}).filter((chunk) => chunk.type === 'chunk'
          && chunk.facadeModuleId).map((chunk) => [chunk.facadeModuleId.replaceAll('\\', '/').replace(base, ''), chunk.fileName]));
        const hours = Object.fromEntries(Object.entries(sources).filter(([source]) => /^src\/components\/oras\/[^/]+\.vue$/.test(source))
          .map(([source, file]) => [source.split('/').at(-1).slice(0, -4).toLowerCase(), '/' + file]));
        if (!hours.laudes) return [];
        hours.invitatorium = hours.invit;
        const layout = ['src/layouts/simple/One.vue', 'src/layouts/default/OraBar.vue']
          .map((source) => sources[source]).filter(Boolean).map((file) => '/' + file);
        return [{
          tag: 'script', injectTo: 'head-prepend',
          children: `(() => {
            const hour = location.pathname.match(/^\\/day\\/[^/]+\\/ora\\/[^/]+\\/([^/]+)\\/?$/)?.[1];
            const files = ${JSON.stringify(hours)};
            if (!Object.hasOwn(files, hour)) return;
            for (const href of [...${JSON.stringify(layout)}, files[hour]]) {
              const link = document.createElement('link');
              link.rel = 'modulepreload';
              link.crossOrigin = 'anonymous';
              link.href = href;
              document.head.appendChild(link);
            }
          })()`,
        }];
      },
    },
    generateBundle(_options, bundle) {
      const add = (chunk) => {
        if (entries.has(chunk.fileName)) return;
        entries.add(chunk.fileName);
        for (const file of chunk.viteMetadata?.importedCss || []) entries.add(file);
        for (const file of chunk.viteMetadata?.importedAssets || []) entries.add(file);
        for (const file of chunk.imports) if (bundle[file]?.type === 'chunk') add(bundle[file]);
      };
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const source = chunk.facadeModuleId?.replaceAll('\\', '/').replace(base, '');
        if (chunk.isEntry || offlineReaders.has(source) || source?.startsWith('src/components/oras/')) add(chunk);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') validateFirebaseWebConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  const offlineAssets = new Set();
  return {
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

    collectOfflineAssets(fileURLToPath(new URL('./', import.meta.url)), offlineAssets),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      includeManifestIcons: false,
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'Каталіцкі малітоўнік',
        short_name: 'Малітоўнік',
        description: 'Каталіцкі малітоўнік для штодзённай малітвы',
        // Android may use the manifest colour for native PWA chrome, including
        // the 3-button navigation bar. Use neutral graphite instead of the light
        // theme's brown. The in-page meta theme-color remains dynamic, so the
        // status bar still follows light/dark/Marian after JavaScript starts.
        theme_color: APP_PWA_MANIFEST_THEME_COLOR,
        background_color: APP_THEME_COLORS.light.background,
        display: 'standalone',
        orientation: 'portrait',
        lang: 'be',
        start_url: '.',
        // A changed icon URL tells Chrome 144+ to re-fetch installed PWA icons.
        // Keep the manifest URL, start_url and implicit identity unchanged.
        icons: [
          {
            src: 'web-app-manifest-192x192.png?v=20261106-color',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'web-app-manifest-512x512.png?v=20261106-color',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'web-app-manifest-maskable-192x192.png?v=20261106-color',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'web-app-manifest-maskable-512x512.png?v=20261106-color',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        importScripts: ['/priest-cache-cleanup.js'],
        cleanupOutdatedCaches: true,
        // Use the installed shell offline. A recovery navigation asks Hosting
        // for a fresh shell, and asset URLs must never receive an HTML fallback.
        navigateFallbackDenylist: [/^\/(?:privacy(?:\.html)?\/?(?:\?|$)|assets\/)/, /\/[^/?]*\.[^/?]+(?:\?|$)/, /[?&]app-retry=/],
        globPatterns: ['index.html', 'registerSW.js', 'manifest.webmanifest', 'assets/*.{js,css,woff2}'],
        manifestTransforms: [(entries) => ({
          manifest: entries.filter(({ url }) => !url.startsWith('assets/') || offlineAssets.has(url)),
        })],
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url, request }) => sameOrigin && url.pathname.startsWith('/assets/')
              && ['script', 'style', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mybrev-opened-assets-v2',
              cacheableResponse: { statuses: [200] },
              plugins: [{
                cacheWillUpdate: async ({ request, response }) => {
                  const type = response.headers.get('content-type') || '';
                  const types = {
                    script: /\b(?:java|ecma)script\b/i,
                    style: /^text\/css\b/i,
                    font: /^(?:font\/|application\/(?:font-|octet-stream))/i,
                  };
                  if (response.status !== 200 || !types[request.destination]?.test(type)) return null;
                  if (request.destination !== 'script' || !response.body) return response;
                  const reader = response.clone().body.getReader();
                  try {
                    const { value } = await reader.read();
                    const prefix = new globalThis.TextDecoder().decode(value?.subarray(0, 200));
                    return /^\s*(?:<!doctype html|<html[\s>])/i.test(prefix) ? null : response;
                  } finally {
                    // Awaiting cancellation of a tee can wait on the consumer.
                    reader.cancel().catch(() => {});
                  }
                },
              }],
              expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
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
          // Firebase services are sizeable and have different loading paths:
          // authentication is deferred, while Firestore is used by the public app.
          if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth')) {
            return 'vendor-firebase-auth';
          }
          if (id.includes('node_modules/@firebase/firestore/dist/lite/') || id.includes('node_modules/firebase/firestore/lite/')) {
            return 'vendor-firebase-firestore-lite';
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
  };
})
