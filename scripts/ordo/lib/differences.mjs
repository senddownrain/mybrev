/**
 * Cross-diocese alignment of celebrations.
 *
 * Sources cover different years (Minsk/Vitebsk 2025–26, Pinsk 2026, Grodno
 * 2027), so celebrations are aligned by identity (fixed MM-DD or movable
 * code), never by civil date. Each difference gets one of:
 * UNIVERSAL / BELARUS / DIOCESAN / LOCAL / YEAR_SPECIFIC /
 * MORE_DETAILED_SOURCE / REAL_CONFLICT.
 */
import { alignDate, celebrationDate } from './calendar.mjs';
import { resolveCelebration } from './identity.mjs';
import { rankValue } from './normalize.mjs';
import { DIOCESE_ORDER } from './notes.mjs';
import { fold, similarity, titleStems } from './text.mjs';

const PRIVILEGED = (align) => align.isoWeekday === 7
  || align.periodType === 'holyweek'
  || (align.periodType === 'lent')
  || (align.periodType === 'easter' && align.periodWeek === 1)
  || align.periodPhase === 'dec17-24'
  || (align.periodType === 'christmas' && align.periodPhase === 'octave');

function outranked(day, identityId, ownRank) {
  if (!day) return false;
  const blocking = ownRank === 'memoria-ad-libitum' ? ['solemnitas', 'festum', 'sunday', 'memoria'] : ['solemnitas', 'festum', 'sunday'];
  return day.celebrations.some((c) => c.role === 'primary' && c.identity?.id !== identityId
    && (blocking.includes(c.rank) || c.identity?.kind === 'dynamic'));
}

function suppressedTitles(note) {
  const text = note.text;
  const match = text.match(/(?:Прапускаецца|Прапускаюцца(?:\s+ўспаміны)?|няма\s+(?:ўспаміну|успаміну|свята)|У\s+гэтым\s+годзе\s+няма\s+(?:ўспаміну|успаміну|свята))\s+(.+?)\.?$/i);
  if (!match) return [];
  return match[1].split(/;|\sі\s(?=св\.|бл\.)/).map((s) => s.trim()).filter(Boolean);
}

