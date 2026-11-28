import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import {
  applySeasonalWeekdayAntiphons,
  resolveAdventDateAgainstPeriod,
  getFixedCelebrationKey,
  getFixedDayTemplateKey,
  getDaytimeHourField,
  getPeriodDayDocumentId,
  getOrdinaryPsalterDayDocumentId,
  getPeriodPsalterDayDocumentId,
  getPeriodDayTemplateDocumentId,
  getSeasonalDateExceptionId,
  groupFixedCelebrationDays,
  hasMissingDaytimeFields,
  hasSingleAntiphonPsalmody,
  isSeasonalDateDocumentId,
  resolveDateDayAgainstPeriod,
  resolveChristmasDateAgainstPeriod,
  resolveDayAgainstPeriod,
  resolvePeriodDayAgainstPsalter,
} from '../src/utils/liturgicalDayResolution.js';

test('builds deterministic Advent and Christmas exception IDs', () => {
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-19')), 'advent-19-12');
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-25')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-26')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-27')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-28')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-01')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-06')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-11')), 'christmas-11-01');
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-12')), 'christmas-12-01');
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-11'), 'ordinary'), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-11'), 'christmas'), 'christmas-11-01');
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-13')), null);
  assert.equal(isSeasonalDateDocumentId('christmas-28-12'), true);
  assert.equal(isSeasonalDateDocumentId('28-12-holy-innocents'), false);
});

test('builds a canonical period ID for a from-day fallback', () => {
  assert.equal(getPeriodDayDocumentId('ordinary', 21, 3), 'ordinary-w21-d3');
  assert.equal(getPeriodDayDocumentId('lent', '0', '4'), 'lent-w0-d4');
  assert.equal(getPeriodDayDocumentId('', 21, 3), '');
  assert.equal(getPeriodDayDocumentId('ordinary', 21, 8), '');
});

test('maps a period week to its four-week psalter template', () => {
  assert.equal(
    getPeriodDayTemplateDocumentId('ordinary', 21, 3),
    'ordinary-psalmweek-1-day-3',
  );
  assert.equal(
    getPeriodDayTemplateDocumentId('ordinary', 22, 3),
    'ordinary-psalmweek-2-day-3',
  );
  assert.equal(getPeriodDayTemplateDocumentId('ordinary', 0, 3), '');
  assert.equal(getPeriodPsalterDayDocumentId('ordinary', 21, 4), 'ordinary-w1-d4');
  assert.equal(getPeriodPsalterDayDocumentId('ordinary', 22, 4), 'ordinary-w2-d4');
  assert.equal(getPeriodPsalterDayDocumentId('ordinary', 0, 4), '');
  assert.equal(getOrdinaryPsalterDayDocumentId(4, 7), 'ordinary-w4-d7');
  assert.equal(getOrdinaryPsalterDayDocumentId(1, 2), 'ordinary-w1-d2');
  assert.equal(getOrdinaryPsalterDayDocumentId(1, 1), 'ordinary-w5-d1');
});

test('repairs empty period daytime fields from the matching psalter day only', () => {
  const periodDay = {
    id: 'ordinary-w21-d4',
    _periodWeekNumber: 21,
    sext1Hymn: null,
    sext1Ps1: '',
    sext1R: '<p>Уласнае чытанне 21 тыдня</p>',
    officeOfReadingsR1: '',
  };
  const psalterDay = {
    id: 'ordinary-w1-d4',
    sext1Hymn: '<p>Гімн псалтыра</p>',
    sext1Ps1: '<p>Псальм псалтыра</p>',
    sext1R: '<p>Чытанне псалтыра</p>',
    officeOfReadingsR1: '<p>Чытанне 1 тыдня</p>',
  };

  assert.equal(hasMissingDaytimeFields(periodDay), true);
  const resolved = resolvePeriodDayAgainstPsalter(periodDay, psalterDay);
  assert.equal(resolved.id, 'ordinary-w21-d4');
  assert.equal(resolved._periodWeekNumber, 21);
  assert.equal(resolved.sext1Hymn, '<p>Гімн псалтыра</p>');
  assert.equal(resolved.sext1Ps1, '<p>Псальм псалтыра</p>');
  assert.equal(resolved.sext1R, '<p>Уласнае чытанне 21 тыдня</p>');
  assert.equal(resolved.officeOfReadingsR1, '');
});

