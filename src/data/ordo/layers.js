/**
 * Ordo calendar layers derived from the four diocesan calendars (stage 6a).
 *
 * Layers never copy the universal calendar (`fixedCalendar.js` +
 * `movableFeasts.js`). They only hold:
 *   add     – proper celebrations the layer adds
 *             `{ id, mmdd, title, rank, category, properKind?, evidence[] }`
 *   modify  – changes of an inherited celebration
 *             `{ id, rank?, mmdd?, evidence[] }`
 *   rules   – structured effects (`{ type: 'suppress', celebrationId }` …)
 *
 * `evidence` lists item ids of `src/data/ordo/evidence/<diocese>.json`
 * (checked by tests/ordo-layers.test.mjs). Diocesan entries with `_place` in
 * `fixedCalendar.js` are NOT repeated here: the engine derives those layers
 * from `fixedCalendar.js` itself; this file only adds what the published
 * calendars prove beyond it. Rejected or doubtful source readings are listed
 * in docs/ordo-engine-ambiguities.md instead.
 */

/**
 * National proper (Belarus): celebrations of `fixedCalendar.js` that are not
 * in the General Roman Calendar but are kept by all four dioceses. Moving
 * them to the national layer makes them proper (rows 8/11/12 of the Table).
 */
export const BELARUS_LAYER = Object.freeze({
  id: 'belarus',
  add: [],
  modify: [
    { id: 'sv-casimir', basis: 'patron of Lithuania and the Grand Duchy; printed by every diocese' },
    { id: 'sv-andrei-bobola', basis: 'patron of Poland/Belarus; printed by every diocese' },
    { id: 'our-lady-budslav', basis: 'national shrine; printed by Minsk, Vitebsk, Pinsk' },
    {
      id: 'our-lady-mother-mercy',
      rank: 'memoria',
      basis: 'Ostra Brama; an obligatory memorial (or higher) in every diocese',
      evidence: ['minsk-mohilev:2026-11-16:c0', 'vitebsk:2026-11-16:c0', 'pinsk:2026-11-16:c0'],
    },
    { id: 'sv-raphael-kalinowski', basis: 'printed by every diocese' },
    { id: 'bl-jurgis-matulaitis', basis: 'printed by every diocese' },
    { id: 'bl-boleslawa-lament', basis: 'printed by every diocese' },
  ],
  rules: [],
});

