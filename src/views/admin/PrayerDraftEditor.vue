<template>
  <v-container class="draft-editor">
    <router-link :to="{ name: 'AdminPrayerDrafts' }" class="back-link"><v-icon icon="mdi-arrow-left" size="18" /> Чарнавікі малітваў</router-link>

    <v-skeleton-loader v-if="loading" type="heading, paragraph, image, paragraph" />
    <v-alert v-else-if="loadError" type="error" variant="tonal">{{ loadError }}</v-alert>

    <template v-else-if="draft">
      <header class="editor-head">
        <div>
          <p class="eyebrow">Чарнавік · {{ originLabel }}</p>
          <h1>{{ form.title || 'Без назвы' }}</h1>
        </div>
        <v-chip :color="statusColor" variant="flat">{{ DRAFT_STATUS_LABELS[draft.status] }}</v-chip>
      </header>

      <v-alert v-if="draft.status === 'published'" type="success" variant="tonal" class="mb-4">
        Апублікавана. Малітва: <router-link :to="`/prayer/${draft.targetPrayerId}`">/prayer/{{ draft.targetPrayerId }}</router-link>. Чарнавік толькі захоўвае гісторыю і не змяняецца.
      </v-alert>
      <v-alert v-if="draft.reason && draft.status !== 'published'" type="warning" variant="tonal" class="mb-4">{{ DRAFT_REASON_LABELS[draft.reason] || draft.reason }}<template v-if="draft.flagReasons?.length">: {{ draft.flagReasons.join('; ') }}</template></v-alert>
      <v-alert v-if="message" :type="message.type" variant="tonal" class="mb-4" closable @click:close="message = null">{{ message.text }}</v-alert>

      <div class="editor-grid">
        <div class="editor-main">
          <v-card class="card" elevation="0">
            <v-textarea v-model="form.title" label="Назва" variant="outlined" rows="1" auto-grow counter="200" maxlength="200" :readonly="locked" />
            <PrayerMarkdownEditor v-model="form.text" :prayers="prayers" :prayers-loading="prayersLoading" :normalize-legacy="false" />
          </v-card>

          <v-card class="card" elevation="0">
            <h2>Тэгі і доступ</h2>
            <v-combobox v-model="form.tags" :items="availableTags" label="Тэгі" multiple chips closable-chips variant="outlined" hide-details="auto" :readonly="locked" hint="Абярыце існуючыя тэгі; новыя дадавайце толькі пры патрэбе." persistent-hint />
            <p v-if="newTags.length" class="hint hint--warn">Новыя тэгі (іх няма ў базе): {{ newTags.join(', ') }}</p>
            <p class="hint">Катэгорыі збіраюцца па тэгах: {{ categoryNames || 'пакуль ніводная не падыходзіць' }}.</p>
            <v-switch v-model="form.priestOnly" label="Толькі для святароў пасля публікацыі" color="primary" hide-details :readonly="locked" />
          </v-card>

          <v-card class="card" elevation="0">
            <h2>Крыніца і правы</h2>
            <v-text-field v-model="form.sourceBook" label="Кніга і выданне" variant="outlined" hide-details="auto" :readonly="locked" />
            <v-textarea v-model="copyrightText" label="Аўтарскія правы (кожны запіс з новага радка)" variant="outlined" rows="2" auto-grow hide-details="auto" class="mt-3" :readonly="locked" />
            <v-checkbox v-model="rightsConfirmed" class="mt-2" color="primary" hide-details :readonly="locked"
              label="Права на лічбавую публікацыю гэтай крыніцы пацверджаны пісьмова" />
            <p class="hint">Без пацверджання кнопка «Апублікаваць» заблакаваная. Права на кнігу не вынікаюць з наяўнасці PDF.</p>
            <dl class="provenance">
              <template v-for="row in provenance" :key="row[0]"><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></template>
            </dl>
          </v-card>
        </div>

        <aside class="editor-side">
          <v-card class="card" elevation="0">
            <h2>Як убачыць чытач</h2>
            <article class="preview" :class="{ 'preview--empty': !form.text.trim() }">
              <h3>{{ form.title }}</h3>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="prayer-preview" v-html="previewHtml" />
              <footer v-if="sourceNotice" class="preview-source"><span>Крыніца:</span> <!-- eslint-disable-next-line vue/no-v-html --><span v-html="sourceHtml" /></footer>
            </article>
          </v-card>
          <v-card v-if="duplicates.length" class="card" elevation="0">
            <h2>Падобныя малітвы</h2>
            <ul class="dup-list">
              <li v-for="item in duplicates" :key="item.id">
                <router-link :to="`/prayer/${item.id}`" target="_blank">{{ item.title }}</router-link>
                <v-chip size="x-small" :color="item.kind === 'exact' ? 'error' : 'warning'" variant="tonal">{{ item.kind === 'exact' ? 'тая ж назва' : 'падобная' }}</v-chip>
              </li>
            </ul>
          </v-card>
          <v-card v-if="audit.length" class="card" elevation="0">
            <h2>Гісторыя</h2>
            <ul class="audit-list"><li v-for="entry in audit" :key="entry.id">{{ auditLabel(entry) }}</li></ul>
          </v-card>
        </aside>
      </div>

      <div v-if="!locked" class="action-bar" role="toolbar" aria-label="Дзеянні з чарнавіком">
        <v-btn variant="tonal" class="text-none" :loading="busy === 'save'" :disabled="Boolean(busy)" @click="save()">Захаваць чарнавік</v-btn>
        <v-btn variant="tonal" class="text-none" :disabled="Boolean(busy)" @click="save('needs_review')">Адправіць на праверку</v-btn>
        <v-btn variant="tonal" class="text-none" :disabled="Boolean(busy)" @click="save('ready_for_publication')">Гатова да публікацыі</v-btn>
        <v-spacer />
        <v-btn v-if="draft.status === 'archived'" variant="text" class="text-none" :disabled="Boolean(busy)" @click="save('draft')">Вярнуць у працу</v-btn>
        <v-btn v-else variant="text" class="text-none" :disabled="Boolean(busy)" @click="save('archived')">Адхіліць / архіваваць</v-btn>
        <v-btn color="primary" class="text-none" prepend-icon="mdi-publish" :disabled="Boolean(busy) || draft.status === 'archived'" @click="openPublish">Апублікаваць</v-btn>
      </div>
    </template>

    <v-dialog v-model="publishOpen" max-width="560" scrollable>
      <v-card v-if="draft" class="publish-dialog">
        <v-card-title>Апублікаваць малітву?</v-card-title>
        <v-card-text>
          <dl class="confirm">
            <dt>Назва</dt><dd>{{ form.title }}</dd>
            <dt>Крыніца</dt><dd>{{ sourceNotice || '—' }}</dd>
            <dt>Тэгі</dt><dd>{{ form.tags.join(', ') || '—' }}</dd>
            <dt>Катэгорыі</dt><dd>{{ categoryNames || '—' }}</dd>
            <dt>Хто бачыць</dt><dd>{{ form.priestOnly ? 'Толькі святары (абароненая калекцыя)' : 'Усе чытачы Web і Flutter' }}</dd>
            <dt>Будучы адрас</dt><dd>/prayer/{{ replaceId || targetId }}</dd>
          </dl>
          <v-alert v-if="blockers.length" type="error" variant="tonal" density="compact" class="mt-3"><div v-for="item in blockers" :key="item">{{ item }}</div></v-alert>
          <div v-if="duplicates.length" class="mt-3">
            <p class="hint hint--warn">Знойдзены падобныя малітвы. Абярыце, што рабіць:</p>
            <v-radio-group v-model="replaceId" hide-details density="compact">
              <v-radio :value="''" label="Апублікаваць як новую малітву" />
              <v-radio v-for="item in duplicates" :key="item.id" :value="item.id" :label="`Замяніць: ${item.title}`" />
            </v-radio-group>
            <v-checkbox v-if="!replaceId && hasExactDuplicate" v-model="acknowledge" label="Разумею, што такая назва ўжо ёсць" hide-details density="compact" />
          </div>
          <p class="hint mt-3">Права на лічбавую публікацыю гэтай крыніцы павінна быць пацверджана. Пры замене захоўваюцца ID, абранае і спасылкі.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" :disabled="busy === 'publish'" @click="publishOpen = false">Скасаваць</v-btn>
          <v-btn color="primary" class="text-none" :loading="busy === 'publish'" :disabled="Boolean(busy) || blockers.length > 0 || (hasExactDuplicate && !replaceId && !acknowledge)" @click="publish">Апублікаваць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PrayerMarkdownEditor from '@/components/prayers/PrayerMarkdownEditor.vue';