test('resolves legacy and canonical from-day markers without replacing identity', () => {
  const resolved = resolveDayAgainstPeriod({
    id: 'fixed',
    _feastName: 'Святы',
    laudesAnt1: 'from-day',
    laudesAnt2: '[from-day]',
    laudesPr: '<p>Уласная</p>',
  }, {
    id: 'period',
    _feastName: 'Перыяд',
    laudesAnt1: '<p>1</p>',
    laudesAnt2: '<p>2</p>',
    laudesPr: '<p>Перыяд</p>',
  });
  assert.equal(resolved.id, 'fixed');
  assert.equal(resolved._feastName, 'Святы');
  assert.equal(resolved.laudesAnt1, '<p>1</p>');
  assert.equal(resolved.laudesAnt2, '<p>2</p>');
  assert.equal(resolved.laudesPr, '<p>Уласная</p>');
});

test('can reapply an already loaded period day to preserved from-day fields', () => {
  const unresolved = resolveDayAgainstPeriod({
    id: '25-08-sv-joseph-calasanz--educators',
    laudesHymn: 'from-day',
    laudesAnt1: '[from-day]',
    laudesPs1: 'from-day',
    laudesPr: '<p>Уласная малітва</p>',
  }, null);

  assert.deepEqual(unresolved._fromDayFields, [
    'laudesHymn',
    'laudesAnt1',
    'laudesPs1',
  ]);
  assert.equal(unresolved.laudesHymn, '');

  const resolved = resolveDayAgainstPeriod(unresolved, {
    id: 'ordinary-w21-d3',
    laudesHymn: '<p>Гімн дня</p>',
    laudesAnt1: '<p>Антыфона дня</p>',
    laudesPs1: '<p>Псальм дня</p>',
    laudesPr: '<p>Малітва дня</p>',
  });

  assert.equal(resolved.id, '25-08-sv-joseph-calasanz--educators');
  assert.equal(resolved.laudesHymn, '<p>Гімн дня</p>');
  assert.equal(resolved.laudesAnt1, '<p>Антыфона дня</p>');
  assert.equal(resolved.laudesPs1, '<p>Псальм дня</p>');
  assert.equal(resolved.laudesPr, '<p>Уласная малітва</p>');
});

test('never leaves unresolved from-day markers in assembled fields', () => {
  const withoutPeriod = resolveDayAgainstPeriod({
    id: 'fixed',
    laudesAnt1: 'from-day',
    laudesAnt2: '[from-day]',
    laudesAnt3: '<p>[from-day]</p>',
    laudesPr: '<p>Уласная</p>',
  }, null);

  assert.equal(withoutPeriod.laudesAnt1, '');
  assert.equal(withoutPeriod.laudesAnt2, '');
  assert.equal(withoutPeriod.laudesAnt3, '');
  assert.equal(withoutPeriod.laudesPr, '<p>Уласная</p>');

  const stalePeriod = resolveDayAgainstPeriod({
    id: 'fixed',
    laudesAnt1: 'from-day',
  }, {
    id: 'period',
    laudesAnt1: '<p>from-day</p>',
    laudesAnt2: 'from-day',
  });

  assert.equal(stalePeriod.laudesAnt1, '');
  assert.equal(stalePeriod.laudesAnt2, '');

  const periodOnly = resolveDayAgainstPeriod({
    id: 'period',
    vesperR: '<p>[from-day]</p>',
  }, null);
  assert.equal(periodOnly.vesperR, '');
});

test('seasonal resolution fills gaps and expands weekday antiphons', () => {
  const seasonal = resolveDayAgainstPeriod({
    id: 'advent-19-12',
    laudesHymn: '',
    thursday: '<p>Ант. 1</p><p>Ант. 2</p><p>Ант. 3</p>',
  }, {
    id: 'advent-w4-d5',
    laudesHymn: '<p>Гімн</p>',
  }, { fillMissing: true });
  const resolved = applySeasonalWeekdayAntiphons(seasonal, 5);
  assert.equal(resolved.id, 'advent-19-12');
  assert.equal(resolved.laudesHymn, '<p>Гімн</p>');
  assert.equal(resolved.laudesAnt2, '<p>Ант. 2</p>');
  assert.equal(resolved.vesperAnt3, '<p>Ант. 3</p>');
});

