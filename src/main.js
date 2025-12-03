import App from './App.vue'
import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import './styles/main.scss'

const app = createApp(App)

registerPlugins(app)

import { useAuthStore } from './stores/auth'
import { usePrayersStore } from './stores/prayers'

const authStore = useAuthStore()
authStore.init()

const prayersStore = usePrayersStore()
prayersStore.init()

app.mount('#app')
