const PSALM_95_LABEL = /Псальм\s+95\s*\(94\)/i;

/**
 * Select the Invitatory Psalm appropriate to a liturgical period.
 * Christmas uses Psalm 95 (94); all other periods retain the configured
 * collection order.
 */
export function getDefaultInvitatoriumId(invitatoriums, periodType) {
  const items = Array.isArray(invitatoriums) ? invitatoriums : [];
  if (periodType === 'christmas') {
    const psalm95 = items.find((item) => {
      const text = `${item?.title || ''} ${item?.name || ''} ${item?.invitatoriumPs1 || ''}`
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ');
      return PSALM_95_LABEL.test(text);
    });
    if (psalm95) return psalm95.id;
  }
  return items[0]?.id || '';
}
