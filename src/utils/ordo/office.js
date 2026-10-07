/**
 * Office resolution descriptors (spec §13–16).
 *
 * The descriptor tells the existing Component Resolver (days + templates)
 * WHERE each component may come from. It never contains texts.
 *
 *  - `sourceFallbacks`: ordered chains (Proper → Common …). A fallback is not
 *    a user choice.
 *  - `allowedChoices`: genuine rubrical choices (for memorials: Common ↔
 *    current Psalter/day), which the UI must keep as a choice.
 *
 * Source vocabulary:
 *   proper               own texts of the celebration (`days` fixed/dynamic doc)
 *   common               Common texts (`templates`, via the doc's `_templates`)
 *   current-day          the temporal day (period doc / seasonal date doc,
 *                        completed from the four-week psalter doc)
 *   sunday-week-1        psalmody of Sunday, week I (`liturgicalTemplates/sunday-week-1`)
 *   complementary        complementary (gradual) psalmody of Daytime Prayer
 *   proper-of-season     Proper of Seasons (Triduum, octaves)
 *   office-for-dead      the `office-for-dead` document
 */
import { SUNDAY_WEEK_1_TEMPLATE } from '../../constants/officeFields.js';

const fallback = (...chain) => ({ chain });
const choice = (chain, options, defaultOption = options[0]) => ({ chain, choice: { options, default: defaultOption } });
const single = (source) => ({ chain: [source] });

/** Reusable source of «з нядзелі І тыдня»: `liturgicalTemplates/sunday-week-1`. */
export const SUNDAY_WEEK_1_SOURCE = SUNDAY_WEEK_1_TEMPLATE;

/** Te Deum by calendar rule (not by content fields). */
export function teDeumFor(officeKind, season) {
  switch (officeKind) {
    case 'solemnity':
    case 'feast':
    case 'easter-octave':
    case 'christmas-octave':
      return true;
    case 'sunday':
      return season.period !== 'lent' && season.period !== 'holyweek';
    default:
      return false;
  }
}

/**
 * Whether a celebration has I Vespers by liturgical right — independent of
 * the presence of `vesper1*` texts.
 */
export function hasFirstVespersByRight(candidate, season) {
  if (candidate.rules?.firstVespers === false) return false;
  if (candidate.rules?.firstVespers === true) return true;
  if (season.date === season.anchors.easterSunday) return false;
  if (candidate.officeKind === 'solemnity') return true;
  if (candidate.officeKind === 'sunday') return true;
  // GNLYC 13: feasts have no I Vespers unless a feast of the Lord replaces a
  // Sunday of Christmas time or Ordinary Time.
  if (candidate.officeKind === 'feast') {
    return season.isSunday && candidate.category === 'lord' && (season.period === 'ordinary' || season.period === 'christmas');
  }
  return false;
}

const inChristmasOctave = (season) => season.period === 'christmas' && season.periodPhase === 'octave';

function complineFor(officeKind, season) {
  if (officeKind === 'solemnity' || officeKind === 'sunday' || officeKind === 'triduum') return 'sunday-after-second-vespers';
  // Both octaves: Sunday Compline after I or II Vespers (Minsk 26 and 30 Dec
  // 2025: "Камплета – як пасля І або ІІ Нешпараў на нядзелю").
  if (officeKind === 'easter-octave' || inChristmasOctave(season)) return 'sunday-after-first-or-second-vespers';
  if (officeKind === 'feast' && season.isSunday) return 'sunday-after-second-vespers';
  return 'current-weekday';
}

function properHours(daytimePsalms, daytimeAntiphons) {
  const hour = () => ({
    hymn: fallback('proper', 'common'),
    psalmody: fallback('proper', 'common'),
    antiphons: fallback('proper', 'common'),
    reading: fallback('proper', 'common'),
    responsory: fallback('proper', 'common'),
    canticleAntiphon: fallback('proper', 'common'),
    intercessions: fallback('proper', 'common'),
    prayer: fallback('proper', 'common'),
  });
  return {
    invitatory: { antiphon: fallback('proper', 'common') },
    officeOfReadings: {
      hymn: fallback('proper', 'common'),
      psalmody: fallback('proper', 'common'),
      antiphons: fallback('proper', 'common'),
      versicle: fallback('proper', 'common'),
      reading1: fallback('proper', 'common'),
      reading2: fallback('proper', 'common'),
      prayer: fallback('proper', 'common'),
    },
    lauds: { ...hour(), psalmody: single('sunday-week-1') },
    daytime: {
      hymn: single('current-day'),
      psalmody: daytimePsalms,
      antiphons: daytimeAntiphons,
      reading: fallback('proper', 'common'),
      prayer: fallback('proper', 'common'),
    },
    vespers: hour(),
  };
}