import { usePrayers } from '@/composables/usePrayers';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';
import { renderPrayerMarkdown } from '@/utils/prayerMarkdown';
import { DRAFT_ORIGINS, DRAFT_REASON_LABELS, DRAFT_STATUS_LABELS, draftSourceNotice, findDuplicateCandidates, publishBlockers, targetPrayerIdFor } from '@/utils/prayerDraftModel.mjs';
import { getDraftActions } from '@/services/prayerDraftService';

const route = useRoute();
const { prayers, allTags, isLoading: prayersLoading } = usePrayers();
const categoriesStore = usePrayerCategoriesStore();
const draft = ref(null);
const loading = ref(true);
const loadError = ref('');
const busy = ref('');
const message = ref(null);
const publishOpen = ref(false);
const replaceId = ref('');
const acknowledge = ref(false);
const audit = ref([]);
const form = ref({ title: '', text: '', tags: [], priestOnly: false, sourceBook: '', copyrightNotices: [], rightsStatus: '' });
const rightsConfirmed = computed({ get: () => form.value.rightsStatus === 'confirmed', set: (value) => { form.value.rightsStatus = value ? 'confirmed' : 'unconfirmed'; } });
const copyrightText = computed({
  get: () => form.value.copyrightNotices.join('\n'),
  set: (value) => { form.value.copyrightNotices = value.split('\n').map((line) => line.trim()).filter(Boolean); },
});
let actions;

