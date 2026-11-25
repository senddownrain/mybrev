import { ACCESS_SET_ID } from '../../../utils/accessSetsV2Code.mjs';

export const PROFILE_STATUSES = {
  active: 'Актыўны',
  disabled: 'Адключаны',
  revoked: 'Адкліканы',
};

export const GRANT_STATUSES = {
  active: 'Актыўны дазвол',
  revoked: 'Адкліканы дазвол',
};

export const isAccessSetId = value => typeof value === 'string' && ACCESS_SET_ID.exec(value)?.[0] === value;

export function profileInput({ id, name, status, allowedSets }) {
  if (!isAccessSetId(id)) return 'invalid-profile';
  if (!name.trim() || [...name.trim()].length > 120) return 'invalid-name';
  if (!Object.hasOwn(PROFILE_STATUSES, status)) return 'invalid-status';
  if (new Set(allowedSets).size !== allowedSets.length) return 'invalid-sets';
  if (!allowedSets.every(isAccessSetId)) return 'invalid-set';
  return null;
}

export function profileImpact(previous, next) {
  const activeSets = profile => profile?.status === 'active' ? profile.allowedSets : [];
  const before = activeSets(previous);
  const after = activeSets(next);
  return {
    before,
    after,
    added: after.filter(id => !before.includes(id)),
    removed: before.filter(id => !after.includes(id)),
  };
}

const messages = {
  'invalid-set': 'Ідэнтыфікатар набору мусіць пачынацца з малой лацінскай літары і змяшчаць да 64 малых літар, лічбаў і злучкоў.',
  'invalid-profile': 'Увядзіце ідэнтыфікатар профілю: 1–64 малыя лацінскія літары, лічбы або злучкі, першы сімвал — літара.',
  'invalid-name': 'Увядзіце назву да 120 сімвалаў.',
  'invalid-sets': 'Кожны набор можна выбраць толькі адзін раз.',
  'invalid-status': 'Выберыце дапушчальны статус профілю.',
  'set-exists': 'Набор з гэтым ідэнтыфікатарам ужо існуе.',
  'stale-profile': 'Профіль змяніўся ў іншай сесіі. Абнавіце спіс і адкрыйце яго нанова.',
  'profile-revoked': 'Адкліканы профіль нельга змяніць.',
  'unknown-set': 'Набор не існуе або недаступны.',
  'inactive-profile': 'Для выдачы кода патрэбны існуючы актыўны профіль.',
  'invalid-prefix': 'Увядзіце ад 3 да 10 лацінскіх літар.',
  'code-not-replaceable': 'Гэты код ужо нельга замяніць. Абнавіце спіс.',
  'permission-denied': 'Дзеянне недаступнае.',
  unauthenticated: 'Сесія скончылася. Увайдзіце зноў.',
  'resource-exhausted': 'Ліміт запытаў вычарпаны. Паспрабуйце пазней.',
  unavailable: 'Сервер недаступны. Перад паўторам праверце стан.',
  'deadline-exceeded': 'Сервер не адказаў своечасова. Перад паўторам праверце стан.',
  'revoke-unconfirmed': 'Не ўдалося пацвердзіць адкліканне. Праверце стан на серверы.',
};

export function errorMessage(code) {
  return Object.hasOwn(messages, code) ? messages[code] : 'Не ўдалося выканаць дзеянне. Праверце стан і паспрабуйце зноў.';
}
