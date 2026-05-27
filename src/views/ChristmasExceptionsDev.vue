<template>
  <v-container fluid class="pa-4 christmas-exceptions-admin">
    <v-toolbar density="comfortable" rounded="lg" class="mb-4">
      <template v-if="!selectedSlot">
        <v-toolbar-title>christmas-exceptions-dev</v-toolbar-title>
      </template>
      <template v-else>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="closeDay">Закрыть</v-btn>
        <v-toolbar-title>{{ selectedSlotLabel }}</v-toolbar-title>
        <v-btn color="primary" :loading="saving" @click="saveDay">Сохранить</v-btn>
      </template>
    </v-toolbar>

    <v-card v-if="!selectedSlot" rounded="lg" class="pa-4">
      <v-alert type="info" variant="tonal" class="mb-4">
        4 недели.
      </v-alert>

      <v-expansion-panels v-model="openedWeeks" multiple>
        <v-expansion-panel v-for="week in weekGroups" :key="week.week" :value="week.week">
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100 pr-2">
              <span :class="week.allChecked ? 'text-success font-weight-bold' : ''">Неделя {{ week.week }}</span>
              <v-chip
                size="x-small"
                :color="week.allChecked ? 'success' : 'default'"
                :variant="week.allChecked ? 'tonal' : 'outlined'"
              >
                {{ week.checkedCount }}/{{ week.totalCount }}
              </v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="comfortable">
              <v-list-item
                v-for="item in week.days"
                :key="item.key"
                :title="item.label"
                :active="item.checked"
                rounded="lg"
                @click="openDay(item)"
              >
                <template #prepend>
                  <v-icon :color="item.checked ? 'success' : 'error'">
                    {{ item.checked ? 'mdi-check-circle' : 'mdi-close-circle' }}
                  </v-icon>
                </template>
                <template #append>
                  <v-checkbox-btn :model-value="item.checked" disabled />
                </template>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>

    <v-card v-else rounded="lg" class="pa-4">
      <v-row class="mb-3" align="center" dense>
        <v-col cols="12" md="4" lg="3">
          <v-select v-model="selectedCompareYear" :items="compareYears" label="Год для сравнения" density="compact" variant="outlined">
            <template #item="{ props, item }">
              <v-list-item v-bind="props">
                <template #append>
                  <v-chip
                    v-if="selectedSlot && yearDiffCount(item.raw)"
                    size="x-small"
                    color="warning"
                    variant="tonal"
                  >
                    {{ yearDiffCount(item.raw) }}
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </v-col>
        <v-col cols="12" md="4" lg="3">
          <v-checkbox v-model="editableChecked" label="Проверен (fixedDays)" hide-details />
        </v-col>
        <v-col cols="12" md="4" lg="3">
          <v-checkbox v-model="miniMode" label="Режим мини" hide-details />
        </v-col>
        <v-col cols="12" md="4" lg="6" class="d-flex ga-2 justify-md-end">
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                size="small"
                color="secondary"
                variant="outlined"
                prepend-icon="mdi-dots-horizontal"
              >
                Действия
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item prepend-icon="mdi-content-copy" title="Копировать всё" @click="copyAllFromCompare" />
              <v-list-item prepend-icon="mdi-content-save" title="Сохранить шаблон" @click="openSaveTemplateDialog" />
              <v-list-item prepend-icon="mdi-database-import" title="Подгрузить шаблон" @click="openLoadTemplateDialog" />
              <v-list-item
                prepend-icon="mdi-restore"
                title="Откатить шаблон"
                :disabled="!templateAppliedSnapshot"
                @click="rollbackTemplateApply"
              />
              <v-list-item prepend-icon="mdi-undo" title="Отменить всё" @click="undoAllChanges" />
            </v-list>
          </v-menu>
          <v-btn color="primary" size="small" :loading="saving" @click="saveDay">Сохранить</v-btn>
        </v-col>
      </v-row>
      <v-alert
        v-if="emptyHighlightFields.length"
        type="warning"
        variant="tonal"
        density="comfortable"
        class="mb-3"
      >
        <div class="font-weight-medium mb-1">
          Есть пустые поля (кроме исключений): {{ emptyHighlightFields.length }}
        </div>
        <div class="d-flex flex-wrap ga-1">
          <v-chip
            v-for="field in emptyHighlightFields"
            :key="`empty-${field}`"
            size="small"
            color="warning"
            variant="outlined"
          >
            {{ field }}
          </v-chip>
        </div>
      </v-alert>

      <div class="compare-table-wrapper">
        <v-row class="header-row" no-gutters>
          <v-col cols="6" class="px-1">
            <v-card color="primary" variant="tonal" class="pa-2 text-subtitle-1 font-weight-bold">
              Источник (fixedDays/2025) — редактируемый
            </v-card>
          </v-col>
          <v-col cols="6" class="px-1">
            <v-card color="secondary" variant="tonal" class="pa-2 text-subtitle-1 font-weight-bold">
              Сравнение: {{ selectedCompareYear }}
            </v-card>
          </v-col>
        </v-row>

        <div class="compare-scroll">
          <v-expansion-panels v-model="openedGroupKeys" multiple>
            <v-expansion-panel
              v-for="group in visibleFieldGroups"
              :key="group.key"
              :value="group.key"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-2">
                  <span>{{ group.title }}</span>
                  <v-chip size="x-small" color="primary" variant="tonal">{{ groupDiffCount(group.fields) }} отличий</v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-row
                  v-for="field in group.fields"
                  :key="field"
                  class="field-row"
                  no-gutters
                >
                  <v-col cols="6" class="px-1 py-1">
                    <v-card :color="leftCardColor(field)" :variant="leftCardVariant(field)">
                      <v-card-item>
                        <div class="d-flex align-center justify-space-between ga-2">
                          <div class="text-body-2 font-weight-bold">{{ field }}</div>
                          <v-btn
                            v-if="!READ_ONLY_FIELDS.has(field)"
                            size="small"
                            variant="text"
                            icon="mdi-pencil"
                            @click="openEditDialog(field)"
                          />
                        </div>
                        <div class="field-value mt-2 line-clamp-2">{{ formatPreviewValue(leftDraft[field]) }}</div>
                      </v-card-item>
                    </v-card>
                  </v-col>

                  <v-col cols="6" class="px-1 py-1">
                    <v-card :color="isDifferent(field) ? 'warning' : undefined" :variant="isDifferent(field) ? 'tonal' : 'outlined'">
                      <v-card-item>
                        <div class="d-flex align-center justify-space-between ga-2">
                          <div class="text-body-2 font-weight-bold">{{ field }}</div>
                          <v-btn
                            v-if="canCopyField(field)"
                            size="small"
                            variant="text"
                            icon="mdi-arrow-left"
                            @click="copyField(field)"
                          />
                        </div>
                        <div class="field-value mt-2 line-clamp-2">{{ formatPreviewValue(compareDay[field]) }}</div>
                      </v-card-item>
                    </v-card>
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </div>
    </v-card>

    <v-dialog v-model="editDialogOpen" fullscreen>
      <v-card>
        <v-toolbar>
          <v-toolbar-title>Редактировать {{ editField }}</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeEditDialog" />
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-btn-toggle v-model="editMode" mandatory color="primary" class="mb-4">
            <v-btn value="html">HTML</v-btn>
            <v-btn value="quill">Quill</v-btn>
          </v-btn-toggle>

          <v-textarea
            v-if="editMode === 'html'"
            v-model="editValue"
            label="HTML"
            auto-grow
            rows="16"
            variant="outlined"
          />

          <quill-editor
            v-else
            v-model:content="editValue"
            content-type="html"
            theme="snow"
            class="quill-full"
          />
        </v-card-text>

        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="outlined" @click="closeEditDialog">Отмена</v-btn>
          <v-btn color="primary" @click="applyEdit">Применить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="saveTemplateDialogOpen" fullscreen>
      <v-card>
        <v-toolbar>
          <v-toolbar-title>Сохранить шаблон</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeSaveTemplateDialog" />
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="templateTitleInput"
            label="Название шаблона"
            variant="outlined"
            hint="Можно изменить автосгенерированное название перед сохранением"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="outlined" @click="closeSaveTemplateDialog">Отмена</v-btn>
          <v-btn color="primary" :loading="templateSaving" @click="saveTemplate">Сохранить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="loadTemplateDialogOpen" fullscreen>
      <v-card>
        <v-toolbar>
          <v-toolbar-title>Подгрузить шаблон</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeLoadTemplateDialog" />
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-list v-if="templatesList.length" lines="two" density="comfortable">
            <v-list-item
              v-for="template in templatesList"
              :key="template.id"
              :title="template.title || template.id"
              :subtitle="`ID: ${template.id}`"
              :active="selectedTemplateId === template.id"
              rounded="lg"
              @click="selectedTemplateId = template.id"
            >
              <template #append>
                <v-icon v-if="selectedTemplateId === template.id" color="primary">mdi-check-circle</v-icon>
              </template>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal">
            В коллекции <code>tmpTemplates</code> пока нет шаблонов.
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="outlined" @click="closeLoadTemplateDialog">Отмена</v-btn>
          <v-btn color="primary" :disabled="!selectedTemplateId" @click="applySelectedTemplate">
            Применить шаблон
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { addDoc, collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '@/plugins/firebase'
import { WEEKDAY_LABEL_MAP } from '@/constants/liturgical'

const FIELDS = [
  '_dayOfWeek', '_periodType', '_periodWeekNumber', '_dayName',
  '_date', '_feast', '_feastName', '_feastType', 'feastComment',
  'invitatoriumAnt', 'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
  'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr', 'laudesHymn', 'laudesAnt1', 'laudesAnt2',
  'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr',
  'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr',
  'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR',
  'vesperAntMag', 'vesperInter', 'vesperPr', 'vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3',
  'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr',
]

const READ_ONLY_FIELDS = new Set(['_dayOfWeek', '_periodType', '_periodWeekNumber'])
const EMPTY_HIGHLIGHT_EXCLUDED = new Set([
  'officeOfReadingsTeDeum',
  'vesper1Hymn',
  'vesper1Ant1',
  'vesper1Ant2',
  'vesper1Ant3',
  'vesper1Ps1',
  'vesper1Ps2',
  'vesper1Ps3',
  'vesper1R',
  'vesper1AntMag',
  'vesper1Inter',
  'vesper1Pr',
])
const TEMPLATE_FIELDS = [
  '_dayOfWeek', '_periodType',
  'invitatoriumAnt', 'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers',
  'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3',
  'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr',
  'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr',
  'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3',
  'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr',
]
const FIELD_GROUPS = [
  {
    key: 'base',
    title: 'Базовые поля',
    fields: ['_periodType', '_periodWeekNumber', '_dayOfWeek', '_dayName'],
  },
  {
    key: 'invitatorium',
    title: 'Инвитаторий',
    fields: ['invitatoriumAnt'],
  },
  {
    key: 'readings',
    title: 'Час чтений',
    fields: [
      'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
      'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
      'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr',
    ],
  },
  {
    key: 'laudes',
    title: 'Лауды',
    fields: [
      'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3',
      'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
    ],
  },
  {
    key: 'sext1',
    title: 'Терция',
    fields: ['sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr'],
  },
  {
    key: 'sext2',
    title: 'Секста',
    fields: ['sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr'],
  },
  {
    key: 'sext3',
    title: 'Нона',
    fields: ['sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr'],
  },
  {
    key: 'vesper',
    title: 'Вечерня',
    fields: ['vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr'],
  },
  {
    key: 'vesper1',
    title: 'Первая вечерня',
    fields: ['vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3', 'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr'],
  },
]
const MINI_FIELDS = new Set([
  '_periodType', '_periodWeekNumber', '_date',
  'invitatoriumAnt', 'officeOfReadingsHymn', 'officeOfReadingsVers', 'officeOfReadingsR1', 'officeOfReadingsR2',
  'officeOfReadingsTeDeum', 'officeOfReadingsPr', 'laudesHymn', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1R', 'sext1Pr', 'sext2Hymn', 'sext2R', 'sext2Pr', 'sext3Hymn', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr',
])
const MINI_SAVE_FIELDS = [
  '_periodType', '_date',
  'invitatoriumAnt', 'officeOfReadingsHymn', 'officeOfReadingsVers', 'officeOfReadingsR1', 'officeOfReadingsR2',
  'officeOfReadingsTeDeum', 'officeOfReadingsPr', 'laudesHymn', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1R', 'sext1Pr', 'sext2Hymn', 'sext2R', 'sext2Pr', 'sext3Hymn', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr',
]
const ADVENT_DEC17_24_HOOK = {
  monday: '<p><span style="color: #ff0000;">1 ант.</span> Вось прыйдзе Пан, першы сярод зямных валадароў. <span style="color: #ff0000;">*</span> Шчаслівы, хто гатовы выйсці Яму насустрач.</p><p><span style="color: #ff0000;">2 ант.</span> Спявайце Пану новую песню, <span style="color: #ff0000;">*</span> слава Яго аж да межаў зямлі.</p><p><span style="color: #ff0000;">3 ант.</span> Калі прыйдзе Сын Чалавечы, <span style="color: #ff0000;">*</span> ці знойдзе веру на зямлі?</p>',
  tuesday: '<p><span style="color: #ff0000;">1 ант.</span> Пан выйдзе са сваёй святыні. <span style="color: #ff0000;">*</span> Ён прыйдзе збавіць свой народ.</p><p><span style="color: #ff0000;">2 ант.</span> Наша цвярдыня — Сіён, <span style="color: #ff0000;">*</span> Збаўца будзе яго ўмацаваннем і абаронай; <span style="color: #ff0000;">/</span> адчыніце брамы, бо з намі Бог, <span style="color: #ff0000;">/</span> аллелюя.</p><p><span style="color: #ff0000;">3 ант.</span> Пане, дай пазнаць Тваю дарогу <span style="color: #ff0000;">*</span> і між усіх народаў Тваё збаўленне.</p>',
  wednesday: '<p><span style="color: #ff0000;">1 ант.</span> З Сіёна прыйдзе ўсемагутны Пан, <span style="color: #ff0000;">*</span> каб збавіць свой народ.</p><p><span style="color: #ff0000;">2 ант.</span> Дзеля Сіёна не буду маўчаць, <span style="color: #ff0000;">*</span> пакуль не ўзыдзе, як святло, яго Справядлівы.</p><p><span style="color: #ff0000;">3 ант.</span> Дух Пана на Мне, <span style="color: #ff0000;">*</span> Ён паслаў Мяне абвяшчаць Добрую Навіну ўбогім.</p>',
  thursday: '<p><span style="color: #ff0000;">1 ант.</span> Да Цябе, Пане, я ўзношу душу маю. <span style="color: #ff0000;">*</span> Прыйдзі і ўратуй мяне, <span style="color: #ff0000;">/</span> бо я на Цябе спадзяюся.</p><p><span style="color: #ff0000;">2 ант.</span> Пане, дай узнагароду тым, хто чакае Цябе, <span style="color: #ff0000;">*</span> каб пацвердзіліся словы Тваіх прарокаў.</p><p><span style="color: #ff0000;">3 ант.</span> Паглядзі на нас, Пане, <span style="color: #ff0000;">*</span> і без спазнення прыйдзі да сваіх слугаў.</p>',
  friday: '<p><span style="color: #ff0000;">1 ант.</span> З Сіёна прыйдзе той, хто павінен валадарыць: <span style="color: #ff0000;">*</span> Пан, Эммануэль — Яго вялікае імя.</p><p><span style="color: #ff0000;">2 ант.</span> Будзьце вернымі — <span style="color: #ff0000;">*</span> і ўбачыце дапамогу Пана.</p><p><span style="color: #ff0000;">3 ант.</span> Скірую свой позірк да Пана <span style="color: #ff0000;">*</span> і буду чакаць Бога, майго Збаўцу.</p>',
  saturday: '<p><span style="color: #ff0000;">1 ант.</span> Бог прыйдзе з Лівана, <span style="color: #ff0000;">*</span> і бляск Ягонай славы заззяе, нібы святло.</p><p><span style="color: #ff0000;">2 ант.</span> Крапіце, нябёсы, з вышыняў, <span style="color: #ff0000;">*</span> і хмары няхай пральюць справядлівасць; <span style="color: #ff0000;">/</span> няхай адкрыецца зямля і народзіць Збаўцу.</p><p><span style="color: #ff0000;">3 ант.</span> Падрыхтуйся, Ізраэль, да сустрэчы з Панам, <span style="color: #ff0000;">*</span> бо Ён прыходзіць.</p>',
}

const selectedSlot = ref(null)
const selectedCompareYear = ref(2024)
const compareYears = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]

