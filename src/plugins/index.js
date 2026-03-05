import { loadFonts } from './webfontloader'
import vuetify from './vuetify'
import router from '../router'
import { VueFire, VueFireAuth } from 'vuefire'
import { firebaseApp } from './firebase'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import { initSentry } from './sentry';

import VCalendar from 'v-calendar';
import 'v-calendar/style.css';

import { createPinia } from 'pinia'

const pinia = createPinia()


export function registerPlugins (app) {
  loadFonts()
  initSentry(app, router)
  app
    .use(pinia)
    .use(vuetify)
    .use(router)
    .use(VCalendar, {})
    .use(VueFire, {
      firebaseApp,
      modules: [
        VueFireAuth(),
      ],
    })
    .component('QuillEditor', QuillEditor)
}
