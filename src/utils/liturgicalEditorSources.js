import { isFromDayReference } from '../constants/days.js';

export const EDITOR_SOURCE_KIND = Object.freeze({
  OWN: 'own',
  INHERITED: 'inherited',
  SHARED_DAYTIME: 'shared-daytime',
  EMPTY: 'empty',
});

const hasText = (value) => value !== null
  && value !== undefined
  && (typeof value !== 'string' || value.trim() !== '');

/**
 * Explain a raw days field in language useful to an editor. The editor
 * can render the assembled value while keeping inherited sources read-only.
 */
export function getDayEditorFieldSource(day, field) {
  const fromDayFields = Array.isArray(day?._fromDayFields) ? day._fromDayFields : [];
  const value = day?.[field];

  if (isFromDayReference(value) || fromDayFields.includes(field)) {
    return {
      kind: EDITOR_SOURCE_KIND.INHERITED,
      label: 'З агульнага літургічнага дня',
      color: 'warning',
      readOnly: true,
    };
  }

  const daytimeMatch = field.match(/^sext([23])(.*)$/);
  if (!hasText(value) && daytimeMatch) {
    const sharedValue = day?.[`sext1${daytimeMatch[2]}`];
    if (hasText(sharedValue) && !isFromDayReference(sharedValue)) {
      return {
        kind: EDITOR_SOURCE_KIND.SHARED_DAYTIME,
        label: 'Агульны тэкст дзённых малітваў',
        color: 'info',
        readOnly: true,
      };
    }
  }

  // Date documents are assembled over the matching period day. An empty
  // content field therefore means inheritance, not an intentionally blank UI.
  if (!hasText(value) && day?._date) {
    return {
      kind: EDITOR_SOURCE_KIND.INHERITED,
      label: 'З агульнага літургічнага дня',
      color: 'warning',
      readOnly: true,
    };
  }

  if (hasText(value)) {
    return {
      kind: EDITOR_SOURCE_KIND.OWN,
      label: 'Уласны тэкст',
      color: 'success',
      readOnly: false,
    };
  }

  return {
    kind: EDITOR_SOURCE_KIND.EMPTY,
    label: 'Не паказваецца',
    color: 'default',
    readOnly: false,
  };
}

export function getDayEditorFieldValue(day, assembledDay, field) {
  const source = getDayEditorFieldSource(day, field);
  if (source.kind === EDITOR_SOURCE_KIND.SHARED_DAYTIME) {
    const match = field.match(/^sext[23](.*)$/);
    return match ? (assembledDay?.[`sext1${match[1]}`] || '') : '';
  }
  return source.readOnly ? (assembledDay?.[field] || '') : (day?.[field] || '');
}

// ---------------------------------------------------------------------------
// Sparse Proper documents (`liturgicalProperTexts`, `_schema: 2`)
// ---------------------------------------------------------------------------

const SPARSE_SOURCE_LABELS = Object.freeze({
  proper: { label: 'Уласны тэкст', color: 'success' },
  'current-day': { label: 'З бягучага дня', color: 'warning' },
  'sunday-week-1': { label: 'З нядзелі І тыдня', color: 'info' },
  complementary: { label: 'Дадатковая псалмодыя', color: 'info' },
  omit: { label: 'Наўмысна пустое', color: 'default' },
});

/**
 * Where an assembled field of a sparse Proper comes from, for the editor:
 * own text / Common / current day / structured ref — from the assembler's
 * provenance (`assembleOffice().provenance`) and the document's own rule.
 * Every kind stays editable: an edit writes ONLY the own override.
 */
export function getSparseFieldSource(proper, field, provenance = {}, describeRule = null) {
  const rule = proper?._fieldRules?.[field] || null;
  if (hasText(proper?.[field])) return { kind: 'own', label: 'Уласны тэкст', color: 'success', readOnly: false, rule };
  const origin = provenance[field] || '';
  const ruleLabel = rule && describeRule ? `Правіла: ${describeRule(rule)}` : '';
  if (origin.startsWith('ref:')) return { kind: 'ref', label: ruleLabel || `Спасылка: ${origin.slice(4)}`, color: 'primary', readOnly: false, rule };
  if (origin.startsWith('common:')) {
    return { kind: 'common', label: ruleLabel || `З агульных тэкстаў «${origin.slice(7)}»`, color: 'info', readOnly: false, rule };
  }
  const known = SPARSE_SOURCE_LABELS[origin];
  if (known) return { kind: origin === 'current-day' ? 'current-day' : 'rule', label: ruleLabel || known.label, color: known.color, readOnly: false, rule };
  return { kind: 'empty', label: ruleLabel || 'Не паказваецца', color: 'default', readOnly: false, rule };
}

/**
 * Firestore update of a sparse Proper: only own fields and `_fieldRules`
 * that changed; a cleared own field is removed (`remove`), never written as
 * the assembled text.
 */
export function sparseUpdatePayload(original, edited, fields) {
  const set = {};
  const remove = [];
  fields.forEach((field) => {
    const before = original?.[field];
    const after = edited?.[field];
    if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return;
    if (!hasText(after) && !(Array.isArray(after) && after.length)) { if (before !== undefined) remove.push(field); return; }
    set[field] = after;
  });
  const rulesBefore = original?._fieldRules || {};
  const rulesAfter = edited?._fieldRules || {};
  if (JSON.stringify(rulesBefore) !== JSON.stringify(rulesAfter)) set._fieldRules = rulesAfter;
  return { set, remove };
}
