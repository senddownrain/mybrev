import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import * as prayerService from '@/services/prayerService';
import { useAuthStore } from '@/stores/auth';
import { canReadPrayerCatalog, prayerCatalogDemand, prayerCatalogRevision } from '@/services/prayerCatalogAccess';
import { clearEditorPrayerReads, getPublicPrayerContent } from '@/services/prayerContentService';
import { isProtectedPrayerRow } from '@/utils/accessSetsV2Policy.mjs';
import { requestContentRefresh } from '@/utils/publicContentCache';

/**
 * @typedef {Object} Prayer
 * @property {string} id - Firestore document ID
 * @property {string} [title] - Plain title of the prayer (legacy field)
 * @property {Object.<string, string>} [titleVersions] - Localized title versions keyed by locale (e.g. 'be', 'ru')
 * @property {string} [text] - Plain text of the prayer (legacy field)
 * @property {Object.<string, string>} [textVersions] - Localized text versions keyed by locale
 * @property {'mybrev-markdown'} [textFormat] - Canonical prayer text format
 * @property {number} [textFormatVersion] - MyBrev Markdown schema version
 * @property {string} [source] - Optional attribution or publication source
 * @property {string[]} [tags] - List of tags associated with the prayer
 * @property {boolean} [verified] - Whether an administrator has reviewed the prayer
 * @property {import('firebase/firestore').Timestamp} [createdAt] - Firestore server timestamp of creation
 */

export const usePrayersStore = defineStore('prayers', () => {
  const prayers = ref([]);
  const allTags = ref([]);
  const isLoading = ref(true);
  const error = ref(null);

  let stopAuthWatch = null;
  let loadSequence = 0;
  let protectedRevision;

  function refreshAllTags() {
    const tagsArray = prayers.value.flatMap(prayer => prayer.tags || []);
    allTags.value = [...new Set(tagsArray)].sort();
  }

  async function loadPrayers(includeProtected) {
    const sequence = ++loadSequence;
    isLoading.value = includeProtected || !prayers.value.length;
    try {
      const publicData = await getPublicPrayerContent();
      if (sequence !== loadSequence) return;
      prayers.value = publicData.prayers;
      refreshAllTags();
      error.value = null;
      if (!includeProtected) return;
      const items = await prayerService.getSavedPrayers(publicData);
      if (sequence !== loadSequence) return;
      prayers.value = items;
      refreshAllTags();
    } catch (err) {
      if (sequence === loadSequence) error.value = err;
    } finally {
      if (sequence === loadSequence) isLoading.value = false;
    }
  }

  function init() {
    const authStore = useAuthStore();
    if (stopAuthWatch) return;
    const stopEditor = watch([() => authStore.isAdmin, () => authStore.user?.uid, prayerCatalogRevision], clearEditorPrayerReads, { flush: 'sync' });
    const stopLoad = watch([() => prayerCatalogDemand.value > 0, prayerCatalogRevision], ([requested, revision], [, previous]) => {
      const changed = revision !== previous;
      if (changed) {
        prayers.value = prayers.value.filter((row) => !isProtectedPrayerRow(row));
        refreshAllTags();
      }
      if (requested && canReadPrayerCatalog()) {
        if (protectedRevision === revision) return;
        protectedRevision = revision;
        void loadPrayers(true);
      } else if (changed) void loadPrayers(false);
    }, { immediate: true, flush: 'sync' });
    stopAuthWatch = () => { stopEditor(); stopLoad(); clearEditorPrayerReads(); };
  }

  /**
   * Delete a prayer document from Firestore by its ID.
   *
   * @param {string} id - Firestore document ID of the prayer to delete
   * @returns {Promise<void>}
   * @throws {Error} If the Firestore delete fails
   */
  async function deletePrayerAction(id) {
    try {
      await prayerService.deletePrayer(id);
      requestContentRefresh();
    } catch (err) {
      error.value = err;
      throw err;
    }
  }

  /**
   * Resolve a display title from a prayer object.
   * Prefers `title`, then falls back to `titleVersions` (Belarusian → Russian → first available).
   *
   * @param {Prayer} prayer - The prayer object
   * @returns {string} Resolved title string, or an empty string if none is found
   */
  function getTitle(prayer) {
    if (!prayer) return '';
    if (prayer.title) {
      return prayer.title;
    }
    if (prayer.titleVersions) {
      return prayer.titleVersions.be || prayer.titleVersions.ru || Object.values(prayer.titleVersions)[0] || '';
    }
    return '';
  }

  /**
   * Resolve the canonical prayer source. Legacy HTML is intentionally returned
   * unchanged here and converted at the rendering/editing boundary.
   * Prefers `text`, then falls back to `textVersions` (Belarusian → Russian → first available).
   *
   * @param {Prayer} prayer - The prayer object
   * @returns {string} Resolved and sanitised text string, or an empty string if none is found
   */
  function getText(prayer) {
    if (!prayer) return '';
    let text = '';
    if (prayer.text) {
      text = prayer.text;
    } else if (prayer.textVersions) {
      text = prayer.textVersions.be || prayer.textVersions.ru || Object.values(prayer.textVersions)[0] || '';
    }

    return text;
  }

  /**
   * Unsubscribe from the Firestore real-time listener and reset the reference.
   *
   * @returns {void}
   */
  function cleanup() {
    loadSequence += 1;
    protectedRevision = undefined;
    prayers.value = prayers.value.filter((row) => !isProtectedPrayerRow(row));
    refreshAllTags();
    if (stopAuthWatch) { stopAuthWatch(); stopAuthWatch = null; }
  }

  return {
    prayers: computed(() => {
      const value = prayers.value;
      return Array.isArray(value) ? value : [];
    }),
    allTags: computed(() => {
      const value = allTags.value;
      return Array.isArray(value) ? value : [];
    }),
    isLoading: computed(() => isLoading.value ?? true),
    error: computed(() => error.value),
    
    init,
    deletePrayer: deletePrayerAction,
    cleanup,
    
    getTitle,
    getText,
  };
});
