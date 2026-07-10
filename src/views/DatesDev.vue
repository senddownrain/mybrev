<template>
  <v-container fluid class="pa-4 dates-admin">
    <v-toolbar density="comfortable" rounded="lg" class="mb-4">
      <template v-if="!selectedItem">
        <v-toolbar-title>DatesDev</v-toolbar-title>
      </template>
      <template v-else>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="closeDate">Назад</v-btn>
        <v-toolbar-title>{{ selectedDateLabel }}</v-toolbar-title>
        <v-btn color="primary" :loading="saving" @click="saveDate">Сохранить</v-btn>
      </template>
    </v-toolbar>

    <v-card v-if="!selectedItem" rounded="lg" class="pa-4">
      <v-expansion-panels v-model="openedMonths" multiple>
        <v-expansion-panel v-for="month in grouped" :key="month.month" :value="month.month">
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100 pr-2">
              <span :class="month.allChecked ? 'text-success font-weight-bold' : ''">{{ month.month }}</span>
              <v-chip
                size="x-small"
                :color="month.allChecked ? 'success' : 'default'"
                :variant="month.allChecked ? 'tonal' : 'outlined'"
              >
                {{ month.checkedCount }}/{{ month.totalCount }}
              </v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="comfortable">
              <v-list-item
                v-for="item in month.items"
                :key="item.id"
                :title="itemLabel(item)"
                :active="item.checked"
                rounded="lg"
                @click="openDate(item)"
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
      <v-expansion-panels v-model="topControlsPanel" class="mb-4">
        <v-expansion-panel value="top-controls">
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100 pr-2 ga-2">
              <span>Параметры, действия и предупреждения</span>
              <div class="d-flex align-center ga-2 flex-wrap justify-end">
                <v-chip size="x-small" color="secondary" variant="tonal">
                  Сравнение: {{ selectedCompareYear }}
                </v-chip>
                <v-chip size="x-small" color="info" variant="tonal">
                  {{ fixedParamsSummary }}
                </v-chip>
                <v-chip
                  v-if="emptyHighlightFields.length"
                  size="x-small"
                  color="warning"
                  variant="tonal"
                >
                  Пустые: {{ emptyHighlightFields.length }}
                </v-chip>
              </div>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-card variant="outlined" class="mb-4">
              <v-card-title class="text-subtitle-1">Параметры fixedCalendar на эту дату</v-card-title>
              <v-card-text>
                <v-row dense>
                  <v-col cols="12" md="2">
                    <v-text-field v-model="fixedParamsDraft.date" label="date" density="compact" variant="outlined" />
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-text-field v-model="fixedParamsDraft.title" label="title" density="compact" variant="outlined" />
                  </v-col>
                  <v-col cols="12" md="3">
                    <v-text-field v-model="fixedParamsDraft.rank" label="rank" density="compact" variant="outlined" />
                  </v-col>
                  <v-col cols="12" md="3">
                    <v-text-field v-model="fixedParamsDraft.place" label="place" density="compact" variant="outlined" />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>

            <v-row class="mb-3" align="center" dense>
              <v-col cols="12" md="4" lg="3">
                <v-select v-model="selectedCompareYear" :items="compareYears" label="Год для сравнения" density="compact" variant="outlined">
                  <template #item="{ props, item }">
                    <v-list-item v-bind="props">
                      <template #append>
                        <v-chip
                          v-if="selectedItem && yearDiffCount(item.raw)"
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
                <v-checkbox v-model="saveVesper1" label="Сохранять I вечерню" hide-details />
              </v-col>
              <v-col cols="12" md="4" lg="3" class="d-flex ga-2 justify-md-end">
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
                <v-btn color="primary" size="small" :loading="saving" @click="saveDate">Сохранить</v-btn>
              </v-col>
            </v-row>

            <v-alert
              v-if="emptyHighlightFields.length"
              type="warning"
              variant="tonal"
              density="comfortable"
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
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <div class="compare-table-wrapper">
        <v-row class="header-row" no-gutters>
          <v-col cols="6" class="px-1">
            <v-card color="primary" variant="tonal" class="pa-2 text-subtitle-1 font-weight-bold">
              Текущая версия (fixedDays/2025) — редактируемая
            </v-card>
          </v-col>
          <v-col cols="6" class="px-1">
            <v-card color="secondary" variant="tonal" class="pa-2 text-subtitle-1 font-weight-bold">
              Сравнение: {{ selectedCompareYear }}
            </v-card>
          </v-col>
        </v-row>

        <div>
          <v-expansion-panels v-model="openedGroupKeys" multiple>
            <v-expansion-panel
              v-for="group in FIELD_GROUPS"
              :key="group.key"
              :value="group.key"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-2">
                  <span>{{ group.title }}</span>
                  <div class="d-flex align-center ga-2 flex-wrap justify-end">
                    <v-chip size="x-small" color="primary" variant="tonal">{{ groupDiffCount(group.fields) }} отличий</v-chip>
                  </div>
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
                          <div class="d-flex align-center ga-1">
                            <v-btn
                              v-if="canSetFromDay(field)"
                              size="small"
                              variant="text"
                              icon="mdi-calendar-import"
                              title="Поставить [from-day]"
                              @click="setFromDay(field)"
                            />
                            <v-btn
                              v-if="!READ_ONLY_FIELDS.has(field)"
                              size="small"
                              variant="text"
                              icon="mdi-pencil"
                              @click="openEditDialog(field)"
                            />
                          </div>
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
          <v-card variant="outlined" class="mb-4">
            <v-card-title>1. Название</v-card-title>
            <v-card-text>
              <v-text-field
                v-model="templateTitleInput"
                label="Название шаблона"
                variant="outlined"
                hint="Можно изменить автосгенерированное название перед сохранением"
                persistent-hint
              />
            </v-card-text>
          </v-card>

          <v-card variant="outlined" class="mb-4">
            <v-card-title class="d-flex align-center justify-space-between ga-2">
              <span>2. Поля шаблона</span>
              <v-checkbox
                v-model="allTemplateFieldsSelected"
                label="Выбрать все"
                density="compact"
                hide-details
              />
            </v-card-title>
            <v-card-text>
              <v-alert type="info" variant="tonal" density="compact" class="mb-3">
                Будут сохранены только отмеченные поля: {{ selectedTemplateFields.length }}/{{ TEMPLATE_FIELDS.length }}.
              </v-alert>
              <v-row dense>
                <v-col
                  v-for="field in TEMPLATE_FIELDS"
                  :key="`template-field-${field}`"
                  cols="12"
                  sm="6"
                  md="4"
                  lg="3"
                >
                  <v-checkbox
                    v-model="selectedTemplateFields"
                    :label="field"
                    :value="field"
                    density="compact"
                    hide-details
                  />
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card variant="outlined">
            <v-card-title>3. Смержить с другим шаблоном</v-card-title>
            <v-card-text>
              <v-select
                v-model="mergeTemplateId"
                :items="mergeTemplateItems"
                item-title="title"
                item-value="id"
                label="Шаблон для merge"
                variant="outlined"
                clearable
                :loading="templatesLoading"
                :hint="templatePeriodType ? `Исключены шаблоны с _periodType: ${templatePeriodType}` : 'Можно сохранить без merge'"
                persistent-hint
              />
              <v-alert v-if="mergeOverwriteFields.length" type="warning" variant="tonal" density="comfortable" class="mt-3">
                <div class="font-weight-medium mb-2">При сохранении будут перетерты поля из выбранного шаблона:</div>
                <div class="d-flex flex-wrap ga-1">
                  <v-chip
                    v-for="field in mergeOverwriteFields"
                    :key="`merge-overwrite-${field}`"
                    size="small"
                    color="warning"
                    variant="outlined"
                  >
                    {{ field }}
                  </v-chip>
                </div>
              </v-alert>
            </v-card-text>
          </v-card>
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
          <v-expansion-panels
            v-if="templatesList.length"
            v-model="openedTemplatePeriodGroups"
            multiple
          >
            <v-expansion-panel
              v-for="group in templatePeriodGroups"
              :key="group.key"
              :value="group.key"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-2">
                  <span>{{ group.title }}</span>
                  <v-chip size="x-small" color="primary" variant="tonal">{{ group.items.length }}</v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-list lines="two" density="comfortable">
                  <v-list-item
                    v-for="template in group.items"
                    :key="template.id"
                    :title="template.title || template.id"
                    :subtitle="templateSubtitle(template)"
                    :active="selectedTemplateId === template.id"
                    rounded="lg"
                    @click="selectedTemplateId = template.id"
                  >
                    <template #append>
                      <v-icon v-if="selectedTemplateId === template.id" color="primary">mdi-check-circle</v-icon>
                    </template>
                  </v-list-item>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          <v-alert v-else type="info" variant="tonal">
            Подходящих шаблонов нет: шаблоны с текущим <code>_periodType</code> исключены.
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
import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from '@/plugins/firebase'
import {
  fixedCalendar,
  denormalizeFixedPlace,
  denormalizeFixedRank,
  normalizeFixedPlace,
  normalizeFixedRank,
} from '@/constants/fixedCalendar'

