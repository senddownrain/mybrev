#!/usr/bin/env node
/**
 * Planned legal Mass options of the generative Ordo engine (2025–2035 × four
 * dioceses) reconciled with the stored `readings` documents through the SAME
 * runtime code as the app (planReadings → queries → orderReadingsByPlan →
 * resolveReadingsScreen). Read-only: local snapshot only.
 *
 *   node scripts/lectionary/plan-options.mjs [--snapshot dir] [--from 2025] [--to 2035]
 *
 * Output: reports/lectionary/planned-options.json (normalized identities,
 * per-class anomalies, counts by year / diocese / season / kind / cycle).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { addDays, daysOfYear } from '../../src/utils/ordo/dates.js';
import { computeEasterSunday } from '../../src/utils/ordo/movableFeasts.js';
import { selectReadingDocuments } from '../../src/utils/ordo/runtime.js';
import { selectReadingLectionaryVariants, readingSelector, normalizeReadingCycle } from '../../src/utils/parsedReadingsIdentity.js';
import { massReadingSetsOf } from '../../src/utils/massReadingSets.js';
import { createReadingsRuntime, screenFor } from './lib/runtime-sim.mjs';
import { expectedPageKey } from './lib/expected-page.mjs';
import { pickerOptionsOf, pickerRouteFor } from '../../src/utils/ordoDatePicker.js';
import { hasReadingDocumentContent } from '../../src/utils/parsedReadingsIdentity.js';
import { openSnapshot, snapshotDirFromArgs } from './lib/snapshot-docs.mjs';
import { ROOT } from './lib/source-pages.mjs';

export const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const argValue = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };

/** Closed policy decisions (default Mass set of multi-set dates). */
export const SET_DEFAULT_POLICY = Object.freeze({
  '15.08': 'day', '29.06': 'day', '24.06': 'day', '25.12': 'day', '24.12': 'vigil', '02.11': 'first',
  holyThursday: 'evening', pentecostSaturday: 'vigil', palmSunday: 'mass',
});

/** Independent rule: Year A starts with Advent 2025; start year S → A (S mod 3 = 0), B (1), C (2). */
const sundayCycleOfYear = (iso, firstAdvent) => {
  const calendarYear = Number(iso.slice(0, 4));
  const start = iso >= firstAdvent(calendarYear) ? calendarYear : calendarYear - 1;
  return ['A', 'B', 'C'][start % 3];
};

