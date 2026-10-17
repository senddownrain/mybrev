/**
 * Reports one successful use of a whitelisted feature to the local analytics
 * (test builds only). In a normal build the flag is replaced by `false` at build
 * time and the hook is dropped: no analytics code and no data remain. Never pass
 * values, identifiers, search text or settings: only the feature id from the
 * contract.
 */
// `typeof` keeps the module importable under plain Node (unit tests have no
// `import.meta.env`); the static `import.meta.env.VITE_…` form is what Vite replaces.
export const trackFeature = typeof import.meta.env !== 'undefined' && import.meta.env.VITE_ANALYTICS_LOCAL === 'true'
  ? (featureId) => { if (typeof window.__analyticsFeature === 'function') window.__analyticsFeature(featureId); }
  : () => {};