function memorialHours() {
  // Own texts stay own; everything else is of the current day by default.
  // Where the rubrics allow the Common, it is a quick user choice.
  const properOrChoice = () => choice(['proper'], ['current-day', 'common'], 'current-day');
  const hour = () => ({
    hymn: properOrChoice(),
    psalmody: fallback('proper', 'current-day'),
    antiphons: fallback('proper', 'current-day'),
    reading: properOrChoice(),
    responsory: properOrChoice(),
    canticleAntiphon: properOrChoice(),
    intercessions: properOrChoice(),
    prayer: fallback('proper', 'common'),
  });
  return {
    invitatory: { antiphon: properOrChoice() },
    officeOfReadings: {
      hymn: properOrChoice(),
      psalmody: fallback('proper', 'current-day'),
      antiphons: fallback('proper', 'current-day'),
      versicle: fallback('proper', 'current-day'),
      // First (biblical) reading of the current day; second is hagiographic.
      reading1: single('current-day'),
      reading2: choice(['proper'], ['current-day', 'common'], 'current-day'),
      prayer: fallback('proper', 'common'),
    },
    lauds: hour(),
    daytime: {
      hymn: single('current-day'),
      psalmody: single('current-day'),
      antiphons: single('current-day'),
      reading: single('current-day'),
      prayer: single('current-day'),
    },
    vespers: hour(),
  };
}

function temporalHours(source) {
  const all = () => ({
    hymn: single(source), psalmody: single(source), antiphons: single(source), reading: single(source),
    responsory: single(source), canticleAntiphon: single(source), intercessions: single(source), prayer: single(source),
  });
  return {
    invitatory: { antiphon: single(source) },
    officeOfReadings: {
      hymn: single(source), psalmody: single(source), antiphons: single(source), versicle: single(source),
      reading1: single(source), reading2: single(source), prayer: single(source),
    },
    lauds: all(),
    daytime: {
      hymn: single(source), psalmody: single(source), antiphons: single(source), reading: single(source), prayer: single(source),
    },
    vespers: all(),
  };
}

function hoursFor(officeKind, season) {
  switch (officeKind) {
    case 'solemnity':
      // Daytime Prayer: complementary psalmody; on a Sunday, the Sunday psalms.
      return properHours(
        single(season.isSunday ? 'sunday-week-1' : 'complementary'),
        fallback('proper', 'common', 'current-day'),
      );
    case 'feast':
      return properHours(single('current-day'), fallback('proper', 'current-day'));
    case 'memorial':
    case 'optional-memorial':
      return memorialHours();
    case 'triduum':
      return temporalHours('proper-of-season');
    case 'all-souls':
      return temporalHours('office-for-dead');
    default:
      return temporalHours('current-day');
  }
}

function flatten(hours) {
  const sourceFallbacks = [];
  const allowedChoices = [];
  Object.entries(hours).forEach(([hour, components]) => {
    Object.entries(components).forEach(([component, slot]) => {
      if (slot.chain.length > 1) sourceFallbacks.push({ hour, component, chain: slot.chain });
      if (slot.choice) allowedChoices.push({ hour, component, after: slot.chain, ...slot.choice });
    });
  });
  return { sourceFallbacks, allowedChoices };
}

function sourcesFor(candidate, temporal) {
  const proper = candidate.kind === 'temporal' ? null : candidate.daysRef;
  return {
    proper,
    ...(candidate.fallbackDaysRefs ? { properFallbacks: candidate.fallbackDaysRefs } : {}),
    common: proper ? { from: 'proper._templates', ...(proper.template ? { template: proper.template } : {}) } : null,
    currentDay: temporal?.daysRef || null,
    sundayWeek1: { template: SUNDAY_WEEK_1_SOURCE },
    officeForDead: candidate.rankKind === 'all-souls' ? 'office-for-dead' : undefined,
  };
}