test('date documents inherit every missing text from the period day', () => {
  const resolved = resolveDateDayAgainstPeriod({
    id: '26-08-our-lady-czestochowa--grodno',
    _date: '26.08',
    laudesPr: '<p>Уласная малітва</p>',
    laudesHymn: '',
  }, {
    id: 'ordinary-w21-d4',
    _periodType: 'ordinary',
    laudesHymn: '<p>Гімн дня</p>',
    laudesPs1: '<p>Псальм дня</p>',
    laudesPr: '<p>Малітва дня</p>',
  });

  assert.equal(resolved.id, '26-08-our-lady-czestochowa--grodno');
  assert.equal(resolved._date, '26.08');
  assert.equal(resolved.laudesHymn, '<p>Гімн дня</p>');
  assert.equal(resolved.laudesPs1, '<p>Псальм дня</p>');
  assert.equal(resolved.laudesPr, '<p>Уласная малітва</p>');
});

test('second Christmas Sunday keeps its proper office and takes only from-day texts from the date', () => {
  const resolved = resolveChristmasDateAgainstPeriod({
    id: 'christmas-03-01',
    officeOfReadingsR1: '<p>Чытанне 3 студзеня</p>',
    laudesHymn: '<p>Гімн 3 студзеня</p>',
  }, {
    id: 'christmas-w2-d1',
    _dayName: 'ІІ нядзеля пасля Нараджэння Пана',
    officeOfReadingsR1: 'from-day',
    laudesHymn: '<p>Уласны нядзельны гімн</p>',
    vesper1Hymn: '<p>Гімн першых Нешпараў</p>',
  });

  assert.equal(resolved.id, 'christmas-w2-d1');
  assert.equal(resolved.officeOfReadingsR1, '<p>Чытанне 3 студзеня</p>');
  assert.equal(resolved.laudesHymn, '<p>Уласны нядзельны гімн</p>');
  assert.equal(resolved.vesper1Hymn, '<p>Гімн першых Нешпараў</p>');
});

test('date documents keep one antiphon around three inherited psalms', () => {
  const resolved = resolveDateDayAgainstPeriod({
    id: 'fixed',
    laudesAnt1: '<p>Адна ўласная антыфона</p>',
    laudesAnt2: 'from-day',
    laudesAnt3: '[from-day]',
  }, {
    id: 'period',
    laudesAnt1: '<p>Антыфона дня 1</p>',
    laudesAnt2: '<p>Антыфона дня 2</p>',
    laudesAnt3: '<p>Антыфона дня 3</p>',
    laudesPs1: '<p>Псальм 1</p>',
    laudesPs2: '<p>Псальм 2</p>',
    laudesPs3: '<p>Псальм 3</p>',
  });

  assert.equal(resolved.laudesAnt1, '<p>Адна ўласная антыфона</p>');
  assert.equal(resolved.laudesAnt2, '');
  assert.equal(resolved.laudesAnt3, '');
  assert.equal(resolved.laudesPs1, '<p>Псальм 1</p>');
  assert.equal(resolved.laudesPs2, '<p>Псальм 2</p>');
  assert.equal(resolved.laudesPs3, '<p>Псальм 3</p>');
  assert.equal(resolved._fromDayFields, undefined);
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: resolved.laudesAnt1,
    ant2: resolved.laudesAnt2,
    ant3: resolved.laudesAnt3,
    ps1: resolved.laudesPs1,
    ps2: resolved.laudesPs2,
    ps3: resolved.laudesPs3,
  }), true);
});

