import { publicContentCache, isContentOnline, requestContentRefresh } from './publicContentCache.js';

/** Explicit user action. Refresh only previously saved resources, never a full DB audit. */
export async function refreshSavedContent() {
  if (!isContentOnline()) throw new Error('Для абнаўлення патрэбны інтэрнэт. Захаваныя тэксты даступныя без сеткі.');
  const { refreshCalendarDefinitions } = await import('../services/ordoCalendarService.js');
  await refreshCalendarDefinitions({ fresh: true, revalidate: true });
  const keys = await publicContentCache.keys();
  requestContentRefresh();
  const [{ useLiturgicalStore }, { getStaticCollection, getLiturgicalTemplates }, { getSavedPrayers }] = await Promise.all([
    import('../stores/liturgical.js'),
    import('../services/staticLiturgicalService.js'), import('../services/prayerService.js'),
  ]);
  const liturgical = useLiturgicalStore();
  const options = { fresh: true, requireFresh: true };
  let refreshed = 0;
  let failed = 0;
  // Small batches avoid a burst of reads. Failed entries are retained as stale.
  for (let index = 0; index < keys.length; index += 2) {
    await Promise.all(keys.slice(index, index + 2).map(async (key) => {
      try {
        const [type, value, dayId, includeAlternatives, readingsDiocese] = JSON.parse(key);
        switch (type) {
          case 'content': await liturgical.fetchContentByDate(value, { ...options, diocese: dayId }); break;
          case 'days': await liturgical.fetchDaysByDate(value, { ...options, diocese: dayId }); break;
          case 'readings': await liturgical.fetchReadingsByDate(value, {
            ...options, dayId, includeAlternatives, diocese: readingsDiocese,
          }); break;
          case 'static':
            if (value === 'liturgicalTemplates') await getLiturgicalTemplates(options);
            else await getStaticCollection(value, options);
            break;
          case 'prayer-content':
          case 'prayers': await getSavedPrayers(options); break;
          case 'songs': await (await import('../services/songService.js')).getSavedSongs(options); break;
          // Legacy keys: year options are computed now, and the feast list of
          // `/picker` comes from the Ordo engine (no full `days` read).
          case 'year':
          case 'years':
          case 'feasts': break;
          default: return;
        }
        refreshed += 1;
      } catch { failed += 1; }
    }));
  }
  return { refreshed, failed };
}