/** Descriptor for one liturgically legal Office option (primary or alternative). */
export function buildOfficeDescriptor(candidate, season, temporal) {
  const officeKind = candidate.officeKind;
  const hours = hoursFor(officeKind, season);
  const { sourceFallbacks, allowedChoices } = flatten(hours);
  const notes = [];
  if (officeKind === 'triduum' && season.date === season.anchors.holyThursday) {
    notes.push('Vespers only for those who do not take part in the evening Mass of the Lord’s Supper.');
  }
  if (officeKind === 'triduum' && season.date === season.anchors.goodFriday) {
    notes.push('Vespers only for those who do not take part in the Celebration of the Lord’s Passion.');
  }
  if (candidate.officeOnly) {
    notes.push('All Souls on Sunday: the Liturgy of the Hours is of the Sunday; Mass and readings of All Souls.');
  }
  return {
    optionId: candidate.id,
    celebrationId: candidate.kind === 'temporal' ? null : candidate.id,
    officeKind,
    sources: sourcesFor(candidate, temporal),
    teDeum: teDeumFor(officeKind, season),
    firstVespers: {
      byRight: hasFirstVespersByRight(candidate, season),
      // I Vespers are assembled Proper → Common when no `vesper1*` texts exist.
      chain: ['proper.vesper1', 'common.vesper1', 'proper', 'common'],
    },
    compline: complineFor(officeKind, season),
    hours,
    sourceFallbacks,
    allowedChoices,
    notes,
  };
}

/** Commemoratio of a memorial on a privileged weekday (GILH 239). */
export function buildCommemorationDescriptor(candidate) {
  return {
    celebrationId: candidate.id,
    mode: 'commemoratio',
    sources: { proper: candidate.daysRef },
    additions: {
      officeOfReadings: [
        { after: 'reading2.responsory', add: 'hagiographic-reading-with-responsory', source: 'proper' },
        { at: 'prayer', add: 'prayer-of-the-saint', source: 'proper' },
      ],
      lauds: [{ after: 'prayer', add: ['antiphon', 'prayer-of-the-saint'], source: 'proper', omitConclusionOfSeasonPrayer: true }],
      vespers: [{ after: 'prayer', add: ['antiphon', 'prayer-of-the-saint'], source: 'proper', omitConclusionOfSeasonPrayer: true }],
    },
    optional: true,
  };
}

/**
 * Evening of `today`: II Vespers of today vs I Vespers of tomorrow (GNLYC 61):
 * the higher row wins; with equal rows today's Vespers are kept.
 */
export function resolveEvening(today, tomorrow) {
  // The Office source (All Souls on a Sunday: the Sunday, §11.1).
  const todayPrimary = today.display.officePrimary || today.display.primary;
  const tomorrowPrimary = tomorrow.display.officePrimary || tomorrow.display.primary;
  const tomorrowHasFirst = hasFirstVespersByRight(tomorrowPrimary, tomorrow.season);
  // Equal rows: today's Vespers are kept, except that a Sunday always begins
  // with its I Vespers against a weekday of the same row (Saturday of the
  // Easter octave → II Sunday of Easter; Vitebsk and Pinsk 11.04.2026).
  const sundayTie = tomorrowPrimary.precedence === todayPrimary.precedence
    && tomorrow.season.isSunday && !today.season.isSunday;
  const tomorrowWins = tomorrowHasFirst && (tomorrowPrimary.precedence < todayPrimary.precedence || sundayTie);
  const todayKind = todayPrimary.officeKind;
  // Days of both octaves have II Vespers (Vitebsk/Grodno print "ІІ Нешпары"
  // on 26–31 December; Minsk "Нешпары з актавы").
  const todaySecond = todayKind === 'solemnity' || todayKind === 'sunday' || todayKind === 'easter-octave'
    || (todayKind === 'feast' && today.season.isSunday) || inChristmasOctave(today.season);
  const conflict = tomorrowHasFirst
    ? { today: todayPrimary.id, tomorrow: tomorrowPrimary.id, winner: tomorrowWins ? 'tomorrow' : 'today', rule: 'GNLYC 61' }
    : null;
  let compline = complineFor(todayKind, today.season);
  if (tomorrowWins && (tomorrowPrimary.officeKind === 'solemnity' || tomorrowPrimary.officeKind === 'sunday'
    || tomorrowPrimary.officeKind === 'feast')) {
    compline = 'sunday-after-first-vespers';
  }
  return {
    vespers: tomorrowWins
      ? { type: 'first', celebrationId: tomorrowPrimary.id, date: tomorrow.season.date, title: tomorrowPrimary.title }
      : {
        type: todaySecond ? 'second' : 'of-the-day',
        celebrationId: todayPrimary.kind === 'temporal' ? null : todayPrimary.id,
        date: today.season.date,
        title: todayPrimary.title,
      },
    compline,
    conflict,
    omittedFirstVespers: tomorrowHasFirst && !tomorrowWins ? tomorrowPrimary.id : null,
  };
}
