import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { checkPriestAccess, priestAccess, priestRequest } from './priestAccessService';
import { permittedPrayerContent } from '../../functions/lib/priest-policy.mjs';

export const PRAYER_PUBLIC_CACHE_KEY = publicContentKey('prayer-content', 2);
let inFlight;
// Public disk cache and protected in-memory results never share a storage key.
export async function getPrayerContent() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Upgrade fallback preserves previously saved public offline prayers.
    // Both legacy collections are needed to evaluate category inheritance.
    if (navigator.onLine === false) await publicContentCache.prime([PRAYER_PUBLIC_CACHE_KEY]);
    if (navigator.onLine === false && !publicContentCache.peek(PRAYER_PUBLIC_CACHE_KEY)) {
      const oldPrayers = publicContentKey('prayers');
      const oldCategories = publicContentKey('prayerCategories');
      await publicContentCache.prime([oldPrayers, oldCategories]);
      const prayers = publicContentCache.peek(oldPrayers);
      const categories = publicContentCache.peek(oldCategories);
      if (Array.isArray(prayers) && Array.isArray(categories)) {
        return permittedPrayerContent(prayers.filter((p) => p.effectivePriestOnly !== true),
          categories.map((c) => ({ ...c, priestOnly: c.priestOnly === true || c.effectivePriestOnly === true })));
      }
    }
    const entry = await publicContentCache.read(PRAYER_PUBLIC_CACHE_KEY, async () => ({
      data: await priestRequest('/content?public=1'), complete: true,
    }), { fresh: true, revalidate: true });
    if (navigator.onLine === false) return entry.data;
    try { await checkPriestAccess(); } catch { return entry.data; }
    if (!priestAccess.active) return entry.data;
    const revision = priestAccess.revision;
    try {
      const allowed = await priestRequest('/content');
      if (revision !== priestAccess.revision || !priestAccess.active) return entry.data;
      return allowed;
    } catch { return entry.data; }
  })().finally(() => { inFlight = null; });
  return inFlight;
}
