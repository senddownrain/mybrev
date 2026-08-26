import { createApp, ref } from 'vue';
import vuetify from '../src/plugins/vuetify.js';
import PrayerMarkdownEditor from '../src/components/prayers/PrayerMarkdownEditor.vue';
import '../src/styles/main.scss';

createApp({
  components: { PrayerMarkdownEditor },
  setup() {
    const text = ref('## Раздзел\n\n**Памолімся.**\n\n:::rubric\nУсе ўстаюць.\n:::');
    return { text };
  },
  template: `
    <v-app>
      <v-main style="padding: 32px; max-width: 900px; margin: 0 auto; width: 100%">
        <PrayerMarkdownEditor v-model="text" />
        <pre data-testid="source" style="margin-top: 24px">{{ text }}</pre>
      </v-main>
    </v-app>
  `,
}).use(vuetify).mount('#app');
