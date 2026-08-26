<template>
  <v-card class="ora" flat>
    <v-card-text class="ora-text ora-ending">
      <section class="ora-ending__section">
        <p class="ora-ending__rubric">Потым, нават тады, калі Камплета чытаецца індывідуальна, прамаўляецца благаслаўленне:</p>
        <div class="ora-ending__dialogue">
          <p><span class="ora-ending__speaker">К.</span> Ноч спакойную і смерць шчаслівую няхай дасць нам Бог усемагутны, Айцец і Сын, і Дух Святы.</p>
          <p><span class="ora-ending__speaker">Н.</span> Амэн.</p>
        </div>
      </section>

      <section class="ora-ending__section ora-ending__antiphons">
        <h2 class="ora-ending__title">Антыфоны на заканчэнне да Найсвяцейшай Панны Марыі</h2>
        <alternative-text :text="ant" aria-label="Выбар антыфоны да Найсвяцейшай Панны Марыі" />
      </section>
    </v-card-text>
  </v-card>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  ant: String,
});
</script>

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
.ora-ending__title {
  margin: 0 0 1rem;
  color: var(--rubric-color);
  font-family: var(--reader-display-font-family);
  font-size: calc(1.05rem * var(--font-size-multiplier, 1));
  font-weight: 700;
  line-height: 1.35;
}
</style>