const compareYears = [2025, 2024, 2023, 2022, 2021, 2020, 2019]

const BOOLEAN_FIELDS = new Set()

const FIELDS = [
  '_date', '_feastName', '_rank', '_place', '_dayName', 'feastComment',
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

const READ_ONLY_FIELDS = new Set(['_date'])
const FROM_DAY_EXCLUDED_FIELDS = new Set(['_date', '_feastName', '_rank', '_place', '_dayName'])
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
const TEMPLATE_FIELDS = FIELDS.filter((field) => !['_date', '_feastName', '_rank', '_place', '_dayName', 'feastComment'].includes(field))
const SAVE_BASE_FIELDS = [
  '_date', '_feastName', '_rank', '_place', 'invitatoriumAnt', 'feastComment',
  'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
  'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr', 'laudesHymn', 'laudesAnt1', 'laudesAnt2',
  'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr',
  'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr',
  'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR',
  'vesperAntMag', 'vesperInter', 'vesperPr',
]
const VESPER1_FIELDS = ['vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3', 'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr']
const FIELD_GROUPS = [
  {
    key: 'base',
    title: 'Базовые поля даты',
    fields: ['_date', '_feastName', '_rank', '_place', '_dayName', 'feastComment'],
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

const selectedItem = ref(null)
const selectedCompareYear = ref(2024)
const fixedDaysMap = ref(new Map())
const compareByYear = ref(new Map())

const fixedParamsDraft = ref(buildEmptyFixedParams())
const fixedParamsOriginal = ref(buildEmptyFixedParams())
const leftDraft = ref(buildEmptyDay())
const leftOriginal = ref(buildEmptyDay())
const compareDay = ref(buildEmptyDay())
const editableChecked = ref(false)
const saveVesper1 = ref(false)

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
const selectedTemplateFields = ref([...TEMPLATE_FIELDS])
const mergeTemplateId = ref(null)
const templatesLoading = ref(false)
const topControlsPanel = ref(null)
const templateAppliedSnapshot = ref(null)
const openedGroupKeys = ref([])
const openedMonths = ref(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
const openedTemplatePeriodGroups = ref([])

const selectedDateLabel = computed(() => (selectedItem.value ? itemLabel({ ...selectedItem.value, ...fixedParamsDraft.value }) : ''))
const fixedParamsSummary = computed(() => {
  const params = fixedParamsDraft.value
  return [params.date, params.title, params.rank, params.place].filter(Boolean).join(' · ') || 'пусто'
})
const templatePeriodType = computed(() => String(leftDraft.value._periodType || selectedItem.value?._periodType || '').trim())
const filteredTemplatesList = computed(() => filterTemplatesByPeriod(templatesList.value))
const mergeTemplateItems = computed(() => filteredTemplatesList.value.map((item) => ({
  ...item,
  title: item.title || item.id,
})))
const templatePeriodGroups = computed(() => groupTemplatesByPeriod(templatesList.value))
const selectedMergeTemplate = computed(() => templatesList.value.find((item) => item.id === mergeTemplateId.value) || null)
const mergeOverwriteFields = computed(() => {
  const mergeTemplate = selectedMergeTemplate.value
  if (!mergeTemplate) return []
  return selectedTemplateFields.value.filter((field) => (
    mergeTemplate[field] !== undefined
    && normalizedCompare(mergeTemplate[field]) !== normalizedCompare(templateFieldValue(field))
  ))
})
const allTemplateFieldsSelected = computed({
  get: () => selectedTemplateFields.value.length === TEMPLATE_FIELDS.length,
  set: (value) => {
    selectedTemplateFields.value = value ? [...TEMPLATE_FIELDS] : []
  },
})

const grouped = computed(() => {
  const months = new Map()
  fixedCalendar.forEach((item) => {
    const id = idFor(item)
    const fixedDoc = fixedDaysMap.value.get(id) || {}
    const merged = { ...item, ...fixedDoc, id, checked: Boolean(fixedDoc.checked) }
    const month = item.date.slice(3, 5)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push(merged)
  })

  return [...months.entries()].map(([month, items]) => {
    const checkedCount = items.filter((item) => item.checked).length
    return {
      month,
      items,
      checkedCount,
      totalCount: items.length,
      allChecked: items.length > 0 && checkedCount === items.length,
    }
  })
})

const emptyHighlightFields = computed(() => {
  if (!selectedItem.value) return []
  return FIELDS.filter((field) => (
    !EMPTY_HIGHLIGHT_EXCLUDED.has(field)
    && isEmpty(leftDraft.value[field])
  ))
})

watch(selectedCompareYear, () => {
  if (selectedItem.value) loadCompareDay()
})

onMounted(async () => {
  await loadIndexData()
})

async function loadIndexData() {
  const snap = await getDocs(collection(db, 'fixedDays'))
  fixedDaysMap.value = new Map(snap.docs.map((item) => [item.id, item.data()]))
}

function idFor(item) {
  const rank = normalizeFixedRank(item.rank) || 'none'
  const place = normalizeFixedPlace(item.place) || 'none'
  return `${item.date}-${rank}-${place}`.toLowerCase()
}

function itemLabel(item) {
  return `${item.date} — ${item.title}${item.rank ? ` (${item.rank})` : ''}${item.place ? ` [${item.place}]` : ''}`
}

function buildDaysTmpId(year, date) {
  return `${year}-${date.slice(3, 5)}-${date.slice(0, 2)}`
}

function buildEmptyDay() {
  return Object.fromEntries(FIELDS.map((field) => [field, BOOLEAN_FIELDS.has(field) ? false : '']))
}

function buildEmptyFixedParams() {
  return {
    date: '',
    title: '',
    rank: '',
    place: '',
  }
}

function mergeWithDefaults(source) {
  const day = buildEmptyDay()
  FIELDS.forEach((field) => {
    day[field] = source?.[field] ?? (BOOLEAN_FIELDS.has(field) ? false : '')
  })
  if (source?._periodType) day._periodType = source._periodType
  return day
}

async function openDate(item) {
  selectedItem.value = item
  selectedCompareYear.value = 2024
  templateAppliedSnapshot.value = null
  openedGroupKeys.value = []
  compareByYear.value = new Map()
  fixedParamsDraft.value = {
    date: item.date || '',
    title: item.title || '',
    rank: denormalizeFixedRank(item.rank || ''),
    place: denormalizeFixedPlace(item.place || ''),
  }
  fixedParamsOriginal.value = { ...fixedParamsDraft.value }
  await loadDateData()
}

function closeDate() {
  selectedItem.value = null
}

async function loadDateData() {
  const selected = selectedItem.value
  if (!selected) return

  const id = idFor(selected)
  const fixedDoc = fixedDaysMap.value.get(id) || null
  const byYear = await loadDaysTmpForSelectedDate(selected.date)
  compareByYear.value = byYear

  const doc2025 = byYear.get(2025)
  const fallback = buildFallback(selected)
  const leftSource = fixedDoc || doc2025 || fallback

  leftDraft.value = mergeWithDefaults(leftSource)
  leftOriginal.value = mergeWithDefaults(leftSource)
  editableChecked.value = Boolean(fixedDoc?.checked)
  loadCompareDay()
}

async function loadDaysTmpForSelectedDate(date) {
  const entries = await Promise.all(compareYears.map(async (year) => {
    const id = buildDaysTmpId(year, date)
    const snap = await getDoc(doc(db, 'daysTmp', id))
    if (snap.exists()) {
      return [year, { id: snap.id, ...snap.data() }]
    }

    const dateQuery = query(collection(db, 'daysTmp'), where('_date', '==', date))
    const byDateSnap = await getDocs(dateQuery)
    const matchingDoc = byDateSnap.docs.find((item) => item.id === id)
    return [year, matchingDoc ? { id: matchingDoc.id, ...matchingDoc.data() } : null]
  }))
  return new Map(entries)
}

function buildFallback(item) {
  return {
    _date: item.date || '',
    _feastName: item.title || '',
    _rank: item.rank || '',
    _place: item.place || '',
    _dayName: idFor(item),
    feastComment: item.place || '',
  }
}

function loadCompareDay() {
  const selected = selectedItem.value
  if (!selected) return
  compareDay.value = mergeWithDefaults(getCompareSourceByYear(selectedCompareYear.value) || {})
}

function getCompareSourceByYear(year) {
  if (!selectedItem.value) return null
  const fixedId = idFor(selectedItem.value)
  const fixedDoc = fixedDaysMap.value.get(fixedId) || null
  const doc2025 = compareByYear.value.get(2025)
  const fallback = buildFallback(selectedItem.value)
  if (Number(year) === 2025) return fixedDoc || doc2025 || fallback
  return compareByYear.value.get(Number(year)) || fallback
}

function formatPreviewValue(value) {
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
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

function yearDiffCount(year) {
  if (!selectedItem.value) return 0
  const source = mergeWithDefaults(getCompareSourceByYear(year) || {})
  return FIELDS.filter((field) => normalizedCompare(leftDraft.value[field]) !== normalizedCompare(source[field])).length
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
  if (typeof value === 'boolean') return false
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

function canSetFromDay(field) {
  return FIELDS.includes(field) && !FROM_DAY_EXCLUDED_FIELDS.has(field)
}

function setFromDay(field) {
  if (!canSetFromDay(field)) return
  leftDraft.value[field] = '[from-day]'
}

function copyField(field) {
  leftDraft.value[field] = compareDay.value[field]
}

function canCopyField(field) {
  return FIELDS.includes(field) && !READ_ONLY_FIELDS.has(field)
}

function copyAllFromCompare() {
  FIELDS.forEach((field) => {
    if (!READ_ONLY_FIELDS.has(field)) {
      leftDraft.value[field] = compareDay.value[field]
    }
  })
}

function undoAllChanges() {
  fixedParamsDraft.value = { ...fixedParamsOriginal.value }
  leftDraft.value = { ...leftOriginal.value }
  templateAppliedSnapshot.value = null
}

function defaultTemplateTitle() {
  const title = fixedParamsDraft.value.title || leftDraft.value._feastName || 'fixed-date'
  const date = fixedParamsDraft.value.date || selectedItem.value?.date || ''
  return `${date}-${title}`
}


function templateFieldValue(field) {
  return leftDraft.value[field] ?? (BOOLEAN_FIELDS.has(field) ? false : '')
}

function templatePayloadFrom(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, source?.[field] ?? (BOOLEAN_FIELDS.has(field) ? false : '')]))
}

function templatePeriodKey(template) {
  const period = String(template?._periodType || '').trim()
  return period || 'without-period'
}

function templatePeriodTitle(template) {
  const period = String(template?._periodType || '').trim()
  return period ? `Период: ${period}` : 'Без периода'
}

function templateSubtitle(template) {
  const period = String(template?._periodType || '').trim()
  return period ? `ID: ${template.id} · _periodType: ${period}` : `ID: ${template.id}`
}

function groupTemplatesByPeriod(templates) {
  const groups = new Map()
  templates.forEach((template) => {
    const key = templatePeriodKey(template)
    if (!groups.has(key)) {
      groups.set(key, { key, title: templatePeriodTitle(template), items: [] })
    }
    groups.get(key).items.push(template)
  })
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title))
}

function filterTemplatesByPeriod(templates) {
  if (!templatePeriodType.value) return templates
  return templates.filter((item) => item._periodType !== templatePeriodType.value)
}

async function loadTemplatesList() {
  templatesLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'tmpTemplates'))
    templatesList.value = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
  } finally {
    templatesLoading.value = false
  }
}

