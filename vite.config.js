// Импортируем утилиты из стандартных пакетов
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Импортируем плагины для Vue и Vuetify
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Плагин для поддержки однофайловых компонентов Vue (.vue)
    vue({ 
      template: { transformAssetUrls }
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