export function buildDifferences(sources, catalog, properSets) {
  const coverage = {};
  const observations = new Map();
  const observe = (id, diocese, value) => {
    if (!observations.has(id)) observations.set(id, { byDiocese: {} });
    const record = observations.get(id);
    record.byDiocese[diocese] ||= [];
    record.byDiocese[diocese].push(value);
    return record;
  };
  const dayMaps = {};
  sources.forEach((source) => {
    const days = source.days.filter((day) => !day.preview);
    dayMaps[source.diocese] = new Map(days.map((day) => [day.date, day]));
    coverage[source.diocese] = { from: days[0]?.date, to: days.at(-1)?.date };
    days.forEach((day) => {
      day.celebrations.forEach((c) => {
        if (!c.identity || !['fixed', 'dynamic'].includes(c.identity.kind)) return;
        const record = observe(c.identity.id, source.diocese, {
          status: 'celebrated', date: day.date, rank: c.rank, role: c.role, itemId: c.id,
          transferredFrom: c.identity.transferredFrom || null,
          local: /катэдр|у\s+катэдры/i.test(c.title) || undefined,
        });
        record.kind = c.identity.kind;
        record.mmdd ||= c.identity.mmdd || null;
        record.title ||= c.title;
      });
      day.notes.filter((n) => (n.tags || []).includes('suppressed')).forEach((note) => {
        suppressedTitles(note).forEach((title) => {
          const identity = resolveCelebration(title, day.liturgical, catalog, source.diocese);
          if (!identity || !['fixed', 'dynamic'].includes(identity.kind)) return;
          const record = observe(identity.id, source.diocese, { status: 'omitted', date: day.date, itemId: note.id });
          record.kind = identity.kind;
          record.mmdd ||= identity.mmdd || null;
          record.title ||= title;
        });
      });
    });
  });

  // Universal fixed celebrations never observed at all are also compared.
  catalog.filter((entry) => !entry.place && entry.fixedCalendarIndex !== null).forEach((entry) => {
    if (!observations.has(entry.id)) observations.set(entry.id, { byDiocese: {}, kind: 'fixed', mmdd: entry.mmdd, title: entry.title });
  });

  const entries = [];
  [...observations.keys()].sort().forEach((id) => {
    const record = observations.get(id);
    const catalogEntries = catalog.filter((item) => item.id === id);
    const universal = catalogEntries.find((item) => !item.place);
    const mybrev = {
      rank: universal?.rank || null,
      diocesan: Object.fromEntries(catalogEntries.filter((item) => item.place).flatMap((item) => (Array.isArray(item.place) ? item.place : [item.place]).map((place) => [place, item.rank]))),
      dayIds: [...new Set(catalogEntries.flatMap((item) => item.dayIds))].slice(0, 8),
    };
    const byDiocese = {};
    DIOCESE_ORDER.forEach((diocese) => {
      const list = record.byDiocese[diocese] || [];
      const celebrated = list.filter((o) => o.status === 'celebrated');
      if (celebrated.length) {
        const best = celebrated.slice().sort((a, b) => rankValue(b.rank) - rankValue(a.rank) || (a.role === 'primary' ? -1 : 1))[0];
        byDiocese[diocese] = {
          status: 'celebrated', rank: best.rank, role: best.role, dates: [...new Set(celebrated.map((o) => o.date))],
          ...(best.transferredFrom ? { transferredFrom: best.transferredFrom } : {}),
          ...(celebrated.some((o) => o.local) ? { localMention: true } : {}),
          itemIds: celebrated.map((o) => o.itemId).slice(0, 4),
        };
        return;
      }
      const omitted = list.find((o) => o.status === 'omitted');
      if (omitted) {
        byDiocese[diocese] = { status: 'omitted', dates: [omitted.date], itemIds: [omitted.itemId] };
        return;
      }
      const range = coverage[diocese];
      if (!range?.from) return;
      const years = [];
      for (let y = Number(range.from.slice(0, 4)); y <= Number(range.to.slice(0, 4)); y += 1) years.push(String(y));
      const expected = years.map((year) => (record.kind === 'fixed' && record.mmdd ? `${year}-${record.mmdd}` : celebrationDate({ kind: record.kind, id }, Number(year))))
        .find((date) => date && date >= range.from && date <= range.to);
      if (!expected) {
        byDiocese[diocese] = { status: 'not-covered' };
        return;
      }
      const day = dayMaps[diocese].get(expected);
      const align = day?.liturgical || alignDate(expected);
      byDiocese[diocese] = {
        status: 'absent', dates: [expected],
        ...(PRIVILEGED(align) || outranked(day, id, mybrev.rank) ? { impeded: true } : {}),
      };
    });

    const differences = mergeDifferences(classifyDifferences(id, record, byDiocese, mybrev, properSets));
    if (!differences.length) return;
    entries.push({
      celebrationId: id,
      kind: record.kind,
      title: universal?.title || record.title,
      ...(record.mmdd ? { mmdd: record.mmdd } : {}),
      mybrev,
      byDiocese,
      differences,
    });
  });
  const missing = missingInMyBrev(sources);
  const summary = {};
  entries.forEach((entry) => entry.differences.forEach((d) => { summary[d.type] = (summary[d.type] || 0) + 1; }));
  const missingSummary = {};
  missing.forEach((entry) => { missingSummary[entry.type] = (missingSummary[entry.type] || 0) + 1; });
  return { coverage, summary, missingSummary, entries, missingInMyBrev: missing };
}

function mergeDifferences(list) {
  const merged = new Map();
  list.forEach((item) => {
    const key = `${item.type}|${item.detail}`;
    if (!merged.has(key)) merged.set(key, { ...item, dioceses: [...item.dioceses] });
    else merged.get(key).dioceses.push(...item.dioceses.filter((d) => !merged.get(key).dioceses.includes(d)));
  });
  return [...merged.values()];
}

/**
 * Celebrations printed by the sources that MyBrev has no identity for at
 * all. Grouped by MM-DD and title similarity across dioceses.
 */