export async function runPlan({ snapshotDir, from = 2025, to = 2035 } = {}) {
  const snap = await openSnapshot(snapshotDir);
  const readings = (await snap.collection('readings')).filter((doc) => doc._obsolete !== true);
  const rt = createReadingsRuntime(readings);
  const { computeFirstAdventSunday } = await import('../../src/utils/ordo/movableFeasts.js');
  const identities = new Map();
  const temporalChecks = new Map();
  const referenceOnly = new Map();
  const memorials = new Map();
  const anomalies = [];
  const counts = { dates: 0, dioceseDates: 0, options: 0, byDiocese: {}, byYear: {}, byKind: {}, byPeriod: {}, byCycle: {}, byStatus: {} };
  const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };

  for (const diocese of DIOCESES) {
    for (let year = from; year <= to; year += 1) {
      for (const date of daysOfYear(year)) {
        counts.dioceseDates += 1;
        bump(counts.byDiocese, diocese);
        bump(counts.byYear, year);
        const loaded = rt.load(date, diocese);
        const { day, plan } = loaded;
        // independent oracle of the cycles
        const expectedSunday = sundayCycleOfYear(date, computeFirstAdventSunday);
        if (day.readingCycle.sunday !== expectedSunday) {
          anomalies.push({ class: 'WRONG_CYCLE', severity: 'high', date, diocese, detail: `engine Sunday cycle ${day.readingCycle.sunday}, rule ${expectedSunday}` });
        }
        bump(counts.byCycle, `${day.readingCycle.sunday}/${day.readingCycle.weekday}`);
        bump(counts.byPeriod, day.period);
        const options = [day.primary, ...day.alternatives];
        for (const [index, option] of options.entries()) {
          counts.options += 1;
          bump(counts.byKind, option.officeKind);
          const planOption = plan.options[index];
          const screen = screenFor(loaded, { option: option.id });
          const lookups = planOption.lookup.map((entry) => {
            const found = selectReadingDocuments(entry, option, loaded.items);
            const chosen = selectReadingLectionaryVariants(found, loaded.context);
            return { entry, found, chosen, selector: found[0] ? readingSelector(found[0]) : selectorOfWhere(entry.where) };
          });
          for (const lookupEntry of lookups) {
            const { entry, found, chosen, selector } = lookupEntry;
            const needsCycle = found.some((doc) => normalizeReadingCycle(doc.year));
            const hasSunday = found.some((doc) => ['A', 'B', 'C'].includes(normalizeReadingCycle(doc.year)));
            const cycle = needsCycle ? (hasSunday ? day.readingCycle.sunday : day.readingCycle.weekday) : '';
            const key = `${entry.purpose}|${selector}|${cycle}`;
            lookupEntry.key = key;
            const identity = identities.get(key) || {
              key, purpose: entry.purpose, selector, cycle, optionIds: new Set(), officeKinds: new Set(), dioceses: new Set(), years: new Set(), dates: 0, sampleDates: [], docIds: new Set(), sets: new Set(),
            };
            identity.optionIds.add(option.id); identity.officeKinds.add(option.officeKind); identity.dioceses.add(diocese); identity.years.add(year); identity.dates += 1;
            if (identity.sampleDates.length < 3) identity.sampleDates.push(date);
            chosen.forEach((doc) => { identity.docIds.add(doc.id); massReadingSetsOf(doc).forEach((set) => identity.sets.add(`${doc.id}#${set.id}`)); });
            identities.set(key, identity);

            if (found.length) bump(counts.byStatus, 'FOUND');
            if (found.length && needsCycle && !chosen.length) {
              anomalies.push({ class: 'WRONG_CYCLE', severity: 'high', date, diocese, option: option.id, purpose: entry.purpose, selector, cycle, detail: `documents exist (${found.map((d) => `${d.id}:${d.year}`).join(', ')}) but none for cycle ${cycle}` });
            }
          }
          // Option-level expectation (lookups are ordered fallbacks of one option).
          const weekdayFound = lookups.some((l) => l.entry.purpose === 'weekday' && l.found.length);
          const properFound = lookups.some((l) => l.entry.purpose === 'proper' && l.found.length);
          const hasProperLookup = lookups.some((l) => l.entry.purpose === 'proper');
          const status = planOption.readingsStatus;
          const memorial = ['memorial', 'optional-memorial'].includes(option.officeKind);
          const missing = (detail) => anomalies.push({ class: 'MISSING_SET', severity: 'high', date, diocese, option: option.id, officeKind: option.officeKind, detail });
          const markAbsent = (kind) => lookups.filter((l) => l.entry.purpose === 'proper' && !l.found.length && l.key).forEach((l) => { const row = identities.get(l.key); if (row) row.absent = { ...(row.absent || {}), [kind]: ((row.absent || {})[kind] || 0) + 1 }; });
          if (memorial) {
            if (status !== 'full' && !properFound) markAbsent(status === 'reference-only' ? 'referenceOnly' : 'weekdayByDesign');
            if (!weekdayFound) missing(`weekday readings of the memorial's day missing (${JSON.stringify(planOption.lookup[0]?.where)})`);
            if (status === 'full' && !properFound) missing(`status full but no proper readings document (${JSON.stringify(lookups.find((l) => l.entry.purpose === 'proper')?.entry.where)})`);
            bump(counts.byStatus, properFound ? 'MEMORIAL_PROPER' : 'MEMORIAL_WEEKDAY');
            // classification of every memorial option (one row per celebration)
            const row = memorials.get(option.id) || { option: option.id, title: option.title, kinds: new Set(), dioceses: new Set(), occurrences: 0, ownDocs: new Set(), statuses: new Set(), samples: [] };
            const choice = planOption.allowedChoices?.[0] || {};
            row.kinds.add(option.officeKind); row.dioceses.add(diocese); row.occurrences += 1; row.statuses.add(status || '—');
            row.prescribedIn = row.prescribedIn || new Set(); if (choice.default === 'proper') { row.prescribedIn.add(diocese); row.prescribedParts = choice.prescribedParts || []; }
            lookups.filter((l) => l.entry.purpose === 'proper').forEach((l) => l.found.forEach((doc) => row.ownDocs.add(doc.id)));
            if (row.samples.length < 3 && !row.samples.includes(date)) row.samples.push(date);
            memorials.set(option.id, row);
            if (status === 'reference-only' && !properFound) {
              bump(counts.byStatus, 'REFERENCE_ONLY');
              const row = referenceOnly.get(option.id) || { option: option.id, title: option.title, officeKind: option.officeKind, reference: option.readingsReference || null, dioceses: new Set(), dates: new Set() };
              row.dioceses.add(diocese); row.dates.add(date); referenceOnly.set(option.id, row);
            }
          } else if (hasProperLookup && !properFound) {
            markAbsent(status === 'reference-only' ? 'referenceOnly' : 'missing');
            if (status === 'reference-only') {
              bump(counts.byStatus, 'REFERENCE_ONLY');
              const row = referenceOnly.get(option.id) || { option: option.id, title: option.title, officeKind: option.officeKind, reference: option.readingsReference || null, dioceses: new Set(), dates: new Set() };
              row.dioceses.add(diocese); row.dates.add(date); referenceOnly.set(option.id, row);
            }
            else if (!weekdayFound) { missing(`no readings document for ${option.id} (status ${status || '—'})`); bump(counts.byStatus, 'MISSING_SET'); }
            else if (status === 'full') missing(`status full but only the weekday document is found (${JSON.stringify(lookups[0]?.entry.where)})`);
          } else if (!hasProperLookup && !weekdayFound) {
            missing(`no weekday readings document (${JSON.stringify(planOption.lookup[0]?.where)})`);
            bump(counts.byStatus, 'MISSING_SET');
          }
          counts.screens = (counts.screens || 0) + 1;
          if (option.kind === 'temporal') {
            const expectedKey = expectedPageKey(day);
            const shownDoc = screen.setDocument?.id || screen.activeReading?.id || null;
            const slot = `${expectedKey}|${shownDoc}|${screen.activeCycle || ''}`;
            const check = temporalChecks.get(slot) || { expectedKey, doc: shownDoc, cycle: screen.activeCycle || '', dioceses: new Set(), years: new Set(), dates: 0, sample: date, sampleOption: option.id };
            check.dioceses.add(diocese); check.years.add(year); check.dates += 1;
            temporalChecks.set(slot, check);
          }
          // screen: the option opens one of ITS documents, in the right cycle
          const ownIds = new Set(lookups.flatMap((l) => l.found.map((d) => d.id)));
          if (ownIds.size) {
            const active = screen.activeReading;
            const activeDocId = screen.setDocument?.id || active?.id;
            if (screen.availableCycles.length) counts.cycleScreens = (counts.cycleScreens || 0) + 1;
            if (screen.sets?.length > 1) counts.multiSetScreens = (counts.multiSetScreens || 0) + 1;
            if (active && !active._referenceOnly && !hasRenderableText(screen)) {
              anomalies.push({ class: 'MISSING_BLOCK', severity: 'high', date, diocese, option: option.id, detail: `the readings of ${activeDocId} render without any text` });
            } else if (active) counts.renderedWithText = (counts.renderedWithText || 0) + 1;
            if (!active) anomalies.push({ class: 'MISSING_SET', severity: 'high', date, diocese, option: option.id, detail: 'readings screen shows nothing although documents exist' });
            else if (!ownIds.has(activeDocId) && !isCoveredBy(screen.activeGroup, ownIds)) {
              anomalies.push({ class: 'WRONG_CONTEXT', severity: 'high', date, diocese, option: option.id, detail: `screen shows ${activeDocId}, expected one of ${[...ownIds].join(', ')}` });
            } else if (screen.availableCycles.length) {
              const hasSunday = screen.availableCycles.some((c) => ['A', 'B', 'C'].includes(c));
              const expected = hasSunday ? day.readingCycle.sunday : day.readingCycle.weekday;
              if (screen.availableCycles.includes(expected) && screen.activeCycle !== expected) {
                anomalies.push({ class: 'WRONG_CYCLE', severity: 'high', date, diocese, option: option.id, detail: `screen cycle ${screen.activeCycle}, expected ${expected}` });
              }
            }
            // default set of multi-set documents
            if (screen.sets?.length > 1 && !isChosenOption(planOption)) {
              const want = defaultPolicy(date, day, screen.setDocument);
              if (want && screen.activeSet?.id !== want) {
                anomalies.push({ class: 'WRONG_DEFAULT', severity: 'high', date, diocese, option: option.id, detail: `default set ${screen.activeSet?.id}, policy ${want}` });
              }
            }
          }
        }
        // date picker navigation: the route of each legal option opens the readings of THAT option
        for (const pickerOption of pickerOptionsOf(date, diocese)) {
          const route = pickerRouteFor(pickerOption, date, 'readings', { today: '2026-10-12', diocese, defaultDiocese: 'minsk-mohilev' });
          counts.pickerRoutes = (counts.pickerRoutes || 0) + 1;
          const routed = screenFor(loaded, { ...(route.query || {}), option: route.query?.option });
          const own = routed.groups.some((group) => group.documents.some((doc) => doc._ordoOptionRoles?.[pickerOption.id]?.default));
          // the route opens the DEFAULT readings of the option (weekday for a memorial, its own where prescribed)
          if (route.query?.option && own && !routed.activeGroup?.documents.some((doc) => doc._ordoOptionRoles?.[pickerOption.id]?.default)) {
            anomalies.push({ class: 'WRONG_CONTEXT', severity: 'high', date, diocese, option: pickerOption.id, detail: 'the date-picker route of the option does not open the default readings group of the option' });
          }
          const plannedPicker = loaded.plan.options.find((planned) => planned.optionId === pickerOption.id);
          const rule = plannedPicker?.allowedChoices?.[0];
          if (rule && ['memorial', 'optional-memorial'].includes(plannedPicker.officeKind)) {
            const roles = routed.activeGroup?.documents.map((doc) => doc._ordoOptionRoles?.[pickerOption.id]?.purpose).filter(Boolean) || [];
            const wanted = rule.default;
            // by the memorial rule: the weekday readings, or the prescribed proper ones when the option has them
            const hasWanted = roles.includes(wanted);
            const ownExists = routed.groups.some((group) => group.documents.some((doc) => doc._ordoOptionRoles?.[pickerOption.id]?.purpose === 'proper'));
            if (rule.default === 'proper' && !ownExists && route.query?.option) {
              anomalies.push({ class: 'MISSING_SET', severity: 'high', date, diocese, option: pickerOption.id, detail: `the Lectionary prescribes proper readings for ${pickerOption.id} but the readings collection has no document of its own (the route falls back to the weekday readings)` });
            } else if (route.query?.option && !hasWanted && (wanted === 'weekday' || ownExists)) {
              anomalies.push({ class: 'WRONG_DEFAULT', severity: 'high', date, diocese, option: pickerOption.id, detail: `memorial rule (default ${rule.default}): the route opened ${roles.join('/') || 'nothing'}, expected ${wanted}` });
            }
            counts.memorialRoutes = (counts.memorialRoutes || 0) + 1;
          }
        }
        counts.dates += diocese === DIOCESES[0] ? 1 : 0;
      }
    }
  }
  const scenarios = scenarioChecks(rt, from, to, anomalies, counts);
  const rows = [...identities.values()].map((identity) => ({
    ...identity,
    absent: identity.absent || null, optionIds: [...identity.optionIds].sort(), officeKinds: [...identity.officeKinds].sort(), dioceses: [...identity.dioceses].sort(),
    years: [...identity.years].sort(), docIds: [...identity.docIds].sort(), sets: [...identity.sets].sort(),
  })).sort((a, b) => a.key.localeCompare(b.key));
  return { snapshot: { dir: path.relative(ROOT, snap.dir), snapshotVersion: snap.manifest.snapshotVersion, exportedAt: snap.manifest.exportedAt }, years: [from, to], dioceses: DIOCESES, counts, identities: rows, scenarios, memorials: [...memorials.values()].map((row) => ({ ...row, kinds: [...row.kinds].sort(), prescribedIn: [...(row.prescribedIn || [])].sort(), dioceses: [...row.dioceses].sort(), ownDocs: [...row.ownDocs].sort(), statuses: [...row.statuses].sort() })).sort((a, b) => a.option.localeCompare(b.option)), referenceOnly: [...referenceOnly.values()].map((r) => ({ ...r, dioceses: [...r.dioceses].sort(), dates: [...r.dates].sort().slice(0, 4), occurrences: r.dates.size })), temporalChecks: [...temporalChecks.values()].map((c) => ({ ...c, dioceses: [...c.dioceses].sort(), years: [...c.years].sort() })), anomalies };
}

