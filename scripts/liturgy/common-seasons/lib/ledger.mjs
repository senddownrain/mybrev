/**
 * Ledgers of the audit: what changed in the BASE texts (separate from the seasonal variants), what was found
 * but NOT changed, and the decisions of the editor that the parser applies.
 *
 * Nothing here writes text: the corrections listed in `BASE_CORRECTIONS` were made once, by hand, as separate
 * commits; this module VERIFIES against the three volumes that the stored base is now in the state the
 * ledger claims (and the tests fail if it is not).
 */
import fs from 'node:fs';
import { htmlToPlain } from './html.mjs';
import { comparableText } from './fields.mjs';
import { ALLELUIA_ANNOTATION, normalizeForCompare } from './volume.mjs';
import { lcsLength, tokensOf, wordChanges } from './compare.mjs';

/** Decisions of the editor on the first audit (docs/common-seasons-decisions.md) and how the parser applies them. */
export const OWNER_DECISIONS = Object.freeze([
  { id: 'NR-001', title: '«аллелюя» у К./Н. пасхальных респонсориев', decision: 'accepted', rule: 'alleluia-v1-versicle', status: 'applied' },
  { id: 'NR-002', title: 'church-dedication.officeOfReadingsAnt2: знак †', decision: 'do not add †', rule: 'dagger-belongs-to-psalmody', status: 'applied' },
  { id: 'NR-003', title: 'apostles.officeOfReadingsPs2: Пс 64 (63), антифоны', decision: 're-verify the whole psalm, separate base corrections from variants', status: 'verified' },
  { id: 'NR-004', title: 'religious.officeOfReadingsR1: Эф 4, 1–24 (том II) против Флп 3–4 (том III)', decision: 'whole-reading variant', status: 'applied' },
  { id: 'NR-005', title: 'religious.officeOfReadingsR1: респонсорий «Пра законнiцу»', decision: 'part of the whole-reading variant', status: 'applied' },
  { id: 'NR-006', title: 'works-of-mercy.officeOfReadingsR1: 1 Ян 4, 7–21 (том II) против 1 Кар 12–13 (том III)', decision: 'whole-reading variant', status: 'applied' },
  { id: 'NR-007', title: 'apostles.officeOfReadingsVers: К./Н. переставлены в базе', decision: 'fix the base', status: 'applied' },
  { id: 'NR-008', title: 'virgins.officeOfReadingsVers: К./Н. переставлены в базе', decision: 'fix the base', status: 'applied' },
  { id: 'NR-009', title: 'holy-women.officeOfReadingsVers: К./Н. переставлены в базе', decision: 'fix the base', status: 'applied' },
  { id: 'NR-010', title: 'опечатка «аллеюя» → «аллелюя»', decision: 'fix', status: 'applied' },
  { id: 'NR-011', title: 'Страстная неделя и Триденствие', decision: 'holyweek = Lent until the Triduum, none for periodPhase triduum', status: 'verified' },
  { id: 'NR-012', title: 'Молитвы Найсвяцейшай Панны Марыі (Адвэнт / Нараджэнне)', decision: 'one seasonal prayer, Ordinary Time keeps the list', status: 'verified' },
]);

const plainOf = (value) => normalizeForCompare(htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value || '')));
const labelsOf = (text) => (text.match(/(?:^|\s)([КкНн])\.(?=\s)/gu) || []).map((m) => m.trim()[0].toUpperCase()).join('');
const volumeLines = (volume, lines) => [...new Set(lines)].sort((a, b) => a - b);

/** Reading of a К./Н. field in a volume: [{ n, text }] of its units. */
function printed(corpus, volId, commonId, field, season = null) {
  const units = corpus.volumes[volId].commons.get(commonId)?.fields.get(field) || [];
  const lines = units.flatMap((unit) => [...unit.lines, ...unit.branches.flatMap((b) => b.lines)]).filter((l) => l.text.trim());
  return { text: comparableText(units, season) || '', lines: volumeLines(volId, lines.map((l) => l.n)), raw: lines.map((l) => l.text) };
}

/**
 * Confirmed corrections of the BASE texts (stored Commons = Ordinary Time, Volume III). Each was made by a
 * separate commit; `verify` re-derives from the volumes that the stored base is in the corrected state.
 */
