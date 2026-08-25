<template>
  <v-container class="prayers-list-container">
    <div class="favorites-page-header">
      <h1 class="favorites-page-title">Абраныя малітвы</h1>
    </div>

    <div v-if="isLoading" class="favorite-prayers-list">
      <v-skeleton-loader
        v-for="n in 5"
        :key="n"
        type="list-item-avatar"
        class="prayer-list-skeleton"
      ></v-skeleton-loader>
    </div>

    <div v-else-if="favoritePrayers.length === 0" class="favorites-empty-state">
      <span class="favorites-empty-icon">
        <v-icon size="32">mdi-heart-outline</v-icon>
      </span>
      <h2>Няма абраных малітваў</h2>
      <p>Дадайце малітвы ў абраныя, націснуўшы на сэрца</p>
    </div>

    <div v-else>
      <v-list lines="one" bg-color="transparent" class="favorite-prayers-list">
        <v-list-item
          v-for="prayer in favoritePrayers"
          :key="prayer.id"
          @click="viewPrayer(prayer.id)"
          class="prayer-list-item"
        >
          <template v-slot:prepend>
            <span class="prayer-list-item__icon-wrap">
              <v-btn
                icon
                variant="text"
                size="small"
                @click.stop="toggleFavorite(prayer.id)"
                color="red"
                aria-label="Выдаліць з абраных"
              >
                <v-icon>mdi-heart</v-icon>
              </v-btn>
            </span>
          </template>

          <v-list-item-title class="prayer-list-item__title">
            {{ getTitle(prayer) }}
          </v-list-item-title>

          <template v-slot:append>
            <div class="prayer-list-item__actions">
              <v-btn
                v-if="authStore.isAdmin"
                icon="mdi-pencil"
                variant="text"
                size="small"
                @click.stop="router.push({ name: 'PrayerEdit', params: { id: prayer.id } })"
                aria-label="Рэдагаваць малітву"
              ></v-btn>
              <v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24"></v-icon>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </div>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const { prayers, isLoading, getTitle } = usePrayers();
const authStore = useAuthStore();
const settings = useSettingsStore();

const favoritePrayers = computed(() => {
  if (!prayers.value || !Array.isArray(prayers.value)) return [];
  if (!settings.favoritePrayers || !Array.isArray(settings.favoritePrayers)) return [];
  
  const filtered = prayers.value.filter(prayer => settings.favoritePrayers.includes(prayer.id));
  filtered.sort((a, b) => getTitle(a).localeCompare(getTitle(b), 'be', { sensitivity: 'base' }));
  
  return filtered;
});

function viewPrayer(id) {
  router.push({ name: 'PrayerView', params: { id } });
}

function toggleFavorite(prayerId) {
  settings.toggleFavoritePrayer(prayerId);
}
</script>

<style scoped>
.prayers-list-container {
  width: min(100%, 760px);
  max-width: 760px;
  padding-top: 12px;
  padding-bottom: 32px !important;
}

.favorites-page-header {
  display: flex;
  align-items: center;
  margin: 0 12px 22px;
}

.favorites-page-title {
  margin: 8px 0 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.85rem, 8vw, 2.35rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.favorite-prayers-list {
  display: grid;
  gap: 12px;
  padding: 0 12px !important;
}

.prayer-list-skeleton {
  min-height: 80px;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
}

.prayer-list-item {
  min-height: 80px;
  padding: 14px 14px 14px 16px !important;
  border: 1px solid var(--nav-border);
  border-radius: 22px !important;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.prayer-list-item:hover {
  border-color: rgba(var(--v-theme-primary), 0.2);
  box-shadow: 0 7px 22px var(--nav-button-shadow);
}

.prayer-list-item:active {
  transform: scale(0.988);
}

.prayer-list-item__icon-wrap {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-error), 0.2);
  border-radius: 16px;
  background: rgba(var(--v-theme-error), 0.08);
}

.prayer-list-item__title {
  padding-inline: 4px 8px;
  font-size: clamp(1.04rem, 4vw, 1.17rem) !important;
  font-weight: 650;
  line-height: 1.36 !important;
  letter-spacing: -0.01em;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: normal;
}

.prayer-list-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.prayer-list-item__arrow {
  color: var(--nav-muted);
}

.favorites-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 42px 12px 0;
  padding: 36px 24px;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--nav-surface);
  color: var(--nav-muted);
  text-align: center;
  box-shadow: 0 3px 14px var(--nav-button-shadow);
}

.favorites-empty-state h2 {
  margin: 16px 0 5px;
  color: var(--nav-on-surface);
  font-size: 1.15rem;
}

.favorites-empty-state p {
  max-width: 360px;
  margin: 0;
  line-height: 1.5;
}

.favorites-empty-icon {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border-radius: 20px;
  background: rgba(var(--v-theme-error), 0.08);
  color: rgb(var(--v-theme-error));
}

:deep(.prayer-list-item .v-list-item__prepend) {
  align-self: center;
  margin-inline-end: 12px;
}

:deep(.prayer-list-item .v-list-item__append) {
  align-self: center;
}

@media (max-width: 600px) {
  .prayers-list-container {
    padding: 8px 4px 28px !important;
  }

  .favorites-page-header {
    margin-inline: 12px;
  }

  .favorite-prayers-list {
    padding-inline: 8px !important;
  }

  .favorites-empty-state {
    margin-inline: 8px;
  }
}

@media (max-width: 359px) {
  .prayer-list-item {
    padding-inline: 12px 10px !important;
    border-radius: 20px !important;
  }

  .prayer-list-item__icon-wrap {
    width: 44px;
    height: 44px;
  }

  :deep(.prayer-list-item .v-list-item__prepend) {
    margin-inline-end: 8px;
  }
}
</style>