const locked = computed(() => draft.value?.status === 'published');
const originLabel = computed(() => DRAFT_ORIGINS[draft.value?.origin] || 'Бог Добры');
const statusColor = computed(() => ({ draft: 'grey', needs_review: 'warning', ready_for_publication: 'info', published: 'success', archived: 'grey' }[draft.value?.status] || 'grey'));
const availableTags = computed(() => [...new Set(allTags.value || [])].sort((a, b) => a.localeCompare(b, 'be')));
const newTags = computed(() => form.value.tags.filter((tag) => !availableTags.value.includes(tag)));
const categoryNames = computed(() => {
  const tags = new Set(form.value.tags);
  return (categoriesStore.categories || []).filter((category) => (category.tags || []).some((tag) => tags.has(tag))).map((category) => category.name).join(', ');
});
const merged = computed(() => ({ ...draft.value, ...form.value }));
const sourceNotice = computed(() => draftSourceNotice(merged.value));
const sourceHtml = computed(() => renderPrayerMarkdown(sourceNotice.value));
const previewHtml = computed(() => renderPrayerMarkdown(form.value.text, 'mybrev-markdown'));
const duplicates = computed(() => findDuplicateCandidates(form.value.title, prayers.value || []).filter((item) => item.id !== draft.value?.targetPrayerId));
const hasExactDuplicate = computed(() => duplicates.value.some((item) => item.kind === 'exact'));
const blockers = computed(() => publishBlockers(merged.value));
const targetId = computed(() => (draft.value ? targetPrayerIdFor(draft.value) : ''));
const provenance = computed(() => [
  ['Крыніца ў парсеры', draft.value?.sourceId], ['Запіс', draft.value?.originalEntryId],
  ['Старонкі PDF', draft.value?.pdfPageStart ? `${draft.value.pdfPageStart}–${draft.value.pdfPageEnd || draft.value.pdfPageStart}` : ''],
  ['SHA-256 кнігі', draft.value?.sourceSha256 ? `${draft.value.sourceSha256.slice(0, 16)}…` : ''],
  ['Партыя імпарту', draft.value?.originBatch],
].filter((row) => row[1]));

