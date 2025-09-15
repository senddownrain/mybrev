/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'
import colors from 'vuetify/lib/util/colors'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  components: {
  },
  theme: {
    themes: {
      // light: {
      //   colors: {
      //     primary: String(colors.yellow),
      //     secondary: '#5CBBF6',
      //   },
      // },
    },
  },
})