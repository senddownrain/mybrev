// Safe automatic context for the feedback form: only public IDs / dates / names. Mirrors the Worker allowlist.
const KINDS = ['prayer', 'song', 'reading', 'hour', 'day', 'bible', 'compendium', 'other'];
const HOURS = ['invitatory', 'office_of_readings', 'lauds', 'daytime', 'vespers', 'compline', 'mass', 'other'];
const SAFE_ID = /^[\p{L}\p{N}_\-.:]{1,128}$/u;

/** Build the context sent to the Worker from route query keys `ctx_kind`, `ctx_id`, `ctx_date`, `ctx_hour`, `ctx_title`. Unknown/unsafe values are dropped. */
export function contextFromQuery(query = {}, { diocese, lang = 'be', path } = {}) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const out = {};
  const kind = one(query.ctx_kind); if (KINDS.includes(kind)) out.kind = kind;
  const id = one(query.ctx_id); if (typeof id === 'string' && SAFE_ID.test(id)) out.id = id;
  const date = one(query.ctx_date); if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date;
  const hour = one(query.ctx_hour); if (HOURS.includes(hour)) out.hour = hour;
  const title = one(query.ctx_title); if (typeof title === 'string' && title.trim()) out.title = title.trim().slice(0, 120);
  if (!Object.keys(out).length) return null;
  if (typeof diocese === 'string' && /^[a-z_]{2,24}$/.test(diocese)) out.diocese = diocese;
  if (lang) out.lang = lang;
  const rawPath = path ?? one(query.ctx_path);
  if (typeof rawPath === 'string') { const p = rawPath.split(/[?#]/)[0]; if (/^\/[\w\-./%]{0,198}$/.test(p) && !p.includes('..')) out.path = p; }
  return out;
}

/** Route location for the "Паведаміць пра памылку" link. */
export const feedbackLink = ({ kind, id, date, hour, title }) => ({
  name: 'Feedback',
  query: Object.fromEntries(Object.entries({ ctx_kind: kind, ctx_id: id, ctx_date: date, ctx_hour: hour, ctx_title: title }).filter(([, v]) => v)),
});

/** Link from the foot of a prayer: the same location the side menu builds (id + return path), plus the shown title. */
export function prayerFeedbackLink(route, title) {
  const auto = feedbackLocationForRoute(route);
  const base = auto || feedbackLink({ kind: 'prayer', id: safeId(route?.params?.id) });
  const t = typeof title === 'string' ? title.trim() : '';
  return t ? { ...base, query: { ...base.query, ctx_title: t } } : base;
}

const HOUR_BY_ROUTE = {
  invitatorium: 'invitatory', lectionis: 'office_of_readings', morning: 'lauds', laudes: 'lauds',
  terz: 'daytime', sext: 'daytime', non: 'daytime', vesper: 'vespers', completorium: 'compline',
};
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const safeId = (v) => (typeof v === 'string' && SAFE_ID.test(v) ? v : undefined);

/** Report the specific selected readings document and date, including today's /readings page.
 *  Only public, allowlisted context reaches the feedback form. */
export function readingFeedbackLink({ id, date, title, path } = {}) {
  const base = feedbackLink({
    kind: 'reading',
    id: safeId(id),
    date: isDate(date) ? date : undefined,
    title: typeof title === 'string' ? title.slice(0, 120) : undefined,
  });
  if (typeof path !== 'string' || !/^\/[\w\-./%]{0,198}$/.test(path) || path.includes('..')) return base;
  return { ...base, query: { ...base.query, ctx_path: path } };
}

/** Automatic "Памылка" location for the current route; null when the screen is not a material (lists, settings, about, editors, the form itself). */
export function feedbackLocationForRoute(route) {
  const link = locationForRoute(route);
  const path = typeof route?.path === 'string' ? route.path.split(/[?#]/)[0] : '';
  return link && /^\/[\w\-./%]{0,198}$/.test(path) && !path.includes('..') ? { ...link, query: { ...link.query, ctx_path: path } } : link;
}

function locationForRoute(route) {
  const p = route?.params || {};
  const q = route?.query || {};
  const name = route?.name;
  if (name === 'oras') return feedbackLink({ kind: 'day', id: safeId(p.id), date: isDate(p.day) ? p.day : undefined });
  if (name in HOUR_BY_ROUTE) {
    return feedbackLink({ kind: 'hour', id: safeId(p.id), date: isDate(p.day) ? p.day : undefined, hour: HOUR_BY_ROUTE[name] });
  }
  if (name === 'Readings' || name === 'ReadingsByDate') {
    const date = isDate(p.date) ? p.date : isDate(q.date) ? q.date : undefined;
    return feedbackLink({ kind: 'reading', date });
  }
  if ((name === 'Ordo' || name === 'OrdoByDate') && isDate(p.date)) return feedbackLink({ kind: 'day', date: p.date });
  if (name === 'PrayerView') return feedbackLink({ kind: 'prayer', id: safeId(p.id) });
  if (name === 'SongView') return feedbackLink({ kind: 'song', id: safeId(p.id) });
  if (name === 'CompendiumPart') return feedbackLink({ kind: 'compendium', id: safeId(p.partId) });
  if (name === 'CompendiumNode') return feedbackLink({ kind: 'compendium', id: safeId(p.nodeId) });
  if (name === 'CompendiumTopic') return feedbackLink({ kind: 'compendium', id: safeId(p.topicId) });
  if (name === 'CompendiumQuestion') return feedbackLink({ kind: 'compendium', id: safeId(String(p.number ?? '')) });
  if (name === 'Bible' && p.bookId) {
    return feedbackLink({ kind: 'bible', id: safeId([p.language, p.bookId, p.chapter].filter(Boolean).join('-')) });
  }
  return null;
}

export const KIND_LABELS = { prayer: 'Малітва', song: 'Спеў', reading: 'Чытанні', hour: 'Літургія гадзінаў', day: 'Дзень літургіі', bible: 'Біблія', compendium: 'Кампендый', other: 'Іншае' };
export const HOUR_LABELS = { invitatory: 'Запрашальнае', office_of_readings: 'Гадзіна чытанняў', lauds: 'Ютрань', daytime: 'Дзённая малітва', vespers: 'Вячэрня', compline: 'Камплета', mass: 'Імша', other: '' };

/** Short human label of the automatic context, e.g. «Малітва · Ойча наш». Never the whole text. */
export const contextSummary = (ctx) => (ctx ? [KIND_LABELS[ctx.kind], ctx.title, ctx.date, HOUR_LABELS[ctx.hour]].filter(Boolean).join(' · ') || (ctx.id ? `ID: ${ctx.id}` : '') : '');

/**
 * One request id per composed message. A retry of the SAME message keeps the id (idempotent on the server);
 * any change to the payload after a failed attempt gets a new id, so the edited text can never be swallowed as a "duplicate".
 */
export function attemptRequestId(state, payload, generate = () => crypto.randomUUID()) {
  const key = JSON.stringify(payload);
  if (!state.id || state.key !== key) { state.id = generate(); state.key = key; }
  return state.id;
}
export const resetAttempt = (state) => { state.id = ''; state.key = ''; };
