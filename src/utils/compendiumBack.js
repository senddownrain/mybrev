// App-bar fallback for a Compendium deep link with no history entry. Legacy
// node/topic ids retain their part and anchor; normal browsing uses root,
// part and question routes only.

const part = (partId) => ({ name: 'CompendiumPart', params: { partId } });

function ownerOf(id) {
  const [, partId] = String(id).match(/^(p\d+)(?:-|$)/) || [];
  return { partId };
}

export function compendiumParentRoute(routeName, params = {}) {
  if (routeName === 'CompendiumNode') {
    const { partId } = ownerOf(params.nodeId);
    if (partId) return { ...part(partId), hash: `#${params.nodeId}` };
  }
  if (routeName === 'CompendiumTopic') {
    const { partId } = ownerOf(params.topicId);
    if (partId) return { ...part(partId), hash: `#${params.topicId}` };
  }
  return { name: 'Compendium' };
}
