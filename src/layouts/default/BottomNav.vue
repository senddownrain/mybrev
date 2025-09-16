<template>
  <div>

    <v-bottom-navigation :value="value" color="#2F4475" horizontal>

      <v-btn v-for="(m, i) in menu" :key="i" :to="m.to" :value="i">
        <span>{{ m.title }}</span>
        <v-icon>{{ m.icon }}</v-icon>
      </v-btn>
      <v-btn value="2" @click="toggleCalendarDialog()">
        <span>Дзень</span>
        <v-icon>mdi-heart</v-icon>
      </v-btn>

    </v-bottom-navigation>
 <v-dialog v-model="isCalendarDialogOpen" width="auto">
      <v-card>
        <v-card-text class="pa-0">
          <!-- ✅ У v-date-picker есть свой v-model -->
          <v-date-picker 
            v-model="selectedDate" 
            color="primary"
            hide-header
          ></v-date-picker>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="toggleCalendarDialog">Адмена</v-btn>
          <v-btn color="primary" variant="text" @click="loadDay">Выбраць</v-btn>
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
import { useAppBar } from '@/composables/useAppBar';

const value = ref(1)
const { isCalendarDialogOpen, toggleCalendarDialog } = useAppBar();
const selectedDate = ref(new Date()); // ✅ Переменная для v-date-picker

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
  toggleCalendarDialog();
  router.push(`/day/${moment(selectedDate.value).format("YYYY-MM-DD")}`)
}

</script>