function hydrate(source) {
  form.value = { title: source.title || '', text: source.text || '', tags: [...(source.tags || [])], priestOnly: source.priestOnly === true, sourceBook: source.sourceBook || source.source || '', copyrightNotices: [...(source.copyrightNotices || [])], rightsStatus: source.rightsStatus || '' };
}
const auditLabel = (entry) => {
  const date = entry.at?.toDate?.().toLocaleString('be-BY') || '';
  const names = { create: 'Створана', edit: 'Праўка', publish: 'Апублікавана', 'status:needs_review': 'На праверку', 'status:ready_for_publication': 'Гатова', 'status:archived': 'Архіў', 'status:draft': 'Вернута ў працу' };
  return `${date} · ${names[entry.action] || entry.action}`;
};
const describeError = (error) => (error?.name === 'DraftError' ? error.message
  : error?.code === 'permission-denied' ? 'Не хапае правоў адміністратара або змесціва змянілася. Абнавіце старонку.' : (error?.message || 'Не ўдалося выканаць аперацыю.'));

async function load() {
  loading.value = true; loadError.value = '';
  try {
    actions = await getDraftActions();
    draft.value = await actions.getDraft(route.params.id);
    hydrate(draft.value);
    audit.value = await actions.listAudit(route.params.id).catch(() => []);
  } catch (error) { loadError.value = describeError(error); } finally { loading.value = false; }
}
async function save(status) {
  busy.value = 'save'; message.value = null;
  try {
    const patch = { title: form.value.title.trim(), text: form.value.text, tags: form.value.tags, priestOnly: form.value.priestOnly, sourceBook: form.value.sourceBook, copyrightNotices: form.value.copyrightNotices, ...(form.value.rightsStatus ? { rightsStatus: form.value.rightsStatus } : {}) };
    await actions.saveDraft(draft.value.id, patch, { expectedVersion: draft.value.version, status });
    message.value = { type: 'success', text: status ? `Статус: ${DRAFT_STATUS_LABELS[status]}.` : 'Чарнавік захаваны.' };
    await load();
  } catch (error) { message.value = { type: 'error', text: describeError(error) }; } finally { busy.value = ''; }
}
function openPublish() { replaceId.value = ''; acknowledge.value = false; publishOpen.value = true; }
async function publish() {
  busy.value = 'publish'; message.value = null;
  try {
    // Unsaved edits go first, so exactly the confirmed text is published.
    const patch = { title: form.value.title.trim(), text: form.value.text, tags: form.value.tags, priestOnly: form.value.priestOnly, sourceBook: form.value.sourceBook, copyrightNotices: form.value.copyrightNotices, ...(form.value.rightsStatus ? { rightsStatus: form.value.rightsStatus } : {}) };
    await actions.saveDraft(draft.value.id, patch, { expectedVersion: draft.value.version });
    const fresh = await actions.getDraft(draft.value.id);
    const result = await actions.publishDraft(draft.value.id, { replaceId: replaceId.value || undefined, acknowledgeDuplicates: acknowledge.value, expectedVersion: fresh.version });
    publishOpen.value = false;
    message.value = { type: 'success', text: result.alreadyPublished ? 'Гэты чарнавік ужо быў апублікаваны.' : `Апублікавана: /prayer/${result.id}` };
    await load();
  } catch (error) { message.value = { type: 'error', text: describeError(error) }; await load().catch(() => {}); } finally { busy.value = ''; }
}
watch(() => route.params.id, load);
onMounted(() => { categoriesStore.init?.(); load(); });
</script>

