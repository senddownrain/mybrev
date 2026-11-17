// A Web administrator must not receive a success toast just because a
// transaction resolved: confirm the document and its editable fields on server.
const FIELDS = Object.freeze([
  'title', 'text', 'textFormat', 'source', 'tags', 'verified', 'priestOnly', 'sourceManual',
]);
export function assertPrayerSaveConfirmed(saved, expected) {
  if (!saved) {
    throw new Error('Сервер не пацвердзіў наяўнасць захаванай малітвы. Абнавіце старонку і праверце вынік.');
  }
  for (const field of FIELDS) {
    if (!Object.hasOwn(expected, field)) continue;
    if (JSON.stringify(saved[field]) !== JSON.stringify(expected[field])) {
      throw new Error(`Сервер не пацвердзіў захаванне поля «${field}». Перазагрузіце малітву і праверце змены.`);
    }
  }
  return saved;
}
