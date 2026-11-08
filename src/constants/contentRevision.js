// Bump after publishing corrections to public Firestore texts/calendar data.
// Deploy this change with the app. Old content remains readable while refreshed.
export const CONTENT_REVISION = '2026-11-07T23:00:00Z'; // reassemble Advent date/Sunday/psalter sources, including I Vespers

// Change the schema only if stored result shapes are no longer render-compatible.
export const CONTENT_CACHE_SCHEMA = 1;
