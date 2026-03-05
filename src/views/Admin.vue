<template>
  <v-container>
    <h1 class="text-h4 font-weight-light mb-4">Панэль адміністратара</h1>
    <p class="mb-6">Сардэчна запрашаем! Выберыце раздзел для кіравання.</p>

    <v-row>
      <template v-for="item in activeItems" :key="item.id">
        <v-col cols="12" :md="item.md ?? 4">
          <v-card :to="item.to" hover :color="item.color">
            <v-card-item>
              <template #append>
                <v-btn
                  icon="mdi-archive-outline"
                  size="small"
                  variant="text"
                  :title="`Архіваваць «${item.title}»`"
                  @click.prevent.stop="archiveItem(item.id)"
                />
              </template>
              <v-card-title>{{ item.title }}</v-card-title>
              <v-card-subtitle v-if="item.subtitle">{{ item.subtitle }}</v-card-subtitle>
            </v-card-item>
          </v-card>
        </v-col>
      </template>

      <v-col cols="12" v-if="archivedItems.length">
        <v-expansion-panels class="mt-4" variant="accordion">
          <v-expansion-panel>
            <v-expansion-panel-title>
              Архіў ({{ archivedItems.length }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col v-for="item in archivedItems" :key="item.id" cols="12" :md="item.md ?? 4">
                  <v-card :to="item.to" hover :color="item.color">
                    <v-card-item>
                      <template #append>
                        <v-btn
                          icon="mdi-archive-arrow-up-outline"
                          size="small"
                          variant="text"
                          :title="`Вярнуць «${item.title}» з архіва`"
                          @click.prevent.stop="restoreItem(item.id)"
                        />
                      </template>
                      <v-card-title>{{ item.title }}</v-card-title>
                      <v-card-subtitle v-if="item.subtitle">{{ item.subtitle }}</v-card-subtitle>
                    </v-card-item>
                  </v-card>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const STORAGE_KEY = 'adminArchivedButtons';

const adminItems = [
  {
    id: 'year-options',
    title: 'Налады года (YearOptions)',
    subtitle: 'Кіраванне рухомымі святамі і перыядамі',
    to: '/admin/year-options',
    md: 6
  },
  {
    id: 'logic-tester',
    title: 'Тэстар літургічнай логікі',
    subtitle: 'Праверка разлікаў для любой даты',
    to: '/admin/logic-tester',
    color: 'blue-grey-darken-3',
    md: 6
  },
  {
    id: 'db-day-list',
    title: 'DbDayList',
    to: '/admin/db-day-list'
  },
  {
    id: 'backup',
    title: 'Backup',
    to: '/admin/backup'
  },
  {
    id: 'categories',
    title: 'Катэгорыі малітваў',
    subtitle: 'Кіраванне катэгорыямі ў меню',
    to: { name: 'AdminCategories' }
  },
  {
    id: 'readings-test',
    title: 'Чытанні',
    subtitle: 'Даданне і кіраванне літургічнымі чытаннямі',
    to: { name: 'ReadingsTest' },
    color: 'green-darken-2'
  },
  {
    id: 'missing-data',
    title: 'Пошук недастаючых дадзеных',
    subtitle: 'Праверка readings і days + хуткі пераход на стварэнне',
    to: { name: 'AdminMissingData' },
    color: 'deep-purple-darken-2'
  },
  {
    id: 'normalize-hymns',
    title: 'Нармалізацыя гімнаў',
    subtitle: "Ручное аб'яднанне дубляў у hymns + абнаўленне days",
    to: { name: 'AdminNormalizeHymns' },
    color: 'orange-darken-2'
  },
  {
    id: 'normalize-completorium',
    title: 'Нармалізацыя комплеторыя',
    subtitle: 'Ручное аб\'яднанне дубляў completorium',
    to: { name: 'AdminNormalizeCompletorium' },
    color: 'teal-darken-2'
  },
  {
    id: 'normalize-psalms',
    title: 'Нармалізацыя псальмаў',
    subtitle: 'Ручное/аўта аб\'яднанне дубляў psalmTemplates',
    to: { name: 'AdminNormalizePsalms' },
    color: 'cyan-darken-2'
  },
  {
    id: 'completorium-templates',
    title: 'Шаблоны комплеты',
    subtitle: 'Стварэнне, пошук, рэдагаванне і выдаленне completoriumTemplates',
    to: { name: 'AdminCompletoriumTemplates' },
    color: 'indigo-darken-2'
  },
  {
    id: 'day-templates',
    title: 'Шаблоны дзён',
    subtitle: 'Стварэнне, групоўка і рэдагаванне dayTemplates',
    to: { name: 'AdminDayTemplatesList' },
    color: 'indigo-darken-2'
  },
  {
    id: 'calendar-map',
    title: 'Карта календара',
    subtitle: 'Калекцыя calendarMap: прагляд, рэдагаванне і пабудова літургічнага дня',
    to: { name: 'AdminCalendarMap' },
    color: 'indigo-darken-1'
  }
];

const archivedIds = ref(loadArchivedIds());

const archivedSet = computed(() => new Set(archivedIds.value));

const activeItems = computed(() => adminItems.filter((item) => !archivedSet.value.has(item.id)));
const archivedItems = computed(() => adminItems.filter((item) => archivedSet.value.has(item.id)));

watch(archivedIds, (value) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}, { deep: true });

function loadArchivedIds() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function archiveItem(itemId) {
  if (archivedSet.value.has(itemId)) {
    return;
  }

  archivedIds.value = [...archivedIds.value, itemId];
}

function restoreItem(itemId) {
  archivedIds.value = archivedIds.value.filter((id) => id !== itemId);
}
</script>
