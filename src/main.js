/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

import './styles/main.scss'

const app = createApp(App)

registerPlugins(app)

import { useAuthStore } from './stores/auth'
const authStore = useAuthStore()
authStore.init()


app.mount('#app')