export function missingInMyBrev(sources) {
  const groups = [];
  sources.forEach((source) => source.days.forEach((day) => day.celebrations.forEach((c) => {
    if (c.identity || !c.rank || c.rank === 'sunday') return;
    const stems = titleStems(c.title);
    const group = groups.find((g) => g.mmdd === day.liturgical.mmdd && similarity(g.stems, stems) >= 0.4);
    const observation = { diocese: source.diocese, date: day.date, title: c.title, rank: c.rank, role: c.role, itemId: c.id };
    if (group) group.observed.push(observation);
    else groups.push({ mmdd: day.liturgical.mmdd, stems, observed: [observation] });
  })));
  return groups.map((group) => {
    const dioceses = [...new Set(group.observed.map((o) => o.diocese))];
    const ranks = [...new Set(group.observed.map((o) => o.rank))];
    let type;
    if (dioceses.length >= 3) type = 'UNIVERSAL';
    else if (dioceses.length === 2) type = 'BELARUS';
    else if (ranks.some((rank) => rank !== 'memoria-ad-libitum')) type = 'DIOCESAN';
    else type = 'MORE_DETAILED_SOURCE';
    return {
      mmdd: group.mmdd,
      title: group.observed[0].title,
      type,
      dioceses,
      ranks,
      detail: type === 'UNIVERSAL'
        ? 'printed by 3+ dioceses; missing from MyBrev fixedCalendar (likely a newer General Roman Calendar entry)'
        : type === 'BELARUS' ? 'printed by two dioceses; missing from MyBrev' : 'printed by one diocese only; missing from MyBrev',
      observed: group.observed.slice(0, 8),
    };
  }).sort((a, b) => a.mmdd.localeCompare(b.mmdd) || a.title.localeCompare(b.title));
}

function classifyDifferences(id, record, byDiocese, mybrev, properSets) {
  const result = [];
  const celebrated = Object.entries(byDiocese).filter(([, v]) => v.status === 'celebrated');
  const covered = Object.entries(byDiocese).filter(([, v]) => v.status !== 'not-covered');
  const ranks = new Map();
  celebrated.forEach(([diocese, v]) => {
    if (!v.rank) return;
    const key = v.rank || 'unknown';
    if (!ranks.has(key)) ranks.set(key, []);
    ranks.get(key).push(diocese);
  });

  // Rank differences between dioceses / against MyBrev.
  if (ranks.size > 1) {
    const sorted = [...ranks.entries()].sort((a, b) => b[1].length - a[1].length || rankValue(a[0]) - rankValue(b[0]));
    const [majorityRank] = sorted[0];
    sorted.slice(1).forEach(([rank, dioceses]) => {
      dioceses.forEach((diocese) => {
        const v = byDiocese[diocese];
        const modeled = mybrev.diocesan[diocese] === rank;
        let type = 'REAL_CONFLICT';
        let detail = `${rank} in ${diocese} vs ${majorityRank} elsewhere`;
        if (modeled || properSets[diocese]?.has(id)) type = 'DIOCESAN';
        else if (v.localMention) type = 'LOCAL';
        else if (v.role !== 'primary' && rank === 'memoria-ad-libitum' && majorityRank === 'memoria') {
          type = 'YEAR_SPECIFIC';
          detail = 'obligatory memorial reduced to optional/commemoratio by a privileged day in that year';
        } else if (rankValue(rank) > rankValue(majorityRank)) type = 'DIOCESAN';
        result.push({ type, dioceses: [diocese], detail, modeledInMyBrev: modeled });
      });
    });
  }
  // Agreement of sources against MyBrev's universal rank.
  if (mybrev.rank && celebrated.length >= 2 && ranks.size === 1) {
    const [rank] = [...ranks.keys()];
    if (rank !== 'unknown' && rank !== mybrev.rank && !(rank === 'memoria-ad-libitum' && celebrated.every(([, v]) => v.role !== 'primary') && mybrev.rank === 'memoria')) {
      result.push({
        type: celebrated.length >= 3 ? 'BELARUS' : 'REAL_CONFLICT',
        dioceses: celebrated.map(([d]) => d),
        detail: `sources agree on ${rank}; MyBrev fixedCalendar has ${mybrev.rank}`,
        mybrevDivergence: true,
      });
    }
  }
  // Present in some dioceses, missing/omitted in others.
  const missing = covered.filter(([, v]) => v.status === 'absent' || v.status === 'omitted');
  if (celebrated.length && missing.length) {
    missing.forEach(([diocese, v]) => {
      let type;
      let detail;
      if (v.status === 'omitted' || v.impeded) {
        type = 'YEAR_SPECIFIC';
        detail = v.status === 'omitted' ? 'omitted in that year (source says so)' : 'impeded in that year by a higher-ranking day or privileged season';
      } else if (celebrated.every(([, c]) => c.rank === 'memoria-ad-libitum')) {
        type = 'MORE_DETAILED_SOURCE';
        detail = 'optional memorial listed only by some sources';
      } else if (celebrated.every(([d]) => properSets[d]?.has(id) || mybrev.diocesan[d])) {
        type = 'DIOCESAN';
        detail = 'diocesan proper celebration of the other dioceses';
      } else {
        type = 'REAL_CONFLICT';
        detail = 'celebrated elsewhere, not found in this source on its date';
      }
      result.push({ type, dioceses: [diocese], detail });
    });
  }
  // Only one diocese has it at all and MyBrev has no universal entry.
  if (celebrated.length === 1 && !mybrev.rank) {
    const [diocese] = celebrated[0];
    result.push({ type: mybrev.diocesan[diocese] || properSets[diocese]?.has(id) ? 'DIOCESAN' : 'DIOCESAN', dioceses: [diocese], detail: 'proper celebration without a universal MyBrev entry', modeledInMyBrev: Boolean(mybrev.diocesan[diocese]) });
  }
  // Transfers.
  celebrated.forEach(([diocese, v]) => {
    if (v.transferredFrom) {
      result.push({ type: 'YEAR_SPECIFIC', dioceses: [diocese], detail: `transferred from ${v.transferredFrom} to ${v.dates.join(', ')} (computable by precedence)` });
    }
  });
  // Universal celebration never found in any covering source.
  if (!celebrated.length && covered.length && record.kind === 'fixed' && mybrev.rank) {
    const allImpeded = covered.every(([, v]) => v.status === 'omitted' || v.impeded);
    result.push({
      type: allImpeded ? 'YEAR_SPECIFIC' : 'REAL_CONFLICT',
      dioceses: allImpeded ? covered.map(([d]) => d) : covered.filter(([, v]) => !(v.status === 'omitted' || v.impeded)).map(([d]) => d),
      detail: allImpeded ? 'impeded in every covered year' : 'MyBrev fixed celebration not found in the sources (check title mapping or calendar change)',
      mybrevDivergence: !allImpeded,
    });
  }
  return result;
}