async function openSaveTemplateDialog() {
  templateTitleInput.value = defaultTemplateTitle()
  selectedTemplateFields.value = [...TEMPLATE_FIELDS]
  mergeTemplateId.value = null
  await loadTemplatesList()
  saveTemplateDialogOpen.value = true
}

function closeSaveTemplateDialog() {
  saveTemplateDialogOpen.value = false
  templateTitleInput.value = ''
  mergeTemplateId.value = null
}


async function saveTemplate() {
  if (templateSaving.value) return
  templateSaving.value = true
  try {
    const mergeTemplate = selectedMergeTemplate.value
    const payload = {
      ...(mergeTemplate ? templatePayloadFrom(mergeTemplate, TEMPLATE_FIELDS) : {}),
      title: String(templateTitleInput.value || defaultTemplateTitle()).trim(),
      ...templatePayloadFrom(leftDraft.value, selectedTemplateFields.value),
    }
    if (templatePeriodType.value) payload._periodType = templatePeriodType.value
    await addDoc(collection(db, 'tmpTemplates'), payload)
    closeSaveTemplateDialog()
  } finally {
    templateSaving.value = false
  }
}

async function openLoadTemplateDialog() {
  await loadTemplatesList()
  templatesList.value = filteredTemplatesList.value
  selectedTemplateId.value = templatesList.value[0]?.id || ''
  openedTemplatePeriodGroups.value = templatePeriodGroups.value.map((group) => group.key)
  loadTemplateDialogOpen.value = true
}

