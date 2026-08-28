import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';

export default [
  // Base JavaScript rules
  js.configs.recommended,

  // Vue 3 essential rules
  ...pluginVue.configs['flat/essential'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        NodeFilter: 'readonly',
        structuredClone: 'readonly',
        // Node globals (for scripts)
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      // Allow unused vars that start with _
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Vue specific
      'vue/multi-word-component-names': 'off',
    },
  },

  // Ignore build artifacts and scripts
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.min.js',
      'import-*.js',
      'migrate-*.js',
    ],
  },
];
