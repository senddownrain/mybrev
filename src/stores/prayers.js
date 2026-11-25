import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { logger } from '@/utils/logger';
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

  let unsubscribe = null;
  let stopAuthWatch = null;
  let loadSequence = 0;

  function refreshAllTags() {
    const tagsArray = prayers.value.flatMap(prayer => prayer.tags || []);
    allTags.value = [...new Set(tagsArray)].sort();
  }

  /**
   * Initialize the Firestore real-time subscription for prayers.
   * Cleans up any existing subscription before creating a new one.
   * Populates `prayers`, `allTags`, `isLoading`, and `error` reactively.
   *
   * @returns {void}
   */
  function startLiveSubscription() {
    if (unsubscribe) {
      unsubscribe();
    }

    const sequence = loadSequence;
    try {
      logger.log('[prayersStore] Initializing prayers subscription...');
      
      unsubscribe = prayerService.subscribePrayers(
        (items) => {
          if (sequence !== loadSequence) return;
          prayers.value = items;
          refreshAllTags();
          isLoading.value = false;
          error.value = null;
          logger.log('[prayersStore] Prayers loaded:', prayers.value.length);
        },
        (err) => {
          if (sequence !== loadSequence) return;
          prayers.value = prayers.value.filter((row) => !isProtectedPrayerRow(row));
          refreshAllTags();
          logger.error('[prayersStore] Error loading prayers:', err);
          logger.error('[prayersStore] Error details:', err.code, err.message);
          error.value = err;
          isLoading.value = false;
        }
      );
    } catch (initError) {
      logger.error('[prayersStore] Initialization error:', initError);
      error.value = initError;
      isLoading.value = false;
    }
  }

  async function loadPrayers(includeProtected) {
    const sequence = ++loadSequence;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    prayers.value = prayers.value.filter((row) => !isProtectedPrayerRow(row));
    refreshAllTags();
    isLoading.value = !prayers.value.length;
    try {
      const publicData = await getPublicPrayerContent();
      if (sequence !== loadSequence) return;
      prayers.value = publicData.prayers;
      refreshAllTags();
      isLoading.value = false;
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
    const stopLoad = watch([() => authStore.isAdmin, () => authStore.user?.uid, () => prayerCatalogDemand.value > 0, prayerCatalogRevision], ([isAdmin, , requested]) => {
      const includeProtected = requested && canReadPrayerCatalog();
      if (!isAdmin || !includeProtected) return loadPrayers(includeProtected);
      loadSequence++;
      prayers.value = prayers.value.filter((row) => !isProtectedPrayerRow(row));
      refreshAllTags();
      startLiveSubscription();
    }, { immediate: true, flush: 'sync' });
    stopAuthWatch = () => { stopEditor(); stopLoad(); clearEditorPrayerReads(); };
  }

  /**
   * Add a new prayer document to Firestore.
   *
   * @param {Omit<Prayer, 'id'>} data - Prayer data without the document ID
   * @returns {Promise<import('firebase/firestore').DocumentReference>} Reference to the created document
   * @throws {Error} If the Firestore write fails
   */
  async function addPrayerAction(data) {
    try {
      const docRef = await prayerService.addPrayer(data);
      requestContentRefresh();
      // The copy editor must be able to load the new prayer immediately,
      // even if the real-time listener has not delivered it yet.
      if (!prayers.value.some((prayer) => prayer.id === docRef.id)) {
        prayers.value = [{ ...data, tags: [...(data.tags || [])], id: docRef.id }, ...prayers.value];
        refreshAllTags();
      }
      return docRef;
    } catch (err) {
      error.value = err;
      throw err;
    }
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
   * Update an existing prayer document in Firestore.
   *
   * @param {string} id - Firestore document ID of the prayer to update
   * @param {Partial<Omit<Prayer, 'id'>>} data - Fields to update
   * @returns {Promise<void>}
   * @throws {Error} If the Firestore update fails
   */
  async function updatePrayerAction(id, data) {
    try {
      const saved = await prayerService.updatePrayer(id, data);
      requestContentRefresh();
      // Use the server-confirmed document, not the optimistic form payload.
      // This also preserves normalization, sourceManual and server timestamps.
      prayers.value = prayers.value.map((prayer) => (
        prayer.id === id ? saved.prayer : prayer
      ));
      refreshAllTags();
      return saved;
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
    prayers.value = prayers.value.filter((row) => !isProtectedPrayerRow(row));
    refreshAllTags();
    if (stopAuthWatch) { stopAuthWatch(); stopAuthWatch = null; }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
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
    addPrayer: addPrayerAction,
    deletePrayer: deletePrayerAction,
    updatePrayer: updatePrayerAction,
    cleanup,
    
    getTitle,
    getText,
  };
});