function closeLoadTemplateDialog() {
  loadTemplateDialogOpen.value = false
  selectedTemplateId.value = ''
  openedTemplatePeriodGroups.value = []
}

function applySelectedTemplate() {
  const selected = templatesList.value.find((item) => item.id === selectedTemplateId.value)
  if (!selected) return
  if (!templateAppliedSnapshot.value) {
    templateAppliedSnapshot.value = { ...leftDraft.value }
  }
  TEMPLATE_FIELDS.forEach((field) => {
    leftDraft.value[field] = selected[field] ?? (BOOLEAN_FIELDS.has(field) ? false : '')
  })
  if (selected._periodType) leftDraft.value._periodType = selected._periodType
  closeLoadTemplateDialog()
}

function rollbackTemplateApply() {
  if (!templateAppliedSnapshot.value) return
  leftDraft.value = { ...templateAppliedSnapshot.value }
  templateAppliedSnapshot.value = null
}

async function saveDate() {
  if (!selectedItem.value || saving.value) return
  saving.value = true
  try {
    const fixedParams = { ...fixedParamsDraft.value }
    const normalizedFixedParams = {
      ...fixedParams,
      rank: normalizeFixedRank(fixedParams.rank),
      place: normalizeFixedPlace(fixedParams.place),
    }
    const { date: _dateToSkip, ...normalizedFixedParamsWithoutDate } = normalizedFixedParams
    const fieldsToSave = saveVesper1.value ? [...SAVE_BASE_FIELDS, ...VESPER1_FIELDS] : SAVE_BASE_FIELDS
    const payload = {
      ...Object.fromEntries(fieldsToSave.map((field) => [field, leftDraft.value[field] ?? (BOOLEAN_FIELDS.has(field) ? false : '')])),
      _rank: normalizedFixedParams.rank || '',
      _place: normalizedFixedParams.place || '',
      ...normalizedFixedParamsWithoutDate,
      checked: Boolean(editableChecked.value),
    }

    const id = idFor(normalizedFixedParams)
    await setDoc(doc(db, 'fixedDays', id), payload)
    fixedDaysMap.value.set(id, payload)
    selectedItem.value = { ...selectedItem.value, ...normalizedFixedParams, id }
    fixedParamsOriginal.value = { ...normalizedFixedParams }
    leftOriginal.value = { ...leftDraft.value }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.dates-admin {
  min-height: 100%;
}

.compare-table-wrapper {
  width: 100%;
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
