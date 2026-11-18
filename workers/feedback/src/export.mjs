import { projectItem } from './acl.mjs';

/** Free text can still carry personal data typed by the sender: strip the obvious kinds before the text leaves the inbox. */
export function redactText(text) {
  return String(text ?? '')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\bhttps?:\/\/\S+/gi, '[link]')
    .replace(/(?<![\w.])\+?\d[\d\s().-]{6,}\d(?![\w])/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim();
}

export const EXPORT_COLUMNS = ['id', 'date', 'category', 'status', 'platform', 'kind', 'context_id', 'context_date', 'hour', 'diocese', 'lang', 'title', 'path', 'message'];

/** One export row. No contact e-mail, no notes, no actor ids, no times finer than a day. Superadmin only: app version. */
export function exportRow(row, role) {
  const item = projectItem(row, role);
  const c = item.context || {};
  const out = {
    id: item.id, date: new Date(item.createdAt).toISOString().slice(0, 10), category: item.category, status: item.status, platform: item.platform,
    kind: c.kind ?? '', context_id: c.id ?? '', context_date: c.date ?? '', hour: c.hour ?? '', diocese: c.diocese ?? '', lang: c.lang ?? '',
    title: redactText(c.title ?? ''), path: c.path ?? '', message: redactText(item.body),
  };
  if (role === 'superadmin') out.app_version = item.appVersion ?? '';
  return out;
}

/** CSV cell: RFC 4180 quoting and a guard against spreadsheet formula injection. */
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows, role) {
  const cols = role === 'superadmin' ? [...EXPORT_COLUMNS, 'app_version'] : EXPORT_COLUMNS;
  return `${[cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n')}\r\n`;
}
