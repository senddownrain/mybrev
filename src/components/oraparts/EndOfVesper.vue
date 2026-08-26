<template>
  <v-card class="ora" flat>
    <v-card-text class="ora-text ora-ending">
      <section class="ora-ending__section">
        <p class="ora-ending__rubric">Потым, калі прысутнічае святар або дыякан, ён рассылае народ, кажучы:</p>
        <div class="ora-ending__dialogue">
          <p><span class="ora-ending__speaker">С.</span> Пан з вамі.</p>
          <p><span class="ora-ending__speaker">Н.</span> І з духам тваім.</p>
          <p><span class="ora-ending__speaker">С.</span> Няхай благаславіць вас Бог усемагутны, Айцец і Сын, і Дух Святы.</p>
          <p><span class="ora-ending__speaker">Н.</span> Амэн.</p>
        </div>
      </section>

      <section class="ora-ending__section">
        <p class="ora-ending__rubric">Калі адбываецца рассыланне народу, дадаецца заклік:</p>
        <div class="ora-ending__dialogue">
          <p><span class="ora-ending__speaker">С.</span> Ідзіце ў супакоі Хрыста.</p>
          <p><span class="ora-ending__speaker">Н.</span> Дзякуем Пану Богу.</p>
        </div>
      </section>

      <section class="ora-ending__section">
        <p class="ora-ending__rubric">Калі святар або дыякан адсутнічаюць ці калі Гадзіна чытаецца індывідуальна, то яна завяршаецца наступным чынам:</p>
        <div class="ora-ending__dialogue">
          <p><span class="ora-ending__speaker">К.</span> Няхай Пан благаславіць нас, абароніць ад усялякага зла і давядзе да жыцця вечнага.</p>
          <p><span class="ora-ending__speaker">Н.</span> Амэн.</p>
        </div>
      </section>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.ora-ending__section + .ora-ending__section {
  margin-top: 1.75rem;
}

.ora-ending__rubric {
  margin-bottom: 0.8rem;
  color: var(--rubric-color);
}

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
