/**
 * P08: negative and edge scenarios, each executed against the REAL P06 core (`handleIngest`, `cleanup`) in a tiny
 * in-memory backend. Output is only fixed technical fields: expected/actual HTTP status and code. No payloads, no ids.
 */
import { cleanup, handleIngest } from '../src/core.mjs';
import { createMemoryStorage } from '../src/storage-memory.mjs';
import { loadPublicInventory } from './synthetic.mjs';

const T = Date.parse('2026-11-06T21:00:00Z');
const good = (over = {}) => ({
  schema_version: 2, day: '2026-11-06', platform: 'web', app_version: '3.2', region: 'UNKNOWN',
  cells: [{ e: 'screen_view', section: 'today', n: 1 }, { e: 'catalog_open', catalog_id: 'songs', n: 1 }, { e: 'feature_use', feature_id: 'theme_change', section: 'settings', n: 1 }],
  ...over,
});

export async function runScenarios() {
  const publicIds = new Set(loadPublicInventory());
  const out = [];
  const record = (id, title, expect, actual, note, extra = {}) => out.push({
    id, title, expected: expect, actual, pass: expect.status === actual.status && expect.code === actual.code, note, ...extra,
  });
  const world = (config = {}) => {
    const storage = createMemoryStorage();
    return { storage, env: { config: { ingestEnabled: true, ...config }, now: () => T, publicIds, storage } };
  };
  const post = (w, body, method = 'POST') => handleIngest({ method, bodyText: typeof body === 'string' ? body : JSON.stringify(body) }, w.env);
  const stored = async (w) => (await w.storage.all()).length;

  let w = world();
  let r = await post(w, good());
  record('happy', 'Корректный пакет', { status: 204, code: 'ok' }, r, 'Принят и записан как агрегат.', { rowsStored: await stored(w) });

  w = world({ ingestEnabled: false });
  r = await post(w, good());
  record('kill_switch_off', 'Приём выключен (kill switch)', { status: 503, code: 'ingest_disabled' }, r, 'Отказ до разбора тела; ничего не записано (fail closed).', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, good({ cells: [{ e: 'screen_view', section: 'songs', content_id: 'song:holysongs-00000000000000000000', n: 1 }] }));
  record('closed_or_unknown_id', 'Неизвестный / закрытый ID материала', { status: 400, code: 'invalid_packet' }, r, 'ID вне публичного перечня отклоняется; сам ID не логируется и не показывается.', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, { ...good(), install_id: 'x' });
  record('extra_identifier_field', 'Лишнее поле (идентификатор)', { status: 400, code: 'invalid_packet' }, r, 'Любое поле вне белого списка отклоняет весь пакет.', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, good({ day: '2026-11-01' }));
  record('stale_packet', 'Устаревший пакет (5 дней назад)', { status: 400, code: 'day_out_of_range' }, r, 'Окно позднего приёма 2 дня UTC.', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, good({ day: '2026-11-08' }));
  record('future_day', 'День из будущего', { status: 400, code: 'day_out_of_range' }, r, 'Часы клиента нельзя «перепрыгнуть».', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, good({ region: 'BY' }));
  record('region_not_allowed', 'Регион вне списка (D-04: региона нет)', { status: 400, code: 'region_not_allowed' }, r, 'Допустим только UNKNOWN.', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, '{not json');
  record('bad_json', 'Повреждённый JSON', { status: 400, code: 'bad_json' }, r, 'Без записи и без эхо тела.', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, 'x'.repeat(17 * 1024));
  record('oversize', 'Слишком большой пакет (>16 KiB)', { status: 413, code: 'payload_too_large' }, r, 'Отказ по размеру до разбора.', { rowsStored: await stored(w) });

  w = world();
  r = await post(w, good(), 'GET');
  record('wrong_method', 'Неверный метод', { status: 405, code: 'method_not_allowed' }, r, 'Только POST.', { rowsStored: await stored(w) });

  w = world({ dailyRowWriteBudget: 3 });
  r = await post(w, good());
  record('budget_exhausted', 'Исчерпан дневной бюджет записей', { status: 503, code: 'budget_exhausted' }, r, 'Fail closed: прежние значения не меняются.', { rowsStored: await stored(w) });

  w = world();
  const first = await post(w, good());
  const second = await post(w, good());
  const sums = (await w.storage.all()).map((x) => x.n);
  record('duplicate_post', 'Тот же пакет отправлен дважды', { status: 204, code: 'ok' }, second, 'Сервер НЕ дедуплицирует (нет id пакета): повтор удваивает счётчики. Защита на клиенте (P07): пакет удаляется из очереди ДО отправки, потеря даёт недосчёт, а не задвоение. Exactly-once не заявляется.', { rowsStored: await stored(w), counterAfterTwoPosts: Math.max(...sums), firstStatus: first.status });

  w = world();
  await post(w, good({ day: '2026-11-06' }));
  w.env.now = () => T;
  await w.storage.addCounts({ today: '2026-10-01', rows: [{ key: JSON.stringify(['2026-10-01', 'web', '3.2', 'UNKNOWN', 'screen_view', 'today', '', '', '', '', '', '']), n: 7 }], charge: 2, dailyRowWriteBudget: 1000 });
  const before = await stored(w);
  await cleanup(w.storage, T, 14);
  const after = await stored(w);
  record('retention', 'Срок хранения 14 дней (UTC)', { status: 200, code: 'retention_applied' }, { status: before > after ? 200 : 0, code: before > after ? 'retention_applied' : 'retention_noop' }, 'Дни строго раньше границы удалены; свежие сохранены.', { rowsStored: after });

  w = world();
  record('no_data', 'Нет данных', { status: 200, code: 'empty' }, { status: (await stored(w)) === 0 ? 200 : 0, code: (await stored(w)) === 0 ? 'empty' : 'not_empty' }, 'Панель показывает «нет данных», а не нули как факт.', { rowsStored: 0 });
  return out;
}