const allPeriodDocs = ref([])
const exceptionsById = ref(new Map())
const fixedDaysMap = ref(new Map())

const leftDraft = ref(buildEmptyDay())
const leftOriginal = ref(buildEmptyDay())
const compareDay = ref(buildEmptyDay())
const editableChecked = ref(false)

const editDialogOpen = ref(false)
const editField = ref('')
const editValue = ref('')
const editMode = ref('html')
const saving = ref(false)
const saveTemplateDialogOpen = ref(false)
const loadTemplateDialogOpen = ref(false)
const templateTitleInput = ref('')
const templateSaving = ref(false)
const templatesList = ref([])
const selectedTemplateId = ref('')
const templateAppliedSnapshot = ref(null)
const openedGroupKeys = ref([])
const openedWeeks = ref([])
const miniMode = ref(false)

const selectedSlotLabel = computed(() => {
  if (!selectedSlot.value) return ''
  return selectedSlot.value.label
})

const emptyHighlightFields = computed(() => {
  if (!selectedSlot.value) return []
  return FIELDS.filter((field) => (
    !EMPTY_HIGHLIGHT_EXCLUDED.has(field)
    && isEmpty(leftDraft.value[field])
  ))
})

const weekGroups = computed(() => {
  const days = buildDateSlots()
  const checkedCount = days.filter((d) => Boolean(fixedDaysMap.value.get(buildFixedDayId(d.date))?.checked)).length
  return [{
    week: '17.12-11.01',
    days: days.map((d) => ({
      ...d,
      key: d.id,
      label: buildSlotListLabel(d),
      checked: Boolean(fixedDaysMap.value.get(buildFixedDayId(d.date))?.checked),
    })),
    checkedCount,
    totalCount: days.length,
    allChecked: checkedCount === days.length,
  }]
})
const visibleFieldGroups = computed(() => {
  if (!miniMode.value) return FIELD_GROUPS
  return FIELD_GROUPS
    .map((group) => ({ ...group, fields: group.fields.filter((field) => MINI_FIELDS.has(field)) }))
    .filter((group) => group.fields.length > 0)
})