/** Closed policy scenarios (previous prompt §5/§21) checked in every year and diocese. */
function scenarioChecks(rt, from, to, anomalies, counts) {
  const rows = [];
  const record = (scenario, date, diocese, expect, extra = {}) => {
    const loaded = rt.load(date, diocese);
    const day = loaded.day;
    const options = [day.primary, ...day.alternatives];
    const row = { scenario, date, diocese, primary: day.primary.id, options: options.map((o) => o.id), ...extra };
    const screen = screenFor(loaded, {});
    row.document = screen.setDocument?.id || screen.activeReading?.id || null;
    row.sets = (screen.sets || []).map((set) => ({ id: set.id, context: set.context || null, default: Boolean(set.default), referenceOnly: Boolean(set.referenceOnly), cycles: setCyclesOf(set) }));
    row.activeSet = screen.activeSet?.id || null;
    row.cycle = screen.activeCycle || null;
    // persistent route selections: ?set= and ?year= choose exactly that set / cycle
    for (const set of screen.sets || []) {
      const chosen = screenFor(loaded, { set: set.id });
      if (chosen.activeSet?.id !== set.id) { anomalies.push({ class: 'WRONG_DEFAULT', severity: 'high', date, diocese, scenario, detail: `DEFAULT route ?set=${set.id} opens ${chosen.activeSet?.id}` }); continue; }
      for (const cycle of chosen.availableCycles) {
        if (screenFor(loaded, { set: set.id, year: cycle }).activeCycle !== cycle) anomalies.push({ class: 'WRONG_CYCLE', severity: 'high', date, diocese, scenario, detail: `route ?set=${set.id}&year=${cycle} opens another cycle` });
      }
      counts.routeSelections = (counts.routeSelections || 0) + 1;
    }
    const failures = expect(row, loaded, screen) || [];
    row.ok = !failures.length;
    failures.forEach((detail) => anomalies.push({ class: detail.startsWith('DEFAULT') ? 'WRONG_DEFAULT' : detail.startsWith('WRONG_CYCLE') ? 'WRONG_CYCLE' : 'MISSING_SET', severity: 'high', date, diocese, scenario, detail }));
    rows.push(row);
  };
  const setIds = (row) => row.sets.map((set) => set.id).join(',');
  for (let year = from; year <= to; year += 1) {
    const easter = computeEasterSunday(year);
    for (const diocese of DIOCESES) {
      record('assumption', `${year}-08-15`, diocese, (r) => [r.sets.length === 2 && setIds(r) === 'vigil,day' ? '' : `sets ${setIds(r)}`, r.activeSet === 'day' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean));
      record('nativity-john-baptist', `${year}-06-24`, diocese, (r, l) => (l.day.primary.id.includes('john-baptist') ? [r.sets.length === 2 && setIds(r) === 'vigil,day' ? '' : `sets ${setIds(r)}`, r.activeSet === 'day' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean) : []));
      record('transfiguration', `${year}-08-06`, diocese, (r, l) => (l.day.primary.id.includes('transfiguration') ? [r.sets.length === 1 && r.sets[0].cycles.join('') === 'ABC' ? '' : `WRONG_CYCLE document has cycles [${(r.sets[0]?.cycles || []).join('')}], the Gospel of year ${l.day.readingCycle.sunday} is needed`, r.cycle === l.day.readingCycle.sunday ? '' : `WRONG_CYCLE screen cycle ${r.cycle}, expected ${l.day.readingCycle.sunday}`].filter(Boolean) : []));
      record('peter-paul', `${year}-06-29`, diocese, (r, l) => (l.day.primary.id.includes('peter') ? [r.sets.length === 2 && setIds(r) === 'vigil,day' ? '' : `sets ${setIds(r)}`, r.activeSet === 'day' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean) : []));
      record('christmas', `${year}-12-25`, diocese, (r) => [setIds(r) === 'night,dawn,day' ? '' : `sets ${setIds(r)}`, r.activeSet === 'day' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean));
      record('christmas-eve', `${year}-12-24`, diocese, (r, l, screen) => (isoWeekdayOf(`${year}-12-24`) === 7
        // On a Sunday: the Sunday of Advent (A/B/C) AND the Christmas Vigil Mass (default, evening).
        ? [screen.groups.length === 2 && screen.activeGroup?.documents.some((doc) => doc._variant === 'christmas-vigil') ? '' : `DEFAULT groups ${screen.groups.map((g) => g.key)}`,
          screen.groups.some((g) => g.documents.some((doc) => doc.id.startsWith('advent-w4-d1--'))) ? '' : 'Sunday IV Advent not offered'].filter(Boolean)
        : [setIds(r) === 'morning,vigil' ? '' : `sets ${setIds(r)}`, r.activeSet === 'vigil' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean)));
      record('holy-thursday', addDays(easter, -3), diocese, (r) => [setIds(r) === 'chrism,evening' ? '' : `sets ${setIds(r)}`, r.activeSet === 'evening' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean));
      record('good-friday', addDays(easter, -2), diocese, (r) => [r.sets.length === 1 && r.sets[0].id === 'passion' ? '' : `sets ${setIds(r)}`].filter(Boolean));
      record('easter-vigil', addDays(easter, -1), diocese, (r) => [r.sets.length === 1 && r.sets[0].id === 'vigil' && r.sets[0].cycles.join('') === 'ABC' ? '' : `sets ${setIds(r)} cycles ${r.sets[0]?.cycles}`].filter(Boolean));
      record('palm-sunday', addDays(easter, -7), diocese, (r) => [setIds(r) === 'procession,mass' ? '' : `sets ${setIds(r)}`, r.activeSet === 'mass' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean));
      record('easter-sunday', easter, diocese, (r) => [r.sets.length === 1 && r.sets[0].id === 'day' ? '' : `sets ${setIds(r)}`].filter(Boolean));
      record('pentecost-saturday', addDays(easter, 48), diocese, (r, l, screen) => (l.day.primary.kind === 'temporal' || ['memorial', 'optional-memorial'].includes(l.day.primary.officeKind)
        ? [setIds(r) === 'morning,vigil' ? '' : `sets ${setIds(r)}`, r.activeSet === 'vigil' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean)
        // a feast/memorial takes the Saturday (Visitation 2031): its Mass AND the evening Vigil Mass of Pentecost, vigil default
        : [screen.groups.length === 2 && screen.activeGroup?.documents.some((doc) => doc._variant === 'pentecost-vigil') ? '' : `DEFAULT groups ${screen.groups.map((g) => g.key)}`,
          screen.groups.some((g) => g.documents.some((doc) => doc._variant === 'pentecost-vigil')) ? '' : 'the Vigil Mass of Pentecost is not offered'].filter(Boolean)));
      record('pentecost-sunday', addDays(easter, 49), diocese, (r) => [r.sets.length === 1 && r.sets[0].id === 'day' ? '' : `sets ${setIds(r)}`].filter(Boolean));
      record('ascension-thursday', addDays(easter, 39), diocese, (r, l) => (l.day.primary.id.includes('ascension') ? (r.sets[0]?.cycles.join('') === 'ABC' ? [] : [`ascension cycles ${r.sets[0]?.cycles}`]) : []));
      record('ascension-sunday', addDays(easter, 42), diocese, (r, l) => (l.day.primary.id.includes('ascension') ? (r.sets[0]?.cycles.join('') === 'ABC' ? [] : [`ascension cycles ${r.sets[0]?.cycles}`]) : []));
      record('all-souls', `${year}-11-02`, diocese, (r) => [setIds(r) === 'first,second,third' ? '' : `sets ${setIds(r)}`, r.activeSet === 'first' ? '' : `DEFAULT ${r.activeSet}`].filter(Boolean), { sunday: isoWeekdayOf(`${year}-11-02`) === 7 });
    }
  }
  return rows;
}
const hasRenderableText = (screen) => {
  const view = screen.activeReading;
  if (view?._sections) return view._sections.some((section) => section.text || section.verses?.length || section.verse || section.passion || section.chorus);
  return hasReadingDocumentContent(view);
};
const setCyclesOf = (set) => ['A', 'B', 'C'].filter((c) => set.cycle === c || (set.sections || []).some((s) => s.cycle === c));
const isoWeekdayOf = (iso) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

