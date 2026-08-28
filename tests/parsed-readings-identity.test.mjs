import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPeriodDayId,
  buildReadingDocumentId,
  canonicalizeLegacyReadingMetadata,
  findReadingDayCandidates,
  hasReadingDocumentContent,
  hasReadingSectionContent,
  normalizeFeastCode,
  inferFeastCodeFromTitle,
  inferPeriodMetadataFromTitle,
  inferReadingCycleFromTitle,
  normalizeReadingCycle,
  normalizeReadingTitle,
  readingSelector,
  readingTitleSimilarity,
  resolveReadingDayLink,
  selectReadingCycleVariants,
  selectReadingLectionaryVariants,
  selectCalendarDayVariants,
  removeDuplicatedBiblePrefix,
  removeTrailingParserStub,
} from '../src/utils/parsedReadingsIdentity.js';

test('normalizes readings selectors to the days vocabulary', () => {
  assert.equal(normalizeFeastCode('holyfamily'), 'feast-holyfamily');
  assert.equal(normalizeFeastCode('feast-HolyFamily'), 'feast-holyfamily');
  assert.equal(readingSelector({ _date: '4.3' }), 'date:04.03');
  assert.equal(readingSelector({ _feast: 'ash' }), 'feast:feast-ash');
  assert.equal(
    readingSelector({ _periodType: 'ordinary', _periodWeekNumber: '12', _dayOfWeek: '3' }),
    'period:ordinary:w12:d3',
  );
});

test('builds IDs from the days base and a normalized lectionary cycle', () => {
  assert.equal(buildPeriodDayId({ _periodType: 'lent', _periodWeekNumber: 2, _dayOfWeek: 4 }), 'lent-w2-d4');
  assert.equal(buildReadingDocumentId('lent-w2-d1', { year: 'a' }), 'lent-w2-d1--A');
  assert.equal(buildReadingDocumentId('ordinary-w12-d3', { year: 2 }), 'ordinary-w12-d3--2');
  assert.equal(buildReadingDocumentId('christmas-25-12', { _variant: 'night' }), 'christmas-25-12--night');
  assert.equal(normalizeReadingCycle(null), '');
});

test('repairs legacy dynamic-feast metadata from authoritative titles', () => {
  assert.equal(inferReadingCycleFromTitle('Урачыстасць Тройцы, Год В'), 'B');
  assert.equal(inferFeastCodeFromTitle('Урачыстасць Найсвяцейшай Тройцы, Год А'), 'feast-trinity');
  assert.equal(inferFeastCodeFromTitle('II Велікодная нядзеля, Год А'), '');
  assert.equal(inferFeastCodeFromTitle('Пятніца пасля Папяльца'), '');
  assert.deepEqual(
    canonicalizeLegacyReadingMetadata({
      _date: '07.06',
      title: 'Урачыстасць Найсвяцейшай Тройцы, Год А',
      year: null,
    }),
    {
      _feast: 'feast-trinity',
      title: 'Урачыстасць Найсвяцейшай Тройцы, Год А',
      year: 'A',
    },
  );
  assert.deepEqual(
    canonicalizeLegacyReadingMetadata({ _feast: 'paulvi', title: 'Св. Паўла VI, папа' }),
    { _date: '29.05', _rank: 'memoria-ad-libitum', title: 'Св. Паўла VI, папа' },
  );
  assert.deepEqual(
    canonicalizeLegacyReadingMetadata({
      _periodType: 'easter',
      _periodWeekNumber: 7,
      _dayOfWeek: 7,
      title: 'Спасланне Духа Святога',
    }),
    {
      _periodType: 'easter',
      _periodWeekNumber: 7,
      _dayOfWeek: 7,
      _variant: 'pentecost-vigil',
      title: 'Спасланне Духа Святога',
    },
  );
});

