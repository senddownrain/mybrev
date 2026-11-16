import { webCorrectionsFor } from '../data/liturgical/web-corrections/index.js';

const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(text)))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** Presentation only. Never mutate SDK/cache inputs or overlay later edits. */
export async function applyWebLiturgicalCorrections(collection, document) {
  if (!document?.id || !['days', 'liturgicalTemplates'].includes(collection)) return document;
  const edits = await webCorrectionsFor(`${collection}/${document.id}`);
  if (!edits.length) return document;
  const changes = await Promise.all(edits.map(async ([path, beforeHash, start, remove, insert]) => {
    const value = path.reduce((object, key) => object?.[key], document);
    if (typeof value !== 'string' || await sha256(value) !== beforeHash) return null;
    return { path, value: value.slice(0, start) + insert + value.slice(start + remove) };
  }));
  let result = document;
  for (const change of changes) {
    if (!change) continue;
    if (result === document) result = { ...document };
    let target = result;
    for (const key of change.path.slice(0, -1)) {
      target[key] = { ...target[key] };
      target = target[key];
    }
    target[change.path.at(-1)] = change.value;
  }
  return result;
}
