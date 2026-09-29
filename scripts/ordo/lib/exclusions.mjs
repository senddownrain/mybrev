/**
 * Exclusion predicates (JS mirror of `ordo_common.EXCLUSION_RULES`).
 *
 * Used by `ordo:check` and the tests to prove that no collection or
 * clergy-personal data leaked into the committed Ordo files.
 */
const CLERGY = '(?:святар|ксяндз|кс\\.|а\\.|айца|айцец|біскуп|арцыбіскуп|бп|пробашч|дыякан|кардынал|папы|святога айца|інфулат|прэлат|канонік)';

export const EXCLUSION_RULES = Object.freeze([
  ['collection', new RegExp('збор\\S*\\s+(?:ахвяраванн|сродкаў|на\\s+патрэбы)|ахвяраванн\\S*,?\\s+(?:сабран|складзен)|ахвяраванн\\S*\\s+[^.]{0,80}прызнач|сённяшнія\\s+зборы|сёння\\s*[–—-]\\s*збор', 'iu')],
  ['clergy-birthday', new RegExp(`(?:дня|дзень)\\s+нараджэння\\s+(?:св\\.\\s*п\\.\\s*)?(?:кардынала|біскупа|арцыбіскупа|святара|кс\\.)|дзень\\s+нараджэння\\s+${CLERGY}|дзень\\s+нараджэння\\s*:|\\(дзень\\s+нара-?\\s*джэння\\)`, 'iu')],
  ['name-day', /імянін|саленізант/iu],
  ['ordination-anniversary', /гадавін\S*\s+(?:прэзбітэрск|святарск|біскупск|дыяканск|епіскапск)|(?:біскупскай|святарскай|епіскапскай)\s+сакры|рукапалажэнн|гадавін\S*\s+(?:прызначэння|інгрэсу|інтранізацыі)[^.]{0,60}(?:біскуп|кардынал|пробашч|ардынары)/iu],
  ['death-anniversary', new RegExp(`дзень\\s+смерці\\s+${CLERGY}|гадавін\\S*\\s+смерці\\s+${CLERGY}|памерлыя\\s+святары`, 'iu')],
  ['necrology', /^\s*(?:†|\+)\s*(?:кс|а\.|бп|біск|арцыб|ксяндзы|о\.|айцец|бр\.|дыяк|кардынал|с\.)|^\s*\d{4}\s*[+†]\s*\S/iu],
]);

export function exclusionCategory(text) {
  const value = String(text ?? '');
  const hit = EXCLUSION_RULES.find(([, pattern]) => pattern.test(value));
  return hit ? hit[0] : null;
}

/** Walk every string of a JSON value and report excluded content. */
export function findExcludedStrings(value, path = '$', found = []) {
  if (typeof value === 'string') {
    const category = exclusionCategory(value);
    if (category) found.push({ path, category, text: value.slice(0, 120) });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findExcludedStrings(item, `${path}[${index}]`, found));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => findExcludedStrings(item, `${path}.${key}`, found));
  }
  return found;
}
