import { comparePrayerCategories, MAX_CATEGORY_DEPTH } from './prayerCategoryMembership.mjs';

/** Input must already be access-filtered. Missing/hidden parents become roots.
 * Invalid graphs remain repairable in admin; every node is emitted at most once. */
export function buildCategoryTree(categories) {
  const nodes = new Map(categories.map((c) => [c.id || c.key, { ...c, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    let ancestor = nodes.get(node.parentId);
    const seen = new Set([node.id || node.key]);
    let invalid = false;
    while (ancestor) {
      if (seen.has(ancestor.id || ancestor.key) || seen.size >= MAX_CATEGORY_DEPTH) { invalid = true; break; }
      seen.add(ancestor.id || ancestor.key);
      ancestor = nodes.get(ancestor.parentId);
    }
    const parent = !invalid && nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const node of nodes.values()) node.children.sort(comparePrayerCategories);
  return roots.sort((a, b) => Number(a.scope === 'personal') - Number(b.scope === 'personal') || comparePrayerCategories(a, b));
}

export function flattenCategoryTree(tree, expanded = new Set(), predicate = null, depth = 0) {
  const rows = [];
  for (const node of tree) {
    const children = flattenCategoryTree(node.children, expanded, predicate, depth + 1);
    if (predicate && !predicate(node) && !children.length) continue;
    rows.push({ ...node, depth, contextOnly: predicate ? !predicate(node) : false });
    if (predicate || expanded.has(node.id || node.key)) rows.push(...children);
  }
  return rows;
}