test('repairs legacy Holy Week selectors and preserves distinct rites', () => {
  assert.deepEqual(inferPeriodMetadataFromTitle('Вялікі панядзелак'), {
    _periodType: 'holyweek',
    _periodWeekNumber: 1,
    _dayOfWeek: 2,
  });
  assert.deepEqual(inferPeriodMetadataFromTitle('Вялікі чацвер (Імша Вячэры Пана)'), {
    _periodType: 'holyweek',
    _periodWeekNumber: 1,
    _dayOfWeek: 5,
    _variant: 'evening-mass',
  });
  assert.deepEqual(inferPeriodMetadataFromTitle('Пасхальная вігілія ў святую ноч'), {
    _periodType: 'holyweek',
    _periodWeekNumber: 1,
    _dayOfWeek: 7,
    _variant: 'vigil',
  });
});

test('recognizes content in every supported reading section shape', () => {
  assert.equal(hasReadingSectionContent({ text: 'Дастаткова доўгі тэкст чытання' }), true);
  assert.equal(hasReadingSectionContent({ verse: 'Кароткі спеў' }), true);
  assert.equal(hasReadingSectionContent({ verses: ['Першы верш'] }), true);
  assert.equal(hasReadingSectionContent({ chorus: 'Дастатковы рэфрэн' }), true);
  assert.equal(hasReadingSectionContent({ text: 'а' }), false);
  assert.equal(hasReadingDocumentContent({ gospel: { bible: 'Мц 1, 1' } }), false);
  assert.equal(hasReadingDocumentContent({ gospel: { text: 'Дастаткова доўгі тэкст Евангелля' } }), true);
});

test('removes only the known standalone parser stub', () => {
  assert.equal(removeTrailingParserStub('Тэкст чытання\n\nа'), 'Тэкст чытання');
  assert.equal(removeTrailingParserStub('Раббі, Ты Сын Божы! а'), 'Раббі, Ты Сын Божы!');
  assert.equal(removeTrailingParserStub('а'), null);
  assert.equal(removeTrailingParserStub('Слова заканчваецца на а'), 'Слова заканчваецца на а');
});

test('moves a duplicated Bible reference out of the section text', () => {
  assert.equal(
    removeDuplicatedBiblePrefix('Ап 21, 9b–14\n\nАнёл гаварыў са мною', 'Ап 21, 9b–14'),
    'Анёл гаварыў са мною',
  );
  assert.equal(removeDuplicatedBiblePrefix('Анёл гаварыў са мною', 'Ап 21, 9b–14'), 'Анёл гаварыў са мною');
});

test('normalizes source-page titles for fixed-day matching', () => {
  assert.equal(
    normalizeReadingTitle('24 жніўня — свята св. Барталамея, апостала'),
    'св барталамея апостала',
  );
  assert.equal(normalizeReadingTitle('Свята, Год А'), '');
});

test('selects one cycle per celebration without hiding other fixed celebrations', () => {
  const documents = [
    { id: 'saint', _date: '13.01', title: 'Св. Гілярыя', year: null },
    { id: 'baptism-a', _date: '13.01', title: 'Хрост Пана, Год А', year: 'A' },
    { id: 'baptism-b', _date: '13.01', title: 'Хрост Пана, Год В', year: 'B' },
  ];
  assert.deepEqual(
    selectReadingCycleVariants(documents, 'A').map((item) => item.id),
    ['saint', 'baptism-a'],
  );
});

test('uses the Sunday cycle for A/B/C feasts celebrated on weekdays', () => {
  const documents = ['A', 'B', 'C'].map((year) => ({
    id: `corpus-${year}`,
    _feast: 'feast-corpuschristi',
    year,
  }));
  assert.deepEqual(
    selectReadingLectionaryVariants(documents, { cycle: '2', sundayCycle: 'B' }).map((item) => item.id),
    ['corpus-B'],
  );
});

test('keeps an independent rite variant alongside the selected feast cycle', () => {
  const documents = [
    { id: 'palms-A', _feast: 'feast-palmsunday', year: 'A' },
    { id: 'palms-B', _feast: 'feast-palmsunday', year: 'B' },
    {
      id: 'palms-procession',
      _feast: 'feast-palmsunday',
      _variant: 'procession',
      year: null,
    },
  ];
  assert.deepEqual(
    selectReadingLectionaryVariants(documents, { cycle: '2', sundayCycle: 'A' }).map((item) => item.id),
    ['palms-A', 'palms-procession'],
  );
});

