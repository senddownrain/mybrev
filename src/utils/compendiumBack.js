// Logical parent of a Compendium screen, derived from the deterministic ids
// (`p1` → `p1-s1` → `p1-s1-ch2` → `p1-s1-ch2-t1`; `-intro` is a technical
// suffix). Used by the app bar's Back button when there is no history entry,
// e.g. after opening a deep link. Pure and tiny: the layout imports it without
// pulling in the Compendium data.

const part = (partId) => ({ name: 'CompendiumPart', params: { partId } });
const node = (nodeId) => ({ name: 'CompendiumNode', params: { nodeId } });

function ownerOf(id) {
  const [, partId, section, chapter] = String(id).match(/^(p\d+)(?:-(s\d+))?(?:-(ch\d+))?/) || [];
  return { partId, sectionId: section ? `${partId}-${section}` : null, chapterId: chapter ? `${partId}-${section}-${chapter}` : null };
}

export function compendiumParentRoute(routeName, params = {}) {
  if (routeName === 'CompendiumNode') {
    const { partId, sectionId, chapterId } = ownerOf(params.nodeId);
    if (chapterId) return node(sectionId);
    if (partId) return part(partId);
  }
  if (routeName === 'CompendiumTopic') {
    const { partId, sectionId, chapterId } = ownerOf(params.topicId);
    if (chapterId || sectionId) return node(chapterId || sectionId);
    if (partId) return part(partId);
  }
  return { name: 'Compendium' };
}
