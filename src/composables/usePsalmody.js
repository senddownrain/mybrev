import { inject, provide, ref, watch } from 'vue';

const PSALMODY = Symbol('psalmody');

export function providePsalmody(route) {
  const dimmedSide = ref(null);
  watch(() => [route.name, route.params.day, route.params.id, route.query.firstVespersDayId], () => {
    dimmedSide.value = null;
  });
  provide(PSALMODY, {
    dimmedSide,
    toggleSide(side) { dimmedSide.value = dimmedSide.value === side ? null : side; },
  });
}

export const usePsalmody = () => inject(PSALMODY, null);
