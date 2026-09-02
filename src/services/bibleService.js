import { doc } from 'firebase/firestore';

import { BIBLE_LANGUAGES } from '@/constants/bible.js';
import { db } from '@/plugins/firebase.js';
import { getDocOfflineAware } from '@/utils/firestoreRead.js';

export async function fetchBibleBook(language, bookId) {
  const languageConfig = BIBLE_LANGUAGES[language];
  if (!languageConfig) throw new Error(`Unsupported Bible language: ${language}`);

  const snapshot = await getDocOfflineAware(doc(db, languageConfig.collection, bookId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}
