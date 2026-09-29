<template>
  <div class="note-list">
    <div v-for="group in groups" :key="group.id" class="note-group">
      <h3 v-if="!plain && group.label" class="note-group__title">{{ group.label }}</h3>
      <ul>
        <li v-for="note in group.notes" :key="note.id" class="note">
          <p>{{ note.text }}</p>
          <small v-if="note.source || note.needsReview">
            {{ note.source }}<template v-if="note.needsReview">{{ note.source ? ' · ' : '' }}патрабуе праверкі</template>
          </small>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
// Ordo notes grouped by `groupOrdoNotes` (src/utils/ordoScreen.js).
defineProps({
  groups: { type: Array, required: true },
  // Without group headings (the section heading already names the group).
  plain: { type: Boolean, default: false },
});
</script>

<style scoped>
.note-list { margin: 0 20px 12px; }
.note-group + .note-group { margin-top: 10px; }
.note-group__title { margin: 0 0 4px; color: var(--nav-muted); font-size: .7rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
ul { margin: 0; padding: 0; list-style: none; }
.note { padding: 9px 0; border-top: 1px solid var(--nav-border); }
.note p { margin: 0; color: var(--nav-on-surface); font-family: var(--reader-font-family); font-size: calc(.92rem * var(--font-size-multiplier, 1)); line-height: 1.55; overflow-wrap: anywhere; }
.note small { display: block; margin-top: 4px; color: var(--nav-muted); font-size: .7rem; }
@media (max-width: 600px) {
  .note-list { margin-inline: 16px; }
}
</style>
