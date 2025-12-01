<template>
  <v-container>
    <v-card>
      <v-card-title>Резервоўнае капіраванне</v-card-title>
      <v-card-text>
        <p class="mb-4">Націсніце на кнопку ніжэй, каб спампаваць поўную рэзервовую копію калекцыі `days` у выглядзе аднаго JSON-файла. Захавайце гэты файл у надзейным месцы перад пачаткам любых змен.</p>
        <v-btn color="primary" @click="downloadBackup" :loading="loading" block size="large">
          Спампаваць бэкап калекцыі 'days'
        </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useFirestore } from 'vuefire';
import { collection, getDocs } from 'firebase/firestore';
import { useNotifier } from '@/composables/useNotifier';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

const db = useFirestore();
const loading = ref(false);
const { success, error: notifyError } = useNotifier();

const downloadBackup = async () => {
  loading.value = true;
  try {
    const daysRef = collection(db, 'days');
    const querySnapshot = await retryFirestore(() => getDocs(daysRef));

    const dataToSave = [];
    querySnapshot.forEach(doc => {
      dataToSave.push({
        id: doc.id,
        ...doc.data()
      });
    });

    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().slice(0, 10);
    link.download = `firestore-days-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    success(`Бэкап паспяхова створаны! Захавана ${dataToSave.length} дакументаў.`);
  } catch (error) {
    logger.error("Памылка стварэння бэкапу:", error);
    notifyError("Адбылася памылка пры стварэнні бэкапу.");
  } finally {
    loading.value = false;
  }
};
</script>