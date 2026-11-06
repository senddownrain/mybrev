import registry from '../data/sources.json' with { type: 'json' };

export const SOURCE_REGISTRY = registry;
export const SOURCES = registry.entries;

export function getSource(id) {
  return SOURCES.find((source) => source.id === id) || null;
}

export function getBibleSource(language, testament) {
  return getSource(registry.bindings.bible[language]?.[testament]);
}
