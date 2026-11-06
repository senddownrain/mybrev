import { CONTENT_CATEGORIES } from './validate.mjs';

/** Categories a role may see. null => nothing. */
export const visibleCategories = (role) => (role === 'superadmin' ? null /* all */ : role === 'admin' ? CONTENT_CATEGORIES : []);

/** Safe field whitelist for the plain admin. Superadmin gets everything incl. email, technical context and private notes. */
export function projectItem(row, role, { notes = [], events = [] } = {}) {
  const sup = role === 'superadmin';
  const context = row.context_json ? JSON.parse(row.context_json) : null;
  const item = {
    id: row.id, category: row.category, status: row.status, platform: row.platform, createdAt: row.created_at,
    updatedAt: row.updated_at, version: row.version, body: row.body,
    context: context && !sup ? pick(context, ['kind', 'id', 'date', 'hour', 'diocese', 'lang', 'title', 'path']) : context,
  };
  if (sup) { item.contactEmail = row.contact_email; item.appVersion = row.app_version; item.sourceApp = row.source_app; item.closedAt = row.closed_at; }
  if (notes.length || events.length) {
    item.notes = notes.filter((n) => sup || n.scope === 'shared').map((n) => ({ id: n.id, scope: n.scope, body: n.body, createdAt: n.created_at, authorUid: sup ? n.author_uid : undefined }));
    item.events = events.map((e) => ({ kind: e.kind, from: e.from_value, to: e.to_value, createdAt: e.created_at, actorUid: sup ? e.actor_uid : undefined }));
  }
  return item;
}
export function projectListRow(row, role) {
  const full = projectItem(row, role);
  return { id: full.id, category: full.category, status: full.status, platform: full.platform, createdAt: full.createdAt, snippet: row.body.slice(0, 160), version: full.version };
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
