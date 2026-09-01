<template>
  <div class="markdown-editor" :class="{ 'markdown-editor--error': error }">
    <div class="markdown-editor__mode-bar">
      <div class="markdown-editor__mode-switch" role="group" aria-label="Рэжым рэдагавання">
        <button
          type="button"
          :class="{ 'is-active': editorMode === 'visual' }"
          @click="setEditorMode('visual')"
        >
          Звычайны
        </button>
        <button
          type="button"
          :class="{ 'is-active': editorMode === 'markdown' }"
          @click="setEditorMode('markdown')"
        >
          Markdown
        </button>
      </div>
      <span class="markdown-editor__mode-description">
        {{ editorMode === 'visual' ? 'Фарматаванне паказваецца без службовых знакаў' : 'Дакладнае рэдагаванне зыходнага тэксту' }}
      </span>
    </div>
    <div class="markdown-editor__toolbar" role="toolbar" aria-label="Фарматаванне малітвы" @mousedown.prevent>
      <button type="button" title="Тлусты тэкст" @click="wrapSelection('**', '**', 'тэкст')">
        <strong>B</strong>
      </button>
      <button type="button" title="Курсіў" @click="wrapSelection('_', '_', 'тэкст')">
        <em>I</em>
      </button>
      <button type="button" title="Загаловак раздзела" @click="prefixLines('## ')">
        H2
      </button>
      <span class="markdown-editor__divider" />
      <button type="button" class="markdown-editor__rubric-button" @click="insertRubric">
        <v-icon icon="mdi-format-color-text" size="17" />
        Рубрыка
      </button>
      <button type="button" class="markdown-editor__autofix-button" title="Аўтаматычна выправіць Markdown" @click="autoFixMarkdown">
        <v-icon icon="mdi-auto-fix" size="17" />
        MD autofix
      </button>
      <span v-if="editorNotice" class="markdown-editor__paste-notice" role="status">
        <v-icon icon="mdi-check-circle-outline" size="16" />
        {{ editorNotice }}
      </span>
      <span v-else class="markdown-editor__hint">
        {{ editorMode === 'visual' ? 'Можна ўставіць з Word або сайта' : 'Ctrl+Space — падказкі' }}
      </span>
    </div>
    <div ref="editorHost" class="markdown-editor__surface" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  placeholder as editorPlaceholder,
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import {
  autoFixPrayerMarkdown,
  htmlToPrayerMarkdown,
  normalizePrayerMarkdown,
  validatePrayerMarkdown,
} from '@/utils/prayerMarkdown';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Увядзіце тэкст малітвы…' },
  error: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const editorHost = ref(null);
const editorMode = ref('visual');
const editorNotice = ref('');
const modeCompartment = new Compartment();
let view = null;
let pasteNoticeTimeout = null;

const rubricCompletions = [
  { label: '/rubric', displayLabel: 'Рубрыка', detail: 'літургічная заўвага', apply: ':::rubric\nТэкст рубрыкі\n:::' },
  { label: '/stand', displayLabel: 'Усе ўстаюць', detail: 'рубрыка', apply: ':::rubric\nУсе ўстаюць.\n:::' },
  { label: '/silence', displayLabel: 'Цішыня', detail: 'рубрыка', apply: ':::rubric\nУсе моляцца некаторы час у цішыні.\n:::' },
  { label: '/priest', displayLabel: 'Святар', detail: 'рубрыка', apply: ':::rubric\nСвятар кажа:\n:::' },
];

function rubricCompletionSource(context) {
  const match = context.matchBefore(/\/\w*/);
  if (!match && !context.explicit) return null;
  return { from: match?.from ?? context.pos, options: rubricCompletions };
}

function addInlineDecorations(line, ranges) {
  const source = line.text;
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, markerLength: 2, className: 'cm-visual-strong' },
    { regex: /(?<!_)_([^_\n]+)_(?!_)/g, markerLength: 1, className: 'cm-visual-emphasis' },
  ];

  patterns.forEach(({ regex, markerLength, className }) => {
    let match = regex.exec(source);
    while (match) {
      const from = line.from + match.index;
      const contentFrom = from + markerLength;
      const contentTo = from + match[0].length - markerLength;
      ranges.push(Decoration.replace({}).range(from, contentFrom));
      ranges.push(Decoration.mark({ class: className }).range(contentFrom, contentTo));
      ranges.push(Decoration.replace({}).range(contentTo, from + match[0].length));
      match = regex.exec(source);
    }
  });
}