export function properIds(rules, catalog, diocese) {
  // Vitebsk lists its proper calendar; Grodno prints proper readings.
  const ids = new Set(catalog.filter((item) => item.place === diocese || (Array.isArray(item.place) && item.place.includes(diocese))).map((item) => item.id));
  const months = { студзень: 1, люты: 2, сакавік: 3, красавік: 4, май: 5, чэрвень: 6, ліпень: 7, жнівень: 8, верасень: 9, кастрычнік: 10, лістапад: 11, снежань: 12 };
  let month = null;
  rules.forEach((rule) => {
    if (rule.scopeHint !== 'diocesan-proper' && rule.scopeHint !== 'diocesan-lectionary') return;
    const key = fold(rule.text);
    if (months[key]) { month = months[key]; return; }
    let match = key.match(/^(\d{1,2})\s*[–—-]\s*(.+)$/);
    let mmdd = null;
    let title = null;
    if (match && (rule.month || month)) {
      month = rule.month || month;
      mmdd = `${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      title = match[2];
    } else {
      match = key.match(/^(.+?)\s+(\d{1,2})\s+(студзеня|лютага|сакавіка|красавіка|мая|чэрвеня|ліпеня|жніуня|верасня|кастрычніка|лістапада|снежня)$/);
      const gen = { студзеня: 1, лютага: 2, сакавіка: 3, красавіка: 4, мая: 5, чэрвеня: 6, ліпеня: 7, жніуня: 8, верасня: 9, кастрычніка: 10, лістапада: 11, снежня: 12 };
      if (match) {
        mmdd = `${String(gen[match[3]]).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
        title = match[1];
      }
    }
    if (!mmdd) return;
    const identity = resolveCelebration(title, alignDate(`2026-${mmdd}`), catalog, diocese);
    if (identity?.kind === 'fixed') {
      ids.add(identity.id);
      rule.identity = identity;
    }
  });
  return ids;
}