export const BASE_CORRECTIONS = Object.freeze([
  ...[
    ['NR-007', 'apostles', 'КН', 'КН', 'НК',
      'Volumes I and II print «К. Апосталы абвяшчалі хвалу і магутнасць Пана. Н. І цуды, якія Ён учыніў.»; Volume III prints the labels reversed. The Proper of Ss. Philip and James (patchs/db-feasts/03-05-sv-philip-james-apostles.json) has К. first.'],
    ['NR-008', 'virgins', 'КН', 'КН', 'НК',
      'Volumes I and II print «К. Ты паказаў мне шляхі жыцця. Н. Напоўніў мяне радасцю сузірання Твайго аблічча.» (Пс 16 (15), 11); Volume III prints the labels reversed.'],
    ['NR-009', 'holy-women', 'КН', 'НК', 'НК',
      'ONLY Volume I prints «К. Разважанні майго сэрца заўжды перад Табою. Н. Пане, мая дапамога і мой Адкупіцель.»; Volumes II and III repeat the same reversed order (the first decision note assumed that Volume II is right: it is not). The versicle is the first half of Пс 19 (18), 15, the response the second half; every other Common of the three volumes prints К. before Н.'],
  ].map(([id, common, expectI, expectII, expectIII, evidence]) => ({
    id, common, field: 'officeOfReadingsVers', kind: 'kn-labels-swapped',
    commit: 'fix(liturgy): swap К./Н. labels in officeOfReadingsVers of apostles, virgins, holy-women',
    evidence,
    before: {
      apostles: 'Н. Апосталы абвяшчалі хвалу і магутнасць Пана. К. І цуды, якія Ён учыніў.',
      virgins: 'Н. Ты паказаў мне шляхі жыцця. К. Напоўніў мяне радасцю сузірання Твайго аблічча.',
      'holy-women': 'Н. Разважанні майго сэрца заўжды перад Табою. К. Пане, мая дапамога і мой Адкупіцель.',
    }[common],
    fields: ['officeOfReadingsVers'],
    verify(corpus) {
      const base = labelsOf(htmlToPlain(corpus.base.get(common).officeOfReadingsVers));
      const labels = (volId) => labelsOf(printed(corpus, volId, common, 'officeOfReadingsVers', volId === 'I' ? 'advent' : volId === 'II' ? 'lent' : null).text.replace(/\s+/g, ' '));
      const v1 = labels('I'); const v2 = labels('II'); const v3 = labels('III');
      return { baseLabels: base, volumeI: v1, volumeII: v2, volumeIII: v3, ok: base === 'КН' && v1 === expectI && v2 === expectII && v3 === expectIII };
    },
  })),
  {
    id: 'NR-003', common: 'apostles', field: 'officeOfReadingsAnt2 + officeOfReadingsPs2 (closing antiphon)', kind: 'misprint-in-antiphon',
    commit: 'fix(liturgy): apostles Ps 64 (63) antiphon wording (абвяшчалі справу)',
    before: '2 ант. Яны абвяшалі справу Бога * і зразумелі Яго ўчынкі. / (closing) Ант. Яны абвяшалі справы Бога * і зразумелі Яго ўчынкі.',
    fields: ['officeOfReadingsAnt2', 'officeOfReadingsPs2'],
    evidence: 'Volume III prints «абвяшалі справу» (2 ант., line 1703) and «абвяшалі справы» (closing antiphon, line 1733) while the verse of the same psalm in the same volume reads «абвесцяць справу Бога»; the verb is «абвяшчаць» everywhere else in the three volumes; Volumes I and II print «абвяшчалі справу» in both antiphons. The psalm body is identical in Volume II and in the stored base (checked word by word).',
    verify(corpus) {
      const base = corpus.base.get('apostles');
      const ant = plainOf(base.officeOfReadingsAnt2);
      const closing = plainOf(base.officeOfReadingsPs2);
      const ps2 = comparableText(corpus.volumes.II.commons.get('apostles').fields.get('officeOfReadingsPs2'), 'easter') || '';
      const body = (t) => tokensOf(t).filter((w) => w !== 'ант' && w !== 'аллелюя');
      const baseBody = body(htmlToPlain(base.officeOfReadingsPs2));
      const volBody = body(ps2);
      const common = lcsLength(baseBody, volBody);
      return {
        antiphon: ant, closingAntiphonEnd: closing.slice(-60), psalmWordsBase: baseBody.length, psalmWordsVolumeII: volBody.length, psalmWordsDifferent: baseBody.length + volBody.length - 2 * common,
        ok: /абвяшчалі справу бога/.test(ant) && /абвяшчалі справу бога \* і зразумелі яго ўчынкі\.?$/.test(closing) && baseBody.length + volBody.length - 2 * common === 0,
      };
    },
  },
]);

/** NR-010: every printed «аллеюя» (misprint of «аллелюя»), by volume and line. */
export function scanSourceMisprints(corpus) {
  const found = [];
  Object.values(corpus.volumes).forEach((volume) => {
    volume.lines.forEach((line) => {
      const hits = line.text.match(/[Аа]ллеюя/gu);
      if (hits && line.n <= volume.indexStart) found.push({ volume: volume.id, line: line.n, words: hits.length, context: line.text.slice(0, 120) });
    });
  });
  return found;
}

