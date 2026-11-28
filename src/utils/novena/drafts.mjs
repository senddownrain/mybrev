/** Draft records, their provenance and the publication step (pure). */
import { EXCLUDED, buildDefinition } from './core.mjs';
import { scheduleFor } from './schedules.mjs';
import { isNovenaSource, pickDefinition } from './document.mjs';

/** Keys of a `novenaDrafts` document besides the definition. */
export const DRAFT_META_FIELDS = Object.freeze(['blockers', 'importHash', 'everPublished', 'updatedAt', 'updatedBy']);

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The editable content: versions, state and bookkeeping excluded. */
export function editableContent(draft) {
  const { title, durationDays, template, days, schedule } = draft;
  return stableJson({ title, durationDays, template, days, schedule, blockers: draft.blockers || [] });
}

/** Source prayers of V1 among the public prayers (Pompeii included for listing). */
export const novenaSources = (prayers) => prayers.filter(isNovenaSource);

/** Generator output as a new draft record; null for excluded novenas. */
export function generatedDraft(prayer, prayers) {
  if (Object.hasOwn(EXCLUDED, prayer.id)) return null;
  const { definition, blockers } = buildDefinition(prayer, prayers);
  return { ...definition, schedule: scheduleFor(prayer.id), blockers };
}

/**
 * The document to publish. `contentVersion` grows by one only when the
 * published content changes (the draft remembers it across an unpublish).
 */
export function publicationDocument(draft, published = null) {
  const next = { ...pickDefinition(draft), status: 'published', trackerEnabled: draft.trackerEnabled === true };
  const comparable = (value) => stableJson({ ...pickDefinition(value), contentVersion: 0 });
  if (published && comparable(published) === comparable(next)) return { ...next, contentVersion: published.contentVersion };
  if (published) return { ...next, contentVersion: Math.max(published.contentVersion, draft.contentVersion || 0) + 1 };
  // After an unpublish the draft still carries the last published number.
  if (draft.everPublished) return { ...next, contentVersion: (draft.contentVersion || 0) + 1 };
  return { ...next, contentVersion: draft.contentVersion || 1 };
}

/**
 * Rows the list may publish in one go: ready and never published. A published
 * one with changes, or one that was taken down, is a decision for its editor.
 */
export const bulkCandidates = (rows) => rows.filter((row) => row.check === 'ready'
  && !row.published && !row.stored?.everPublished);

/**
 * Publishes one by one with the tracker on. Stops after `maxFailures` errors in
 * a row (quota, rules), so a broken run does not repeat reads for nothing.
 */
export async function publishInTurn(rows, publish, { onProgress = () => {}, maxFailures = 3 } = {}) {
  const result = { published: [], failed: [], skipped: 0 };
  let inRow = 0;
  for (const [index, row] of rows.entries()) {
    if (inRow >= maxFailures) {
      result.skipped = rows.length - index;
      break;
    }
    try {
      await publish({ ...row.record, trackerEnabled: true }, row.stored);
      result.published.push(row.id);
      inRow = 0;
    } catch (error) {
      result.failed.push({ id: row.id, title: row.title, message: error?.message || String(error) });
      inRow += 1;
    }
    onProgress(index + 1);
  }
  return result;
}
