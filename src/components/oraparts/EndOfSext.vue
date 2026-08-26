<template>
  <v-card class="ora" flat>
    <v-card-text class="ora-text ora-ending">
      <div class="ora-ending__dialogue">
        <p><span class="ora-ending__speaker">К.</span> Благаславім Пана.</p>
        <p><span class="ora-ending__speaker">Н.</span> Дзякуем Пану Богу.</p>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.ora-ending__dialogue p {
  margin: 0;
}

.ora-ending__dialogue p + p {
  margin-top: 0.5rem;
}

.ora-ending__speaker {
  display: inline-block;
  min-width: 1.55rem;
  color: var(--rubric-color);
  font-weight: 700;
}
</style>
