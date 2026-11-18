import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { getPrayerContentWriter } from '@/services/prayerStorageService';
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
  const publishDraft = actions.publishDraft;
  return { ...actions, async publishDraft(...args) { const result = await publishDraft(...args); requestContentRefresh(); return result; } };
}