/** Diocesan proper beyond the `_place` entries of `fixedCalendar.js`. */
export const DIOCESAN_LAYERS = Object.freeze({
  "grodno": {
    add: [
      {"id": "bl-vincent-lewoniuk-companions", "mmdd": "01-23", "title": "Бл. Вінцэнта Леванюка і 12 паплечнікаў, мучанікаў з Пратуліна", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-01-23:c0"]},
      {"id": "our-lady-help-of-christians", "mmdd": "05-24", "title": "Найсв. Панны Марыі, Успамогі Вернікаў", "rank": "memoria", "category": "mary", "evidence": ["grodno:2027-05-24:c0"]},
      {"id": "sv-jadwiga-queen", "mmdd": "06-08", "title": "Св. Ядвігі, каралевы", "rank": "memoria", "category": "saint", "evidence": ["grodno:2027-06-08:c0"]},
      {"id": "sv-albert-chmielowski", "mmdd": "06-17", "title": "Св. Брата Альберта Хмялёўскага, законніка", "rank": "memoria", "category": "saint", "evidence": ["grodno:2027-06-17:c0"]},
      {"id": "our-lady-of-angels", "mmdd": "08-02", "title": "Найсв. Панны Марыі Анёльскай", "rank": "memoria-ad-libitum", "category": "mary", "evidence": ["grodno:2027-08-02:c0"]},
      {"id": "bl-sancja-szymkowiak", "mmdd": "08-18", "title": "Бл. Санцыі Шымкавяк, панны", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-08-18:c0"]},
      {"id": "bl-bronislawa", "mmdd": "09-01", "title": "Бл. Браніславы, панны", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-09-01:c0"]},
      {"id": "bl-ladislaus-gielniow", "mmdd": "09-25", "title": "Бл. Уладзіслава з Гельнёва, прэзбітэра", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-09-25:c0"]},
      {"id": "bl-honorat-kozminski", "mmdd": "10-13", "title": "Бл. Ганарата Казмінскага, прэзбітэра", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-10-13:c0"]},
      {"id": "five-martyred-brothers", "mmdd": "11-13", "title": "Свв. Бэнэдыкта, Яна, Мацвея, Ісаака і Крыстына, мучанікаў", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-11-13:c0"]},
      {"id": "bl-karolina-kozka", "mmdd": "11-18", "title": "Бл. Караліны Кузкі, панны і мучаніцы", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-11-18:c0"]},
      {"id": "bl-salomea", "mmdd": "11-19", "title": "Бл. Саламеі, панны", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-11-19:c0"]},
      {"id": "bl-maria-jesus-good-shepherd", "mmdd": "11-25", "title": "Бл. Марыі ад Езуса Добрага Пастыра, панны", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-11-25:c1"]},
      {"id": "sv-barbara", "mmdd": "12-04", "title": "Св. Барбары, панны і мучаніцы", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["grodno:2027-12-04:c0"]},
    ],
    modify: [
      {"id": "bl-jurgis-matulaitis", "rank": "memoria", "evidence": ["grodno:2027-01-27:c0"]},
      {"id": "bl-boleslawa-lament", "rank": "memoria", "evidence": ["grodno:2027-01-29:c0"]},
      {"id": "sv-george-martyr", "rank": "memoria", "evidence": ["grodno:2027-04-23:c0"]},
      {"id": "sv-wenceslaus", "rank": "memoria", "evidence": ["grodno:2027-09-28:c0"]},
      {"id": "sv-raphael-kalinowski", "rank": "memoria", "evidence": ["grodno:2027-11-20:c0"]},
      {"id": "mary-mother-church", "rank": "festum", "evidence": ["grodno:2027-05-17:c0"]},
      {"id": "our-lady-mount-carmel", "rank": "memoria", "evidence": ["grodno:2027-07-16:c0"]},
      {"id": "our-lady-congregational", "rank": "memoria", "evidence": ["grodno:2027-08-05:c0"]},
      {"id": "sv-faustina-kowalska", "rank": "memoria", "evidence": ["grodno:2027-10-05:c0"]},
      {"id": "our-lady-loreto", "rank": "memoria", "evidence": ["grodno:2027-12-10:c0"]},
      {"id": "sv-adalbert-wojciech-bishop-martyr", "rank": "memoria", "mmdd": "04-24", "evidence": ["grodno:2027-04-24:c0"]},
      {"id": "sv-stanislaus-bishop-martyr", "rank": "memoria", "mmdd": "05-08", "evidence": ["grodno:2027-05-08:c0"]},
    ],
    rules: [],
  },
  "minsk-mohilev": {
    add: [
    ],
    modify: [
    ],
    rules: [],
  },
  "pinsk": {
    add: [
      {"id": "sv-dismas", "mmdd": "03-26", "title": "Св. Дызмы, Добрага Злачынцы", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-03-26:c0"]},
      {"id": "sv-florian", "mmdd": "05-04", "title": "Св. Фларыяна, мучаніка", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-05-04:c0"]},
      {"id": "our-lady-perpetual-help", "mmdd": "06-27", "title": "Маці Божай Нястомнай Дапамогі", "rank": "memoria-ad-libitum", "category": "mary", "evidence": ["pinsk:2026-06-27:c0"]},
      {"id": "bl-czeslaw", "mmdd": "07-20", "title": "Бл. Чэслава, прэзбітэра", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-07-20:c1"]},
      {"id": "sv-hyacinth", "mmdd": "08-17", "title": "Св. Яцэка, прэзбітэра", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-08-17:c0"]},
      {"id": "our-lady-lahishyn", "mmdd": "08-22", "title": "Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі", "rank": "solemnitas", "category": "mary", "evidence": ["pinsk:2026-08-22:c0"], "properKind": "principal-patron-diocese"},
      {"id": "bl-maria-stella-companions", "mmdd": "09-04", "title": "Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-09-04:c0"]},
      {"id": "bl-honorat-kozminski", "mmdd": "10-13", "title": "Бл. Ганарата Казмінскага, прэзбітэра", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-10-13:c0"]},
      {"id": "sv-barbara", "mmdd": "12-04", "title": "Св. Барбары, панны і мучаніцы", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["pinsk:2026-12-04:c1"]},
    ],
    modify: [
      {"id": "our-lady-of-lourdes", "rank": "memoria", "evidence": ["pinsk:2026-02-11:c0"]},
      {"id": "sv-john-paul-ii", "rank": "memoria", "evidence": ["pinsk:2026-10-22:c0"]},
      {"id": "mary-mother-church", "rank": "festum", "evidence": ["pinsk:2026-05-25:c0"]},
      {"id": "our-lady-budslav", "rank": "memoria", "evidence": ["pinsk:2026-07-02:c0"]},
    ],
    rules: [],
  },
  "vitebsk": {
    add: [
      {"id": "bl-celina-borzecka", "mmdd": "10-26", "title": "Бл. Цэліны Бажэнцкай, законніцы", "rank": "memoria-ad-libitum", "category": "saint", "evidence": ["vitebsk:2026-10-26:c1"]},
    ],
    modify: [
    ],
    rules: [],
  },
});