watch(selectedCompareYear, () => {
  if (selectedSlot.value) loadDayData()
})

onMounted(async () => {
  await loadIndexData()
})

async function loadIndexData() {
  const fixedSnap = await getDocs(collection(db, 'fixedDays'))
  const ordinarySnap = await getDocs(collection(db, 'exceptionsTmp'))

  allPeriodDocs.value = ordinarySnap.docs.map((item) => ({ id: item.id, ...item.data() }))
  exceptionsById.value = new Map(ordinarySnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]))
  fixedDaysMap.value = new Map(fixedSnap.docs.map((item) => [item.id, item.data()]))
}


function buildDateSlots() {
  const out = []
  for (let d = 17; d <= 31; d += 1) {
    const dd = String(d).padStart(2, '0')
    out.push({ month: 12, day: d, label: `${dd}.12`, date: resolveBaseDate(12, d), id: `12-${dd}` })
  }
  for (let d = 1; d <= 11; d += 1) {
    const dd = String(d).padStart(2, '0')
    out.push({ month: 1, day: d, label: `${dd}.01`, date: resolveBaseDate(1, d), id: `01-${dd}` })
  }
  return out
}

function findDocByDate(date) {
  return exceptionsById.value.get(date)
    || allPeriodDocs.value.find((item) => String(item?._date || item?.id || '') === date)
    || null
}

