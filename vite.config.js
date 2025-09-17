// Импортируем утилиты из стандартных пакетов
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

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
    visualizer({ // Добавляем плагин
       filename: 'dist/stats.html', // 3. Явно указываем, куда сохранить отчет
      open: true,                // Попытаться открыть отчет автоматически
      gzipSize: true,            // Показать размер после gzip
      brotliSize: true,  
    }),
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
      manifest: {
        name: 'Каталіцкі малітоўнік',
        short_name: 'Малітоўнік',
        description: 'малітоўнік мік',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
      src: "web-app-manifest-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable"
    },
    {
      src: "web-app-manifest-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    }
        ]

      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,txt,woff2,webmanifest}'],
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
  
  // Настройки сервера для разработки
  server: {
    port: 3000, // Указываем, что сервер должен запускаться на порту 3000
  },
})