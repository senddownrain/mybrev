// Draft workflow against Firestore (admin-only `prayerDrafts`). Dependencies are injected so the
// very same code runs in the app and in the emulator tests. Roles are enforced by firestore.rules
// (`admin`, `superadmin`, legacy admins); nothing here trusts a client-side `isAdmin` flag.
import { buildPrayerFromDraft, canTransition, DRAFT_COLLECTION, findDuplicateCandidates, normalizeTitleKey, prayerTitleOf, publishBlockers, targetPrayerIdFor, validateDraft } from './prayerDraftModel.mjs';

export class DraftError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'DraftError'; this.code = code; Object.assign(this, details); }
}
const DRAFT_FIELDS = ['title', 'text', 'source', 'sourceBook', 'sourceEdition', 'tags', 'categoryIds', 'copyrightNotices', 'priestOnly', 'notes', 'rightsStatus'];
const pick = (data, keys) => Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));

export function createDraftActions({ db, fs, writer, actorUid }) {
  const { collection, doc, getDocFromServer, getDocsFromServer, serverTimestamp, runTransaction } = fs;
  const draftRef = (id) => doc(db, DRAFT_COLLECTION, id);
  const auditRef = (id) => doc(collection(db, DRAFT_COLLECTION, id, 'audit'));
  const audit = (transaction, id, entry) => transaction.set(auditRef(id), { uid: actorUid, at: serverTimestamp(), ...entry });
  const fromSnap = (snap) => ({ ...snap.data(), id: snap.id });

  async function listDrafts() {
    return (await getDocsFromServer(collection(db, DRAFT_COLLECTION))).docs.map(fromSnap);
  }
  async function getDraft(id) {
    const snap = await getDocFromServer(draftRef(id));
    if (!snap.exists()) throw new DraftError('not-found', 'Чарнавік не знойдзены.');
    return fromSnap(snap);
  }
  async function listAudit(id) {
    return (await getDocsFromServer(collection(db, DRAFT_COLLECTION, id, 'audit'))).docs.map(fromSnap)
      .sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
  }

  async function createDraft(draftId, data) {
    const record = { ...pick(data, [...DRAFT_FIELDS, 'sourceId', 'sourceSha256', 'sourcePageSpan', 'pdfPageStart', 'pdfPageEnd', 'printedPageStart', 'printedPageEnd',
      'originalEntryId', 'originBatch', 'origin', 'reason', 'flagReasons', 'possibleDuplicateIds', 'fingerprint']),
      draftId, textFormat: 'mybrev-markdown', status: 'draft', version: 1, tags: data.tags || [], createdBy: actorUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    const errors = validateDraft(record);
    if (errors.length) throw new DraftError('invalid', errors.join(' '));
    await runTransaction(db, async (transaction) => {
      if ((await transaction.get(draftRef(draftId))).exists()) throw new DraftError('exists', 'Чарнавік ужо існуе.');
      transaction.set(draftRef(draftId), record);
      audit(transaction, draftId, { action: 'create', toStatus: 'draft', version: 1 });
    });
    return draftId;
  }

  /** Optimistic save (version) and status move in one transaction, with an audit record. */
  async function saveDraft(draftId, patch, { expectedVersion, status, note } = {}) {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(draftRef(draftId));
      if (!snap.exists()) throw new DraftError('not-found', 'Чарнавік не знойдзены.');
      const current = snap.data();
      if (expectedVersion !== undefined && current.version !== expectedVersion) throw new DraftError('conflict', 'Чарнавік змянілі ў іншай сесіі. Абнавіце старонку.');
      if (current.status === 'published') throw new DraftError('published', 'Апублікаваны чарнавік не рэдагуецца.');
      const next = status || current.status;
      if (!canTransition(current.status, next)) throw new DraftError('transition', 'Недапушчальная змена статуса.');
      if (next === 'published') throw new DraftError('transition', 'Публікацыя — асобная аперацыя.');
      const merged = { ...current, ...pick(patch || {}, DRAFT_FIELDS), status: next };
      const errors = validateDraft(merged);
      if (errors.length) throw new DraftError('invalid', errors.join(' '));
      const reviewed = next !== current.status && ['needs_review', 'ready_for_publication'].includes(next) ? { reviewedBy: actorUid, reviewedAt: serverTimestamp() } : {};
      transaction.update(draftRef(draftId), { ...pick(patch || {}, DRAFT_FIELDS), ...reviewed, status: next, version: current.version + 1, updatedAt: serverTimestamp() });
      audit(transaction, draftId, { action: next === current.status ? 'edit' : `status:${next}`, fromStatus: current.status, toStatus: next, version: current.version + 1, ...(note ? { note: String(note).slice(0, 300) } : {}) });
    });
  }

  /**
   * Publish one draft. Re-reads everything: current duplicates, the draft inside the transaction and the
   * content lock. Idempotent: repeating (or a second admin tab) returns the same prayer id.
   * `replaceId` replaces that existing prayer (id, createdAt, links stay); `acknowledgeDuplicates` publishes as new
   * despite similar titles.
   */
  async function publishDraft(draftId, { replaceId, acknowledgeDuplicates = false, expectedVersion } = {}) {
    const before = await getDraft(draftId);
    if (before.status === 'published') return { id: before.targetPrayerId, alreadyPublished: true };
    if (expectedVersion !== undefined && before.version !== expectedVersion) throw new DraftError('conflict', 'Чарнавік змянілі ў іншай сесіі. Абнавіце старонку.');
    const blockers = publishBlockers(before);
    if (blockers.length) throw new DraftError('blocked', blockers.join(' '), { blockers });
    let targetId; let duplicates = [];
    try {
      await writer.mutate((content) => {
        const exactMatches = findDuplicateCandidates(before.title, content.prayers).filter((item) => item.kind === 'exact');
        duplicates = exactMatches;
        if (replaceId) {
          if (!content.prayers.some((item) => item.id === replaceId)) throw new DraftError('replace-missing', 'Малітва для замены не знойдзена.');
          targetId = replaceId;
        } else {
          targetId = targetPrayerIdFor(before);
          if (exactMatches.some((item) => item.id !== targetId) && !acknowledgeDuplicates) {
            throw new DraftError('duplicate', 'Ёсць малітва з такой самай назвай. Абярыце замену або пацвердзіце публікацыю як новай.', { duplicates: exactMatches });
          }
        }
        const old = content.prayers.find((item) => item.id === targetId);
        const built = buildPrayerFromDraft(before, { existing: old });
        content.prayers = content.prayers.filter((item) => item.id !== targetId);
        content.prayers.push({ ...old, ...built, id: targetId, ...(old ? {} : { createdAt: serverTimestamp() }), updatedAt: serverTimestamp() });
      }, {
        async read(transaction) {
          const snap = await transaction.get(draftRef(draftId));
          if (!snap.exists()) throw new DraftError('not-found', 'Чарнавік не знойдзены.');
          const live = snap.data();
          if (live.status === 'published') throw new DraftError('already-published', 'Чарнавік ужо апублікаваны.', { targetPrayerId: live.targetPrayerId });
          if (live.version !== before.version) throw new DraftError('conflict', 'Чарнавік змянілі ў іншай сесіі. Абнавіце старонку.');
          if (!canTransition(live.status, 'published') || live.status === 'archived') throw new DraftError('transition', 'Чарнавік у архіве. Верніце яго ў працу перад публікацыяй.');
        },
        write(transaction) {
          transaction.update(draftRef(draftId), { status: 'published', publishedBy: actorUid, publishedAt: serverTimestamp(), targetPrayerId: targetId, version: before.version + 1, updatedAt: serverTimestamp() });
          audit(transaction, draftId, { action: 'publish', fromStatus: before.status, toStatus: 'published', version: before.version + 1, targetPrayerId: targetId });
        },
      });
    } catch (error) {
      if (error?.code === 'already-published') return { id: error.targetPrayerId, alreadyPublished: true };
      throw error;
    }
    return { id: targetId, alreadyPublished: false, duplicates };
  }

  return { listDrafts, getDraft, listAudit, createDraft, saveDraft, publishDraft };
}
export { normalizeTitleKey, prayerTitleOf };
