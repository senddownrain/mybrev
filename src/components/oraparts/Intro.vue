<template>
  <div>
    <v-card class="ora" flat>
      <v-card-title class="ora-title">
        {{ title }}
      </v-card-title>

      <v-card-text class="ora-text">
        <div>
          <span style="color: red">К.</span> Божа, прыйдзі мне на дапамогу.<br>
          <span style="color: red">Н.</span> Пане, паспяшы да мяне на паратунак.<br>
          Хвала Айцу і Сыну, * і Духу Святому.<br>
          Як была спрадвеку, цяпер і заўсёды, *<br>
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
});
</script>
