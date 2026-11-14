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

export function flattenCategoryTree(tree, predicate = null, depth = 0) {
  const rows = [];
  for (const node of tree) {
    const children = flattenCategoryTree(node.children, predicate, depth + 1);
    if (predicate && !predicate(node) && !children.length) continue;
    rows.push({ ...node, depth, contextOnly: predicate ? !predicate(node) : false });
    rows.push(...children);
  }
  return rows;
}

/** Page navigation follows the visible tree, including promoted hidden-parent roots. */
export function categoryPageNavigation(tree, categoryId) {
  const pending = tree.map((category) => ({ category, parent: null }));
  while (pending.length) {
    const { category, parent } = pending.pop();
    if (category.id === categoryId) return { category, parent, children: category.children };
    pending.push(...category.children.map((child) => ({ category: child, parent: category })));
  }
  // Hidden is a menu preference, not an access restriction: direct URLs can
  // still show permitted immediate children that were promoted to roots.
  return { category: null, parent: null, children: tree.filter((c) => c.parentId === categoryId) };
}
