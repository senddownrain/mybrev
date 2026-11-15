// Bump after publishing corrections to public Firestore texts/calendar data.
// Deploy this change with the app. Old content remains readable while refreshed.
export const CONTENT_REVISION = '2026-11-15-pr245-proper-published'; // 226 Proper documents / 406 fields verified by server receipt 43736119244; Advent remains included

// Change the schema only if stored result shapes are no longer render-compatible.
export const CONTENT_CACHE_SCHEMA = 1;
