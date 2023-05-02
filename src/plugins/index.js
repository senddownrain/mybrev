/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import { loadFonts } from './webfontloader'
import vuetify from './vuetify'
//import VueRouter from 'vue-router'
import router from '../router'
import { VueFire, VueFireAuth } from 'vuefire'
import { firebaseApp } from './firebase'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css';

import { SetupCalendar, Calendar, DatePicker } from 'v-calendar';
import 'v-calendar/dist/style.css';

export function registerPlugins (app) {
  loadFonts()
  app
    
    .use(vuetify)
    .use(router)
    .use(SetupCalendar, {})
    .use(VueFire, {
      // imported above but could also just be created here
      firebaseApp,
      modules: [
        // we will see other modules later on
        VueFireAuth(),
      ],
    })
    .component('QuillEditor', QuillEditor)
    .component('Calendar', Calendar)
    .component('DatePicker', DatePicker)
}
