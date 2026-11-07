import fs from 'node:fs';
import moment from '../../src/utils/moment-be.js';
import { resolveRuntimeDay, legacyContextOf } from '../../src/utils/ordo/runtime.js';
import { assembleDaysResult } from '../../src/utils/daysResult.js';
import { buildOrdoDayOptions, contentDayMap, findResolvedDayById } from '../../src/utils/ordoDayOptions.js';

export const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/liturgical-editor/2026-10-28.json', import.meta.url)));
export const properPath = `liturgicalProperTexts/${fixture.dayId}`;
export const legacyPath = `days/${fixture.dayId}`;
export const readFixture = (documents) => async (collection, id) => structuredClone(documents[`${collection}/${id}`] || null);

/** The same data-only pipeline as fetchContentForDate, including route selection. */
export function publicFixtureDay(documents) {
  const resolved = resolveRuntimeDay(fixture.date, { diocese: fixture.diocese });
  const context = legacyContextOf(resolved);
  const collection = (name) => Object.entries(documents).filter(([path]) => path.startsWith(`${name}/`))
    .map(([path, data]) => ({ id: path.slice(name.length + 1), ...data }));
  const days = collection('days');
  const daysResult = assembleDaysResult({
    mDate: moment(fixture.date), context,
    periodDay: days.find((day) => day.id === 'ordinary-w30-d4'),
    fixedDocs: days.filter((day) => day._date === '28.10'),
    properDocs: collection('liturgicalProperTexts'), dynamicEntries: [],
  });
  const { dayOptions } = buildOrdoDayOptions({
    resolved, daysResult, context, date: fixture.date, diocese: fixture.diocese,
    templates: new Map(collection('liturgicalTemplates').map((item) => [item.id, item])),
  });
  return findResolvedDayById({ itemsDays: [...contentDayMap(days, dayOptions).values()], dayOptions }, fixture.dayId);
}