test('each daytime hour keeps its one antiphon while hymns and psalms inherit', () => {
  const fixed = {
    id: '26-08-our-lady-czestochowa--grodno',
    _date: '26.08',
  };
  const period = { id: 'ordinary-w21-d4' };
  [1, 2, 3].forEach((hour) => {
    fixed[`sext${hour}Hymn`] = 'from-day';
    fixed[`sext${hour}Ant1`] = `<p>Уласная антыфона ${hour}</p>`;
    fixed[`sext${hour}Ant2`] = 'from-day';
    fixed[`sext${hour}Ant3`] = 'from-day';
    fixed[`sext${hour}Ps1`] = 'from-day';
    fixed[`sext${hour}Ps2`] = 'from-day';
    fixed[`sext${hour}Ps3`] = 'from-day';
    period[`sext${hour}Hymn`] = `<p>Гімн ${hour}</p>`;
    period[`sext${hour}Ant1`] = `<p>Антыфона дня ${hour}.1</p>`;
    period[`sext${hour}Ant2`] = `<p>Антыфона дня ${hour}.2</p>`;
    period[`sext${hour}Ant3`] = `<p>Антыфона дня ${hour}.3</p>`;
    period[`sext${hour}Ps1`] = `<p>Псальм ${hour}.1</p>`;
    period[`sext${hour}Ps2`] = `<p>Псальм ${hour}.2</p>`;
    period[`sext${hour}Ps3`] = `<p>Псальм ${hour}.3</p>`;
  });

  const resolved = resolveDateDayAgainstPeriod(fixed, period);
  [1, 2, 3].forEach((hour) => {
    assert.equal(getDaytimeHourField(resolved, hour, 'Hymn'), `<p>Гімн ${hour}</p>`);
    assert.equal(getDaytimeHourField(resolved, hour, 'Ant1'), `<p>Уласная антыфона ${hour}</p>`);
    assert.equal(getDaytimeHourField(resolved, hour, 'Ant2'), '');
    assert.equal(getDaytimeHourField(resolved, hour, 'Ant3'), '');
    assert.equal(getDaytimeHourField(resolved, hour, 'Ps1'), `<p>Псальм ${hour}.1</p>`);
    assert.equal(getDaytimeHourField(resolved, hour, 'Ps2'), `<p>Псальм ${hour}.2</p>`);
    assert.equal(getDaytimeHourField(resolved, hour, 'Ps3'), `<p>Псальм ${hour}.3</p>`);
  });
  assert.deepEqual(resolved._fromDayFields.sort(), [
    'sext1Hymn', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3',
    'sext2Hymn', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3',
    'sext3Hymn', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3',
  ]);

  const rerendered = resolveDayAgainstPeriod(resolved, period);
  [1, 2, 3].forEach((hour) => {
    assert.equal(getDaytimeHourField(rerendered, hour, 'Ant2'), '');
    assert.equal(getDaytimeHourField(rerendered, hour, 'Ant3'), '');
  });
});

test('groups templates and dioceses by celebration rank', () => {
  const base = {
    _date: '02.01',
    _feastName: 'Св. Базыля і Грыгорыя',
    _rank: 'memoria',
  };
  assert.equal(
    getFixedCelebrationKey({ ...base, _currentVersion: 'pastors' }),
    getFixedCelebrationKey({ ...base, _currentVersion: 'doctors-of-church' }),
  );
  assert.equal(
    getFixedCelebrationKey(base),
    getFixedCelebrationKey({ ...base, _place: 'vitebsk' }),
  );
  assert.notEqual(
    getFixedCelebrationKey(base),
    getFixedCelebrationKey({ ...base, _rank: 'festum' }),
  );
});

test('deduplicates identical templates across dioceses within the same rank', () => {
  const base = {
    _date: '26.08',
    _feastName: 'Найсв. Панны Марыі Чэнстахоўскай',
    _rank: 'memoria',
    _templates: ['blessed-virgin-mary'],
  };
  const days = [
    { ...base, id: 'czestochowa--grodno', _place: 'grodno' },
    { ...base, id: 'czestochowa--minsk-mohilev', _place: 'minsk-mohilev' },
    { ...base, id: 'czestochowa--pinsk', _place: 'pinsk' },
  ];

  const groups = groupFixedCelebrationDays(days);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].day._place, ['grodno', 'minsk-mohilev', 'pinsk']);
  assert.equal(groups[0].templates.length, 1);
  assert.deepEqual(groups[0].templates[0].dayIds, days.map((day) => day.id));
  assert.deepEqual(groups[0].templates[0].day._place, ['grodno', 'minsk-mohilev', 'pinsk']);
});

test('keeps distinct templates and ranks as distinct choices', () => {
  const base = {
    _date: '02.01',
    _feastName: 'Св. Базыля і Грыгорыя',
  };
  const days = [
    { ...base, id: 'memoria-pastors', _rank: 'memoria', _currentVersion: 'pastors' },
    { ...base, id: 'memoria-doctors', _rank: 'memoria', _currentVersion: 'doctors-of-church' },
    { ...base, id: 'festum-pastors', _rank: 'festum', _currentVersion: 'pastors' },
  ];

  const groups = groupFixedCelebrationDays(days);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.templates.length), [2, 1]);
  assert.notEqual(getFixedDayTemplateKey(days[0]), getFixedDayTemplateKey(days[1]));
  assert.equal(getFixedDayTemplateKey(days[0]), getFixedDayTemplateKey(days[2]));
  assert.equal(
    getFixedDayTemplateKey(days[0]),
    getFixedDayTemplateKey({ _templates: ['pastors'] }),
  );
});

