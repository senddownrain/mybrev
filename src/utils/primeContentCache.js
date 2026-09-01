import moment from './moment-be.js';
import { publicContentCache, contentKey, readingsKey, publicContentKey } from './publicContentCache.js';

/** Read a small set of local records only. Never waits for Firestore or network. */
export async function primeContentCache(location = window.location) {
  const url = new URL(location.href);
  const datePart = url.pathname.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\b/)?.[1] || url.searchParams.get('date');
  const parsed = datePart ? moment(datePart, ['YYYY-MM-DD', 'DD-MM-YYYY'], true) : moment();
  const date = parsed.isValid() ? parsed : moment();
  const key = date.format('YYYY-MM-DD');
  const routeDayId = decodeURIComponent(url.pathname.match(/\/ora\/([^/]+)/)?.[1] || '');
  const keys = [
    contentKey(key), contentKey(date.clone().add(1, 'day').format('YYYY-MM-DD')),
    readingsKey(key), readingsKey(key, { includeAlternatives: true }),
    readingsKey(key, { dayId: routeDayId === 'office-for-dead' ? '' : routeDayId }),
    readingsKey(key, { dayId: url.searchParams.get('dayId'), includeAlternatives: true }),
    publicContentKey('year', date.year()), publicContentKey('year', date.year() + 1),
  ];
  if (/prayer/.test(url.pathname)) keys.push(publicContentKey('prayers'));
  if (/completorium|invit/.test(url.pathname)) {
    keys.push(publicContentKey('static', 'completoriums'), publicContentKey('static', 'invitatoriums'));
  }
  await publicContentCache.prime([...new Set(keys)]);
}
