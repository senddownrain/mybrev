/**
 * Which copy of the calendar the runtime uses. Pure, so the rules are tested
 * without Firestore:
 *
 *  - the bundled snapshot IS publication `revision` N; Firestore wins only
 *    with a strictly newer revision that carries celebrations;
 *  - notes follow `notesRevision` the same way.
 *
 * There is always exactly one active calendar — never a merge of two.
 */
export function selectCalendarSource({ bundled, cached }) {
  if (Number(cached?.schemaVersion ?? 1) !== Number(bundled?.schemaVersion ?? 1)) return 'bundled';
  if (!cached || !Array.isArray(cached.celebrations) || !cached.celebrations.length) return 'bundled';
  return Number(cached.revision || 0) > Number(bundled?.revision || 0) ? 'firestore' : 'bundled';
}

export function selectNotesSource({ bundledRevision = 0, meta }) {
  return Number(meta?.notesRevision || 0) > Number(bundledRevision || 0) ? 'firestore' : 'bundled';
}

const comparable = (definitions) => JSON.stringify([
  definitions.revision ?? null,
  definitions.celebrations ?? null,
  definitions.dioceseOverrides ?? null,
  definitions.yearOverrides ?? null,
]);

/** Would applying `next` (a partial definitions object) change `current`? */
export function sameDefinitions(current, next) {
  return comparable({
    revision: next.revision ?? current.revision,
    celebrations: next.celebrations ?? current.celebrations,
    dioceseOverrides: next.dioceseOverrides ?? current.dioceseOverrides,
    yearOverrides: next.yearOverrides ?? current.yearOverrides,
  }) === comparable(current);
}
