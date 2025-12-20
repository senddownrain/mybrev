<template>
  <v-container>
    <v-row>
      <!-- Бэкап коллекции days -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Бэкап калекцыі 'days'</v-card-title>
          <v-card-text>
            <p class="mb-4">Спампаваць поўную рэзервовую копію калекцыі `days` у выглядзе JSON-файла.</p>
            <v-btn 
              color="primary" 
              @click="downloadBackup('days')" 
              :loading="loading.days" 
              block 
              size="large"
              :disabled="isAnyLoading"
            >
              <v-icon start>mdi-download</v-icon>
              Спампаваць бэкап 'days'
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
      
      <!-- Бэкап коллекции readings -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Бэкап калекцыі 'readings'</v-card-title>
          <v-card-text>
            <p class="mb-4">Спампаваць поўную рэзервовую копію калекцыі `readings` у выглядзе JSON-файла.</p>
            <v-btn 
              color="primary" 
              @click="downloadBackup('readings')" 
              :loading="loading.readings" 
              block 
              size="large"
              :disabled="isAnyLoading"
            >
              <v-icon start>mdi-download</v-icon>
              Спампаваць бэкап 'readings'
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
      
      <!-- Бэкап коллекции readingsData -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Бэкап калекцыі 'readingsData'</v-card-title>
          <v-card-text>
            <p class="mb-4">Спампаваць поўную рэзервовую копію калекцыі `readingsData` у выглядзе JSON-файла.</p>
            <v-btn 
              color="primary" 
              @click="downloadBackup('readingsData')" 
              :loading="loading.readingsData" 
              block 
              size="large"
              :disabled="isAnyLoading"
            >
              <v-icon start>mdi-download</v-icon>
              Спампаваць бэкап 'readingsData'
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useFirestore } from 'vuefire';
import { collection, getDocs } from 'firebase/firestore';
import { useNotifier } from '@/composables/useNotifier';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

const db = useFirestore();
const loading = ref({
  days: false,
  readings: false,
  readingsData: false
});

const isAnyLoading = computed(() => {
  return loading.value.days || loading.value.readings || loading.value.readingsData;
});

const { success, error: notifyError } = useNotifier();

const downloadBackup = async (collectionName) => {
  if (loading.value[collectionName]) return;
  
  loading.value[collectionName] = true;
  try {
    const collectionRef = collection(db, collectionName);
    const querySnapshot = await retryFirestore(() => getDocs(collectionRef));

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
    const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
    link.download = `firestore-${collectionName}-backup-${date}-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const fileSize = (blob.size / 1024).toFixed(2);
    success(`Бэкап калекцыі '${collectionName}' паспяхова створаны! Захавана ${dataToSave.length} дакументаў (${fileSize} KB).`);
    logger.log(`[Backup] Бэкап калекцыі '${collectionName}': ${dataToSave.length} дакументаў, ${fileSize} KB`);
  } catch (error) {
    logger.error(`[Backup] Памылка стварэння бэкапу калекцыі '${collectionName}':`, error);
    notifyError(`Адбылася памылка пры стварэнні бэкапу калекцыі '${collectionName}'.`);
  } finally {
    loading.value[collectionName] = false;
  }
};
</script>