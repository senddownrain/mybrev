/**
 * Rubrics from the Belarusian Liturgy of the Hours, pp. 394–395, 419–420,
 * 442–443, 1317–1321. Keep these overrides separate from generic records:
 * the normalized completoriums collection contains weekday templates.
 */
const TRIDUUM_RESPONSORIES = Object.freeze({
  5: 'Хрыстус стаў дзеля нас паслухмяным * ажно да смерці.',
  6: 'Хрыстус стаў дзеля нас паслухмяным ажно да смерці, * смерці крыжовай.',
  7: 'Хрыстус стаў дзеля нас паслухмяным ажно да смерці, смерці крыжовай. * Таму Бог узвысіў Яго і даў Яму імя па-над усялякае імя.',
});

const SOLEMNITY_PRAYER = '<p>Просім Цябе, Пане, наведай гэты дом і аддалі ад яго ўсе варожыя подступы. Няхай Твае святыя анёлы апякуюцца ім і захоўваюць нас у спакоі, а Тваё благаслаўленне няхай заўсёды будзе над намі. Праз Хрыста, Пана нашага. Амэн.</p>';

const GOOD_FRIDAY_INTERCESSIONS = 'У якасці просьбаў будзе пахвальным выкарыстаць агульную малітву, якая пададзена ў Імшале на гэты дзень. Аднак на выбар могуць выкарыстоўвацца ніжэйпададзеныя просьбы або малітва ў маўчанні ў прапанаваных тут інтэнцыях.';

export function triduumWeekday(day) {
  const weekday = Number(day?._dayOfWeek);
  return day?._ordo?.officeKind === 'triduum' && [5, 6, 7].includes(weekday)
    ? weekday : null;
}

export function triduumVespersNotice(day) {
  switch (triduumWeekday(day)) {
    case 5: return 'Нешпары чытаюць толькі тыя, хто не ўдзельнічае ў вечаровай Імшы Вячэры Пана.';
    case 6: return 'Нешпары чытаюць толькі тыя, хто не ўдзельнічае ў Літургіі Мукі Пана.';
    default: return '';
  }
}

export function triduumComplineNotice(day) {
  return triduumWeekday(day) === 7
    ? 'Камплету чытаюць толькі тыя, хто не ўдзельнічае ў Пасхальнай вігіліі.'
    : '';
}

export function triduumAntiphon(day) {
  const text = TRIDUUM_RESPONSORIES[triduumWeekday(day)];
  return text ? `<p><span style="color:red">Ант.</span> ${text}</p>` : '';
}

export function goodFridayIntercessionsRubric(day) {
  return triduumWeekday(day) === 6 ? GOOD_FRIDAY_INTERCESSIONS : '';
}

export function completoriumSolemnityPrayer(day) {
  return day?._ordo?.complineSolemnityPrayer ? SOLEMNITY_PRAYER : '';
}

export function applyComplineRubrics(record, liturgicalDay) {
  if (!record) return record;
  const responsory = liturgicalDay?._ordo?.complineChoice
    ? '<p><span style="color:red">Ант.</span> Вось дзень, які Пан учыніў, * будзем радавацца ў ім і весяліцца,<br>аллелюя</p>'
    : triduumAntiphon(liturgicalDay);
  const prayer = completoriumSolemnityPrayer(liturgicalDay);
  return {
    ...record,
    ...(responsory ? { compResp: responsory } : {}),
    ...(prayer ? { compPr: prayer } : {}),
  };
}
