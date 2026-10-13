/**
 * Production changes that the Lectionary audit PREPARED but that are NOT
 * written: each needs an explicit authorization of the owner. Dry-run only:
 * hashes of the reviewed before/after documents, the evidence and the exact
 * options. Nothing here touches Firestore.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { documentHash, storedDocument } from '../../content/lib/app-content.mjs';
import { ROOT } from './source-pages.mjs';

const hashed = (id, data) => documentHash(storedDocument(id, data));
const BUDSLAV_DAY_IDS = ['02-07-our-lady-budslav-minsk', '02-07-our-lady-budslav-vitebsk', '02-07-our-lady-budslav'];

/** Exodus 20, 1–17 from the repository's Belarusian Bible (NOT the Lectionary translation). */
export function exodus20FromBible() {
  const file = path.join(ROOT, 'scripts', 'bible', 'bible_seed_bel.json.gz');
  if (!fs.existsSync(file)) return null;
  const books = JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).books;
  const verses = books.find((book) => book.id === 'ex')?.chapters?.[19];
  return verses ? verses.slice(0, 17).join('\n') : null;
}

export function buildPendingPlans({ docs, pages = null, bible = exodus20FromBible() }) {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const strip = ({ id: _id, ...data }) => data;
  const plans = [];

  const budslav = byId.get('02-07-our-lady-budslav-minsk');
  if (budslav) {
    const before = strip(budslav);
    const after = { ...before, _dayIds: BUDSLAV_DAY_IDS };
    plans.push({
      id: 'budslav-link', title: '02.07 Our Lady of Budslav: readings of every diocese that celebrates it',
      status: 'NEEDS_AUTHORIZATION', collection: 'readings',
      evidence: [
        'Minsk-Mohilev diocesan calendar 2026: SOLEMNITY (patron of the archdiocese), Mass of the solemnity, Gloria, Creed; Zeph 3, 14-18; Rom 12, 9-16b; Lk 1, 39-56 (lectionary vol. VI)',
        'Vitebsk 2026: FEAST «Свята Найсвяцейшай Панны Марыі Будслаўскай», own Mass; Zeph 3, 14-18 or Rom 12, 9-16b; Ps 45; Lk 1, 39-56',
        'Pinsk 2026: MEMORIAL (white) «Імша: з усп., чыт. VI» with Zeph 3, 14-18; Rom 12, 9-16b; Lk 1, 39-56',
        'Grodno 2027: the daily table has a WEEKDAY on 2 July («Аф. буд. звыч. перыяду»); only the announcement list names «урачыстасць НПМ Будслаўскай» on 2-3 July (inconsistent inside the source)',
      ],
      documents: [{ id: budslav.id, changedFields: ['_dayIds'], beforeHash: hashed(budslav.id, before), afterHash: hashed(budslav.id, after) }],
      options: [
        { id: 'A', label: 'add `_dayIds` (additive, 1 field): the same document serves Minsk, Vitebsk, Pinsk and Grodno; Pinsk (memorial) opens it by default (diocesan calendar), Grodno keeps the weekday and offers it as an alternative', recommended: true },
        { id: 'B', label: 'leave the document as is: only Minsk shows the Budslav readings; Vitebsk (feast) and Pinsk (memorial) fall back to «readings missing»' },
        { id: 'C', label: 'additionally create a second document for Vitebsk/Pinsk (copy of the same page): rejected, duplicates the text' },
      ],
      tests: 'tests/liturgical-decisions.test.mjs (Budslav in four dioceses, with and without the link)',
    });
  }

  const lent = byId.get('lent-w3-d1--B');
  if (lent) {
    const before = strip(lent);
    const short = pages?.get('5089')?.parsed?.sets?.[0]?.sections?.[0]?.alternatives?.find((alt) => alt.form === 'short');
    const afterShort = short?.text ? { ...before, reading1: { bible: short.bible, comment: before.reading1?.comment, title: before.reading1?.title, text: short.text } } : null;
    const bibleText = bible;
    const afterBible = bibleText ? { ...before, reading1: { ...before.reading1, text: bibleText, textSource: 'bible_seed_bel (Bible translation, not the Lectionary translation)' } } : null;
    plans.push({
      id: 'lent-w3-d1-B-first-reading', title: 'III Sunday of Lent, year B: the first reading has no text of the long form (Ex 20, 1-17)',
      status: 'NEEDS_AUTHORIZATION', collection: 'readings',
      evidence: ['Catholic.by page 5089 has the heading «ПЕРШАЕ ЧЫТАННЕ, ДАЎЖЭЙШАЕ Зых 20, 1–17» WITHOUT text, and «ПЕРШАЕ ЧЫТАННЕ Зых 20, 1-3. 7-8. 12-17» WITH the text of the short form (620 characters)', 'production `reading1.text` is the 40-character comment «Закон быў дадзены праз Майсея (Ян 1, 17)»; the short form is not in production at all (MISSING_BLOCK)', 'next occurrence: 2027-03-07 (year B)'],
      documents: [
        ...(afterShort ? [{ option: 'A', id: lent.id, changedFields: ['reading1'], beforeHash: hashed(lent.id, before), afterHash: hashed(lent.id, afterShort), characters: short.text.length }] : []),
        ...(afterBible ? [{ option: 'B', id: lent.id, changedFields: ['reading1'], beforeHash: hashed(lent.id, before), afterHash: hashed(lent.id, afterBible), characters: bibleText.length }] : []),
      ],
      options: [
        { id: 'A', label: 'use the SHORT form that the source page does provide (Ex 20, 1-3. 7-8. 12-17, Lectionary translation, 620 characters) as the reading: the only Lectionary text that exists; the long form stays unavailable and is said so', recommended: true },
        { id: 'B', label: 'fill the long form from the repository Belarusian Bible (Ex 20, 1-17): a different translation, marked with its source' },
        { id: 'C', label: 'keep the citation only with a notice until the long form is obtained from the Catholic.by editors / the Bishops\' Conference' },
      ],
      tests: 'tests/lectionary-audit.test.mjs (only two reading pages fail the validation, each a documented source defect)',
    });
  }

  const obsolete = byId.get('christmas-05-01--sunday');
  if (obsolete) {
    const before = strip(obsolete);
    const after = { ...before, _obsolete: true };
    plans.push({
      id: 'christmas-05-01-sunday-obsolete', title: '`christmas-05-01--sunday`: obsolete copy of the II Sunday after Christmas (keyed to 05.01)',
      status: 'NEEDS_AUTHORIZATION', collection: 'readings',
      evidence: ['unreachable since the engine reads the period document `christmas-w2-d1` on the Sunday; the Flutter app already ignores it (`_obsolete` is honoured by the app)', 'permanent deletion is not proposed'],
      documents: [{ id: obsolete.id, changedFields: ['_obsolete'], beforeHash: hashed(obsolete.id, before), afterHash: hashed(obsolete.id, after) }],
      options: [{ id: 'A', label: 'mark `_obsolete: true` (reversible)', recommended: true }, { id: 'B', label: 'leave it (harmless, unreachable)' }, { id: 'C', label: 'delete: not proposed (permanent)' }],
      tests: 'tests/lectionary-audit.test.mjs (documents never reached by a planned option are listed)',
    });
  }

  const week = ['christmas-w1-d5', 'christmas-w1-d6', 'christmas-w1-d7'].filter((id) => byId.has(id));
  if (week.length) {
    plans.push({
      id: 'christmas-w1-d5-d7-unsourced', title: '`christmas-w1-d5/6/7`: weekday documents of the Christmas octave week without a Catholic.by page',
      status: 'DECISION_NEEDED', collection: 'readings',
      evidence: ['no source page carries these identities (29-31 December are served by the date documents `christmas-29-12`, `-30-12`, `-31-12`, which have pages)', 'no planned option of 2025-2035 reaches them'],
      documents: week.map((id) => ({ id, changedFields: ['_obsolete'], beforeHash: hashed(id, strip(byId.get(id))), afterHash: hashed(id, { ...strip(byId.get(id)), _obsolete: true }) })),
      options: [{ id: 'A', label: 'mark `_obsolete: true` (reversible)', recommended: true }, { id: 'B', label: 'keep as unreachable reserve' }],
      tests: 'coverage.json documents.noSourcePage / notReachedByAnyPlannedOption',
    });
  }

  plans.push({
    id: 'prescribed-proper-without-document', title: 'Memorials with PRESCRIBED proper readings that have no document in `readings`',
    status: 'DECISION_NEEDED', collection: 'readings',
    evidence: ['03.01 Most Holy Name of Jesus (optional; first reading + Gospel), 01.05 St Joseph the Worker (optional; Gospel Mt 13, 54-58), 11.06 St Barnabas (memorial; first reading Acts 11, 21b-26; 13, 1-3), 18.11 Dedication of the Basilicas of Sts Peter and Paul (optional; first reading + Gospel)', 'Catholic.by has no Lectionary page for them (617 articles crawled): the text cannot be imported without a source; nothing is invented'],
    documents: [],
    options: [{ id: 'A', label: 'obtain the Lectionary pages from Catholic.by / the Bishops\' Conference and import them with the resync tooling', recommended: true }, { id: 'B', label: 'until then the weekday readings are shown (current behaviour; the audit reports 106 option routes)' }],
    tests: 'tests/memorial-readings.test.mjs',
  });

  return plans;
}
