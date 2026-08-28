import vuetify from './vuetify'
import router from '../router'
import { scheduleSentryInit } from './sentry';

import { createPinia } from 'pinia'

const pinia = createPinia()


export function registerPlugins (app) {
  app
    .use(pinia)
    .use(vuetify)
    .use(router)

  scheduleSentryInit(app, router)
}