/** Volume-to-volume check of the index of antiphons at the end of Volume II (annotated antiphons of the canticles). */
export function indexCrossCheck(corpus) {
  const volume = corpus.volumes.II;
  const index = volume.lines.slice(volume.indexStart).filter((l) => ALLELUIA_ANNOTATION.test(l.text));
  const corpusAnnotated = [];
  volume.commons.forEach((entry) => entry.common.order.forEach((unit) => {
    [...unit.lines, ...unit.branches.flatMap((b) => b.lines), ...(unit.suffix || []), ...unit.repeats].forEach((l) => { if (ALLELUIA_ANNOTATION.test(l.text)) corpusAnnotated.push(l.text); });
  }));
  const clean = (text) => tokensOf(text.replace(/^[^:]{2,40}:\s*/u, '').replace(ALLELUIA_ANNOTATION, '').replace(/^(?:[123]\s+)?ант\.\s*(?:да\s+песні\s+\p{L}+:)?/iu, ''));
  const pool = corpusAnnotated.map(clean);
  const unmatched = index.filter((line) => {
    const a = clean(line.text);
    return !pool.some((b) => a.length && lcsLength(a, b) / Math.max(a.length, b.length) >= 0.85);
  });
  return { indexAnnotated: index.length, corpusAnnotated: corpusAnnotated.length, unmatched: unmatched.map((l) => ({ line: l.n, text: l.text.slice(0, 120) })) };
}

/**
 * Differences between the stored base and Volume III (the base is supposed to be Volume III):
 * text printed by Volume III that the stored field does not contain. NOT corrected here.
 */
export function baseVersusOrdinary(corpus) {
  const rows = [];
  for (const [commonId, doc] of corpus.base) {
    const fields = corpus.volumes.III.commons.get(commonId)?.fields || new Map();
    for (const [field, units] of fields) {
      const value = doc[field];
      if (!value) continue;
      const a = tokensOf(comparableText(units, null));
      const b = tokensOf(htmlToPlain(Array.isArray(value) ? value.join('\n') : value));
      const common = lcsLength(a, b);
      const missingInBase = a.length ? 1 - common / a.length : 0;
      if (missingInBase >= 0.03 && a.length - common >= 8) {
        rows.push({
          common: commonId, field, missingWords: a.length - common, share: Math.round(missingInBase * 1000) / 1000,
          changes: wordChanges(b, a, 3).map((c) => ({ onlyInVolumeIII: c.volume.slice(0, 160), onlyInBase: c.ordinary.slice(0, 160) })),
        });
      }
    }
  }
  return rows;
}

/**
 * «Nothing printed by Volume I or II is lost»: for every (Common, field, season) the words that the seasonal volume
 * prints are looked up (in order, longest common subsequence) in the text the app will show in that season
 * (the seasonal variant when there is one, else the stored base). What is not found is a difference of wording,
 * a cross-reference or a page reference; the largest ones are listed so that nothing hides behind a percentage.
 * `аллелюя` is left out (it is added by rule, not printed word for word).
 */
export function volumeWordCoverage({ corpus, variants, seasons, seasonVolume }) {
  const rows = [];
  let cells = 0;
  for (const [commonId, doc] of corpus.base) {
    for (const season of seasons) {
      const fields = corpus.volumes[seasonVolume[season]].commons.get(commonId)?.fields || new Map();
      for (const [field, units] of fields) {
        const printedText = comparableText(units, season);
        if (printedText === null) continue;
        const printed = tokensOf(printedText).filter((t) => t !== 'аллелюя');
        if (!printed.length) continue;
        const variant = variants.get(commonId)?.[season]?.[field];
        const shown = variant ? variant.value : doc[field];
        const shownTokens = tokensOf(htmlToPlain(Array.isArray(shown) ? shown.join('\n') : (shown || ''))).filter((t) => t !== 'аллелюя');
        cells += 1;
        const lost = printed.length - lcsLength(printed, shownTokens);
        if (lost) rows.push({ common: commonId, field, season, volume: seasonVolume[season], printedWords: printed.length, notFoundWords: lost, seasonalVariant: Boolean(variant) });
      }
    }
  }
  const bucket = (n) => (n === 0 ? '0' : n <= 5 ? '1–5' : n <= 19 ? '6–19' : '≥ 20');
  const buckets = { '0': cells - rows.length, '1–5': 0, '6–19': 0, '≥ 20': 0 };
  rows.forEach((r) => { buckets[bucket(r.notFoundWords)] += 1; });
  return { cells, buckets, largest: rows.filter((r) => r.notFoundWords >= 6).sort((a, b) => b.notFoundWords - a.notFoundWords || a.common.localeCompare(b.common) || a.field.localeCompare(b.field)) };
}

/** Source lines (per volume) of a field, for the ledger. */
export function sourceLines(corpus, common, field) {
  return Object.fromEntries(['I', 'II', 'III'].map((volId) => {
    const units = corpus.volumes[volId].commons.get(common)?.fields.get(field) || [];
    const numbers = units.flatMap((unit) => [unit.startLine, ...unit.lines.map((l) => l.n), ...unit.branches.flatMap((b) => b.lines.map((l) => l.n)), ...unit.repeats.map((l) => l.n)]);
    return [volId, numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : null];
  }));
}

export function readText(file) { return fs.readFileSync(file, 'utf8'); }
