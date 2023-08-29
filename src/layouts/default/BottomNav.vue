<template>
  <div>

    <v-bottom-navigation :value="value" color="#2F4475" horizontal>

      <v-btn v-for="(m, i) in menu" :key="i" :to="m.to" :value="i">
        <span>{{ m.title }}</span>
        <v-icon>{{ m.icon }}</v-icon>
      </v-btn>
      <v-btn value="2" @click.stop="dialog = !dialog">
        <span>Дзень</span>
        <v-icon>mdi-heart</v-icon>
      </v-btn>

    </v-bottom-navigation>

    <v-dialog v-model="dialog" width="auto">
      <v-card>
        <v-card-text>
          <VDatePicker v-model="picker" mode="date" />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="dialog = false">Отмена</v-btn>
          <v-btn variant="text" @click="loadDay()">Выбрать</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>


<script setup>


import moment from 'moment'
import 'moment/dist/locale/be'
import { ref } from 'vue'
import router from '@/router';

const value = ref(1)
const picker = ref(Date.now());
const dialog = ref(false);


function go(item) {
  router.push(item)
}
const yeasterday = moment().subtract(1, 'days');
const menu = [
  {
    title: "Учора",
    to: `/day/${yeasterday.format("DD-MM-YYYY")}`,
    icon: "mdi-heart"
  },
  {
    title: "Сёння",
    to: "/",
    icon: "mdi-heart"
  },
]

function loadDay() {
  dialog.value = false
  router.push(`/day/${moment(picker.value).format("DD-MM-YYYY")}`)
}

</script>