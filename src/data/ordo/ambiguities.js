/**
 * Open liturgical questions of the engine as structured data
 * (`docs/ordo-engine-ambiguities.md` keeps the full reasoning).
 *
 * `status`: `needs-review` (open), `provisional` (temporary product decision,
 * source-dependent), `decided` (product decision taken; kept for the record).
 * Transfers are additionally materialized as editable Year Overrides
 * (`src/utils/ordo/transferOverrides.js`).
 *
 * Nothing here changes the calendar. The Year Overrides admin page shows a
 * case when the selected year actually hits it, so that an administrator can
 * confirm the engine's decision or create a manual override for that year.
 * Detection lives in `src/utils/ordo/ambiguities.js`.
 */
export const ORDO_AMBIGUITIES = Object.freeze([
  {
    id: 'st-joseph-holy-week',
    status: 'needs-review',
    docItem: 1,
    title: 'Св. Юзаф у Вялікім тыдні',
    description: '19 сакавіка выпадае на Вялікі тыдзень.',
    currentDecision: 'anticipated-before-palm-sunday',
    decisionLabel: 'Урачыстасць пераносіцца на суботу перад Пальмовай нядзеляй',
    note: 'CDW 2008. Беларускія календары («АС, 60») падаюць толькі агульнае правіла «найбліжэйшы вольны дзень», якое дало б дату пасля актавы Пасхі.',
    celebrationId: 'sv-joseph',
  },
  {
    id: 'coinciding-general-solemnities',
    status: 'needs-review',
    docItem: 2,
    title: 'Супадзенне дзвюх урачыстасцяў агульнага календара',
    description: 'Найсвяцейшае Сэрца Пана Езуса супадае з Нараджэннем св. Яна Хрысціцеля або са свв. Пятром і Паўлам.',
    currentDecision: 'lord-solemnity-stays-other-moves-forward',
    decisionLabel: 'Урачыстасць Пана застаецца, другая пераносіцца на найбліжэйшы вольны дзень',
    note: 'У 2022 г. CDW перанесла Нараджэнне св. Яна Хрысціцеля на 23 чэрвеня (назад). Калі будзе дэкрэт — патрэбны override на год.',
  },
  {
    id: 'all-souls-on-sunday',
    status: 'decided',
    docItem: 3,
    title: 'Успамін усіх памерлых вернікаў у нядзелю',
    description: '2 лістапада выпадае на нядзелю.',
    currentDecision: 'office-sunday-mass-all-souls',
    decisionLabel: 'Літургія гадзін — з нядзелі; Імша і чытанні — Успаміну ўсіх памерлых (3 камплекты)',
    note: 'Прадуктовае рашэнне MyBrev (фінальны этап §11.1): крыніцы Афіцыя і Імшы ў адзін дзень могуць быць розныя (`sources.office` / `sources.mass`).',
    celebrationId: 'all-faithful-departed',
  },
  {
    id: 'mary-mother-church-with-memorial',
    status: 'decided',
    docItem: 5,
    title: 'Марыя, Маці Касцёла, супадае з іншым абавязковым успамінам',
    description: 'Панядзелак пасля Спаслання Духа Святога мае яшчэ адзін абавязковы ўспамін.',
    currentDecision: 'legal-choice-marian-first',
    decisionLabel: 'Абодва абавязковыя ўспаміны — на выбар, марыйны першы, без асобнага будня',
    note: 'Пацверджана карыстальнікам (фінальны этап §11.3).',
    celebrationId: 'mary-mother-church',
  },
  {
    id: 'christ-high-priest-collision',
    status: 'provisional',
    docItem: 6,
    title: 'Езус Хрыстус, Найвышэйшы і Вечны Святар, супадае з іншым святам',
    description: 'Свята (уласны каляндар Беларусі) прыпадае на дзень іншага свята (напр. Адведзіны 31 мая).',
    currentDecision: 'both-options-provisional',
    decisionLabel: 'Часова абодва святы застаюцца на выбар',
    note: 'Старое правіла «радок 8 — уласнае свята прапускаецца» не ўжываецца без беларускай нарматыўнай крыніцы (фінальны этап §11.4).',
    celebrationId: 'christ-the-high-priest',
  },
  {
    id: 'immaculate-heart-with-memorial',
    status: 'decided',
    docItem: 21,
    title: 'Беззаганнае Сэрца Марыі супадае з абавязковым успамінам',
    description: 'Субота пасля ўрачыстасці Найсвяцейшага Сэрца мае яшчэ адзін абавязковы ўспамін.',
    currentDecision: 'two-memorial-choices-no-weekday',
    decisionLabel: 'Роўна два ўспаміны на выбар, без варыянту «З дня»',
    note: 'Прадуктовае правіла MyBrev/Беларусь (фінальны этап §11.2), напр. 13.06.2026.',
    celebrationId: 'immaculate-heart',
  },
  {
    id: 'diocesan-patron-impeded',
    status: 'needs-review',
    docItem: 22,
    title: 'Урачыстасць апекуна дыяцэзіі перанесена',
    description: 'Уласная ўрачыстасць дыяцэзіі саступае дню з большым першынством.',
    currentDecision: 'transferred-to-next-free-day',
    decisionLabel: 'Пераносіцца на найбліжэйшы вольны дзень (толькі калі літургічная ступень пацверджана крыніцай); запіс у «Выключэннях на год»',
    note: 'Напр. св. Андрэй Баболя ў Пінскай дыяцэзіі 16.05.2027 (Спасланне Духа Святога) → аўторак 18.05. Пацвердзіць па календары дыяцэзіі.',
  },
]);