function buildVisualDecorations(editorView) {
  const ranges = [];
  let rubricOpen = false;

  for (let number = 1; number <= editorView.state.doc.lines; number += 1) {
    const line = editorView.state.doc.line(number);
    const trimmed = line.text.trim();

    if (trimmed === ':::rubric' || trimmed === ':::') {
      ranges.push(Decoration.line({ class: 'cm-rubric-marker-line' }).range(line.from));
      if (line.length) ranges.push(Decoration.replace({}).range(line.from, line.to));
      rubricOpen = trimmed === ':::rubric';
      continue;
    }

    if (rubricOpen) {
      ranges.push(Decoration.line({ class: 'cm-rubric-line' }).range(line.from));
    }

    const heading = /^(#{1,6})\s+/.exec(line.text);
    if (heading) {
      ranges.push(Decoration.replace({}).range(line.from, line.from + heading[0].length));
      ranges.push(Decoration.line({ class: `cm-visual-heading cm-visual-heading-${Math.min(heading[1].length, 3)}` }).range(line.from));
    }

    addInlineDecorations(line, ranges);
  }

  return Decoration.set(ranges, true);
}

const visualModeExtension = ViewPlugin.fromClass(class {
  constructor(editorView) {
    this.decorations = buildVisualDecorations(editorView);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildVisualDecorations(update.view);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

function showEditorNotice(message) {
  editorNotice.value = message;
  if (pasteNoticeTimeout) clearTimeout(pasteNoticeTimeout);
  pasteNoticeTimeout = setTimeout(() => {
    editorNotice.value = '';
    pasteNoticeTimeout = null;
  }, 2400);
}

function insertPastedContent(event, editorView) {
  const clipboard = event.clipboardData;
  if (!clipboard) return false;
  const html = clipboard.getData('text/html');
  const plain = clipboard.getData('text/plain');
  if (!html && !plain) return false;

  const convertedHtml = html ? htmlToPrayerMarkdown(html) : '';
  const content = convertedHtml || normalizePrayerMarkdown(plain);
  if (!content) return false;

  event.preventDefault();
  const range = editorView.state.selection.main;
  const before = range.from > 0 && editorView.state.sliceDoc(range.from - 1, range.from) !== '\n' ? '\n\n' : '';
  const after = range.to < editorView.state.doc.length && editorView.state.sliceDoc(range.to, range.to + 1) !== '\n' ? '\n\n' : '';
  const insert = `${before}${content}${after}`;
  editorView.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + before.length + content.length },
  });
  showEditorNotice('Тэкст пераўтвораны');
  return true;
}

function createEditor() {
  view = new EditorView({
    parent: editorHost.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        markdown(),
        autocompletion({ override: [rubricCompletionSource] }),
        keymap.of(completionKeymap),
        editorPlaceholder(props.placeholder),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({ paste: insertPastedContent }),
        modeCompartment.of(visualModeExtension),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { minHeight: '310px', backgroundColor: 'transparent' },
          '.cm-scroller': { fontFamily: 'var(--reader-font-family)', lineHeight: '1.7' },
          '.cm-content': { minHeight: '310px', padding: '18px 0', caretColor: 'rgb(var(--v-theme-primary))' },
          '.cm-line': { padding: '0 20px' },
          '.cm-gutters': { display: 'none' },
          '&.cm-focused': { outline: 'none' },
          '.cm-activeLine': { backgroundColor: 'rgba(var(--v-theme-primary), 0.045)' },
          '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(var(--v-theme-primary), 0.2) !important' },
          '.cm-tooltip': { backgroundColor: 'var(--nav-surface)', color: 'var(--nav-on-surface)', borderColor: 'var(--nav-border)' },
          '.cm-rubric-marker-line': { height: '0', minHeight: '0', overflow: 'hidden', lineHeight: '0', padding: '0' },
          '.cm-rubric-line': { borderLeft: '3px solid var(--rubric-color)', color: 'var(--rubric-color)', fontSize: '0.9em', lineHeight: '1.5', paddingLeft: '16px' },
          '.cm-visual-heading': { fontFamily: 'var(--reader-display-font-family)', fontWeight: '700', lineHeight: '1.35', paddingTop: '0.45em', paddingBottom: '0.18em' },
          '.cm-visual-heading-1': { fontSize: '1.45em' },
          '.cm-visual-heading-2': { fontSize: '1.25em' },
          '.cm-visual-heading-3': { fontSize: '1.1em' },
          '.cm-visual-strong': { fontWeight: '750' },
          '.cm-visual-emphasis': { fontStyle: 'italic' },
        }),
      ],
    }),
  });
}

function setEditorMode(mode) {
  if (editorMode.value === mode) return;
  editorMode.value = mode;
  view?.dispatch({
    effects: modeCompartment.reconfigure(mode === 'visual' ? visualModeExtension : []),
  });
  view?.focus();
}

