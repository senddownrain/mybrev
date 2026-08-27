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
 * Explain a raw fixedDays field in language useful to an editor. The editor
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