test('daytime hours inherit each missing field from sext1', () => {
  const day = {
    sext1Hymn: '<p>Агульны гімн</p>',
    sext1Ant1: '<p>Агульная антыфона</p>',
    sext1Ps1: '<p>Агульны псалом</p>',
    sext2Hymn: '<p>Уласны гімн сэксты</p>',
    sext2Ant1: '',
    sext3Ps1: '   ',
  };

  assert.equal(getDaytimeHourField(day, 1, 'Hymn'), '<p>Агульны гімн</p>');
  assert.equal(getDaytimeHourField(day, 2, 'Hymn'), '<p>Уласны гімн сэксты</p>');
  assert.equal(getDaytimeHourField(day, 2, 'Ant1'), '<p>Агульная антыфона</p>');
  assert.equal(getDaytimeHourField(day, 3, 'Ps1'), '<p>Агульны псалом</p>');
  assert.equal(getDaytimeHourField({ sext1R: '[from-day]', sext2R: 'from-day' }, 2, 'R'), '');
});

test('detects one antiphon surrounding a complete group of three psalms', () => {
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: '<p>Антыфона</p>', ant2: '', ant3: ' ', ps1: '1', ps2: '2', ps3: '3',
  }), true);
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: '<p>Антыфона 1</p>', ant2: '<p>Антыфона 2</p>', ant3: '', ps1: '1', ps2: '2', ps3: '3',
  }), false);
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: '<p>Антыфона</p>', ant2: '', ant3: '', ps1: '1', ps2: '', ps3: '3',
  }), false);
});

test('ADV-12: a dated Advent document keeps its own Lauds antiphons over the weekday set', () => {
  const period = { id: 'advent-w4-d5', laudesHymn: '<p>Гімн</p>' };
  const weekdaySet = '<p>1 ант. Тыдзень</p><p>2 ант. Тыдзень</p><p>3 ант. Тыдзень</p>';
  const own = resolveAdventDateAgainstPeriod({
    id: 'advent-24-12',
    laudesAnt1: '<p>1 ант. Ты, Бэтлеем</p>',
    laudesAnt2: '<p>2 ант. Падыміце</p>',
    laudesAnt3: '<p>3 ант. Заўтра</p>',
    thursday: weekdaySet,
  }, period, 5);
  assert.match(own.laudesAnt1, /Ты, Бэтлеем/u);
  assert.match(own.laudesAnt3, /Заўтра/u);
  // 17–23 December: no own antiphons, the weekday set still applies.
  const plain = resolveAdventDateAgainstPeriod({ id: 'advent-19-12', thursday: weekdaySet }, period, 5);
  assert.match(plain.laudesAnt1, /Тыдзень/u);
  assert.match(plain.vesperAnt2, /Тыдзень/u);
});

test('ADV-10: Sunday IV of Advent takes verse and readings from the calendar date, the rest from the Sunday', () => {
  const sunday = {
    id: 'advent-w4-d1', _periodType: 'advent', _periodWeekNumber: 4,
    officeOfReadingsHymn: '<p>Гімн нядзелі</p>',
    officeOfReadingsVers: '<p>Верш 21</p>', officeOfReadingsR1: '<p>Чытанне 21.12</p>', officeOfReadingsR2: '<p>Чытанне 2 21.12</p>',
  };
  const dated = {
    id: 'advent-20-12',
    officeOfReadingsVers: '<p>Верш 20</p>', officeOfReadingsR1: '<p>Чытанне 20.12</p>', officeOfReadingsR2: '<p>Чытанне 2 20.12</p>',
    officeOfReadingsHymn: '<p>Гімн даты</p>',
  };
  const resolved = resolveAdventDateAgainstPeriod(dated, sunday, 1, { periodWeek: 4 });
  assert.equal(resolved.officeOfReadingsR1, '<p>Чытанне 20.12</p>');
  assert.equal(resolved.officeOfReadingsR2, '<p>Чытанне 2 20.12</p>');
  assert.equal(resolved.officeOfReadingsVers, '<p>Верш 20</p>');
  assert.equal(resolved.officeOfReadingsHymn, '<p>Гімн нядзелі</p>');
  assert.equal(resolved._fieldSources.officeOfReadingsR1.document, 'advent-20-12');
  // A missing dated reading never blanks the Hour: the Sunday's text stays.
  const fallback = resolveAdventDateAgainstPeriod({ id: 'advent-20-12' }, sunday, 1, { periodWeek: 4 });
  assert.equal(fallback.officeOfReadingsR1, '<p>Чытанне 21.12</p>');
});
