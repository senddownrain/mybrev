/**
 * Vue-side view of the active calendar definitions: a counter that changes
 * whenever the engine gets new definitions (published calendar revision or
 * manual year overrides), so computed Ordo data can depend on it.
 */
import { ref } from 'vue';
import { onCalendarDefinitionsChange } from './ordo/definitions.js';

export const ordoCalendarEpoch = ref(0);

onCalendarDefinitionsChange(() => { ordoCalendarEpoch.value += 1; });
