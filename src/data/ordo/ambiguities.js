/**
 * Open liturgical questions of the engine as structured data
 * (`docs/ordo-engine-ambiguities.md` keeps the full reasoning).
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
    status: 'needs-review',
    docItem: 3,
    title: 'Успамін усіх памерлых вернікаў у нядзелю',
    description: '2 лістапада выпадае на нядзелю.',
    currentDecision: 'all-souls-primary',
    decisionLabel: 'Галоўнае празднаванне — Успамін усіх памерлых; Імша за памерлых',
    note: 'Ці бярэцца Афіцый з нядзелі ці за памерлых — не вырашана, пазначана толькі заўвагай у Office descriptor.',
    celebrationId: 'all-faithful-departed',
  },
  {
    id: 'mary-mother-church-with-memorial',
    status: 'needs-review',
    docItem: 5,
    title: 'Марыя, Маці Касцёла, супадае з іншым абавязковым успамінам',
    description: 'Панядзелак пасля Спаслання Духа Святога мае яшчэ адзін абавязковы ўспамін.',
    currentDecision: 'legal-choice-marian-first',
    decisionLabel: 'Абодва ўспаміны — на выбар, марыйны першы',
    note: 'Трэба пацвердзіць па ўказаннях CDW 2018.',
    celebrationId: 'mary-mother-church',
  },
  {
    id: 'christ-high-priest-omitted',
    status: 'needs-review',
    docItem: 6,
    title: 'Езус Хрыстус, Найвышэйшы і Вечны Святар, прапускаецца',
    description: 'Свята (уласны каляндар Беларусі, радок 8) супадае са святам агульнага календара або вышэйшым днём.',
    currentDecision: 'national-feast-omitted',
    decisionLabel: 'Свята ў гэтым годзе прапускаецца',
    note: 'Нацыянальнае свята стаіць у радку 8, а не 5, таму саступае святу агульнага календара (напр. Адведзіны 31 мая).',
    celebrationId: 'christ-the-high-priest',
  },
  {
    id: 'immaculate-heart-with-memorial',
    status: 'needs-review',
    docItem: 21,
    title: 'Беззаганнае Сэрца Марыі супадае з абавязковым успамінам',
    description: 'Субота пасля ўрачыстасці Найсвяцейшага Сэрца мае яшчэ адзін абавязковы ўспамін.',
    currentDecision: 'both-optional-weekday-primary',
    decisionLabel: 'Абодва ўспаміны становяцца неабавязковымі, галоўны — будзень',
    note: 'Імшал робіць абодва неабавязковымі; усе чатыры календары друкуюць адзін з іх як галоўны.',
    celebrationId: 'immaculate-heart',
  },
  {
    id: 'diocesan-patron-impeded',
    status: 'needs-review',
    docItem: 22,
    title: 'Урачыстасць апекуна дыяцэзіі перанесена',
    description: 'Уласная ўрачыстасць дыяцэзіі саступае дню з большым першынством.',
    currentDecision: 'transferred-to-next-free-day',
    decisionLabel: 'Пераносіцца на найбліжэйшы вольны дзень',
    note: 'Напр. св. Андрэй Баболя ў Пінскай дыяцэзіі 16.05.2027 (Спасланне Духа Святога) → аўторак 18.05. Пацвердзіць па календары дыяцэзіі.',
  },
]);
