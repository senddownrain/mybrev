import { readonly, ref } from 'vue';

const revision = ref(0);
export const prayerCatalogRevision = readonly(revision);

export function advancePrayerCatalogRevision() {
  revision.value++;
}
