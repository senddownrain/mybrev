import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue';
import { createPinia, defineStore, setActivePinia, storeToRefs } from 'pinia';
import { useUiStore } from '../src/stores/ui.js';
import * as markdown from '../src/utils/prayerMarkdown.js';

// Execute the real SFC/store logic with injected network and router boundaries.
// No Firebase initialization, reads, or writes take place in these tests.
function loadLogic(path, bindings, exposed, setup = false) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { descriptor } = parse(setup ? source : `<script>${source}</script>`);
  const compiled = compileScript(descriptor, { id: 'prayer-copy-test' });
  let code = (setup ? descriptor.scriptSetup : descriptor.script).content;
  for (const node of [...(setup ? compiled.scriptSetupAst : compiled.scriptAst)].reverse()) {
    if (node.type === 'ImportDeclaration') {
      code = code.slice(0, node.start) + code.slice(node.end);
    } else if (node.type === 'ExportNamedDeclaration') {
      code = code.slice(0, node.start) + code.slice(node.declaration.start);
    }
  }
  code = code.replaceAll("import('@/utils/errorHandler')", 'loadErrorHandler()');
  return new Function(...Object.keys(bindings), `${code}\nreturn { ${exposed.join(', ')} };`)(
    ...Object.values(bindings),
  );
}

function createEditor(t, options = {}) {
  setActivePinia(createPinia());
  const original = {
    id: 'original', title: options.title || 'Малітва',
    text: 'Гэта дастаткова доўгі тэкст малітвы.',
    textFormat: 'mybrev-markdown', textFormatVersion: 1,
    source: 'Крыніца', tags: ['Тэг'], verified: true,
  };
  const writes = [];
  const notices = [];
  const errors = [];
  const { usePrayersStore } = loadLogic('../src/stores/prayers.js', {
    defineStore, ref, computed, watch,
    logger: { log() {}, error() {} },
    publicContentCache: { peek: () => null },
    publicContentKey: (name) => name,
    requestContentRefresh: () => {},
    useAuthStore: () => reactive({ isAdmin: true }),
    priestAccess: reactive({ revision: 0 }),
    getPrayersQuery: () => 'mock-query',
    onSnapshot: (_query, callback) => {
      callback({ docs: [{ id: original.id, data: () => ({ ...original }) }] });
      return () => {};
    },
    prayerService: {
      subscribePrayers: (callback) => { callback([{ ...original }]); return () => {}; },
      addPrayer: async (data) => {
        if (options.failWrite) throw new Error('Test write failed');
        const id = `copy-${writes.length + 1}`;
        writes.push({ operation: 'add', id, data });
        // Deliberately do not emit a snapshot for the new document.
        return { id };
      },
      updatePrayer: async (id, data) => { writes.push({ operation: 'update', id, data }); },
    },
  }, ['usePrayersStore']);
  const store = usePrayersStore();
  store.init();
  const route = reactive({ name: 'PrayerEdit', params: { id: original.id } });
  const guards = {};
  const router = {
    push: async (target) => {
      const guard = target.name === route.name ? guards.update : guards.leave;
      if (guard?.() === false) return { type: 4 };
      route.name = target.name;
      route.params = target.params || {};
      await nextTick();
    },
  };
  const ui = useUiStore();
  const scope = effectScope();
  t.after(() => scope.stop());
  const form = scope.run(() => loadLogic('../src/components/prayers/PrayerForm.vue', {
    ...markdown, computed, ref, watch, storeToRefs,
    useRoute: () => route,
    useRouter: () => router,
    usePrayers: () => ({
      ...storeToRefs(store), addPrayer: store.addPrayer, updatePrayer: store.updatePrayer,
    }),
    useNotifier: () => ({ notifySuccess: (message) => notices.push(message), notifyError: (message) => errors.push(message) }),
    useUiStore: () => ui,
    validatePrayerTitle: (title) => title.trim() && title.length <= 200 ? true : 'Invalid title',
    validatePrayerText: (text) => text.trim().length >= 10 ? true : 'Invalid text',
    onMounted: (callback) => callback(),
    onBeforeUnmount: () => {},
    onBeforeRouteLeave: (callback) => { guards.leave = callback; },
    onBeforeRouteUpdate: (callback) => { guards.update = callback; },
    window: { addEventListener() {}, confirm: () => false },
    loadErrorHandler: async () => ({ handleFirestoreError: (error) => errors.push(error.message) }),
  }, ['form', 'formRef', 'handleCreateCopy', 'handleSave', 'isDirty', 'copying', 'loadError', 'allowNavigation'], true));
  form.formRef.value = { validate: options.validate || (async () => ({ valid: true })) };
  return { ...form, store, original, route, router, guards, writes, notices, errors, ui };
}

