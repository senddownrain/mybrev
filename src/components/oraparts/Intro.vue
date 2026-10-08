<template>
  <div>
    <v-card class="ora" flat>
      <v-card-title class="ora-title" data-hour-heading>
        {{ title }}
      </v-card-title>

      <v-card-text v-if="!hideText" class="ora-text">
        <div class="ora-intro">
          <span style="color: red">К.</span> Божа, прыйдзі мне на дапамогу.<br>
          <span style="color: red">Н.</span> Пане, паспяшы да мяне на паратунак.<br>
          Хвала Айцу і Сыну, <span class="psalm-marker">*</span> і Духу Святому.<br>
          Як была спрадвеку, цяпер і заўсёды, <span class="psalm-marker">*</span><br>
          І на векі вечныя. Амэн.<br>
          Аллелюя.
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  hideText: {
    type: Boolean,
    default: false,
  },
});
</script>
