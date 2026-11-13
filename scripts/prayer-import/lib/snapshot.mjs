// Prayer content from a private local Firestore snapshot (see AGENTS.md: snapshot first, live later).
import { openFirestoreSnapshot } from '../../lib/firestore-snapshot.mjs';
import { PRAYER_STORAGE } from '../../../src/utils/prayerStoragePlan.mjs';

export async function loadPrayerSnapshot(directories) {
  const prayers = new Map(); const categories = new Map(); const present = new Set(); const info = [];
  for (const directory of directories) {
    const snapshot = await openFirestoreSnapshot(directory);
    info.push({ directory, projectId: snapshot.manifest.projectId, exportedAt: snapshot.manifest.exportedAt, snapshotVersion: snapshot.manifest.snapshotVersion });
    for (const [name, target] of [['prayers', prayers], ['priestProtectedPrayers', prayers], ['prayerCategories', categories], ['priestProtectedCategories', categories]]) {
      const entries = await snapshot.collectionEntries(name);
      if (entries === null) continue;
      present.add(name);
      for (const { id, data } of entries) target.set(id, { ...data, id, _collection: name });
    }
  }
  const missing = Object.entries(PRAYER_STORAGE).flat().filter((name) => !present.has(name));
  return { prayers: [...prayers.values()], categories: [...categories.values()], missingCollections: missing, info };
}