test('copy stays in the editor, gets a marked title, and is available before the next snapshot', async (t) => {
  const editor = createEditor(t);
  editor.form.value.text = 'Новы тэкст, які яшчэ не быў захаваны.';
  editor.form.value.source = 'Іншая крыніца';
  editor.form.value.tags.push('Новы тэг');
  await editor.handleCreateCopy();

  assert.equal(editor.route.name, 'PrayerEdit');
  assert.equal(editor.route.params.id, 'copy-1');
  assert.equal(editor.form.value.title, 'Малітва (копія)');
  assert.equal(editor.form.value.text, 'Новы тэкст, які яшчэ не быў захаваны.');
  assert.equal(editor.form.value.source, 'Іншая крыніца');
  assert.deepEqual([...editor.form.value.tags], ['Тэг', 'Новы тэг']);
  assert.equal(editor.form.value.verified, false);
  assert.deepEqual({ ...editor.store.prayers.find((prayer) => prayer.id === 'original') }, editor.original);
  assert.equal(editor.store.prayers.find((prayer) => prayer.id === 'copy-1').verified, false);
  assert.equal(editor.store.prayers.length, 2);
  assert.ok(editor.store.allTags.includes('Новы тэг'));
  assert.equal(editor.isDirty.value, false);
  assert.equal(editor.allowNavigation.value, false);
  assert.equal(editor.loadError.value, '');
});

test('saving edits after copying updates only the copy and retains dirty navigation protection', async (t) => {
  const editor = createEditor(t);
  await editor.handleCreateCopy();
  editor.form.value.title = 'Другая малітва';
  assert.equal(editor.isDirty.value, true);
  assert.equal(editor.guards.leave(), false);
  assert.equal(editor.guards.update(), false);
  await editor.handleSave();

  assert.equal(editor.writes[1].operation, 'update');
  assert.equal(editor.writes[1].id, 'copy-1');
  assert.equal(editor.writes[1].data.title, 'Другая малітва');
  assert.equal(editor.store.prayers.find((prayer) => prayer.id === 'original').title, 'Малітва');
});

test('saving an edited prayer persists its verification flag', async (t) => {
  const editor = createEditor(t);
  editor.form.value.verified = false;
  await editor.handleSave();

  assert.equal(editor.writes[0].operation, 'update');
  assert.equal(editor.writes[0].id, 'original');
  assert.equal(editor.writes[0].data.verified, false);
});

test('returning to the original rehydrates the reused form', async (t) => {
  const editor = createEditor(t);
  await editor.handleCreateCopy();
  await editor.router.push({ name: 'PrayerEdit', params: { id: 'original' } });
  assert.equal(editor.form.value.title, 'Малітва');
  assert.equal(editor.isDirty.value, false);
});

test('copy title fits the 200-character limit', async (t) => {
  const editor = createEditor(t, { title: 'А'.repeat(200) });
  await editor.handleCreateCopy();
  assert.equal(editor.form.value.title.length, 200);
  assert.ok(editor.form.value.title.endsWith(' (копія)'));
  assert.equal(editor.original.title.length, 200);
});

test('failed copy keeps the original route and unsaved draft', async (t) => {
  const editor = createEditor(t, { failWrite: true });
  editor.form.value.title = 'Незахаваныя змены';
  await editor.handleCreateCopy();
  assert.equal(editor.route.params.id, 'original');
  assert.equal(editor.form.value.title, 'Незахаваныя змены');
  assert.equal(editor.isDirty.value, true);
  assert.equal(editor.guards.leave(), false);
  assert.equal(editor.copying.value, false);
  assert.equal(editor.notices.length, 0);
  assert.deepEqual(editor.errors, ['Test write failed']);
});

test('invalid form does not create a copy', async (t) => {
  const editor = createEditor(t, { validate: async () => ({ valid: false }) });
  await editor.handleCreateCopy();
  assert.equal(editor.writes.length, 0);
  assert.equal(editor.route.params.id, 'original');
  assert.equal(editor.copying.value, false);
});

test('copy and save cannot race while asynchronous validation is pending', async (t) => {
  let finishValidation;
  const editor = createEditor(t, {
    validate: () => new Promise((resolve) => { finishValidation = resolve; }),
  });
  const pendingCopy = editor.handleCreateCopy();
  await nextTick();
  assert.equal(editor.ui.prayerFormCopying, true);
  await editor.handleCreateCopy();
  await editor.handleSave();
  finishValidation({ valid: true });
  await pendingCopy;
  assert.equal(editor.writes.length, 1);
  assert.equal(editor.ui.prayerFormCopying, false);
});
