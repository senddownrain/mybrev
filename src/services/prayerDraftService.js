import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { commitCanonicalCatalog, getPrayerContentWriter, usesCanonicalCatalogWriter } from '@/services/prayerStorageService';
import { requestContentRefresh } from '@/utils/publicContentCache';
import { createDraftActions } from '@/utils/prayerDraftActions.mjs';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '@/plugins/firebase';

const fs = { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp };

/** Actions bound to the editor Firestore (memory cache only) and the signed-in admin. */
export async function getDraftActions() {
  const db = await getPriestEditorDb();
  const writer = await getPrayerContentWriter();
  const actions = createDraftActions({ db, fs, writer, actorUid: getAuth(firebaseApp).currentUser.uid });
  return {
    ...actions,
    async publishDraft(id, { patch, accessSets, ...options } = {}) {
      if (await usesCanonicalCatalogWriter()) {
        return commitCanonicalCatalog({ draft: { id, ...options, ...(patch && { patch }),
          ...(accessSets !== undefined && { accessSets }) } });
      }
      if (accessSets !== undefined) throw new Error('Кананічны каталог недаступны. Абнавіце форму.');
      if (patch) {
        await actions.saveDraft(id, patch, { expectedVersion: options.expectedVersion });
        options.expectedVersion = (await actions.getDraft(id)).version;
      }
      const result = await actions.publishDraft(id, options);
      requestContentRefresh();
      return result;
    },
  };
}
