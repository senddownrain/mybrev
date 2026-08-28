<template>
    <div>
        <v-card class="ora" flat>
            <v-card-text class="ora-text">
                <alternative-text :text="text" kind="reading" aria-label="Выбар чытання або рэспансорыя" />
            </v-card-text>
        </v-card>
    </div>
</template>


<script setup>
import AlternativeText from '@/components/oraparts/AlternativeText.vue';

defineProps({
  text: String,
})
</script>

<style scoped>
.ora-text {
  text-align: left !important;
}

.ora-text :deep(*) {
  text-align: left !important;
}

.ora-text :deep([style*="text-align: justify"]),
.ora-text :deep([style*="text-align:justify"]) {
  text-align: left !important;
}
</style>