function replaceSelection(text, selectionStart = null, selectionEnd = null) {
  if (!view) return;
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: {
      anchor: range.from + (selectionStart ?? text.length),
      head: range.from + (selectionEnd ?? selectionStart ?? text.length),
    },
  });
  view.focus();
}

function wrapSelection(before, after, fallback) {
  if (!view) return;
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to) || fallback;
  replaceSelection(`${before}${selected}${after}`, before.length, before.length + selected.length);
}

function prefixLines(prefix) {
  if (!view) return;
  const range = view.state.selection.main;
  const from = view.state.doc.lineAt(range.from).from;
  const to = view.state.doc.lineAt(range.to).to;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({ changes: { from, to, insert: selected.split('\n').map((line) => `${prefix}${line}`).join('\n') } });
  view.focus();
}

function insertRubric() {
  if (!view) return;
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to) || 'Тэкст рубрыкі';
  const block = `:::rubric\n${selected}\n:::`;
  replaceSelection(block, ':::rubric\n'.length, ':::rubric\n'.length + selected.length);
}

function autoFixMarkdown() {
  if (!view) return;
  const source = view.state.doc.toString();
  const result = autoFixPrayerMarkdown(source);

  if (!result.changed) {
    showEditorNotice('Памылак не знойдзена');
    view.focus();
    return;
  }

  const cursor = Math.min(view.state.selection.main.head, result.markdown.length);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: result.markdown },
    selection: { anchor: cursor },
  });
  showEditorNotice(`Выпраўлена: ${result.fixes.length}`);
  view.focus();
}

watch(() => props.modelValue, (value) => {
  if (!view || value === view.state.doc.toString()) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
});

watch(() => props.error, () => {
  if (view) validatePrayerMarkdown(view.state.doc.toString());
});

onMounted(createEditor);
onBeforeUnmount(() => {
  if (pasteNoticeTimeout) clearTimeout(pasteNoticeTimeout);
  view?.destroy();
});
</script>

<style scoped>
.markdown-editor { overflow: visible; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 17px; background: rgba(var(--v-theme-on-surface), 0.02); transition: border-color 0.2s ease; }
.markdown-editor:focus-within { border-color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary)); }
.markdown-editor--error { border-color: rgb(var(--v-theme-error)); }
.markdown-editor__mode-bar { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 16px 16px 0 0; border-bottom: 1px solid var(--nav-border); background: color-mix(in srgb, var(--nav-surface) 94%, var(--nav-active)); }
.markdown-editor__mode-switch { display: inline-flex; flex: 0 0 auto; padding: 3px; border-radius: 10px; background: var(--nav-active); }
.markdown-editor__mode-switch button { min-height: 30px; padding: 4px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--nav-muted); font: inherit; font-size: 0.72rem; font-weight: 700; cursor: pointer; }
.markdown-editor__mode-switch button.is-active { background: var(--nav-surface); color: var(--nav-on-surface); box-shadow: 0 2px 8px var(--nav-button-shadow); }
.markdown-editor__mode-description { min-width: 0; color: var(--nav-muted); font-size: 0.7rem; line-height: 1.3; }
.markdown-editor__toolbar { position: sticky; top: calc(var(--v-layout-top, 64px) + 8px); z-index: 5; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 48px; padding: 7px 10px; border-bottom: 1px solid var(--nav-border); background: var(--nav-surface, rgb(var(--v-theme-surface))); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08); }
.markdown-editor__toolbar button { display: inline-flex; min-width: 34px; min-height: 34px; align-items: center; justify-content: center; gap: 6px; padding: 5px 9px; border: 0; border-radius: 8px; background: transparent; color: var(--nav-on-surface); font: inherit; font-size: 0.82rem; cursor: pointer; }
.markdown-editor__toolbar button:hover, .markdown-editor__toolbar button:focus-visible { background: rgba(var(--v-theme-primary), 0.12); outline: none; }
.markdown-editor__rubric-button { color: var(--rubric-color) !important; font-weight: 700 !important; }
.markdown-editor__autofix-button { color: rgb(var(--v-theme-primary)) !important; font-weight: 700 !important; }
.markdown-editor__divider { width: 1px; height: 24px; margin-inline: 3px; background: var(--nav-border); }
.markdown-editor__hint { margin-left: auto; color: var(--nav-muted); font-size: 0.68rem; }
.markdown-editor__paste-notice { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: rgb(var(--v-theme-primary)); font-size: 0.7rem; font-weight: 700; }
.markdown-editor__surface { color: var(--nav-on-surface); font-size: 1rem; }
@media (max-width: 600px) {
  .markdown-editor__mode-description, .markdown-editor__hint { display: none; }
  .markdown-editor__mode-bar { justify-content: center; }
}
</style>
