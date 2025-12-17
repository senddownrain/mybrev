<template>
  <v-container>
    <h1 class="text-h5 font-weight-light mb-4">Выбраць дату для чытанняў</h1>

    <v-card variant="outlined" class="mb-4">
      <v-card-text class="pa-0">
        <v-date-picker 
          v-model="selectedDate" 
          color="primary"
          :first-day-of-week="1"
          @update:model-value="onDateSelected"
        ></v-date-picker>
      </v-card-text>
    </v-card>

    <v-card v-if="selectedDate" variant="outlined">
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn 
          color="primary" 
          variant="flat" 
          @click="goToReadings"
          :disabled="!selectedDate"
        >
          Праглядзець чытанні
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import moment from 'moment';
import 'moment/dist/locale/be';

moment.locale('be');

const router = useRouter();
const selectedDate = ref(new Date());

const today = computed(() => moment().startOf('day'));

function onDateSelected(date) {
  if (date) {
    selectedDate.value = date;
  }
}

function goToReadings() {
  if (!selectedDate.value) return;
  
  const dateString = moment(selectedDate.value).format('YYYY-MM-DD');
  if (moment(selectedDate.value).isSame(today.value, 'day')) {
    router.push('/readings');
  } else {
    router.push(`/readings/${dateString}`);
  }
}
</script>