<style scoped>
.draft-editor { width: min(100%, 1180px); padding: 28px 20px 96px !important; }
.back-link { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 14px; color: var(--nav-muted); text-decoration: none; font-size: 0.9rem; }
.editor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.editor-head > div { min-width: 0; }
.editor-head h1 { margin: 0; font-size: 1.5rem; overflow-wrap: anywhere; }
.eyebrow { margin: 0 0 6px; color: var(--nav-muted); font-size: 0.75rem; font-weight: 750; letter-spacing: 0.11em; text-transform: uppercase; }
.editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
.editor-main, .editor-side { display: grid; gap: 14px; min-width: 0; }
.card { padding: 18px; border: 1px solid var(--nav-border); border-radius: 18px; background: var(--nav-surface); }
.card h2 { margin: 0 0 12px; font-size: 1rem; }
.hint { margin: 8px 0 0; color: var(--nav-muted); font-size: 0.82rem; }
.hint--warn { color: rgb(var(--v-theme-warning)); }
.provenance { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 14px 0 0; font-size: 0.8rem; color: var(--nav-muted); }
.provenance dd { margin: 0; overflow-wrap: anywhere; }
.preview h3 { margin: 0 0 10px; font-size: 1.05rem; }
.prayer-preview { color: var(--reader-ink); font-family: var(--reader-font-family); font-size: 1rem; line-height: 1.7; overflow-wrap: anywhere; }
.prayer-preview :deep(p) { margin: 0 0 1em; }
.prayer-preview :deep(p:last-child) { margin-bottom: 0; }
.prayer-preview :deep(h2), .prayer-preview :deep(h3), .prayer-preview :deep(h4) { margin: 1.2em 0 0.5em; font-size: 1.05em; line-height: 1.3; }
.prayer-preview :deep(ul), .prayer-preview :deep(ol) { margin: 0.65em 0 1em; padding-inline-start: 1.45em; }
.prayer-preview :deep(li) { padding-inline-start: 0.16em; overflow-wrap: anywhere; }
.prayer-preview :deep(.prayer-rubric) { margin: 1.05em 0; padding: 0.08em 0 0.08em 0.85em; border-left: 3px solid var(--rubric-color); color: var(--rubric-color); font-size: 0.86em; line-height: 1.45; }
.prayer-preview :deep(.prayer-rubric p) { margin-bottom: 0.45em; }
.prayer-preview :deep(.prayer-speaker) { color: var(--rubric-color); font-weight: 700; font-size: inherit; font-style: normal; }
.preview--empty { color: var(--nav-muted); }
.preview-source { margin-top: 14px; color: var(--nav-muted); font-size: 0.72rem; }
.dup-list, .audit-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 0.88rem; }
.dup-list li { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.audit-list { color: var(--nav-muted); font-size: 0.8rem; }
.action-bar { position: sticky; bottom: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 18px -20px -80px; padding: 10px 20px; border-top: 1px solid var(--nav-border); background: var(--nav-surface); }
.editor-head .v-chip { flex-shrink: 0; }
.confirm { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 0.9rem; }
.confirm dt { color: var(--nav-muted); }
.confirm dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 900px) { .editor-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .draft-editor { padding: 18px 16px 96px !important; }
  .action-bar { position: static; margin: 18px 0 0; padding: 12px 0 0; background: transparent; }
  .action-bar .v-btn { flex: 1 1 calc(50% - 8px); min-width: 0; padding: 0 8px; }
}
</style>