function selectorOfWhere(where = {}) {
  if (where._date) return `date:${where._date}`;
  if (where._feast) return `feast:${String(where._feast).replace(/^feast-/, '')}`;
  if (where._periodType) return `period:${where._periodType}:w${where._periodWeekNumber}:d${where._dayOfWeek}`;
  return '';
}
const isCoveredBy = (group, ownIds) => (group?.documents || []).some((doc) => ownIds.has(doc.id) || ownIds.has(doc._massReadingsRef?.doc));
const isChosenOption = () => false;

function defaultPolicy(date, day, doc) {
  const dm = `${date.slice(8, 10)}.${date.slice(5, 7)}`;
  if (SET_DEFAULT_POLICY[dm] && doc?._date === dm) return SET_DEFAULT_POLICY[dm];
  if (doc?.id === 'holyweek-w1-d5') return SET_DEFAULT_POLICY.holyThursday;
  if (doc?.id === 'easter-w7-d7') return SET_DEFAULT_POLICY.pentecostSaturday;
  if (doc?.id === 'feast-palmsunday') return SET_DEFAULT_POLICY.palmSunday;
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const result = await runPlan({ snapshotDir: snapshotDirFromArgs(), from: Number(argValue('--from', 2025)), to: Number(argValue('--to', 2035)) });
  const out = path.join(ROOT, 'reports', 'lectionary');
  fs.mkdirSync(out, { recursive: true });
  const serial = { ...result, identities: result.identities.map(({ dates, ...rest }) => ({ ...rest, dates })) };
  fs.writeFileSync(path.join(out, 'planned-options.json'), `${JSON.stringify(serial)}\n`);
  const byClass = {};
  result.anomalies.forEach((a) => { byClass[a.class] = (byClass[a.class] || 0) + 1; });
  console.log(JSON.stringify({ counts: result.counts, identities: result.identities.length, anomalies: byClass }, null, 1));
}
