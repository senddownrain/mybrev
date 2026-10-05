/**
 * Hours / Readings for several dioceses (Settings): each diocese is resolved
 * on its own (the engine takes one diocese), the legal options are united
 * here, at the presentation layer.
 *
 *   same celebration, rank and Office document in every diocese → one row
 *   an option of only some dioceses                            → its diocese badges
 *   same celebration, different rank or content                → distinct rows
 *
 * A row remembers the diocese to open it in (`contextDiocese`): the primary
 * one when it has the row, else the first that has it.
 *
 * Pure.
 */
export const DIOCESE_BADGES = Object.freeze({
  'minsk-mohilev': 'Мінск',
  vitebsk: 'Віцебск',
  pinsk: 'Пінск',
  grodno: 'Гродна',
});

const keyOf = (option) => [
  option.ordo?.optionId || option.key,
  option.ordo?.rank || option.day?._rank || '',
  option.dayId || '',
].join('|');

/**
 * @param {Array<{ diocese: string, dayOptions: object[] }>} results  one per diocese, primary first
 * @param {{ primary?: string }} [o]
 * @returns {object[]} options with `dioceses`, `badges`, `contextDiocese`, unique `key`
 */
export function unionDayOptions(results, { primary = results[0]?.diocese } = {}) {
  const rows = new Map();
  let position = 0;
  results.forEach(({ diocese, dayOptions }) => {
    (dayOptions || []).forEach((option) => {
      const key = keyOf(option);
      const row = rows.get(key) || { option, dioceses: [], position: position += 1 };
      row.dioceses.push(diocese);
      rows.set(key, row);
    });
  });
  const all = results.length;
  return [...rows.values()]
    .sort((a, b) => (a.option.order ?? 50) - (b.option.order ?? 50) || a.position - b.position)
    .map(({ option, dioceses }) => {
      const contextDiocese = dioceses.includes(primary) ? primary : dioceses[0];
      return {
        ...option,
        key: all > 1 ? `${option.key}@${contextDiocese}` : option.key,
        dioceses,
        contextDiocese,
        // Shared by every selected diocese: no badge.
        badges: dioceses.length === all ? [] : dioceses.map((id) => DIOCESE_BADGES[id] || id),
      };
    });
}