function resolveBaseDate(month, day) {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const candidates = month === 12
    ? [`2025-${mm}-${dd}`]
    : [`2026-${mm}-${dd}`, `2025-${mm}-${dd}`]
  const existing = candidates.find((id) => exceptionsById.value.has(id))
  return existing || candidates[0]
}

function getListSource(slot) {
  const fixedDoc = fixedDaysMap.value.get(buildFixedDayId(slot.date))
  if (fixedDoc) return fixedDoc
  return findDocByDate(slot.date)
}

function hasMiniVersion(docItem) {
  if (!docItem) return false
  return Boolean(docItem.savedMini === true || docItem.isMiniVersion || docItem.miniSavedAt)
}

function buildSlotListLabel(slot) {
  const source = getListSource(slot) || {}
  const dayName = source._dayName || ''
  const periodType = source._periodType || ''
  const feastName = source._feastName || ''
  const suffixChecked = source.checked ? ' [✓]' : ''
  const suffixMini = hasMiniVersion(source) ? ' [mini]' : ''
  return `${slot.label} - '${dayName}' - [${periodType}] - [${periodType}] - [${feastName}]${suffixChecked}${suffixMini}`
}

function buildFixedDayId(dateStr) {
  const value = String(dateStr || '').trim()
  let d = NaN
  let m = NaN
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    m = Number(iso[2])
    d = Number(iso[3])
  } else {
    const dm = value.match(/^(\d{2})\.(\d{2})$/)
    if (dm) {
      d = Number(dm[1])
      m = Number(dm[2])
    }
  }
  if (!Number.isFinite(d) || !Number.isFinite(m)) {
    return ''
  }
  const prefix = m === 12 && d >= 17 && d <= 24 ? 'advent' : 'christmas'
  return `${prefix}-${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}`
}

