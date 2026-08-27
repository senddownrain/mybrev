import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { onSnapshot } from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { getPrayersQuery } from '@/services/prayerService';
import * as prayerService from '@/services/prayerService';

/**
 * @typedef {Object} Prayer
 * @property {string} id - Firestore document ID
 * @property {string} [title] - Plain title of the prayer (legacy field)
 * @property {Object.<string, string>} [titleVersions] - Localized title versions keyed by locale (e.g. 'be', 'ru')
 * @property {string} [text] - Plain text of the prayer (legacy field)
 * @property {Object.<string, string>} [textVersions] - Localized text versions keyed by locale
 * @property {'mybrev-markdown'} [textFormat] - Canonical prayer text format
 * @property {number} [textFormatVersion] - MyBrev Markdown schema version
 * @property {string[]} [tags] - List of tags associated with the prayer
 * @property {import('firebase/firestore').Timestamp} [createdAt] - Firestore server timestamp of creation
 */

export const usePrayersStore = defineStore('prayers', () => {
  const prayers = ref([]);
  const allTags = ref([]);
  const isLoading = ref(true);
  const error = ref(null);

  let unsubscribe = null;

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
  function init() {
    if (unsubscribe) {
      unsubscribe();
    }

    try {
      const prayersQuery = getPrayersQuery();
      logger.log('[prayersStore] Initializing prayers subscription...');
      
      unsubscribe = onSnapshot(
        prayersQuery,
        (snapshot) => {
          logger.log('[prayersStore] Documents received:', snapshot.docs.length);
          prayers.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          refreshAllTags();
          isLoading.value = false;
          error.value = null;
          logger.log('[prayersStore] Prayers loaded:', prayers.value.length);
          logger.log('[prayersStore] First 3 prayers:', prayers.value.slice(0, 3).map(p => ({ id: p.id, title: getTitle(p) })));
        },
        (err) => {
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

  /**
   * Add a new prayer document to Firestore.
   *
   * @param {Omit<Prayer, 'id'>} data - Prayer data without the document ID
   * @returns {Promise<import('firebase/firestore').DocumentReference>} Reference to the created document
   * @throws {Error} If the Firestore write fails
   */
  async function addPrayerAction(data) {
    try {
      return await prayerService.addPrayer(data);
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
      await prayerService.updatePrayer(id, data);
      // Do not wait for the next Firestore snapshot before showing the saved
      // value. The listener will reconcile timestamps and remote changes later.
      prayers.value = prayers.value.map((prayer) => (
        prayer.id === id ? { ...prayer, ...data, id } : prayer
      ));
      refreshAllTags();
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