test('selects an exact calendar-weekday variant before a generic date reading', () => {
  const documents = [
    { id: 'weekday', _date: '05.01' },
    { id: 'sunday', _date: '05.01', _calendarDayOfWeek: 1 },
  ];
  assert.deepEqual(selectCalendarDayVariants(documents, 1).map((item) => item.id), ['sunday']);
  assert.deepEqual(selectCalendarDayVariants(documents, 2).map((item) => item.id), ['weekday']);
});

test('maps period and feast readings directly to days', () => {
  const days = [
    { id: 'ordinary-w2-d3', _periodType: 'ordinary', _periodWeekNumber: 2, _dayOfWeek: 3 },
    { id: 'feast-ash', _feast: 'feast-ash' },
  ];
  assert.deepEqual(
    findReadingDayCandidates({ _periodType: 'ordinary', _periodWeekNumber: 2, _dayOfWeek: 3 }, days).map((x) => x.id),
    ['ordinary-w2-d3'],
  );
  assert.deepEqual(findReadingDayCandidates({ _feast: 'ash' }, days).map((x) => x.id), ['feast-ash']);
});

test('uses title, rank, and place to disambiguate fixed celebrations', () => {
  const days = [
    { id: '04.03-memoria-sv-casimir', _date: '04.03', _rank: 'memoria', _title: 'Св. Казіміра' },
    { id: '04.03-festum-grodno-sv-casimir', _date: '04.03', _rank: 'festum', _place: 'grodno', _title: 'Св. Казіміра, дадатковага апекуна дыяцэзіі' },
  ];
  const reading = {
    _date: '04.03',
    _rank: 'festum',
    _place: 'grodno',
    title: '4 сакавіка — свята св. Казіміра, дадатковага апекуна дыяцэзіі',
  };
  assert.deepEqual(findReadingDayCandidates(reading, days).map((x) => x.id), ['04.03-festum-grodno-sv-casimir']);
});

test('uses inflection-tolerant title similarity without merging another feast', () => {
  assert.ok(readingTitleSimilarity(
    '8 верасня — свята Нараджэння Найсвяцейшай Панны Марыі',
    'НАРАДЖЭННЕ НАЙСВ. ПАННЫ МАРЫІ',
  ) > readingTitleSimilarity(
    '8 верасня — свята Нараджэння Найсвяцейшай Панны Марыі',
    'НАЙСВ. ПАННЫ МАРЫІ БРАСЛАЎСКАЙ',
  ));
});

test('links seasonal readings and shared local celebrations conservatively', () => {
  const seasonalDays = [
    { id: '21-12-sv-peter-canisius', _date: '21.12', _rank: 'memoria-ad-libitum', _title: 'Св. Пятра Канізія' },
    { id: 'advent-21-12', _date: '21.12' },
  ];
  assert.equal(resolveReadingDayLink({
    _date: '21.12', _sourceCategory: 'advent', title: '21 снежня — звычайны дзень Адвэнту',
  }, seasonalDays).baseId, 'advent-21-12');

  const localDays = [
    { id: '16-05-sv-andrei-bobola-minsk-mohilev', _date: '16.05', _rank: 'memoria', _place: 'minsk-mohilev', _title: 'Св. Андрэя Баболі' },
    { id: '16-05-sv-andrei-bobola-vitebsk', _date: '16.05', _rank: 'memoria', _place: 'vitebsk', _title: 'Св. Андрэя Баболі' },
  ];
  const link = resolveReadingDayLink({
    _date: '16.05', _sourceCategory: 'uspaminy', title: 'Успамін св. Андрэя Баболі',
  }, localDays);
  assert.equal(link.status, 'mapped');
  assert.equal(link.baseId, '16-05-sv-andrei-bobola');
  assert.equal(link.dayIds.length, 2);
});