function buildAdventHook(dateStr) {
  const value = String(dateStr || '').trim()
  let day = NaN
  let month = NaN
  let weekdayIndex = NaN

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    month = Number(iso[2])
    day = Number(iso[3])
    weekdayIndex = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`).getUTCDay()
  } else {
    const dm = value.match(/^(\d{2})\.(\d{2})$/)
    if (dm) {
      day = Number(dm[1])
      month = Number(dm[2])
      // Для формата DD.MM используем базовый литургический год 2025 для декабря
      // (для нашего хука это диапазон 17..24 декабря).
      const baseYear = 2025
      weekdayIndex = new Date(`${baseYear}-${dm[2]}-${dm[1]}T00:00:00Z`).getUTCDay()
    }
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(weekdayIndex)) return null
  if (month !== 12 || day < 17 || day > 24) return null
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const weekday = keys[weekdayIndex]
  if (!ADVENT_DEC17_24_HOOK[weekday]) return null
  return ADVENT_DEC17_24_HOOK
}
function buildEmptyDay() {
  return Object.fromEntries(FIELDS.map((field) => [field, '']))
}

function openDay(slot) {
  selectedSlot.value = slot
  selectedCompareYear.value = 2024
  templateAppliedSnapshot.value = null
  openedGroupKeys.value = []
  loadDayData()
}

function closeDay() {
  selectedSlot.value = null
}

function normalizeYear(item) {
  const raw = Number(item?._year ?? item?.year ?? item?._liturgicalYear ?? parseDayId(item?.id)?.year ?? 0)
  if (raw >= 19 && raw <= 25) return raw + 2000
  return raw
}

function parseDayId(id) {
  const value = String(id ?? '').trim()

  const ordinaryMatch = value.match(/^advent-w(\d{1,2})-d(\d{1,2})$/i)
  if (ordinaryMatch) {
    return {
      periodType: 'advent',
      week: Number(ordinaryMatch[1]),
      day: Number(ordinaryMatch[2]),
      year: null,
    }
  }

  const yearWeekDayMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (yearWeekDayMatch) {
    return {
      periodType: 'advent',
      year: Number(yearWeekDayMatch[1]),
      week: Number(yearWeekDayMatch[2]),
      day: Number(yearWeekDayMatch[3]),
    }
  }

  return null
}

function getDocMeta(item) {
  const fromId = parseDayId(item?.id)
  const dateValue = String(item?._date || item?.id || '')
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return {
    periodType: item?._periodType ?? fromId?.periodType ?? 'advent',
    week: Number(item?._periodWeekNumber ?? fromId?.week ?? 0),
    day: Number(item?._dayOfWeek ?? fromId?.day ?? 0),
    year: normalizeYear(item) || (dateMatch ? Number(dateMatch[1]) : 0),
    month: dateMatch ? Number(dateMatch[2]) : 0,
    monthDay: dateMatch ? `${dateMatch[2]}-${dateMatch[3]}` : '',
  }
}

function findDayBySlot(year) {
  if (!selectedSlot.value) return null
  const selectedDate = String(selectedSlot.value.date || '')
  const selectedMonthDay = selectedDate.slice(5) // MM-DD
  const [monthStr, dayStr] = selectedMonthDay.split('-')
  const month = Number(monthStr)
  const day = Number(dayStr)
  const targetYear = Number(year) + (month === 1 ? 1 : 0)
  const targetDate = `${targetYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  if (Number(year) === 2025) {
    return findDocByDate(selectedDate) || allPeriodDocs.value.find((item) => {
      const date = String(item?._date || item?.id || '')
      return date.endsWith(selectedMonthDay) && (date.startsWith('2025-') || date.startsWith('2026-'))
    }) || null
  }
  return findDocByDate(targetDate) || allPeriodDocs.value.find((item) => {
    const date = String(item?._date || item?.id || '')
    return date === targetDate
  }) || null
}

function mergeWithDefaults(source) {
  const day = buildEmptyDay()
  FIELDS.forEach((field) => {
    day[field] = source?.[field] ?? ''
  })
  return day
}

function loadDayData() {
  const selected = selectedSlot.value
  if (!selected) return

  const fixedId = buildFixedDayId(selected.date)
  const fixedDoc = fixedDaysMap.value.get(fixedId) || null

  const doc2025 = findDayBySlot(2025)
  const leftSource = fixedDoc || doc2025 || {}
  const fallback = {
    _date: selected.date,
    _periodType: leftSource?._periodType || '',
    _periodWeekNumber: leftSource?._periodWeekNumber || '',
    _dayOfWeek: leftSource?._dayOfWeek || '',
    _dayName: leftSource?._dayName || '',
    _feastName: leftSource?._feastName || '',
  }

  leftDraft.value = mergeWithDefaults(fixedDoc || doc2025 || fallback)
  leftOriginal.value = mergeWithDefaults(fixedDoc || doc2025 || fallback)
  editableChecked.value = Boolean(fixedDoc?.checked)
  miniMode.value = Boolean(fixedDoc?.savedMini || fixedDoc?.isMiniVersion)

  const compareSource = selectedCompareYear.value === 2025
    ? (fixedDoc || doc2025 || fallback)
    : (findDayBySlot(selectedCompareYear.value) || fallback)

  compareDay.value = mergeWithDefaults(compareSource)
}

function formatPreviewValue(value) {
  if (value === null || value === undefined || value === '') return '— пусто —'
  const stripped = String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped || '— пусто —'
}

function normalizedCompare(value) {
  return formatPreviewValue(value)
}

function isDifferent(field) {
  return normalizedCompare(leftDraft.value[field]) !== normalizedCompare(compareDay.value[field])
}

function groupDiffCount(fields) {
  return fields.filter((field) => isDifferent(field)).length
}

function leftCardColor(field) {
  if (isEmpty(leftDraft.value[field]) && !EMPTY_HIGHLIGHT_EXCLUDED.has(field)) return 'error'
  if (isDifferent(field)) return 'warning'
  return undefined
}

function leftCardVariant(field) {
  if ((isEmpty(leftDraft.value[field]) && !EMPTY_HIGHLIGHT_EXCLUDED.has(field)) || isDifferent(field)) return 'tonal'
  return 'outlined'
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function openEditDialog(field) {
  editField.value = field
  editValue.value = String(leftDraft.value[field] ?? '')
  editMode.value = 'html'
  editDialogOpen.value = true
}

function closeEditDialog() {
  editDialogOpen.value = false
  editField.value = ''
  editValue.value = ''
}

function applyEdit() {
  if (!editField.value) return
  leftDraft.value[editField.value] = editValue.value
  closeEditDialog()
}

function copyField(field) {
  leftDraft.value[field] = compareDay.value[field]
}

function canCopyField(field) {
  return FIELDS.includes(field)
}

function copyAllFromCompare() {
  FIELDS.forEach((field) => {
    if (!READ_ONLY_FIELDS.has(field)) {
      leftDraft.value[field] = compareDay.value[field]
    }
  })
}

function undoAllChanges() {
  leftDraft.value = { ...leftOriginal.value }
  templateAppliedSnapshot.value = null
}

function defaultTemplateTitle() {
  const period = leftDraft.value._periodType || 'advent'
  const day = leftDraft.value._dayOfWeek || selectedSlot.value?.day || ''
  const dayLabel = WEEKDAY_LABEL_MAP[Number(day)] || day || 'День'
  return `${dayLabel}-${period}`
}

function openSaveTemplateDialog() {
  templateTitleInput.value = defaultTemplateTitle()
  saveTemplateDialogOpen.value = true
}

function closeSaveTemplateDialog() {
  saveTemplateDialogOpen.value = false
  templateTitleInput.value = ''
}

async function saveTemplate() {
  if (templateSaving.value) return
  templateSaving.value = true
  try {
    const dayOfWeek = Number(leftDraft.value._dayOfWeek || selectedSlot.value?.day || 0)
    const skipFields = new Set()
    if (dayOfWeek === 7) {
      skipFields.add('vesperAntMag')
    }
    if (dayOfWeek === 1) {
      skipFields.add('vesperAntMag')
      skipFields.add('laudesAntBen')
    }

    const payload = {
      title: String(templateTitleInput.value || defaultTemplateTitle()).trim(),
      ...Object.fromEntries(
        TEMPLATE_FIELDS
          .filter((field) => !skipFields.has(field))
          .map((field) => [field, leftDraft.value[field] ?? '']),
      ),
    }
    await addDoc(collection(db, 'tmpTemplates'), payload)
    closeSaveTemplateDialog()
  } finally {
    templateSaving.value = false
  }
}

async function openLoadTemplateDialog() {
  const snap = await getDocs(collection(db, 'tmpTemplates'))
  templatesList.value = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
  selectedTemplateId.value = templatesList.value[0]?.id || ''
  loadTemplateDialogOpen.value = true
}

function closeLoadTemplateDialog() {
  loadTemplateDialogOpen.value = false
  selectedTemplateId.value = ''
}

function applySelectedTemplate() {
  const selected = templatesList.value.find((item) => item.id === selectedTemplateId.value)
  if (!selected) return
  if (!templateAppliedSnapshot.value) {
    templateAppliedSnapshot.value = { ...leftDraft.value }
  }
  TEMPLATE_FIELDS.forEach((field) => {
    leftDraft.value[field] = selected[field] ?? ''
  })
  closeLoadTemplateDialog()
}

function rollbackTemplateApply() {
  if (!templateAppliedSnapshot.value) return
  leftDraft.value = { ...templateAppliedSnapshot.value }
  templateAppliedSnapshot.value = null
}

function getFallbackBySlot() {
  if (!selectedSlot.value) return null
  return {
    _date: selectedSlot.value.date,
    _periodType: '',
    _periodWeekNumber: '',
    _dayOfWeek: '',
  }
}

function getCompareSourceByYear(year) {
  if (!selectedSlot.value) return null
  const fixedId = buildFixedDayId(selectedSlot.value.date)
  const fixedDoc = fixedDaysMap.value.get(fixedId) || null
  const doc2025 = findDayBySlot(2025)
  const fallback = getFallbackBySlot()
  if (Number(year) === 2025) return fixedDoc || doc2025 || fallback
  return findDayBySlot(Number(year)) || fallback
}

function yearDiffCount(year) {
  if (!selectedSlot.value) return 0
  const source = mergeWithDefaults(getCompareSourceByYear(year) || {})
  return FIELDS.filter((field) => normalizedCompare(leftDraft.value[field]) !== normalizedCompare(source[field])).length
}

async function saveDay() {
  if (!selectedSlot.value || saving.value) return
  saving.value = true
  try {
    const dateForSave = String(leftDraft.value._date || selectedSlot.value?.date || '')
    const id = buildFixedDayId(dateForSave)
    if (!id) {
      console.error('[ChristmasExceptionsDev.saveDay] invalid date for fixedDays id', { dateForSave, slot: selectedSlot.value })
      throw new Error(`Invalid date for fixedDays id: ${dateForSave}`)
    }
    const week = leftDraft.value._periodWeekNumber ?? ''
    const day = leftDraft.value._dayOfWeek ?? ''
    const periodType = leftDraft.value._periodType || 'advent'

    const fullPayload = {
      ...Object.fromEntries(FIELDS.map((field) => [field, leftDraft.value[field] ?? ''])),
      _periodType: periodType,
      _periodWeekNumber: week,
      _dayOfWeek: day,
      checked: Boolean(editableChecked.value),
      savedMini: Boolean(miniMode.value),
      miniSavedAt: miniMode.value ? new Date().toISOString() : null,
    }
    fullPayload._date = dateForSave

    const payload = miniMode.value
      ? {
          ...Object.fromEntries(MINI_SAVE_FIELDS.map((field) => [field, fullPayload[field] ?? ''])),
          checked: fullPayload.checked,
          savedMini: fullPayload.savedMini,
          miniSavedAt: fullPayload.miniSavedAt,
        }
      : fullPayload

    delete payload._dayOfWeek
    delete payload._periodWeekNumber

    const hook = buildAdventHook(dateForSave)
    if (hook) {
      payload.monday = hook.monday
      payload.tuesday = hook.tuesday
      payload.wednesday = hook.wednesday
      payload.thursday = hook.thursday
      payload.friday = hook.friday
      payload.saturday = hook.saturday
    }

    console.log('[ChristmasExceptionsDev.saveDay] start', { id, dateForSave, miniMode: miniMode.value, checked: editableChecked.value })
    console.log('[ChristmasExceptionsDev.saveDay] payload keys', Object.keys(payload))
    await setDoc(doc(db, 'fixedDays', id), payload)
    fixedDaysMap.value.set(id, payload)
    console.log('[ChristmasExceptionsDev.saveDay] saved to fixedDays', { id })
    leftOriginal.value = { ...leftDraft.value }
    editableChecked.value = true
  } catch (error) {
    console.error('[ChristmasExceptionsDev.saveDay] failed', error)
    throw error
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.christmas-exceptions-admin {
  min-height: 100%;
}

.compare-table-wrapper {
  width: 100%;
}

.compare-scroll {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.field-value {
  white-space: pre-wrap;
  word-break: break-word;
}

.line-clamp-2 {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.quill-full :deep(.ql-editor) {
  min-height: calc(100vh - 260px);
}

@media (max-width: 960px) {
  .header-row {
    display: none;
  }

  .field-row {
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
}
</style>
