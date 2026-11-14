// Bump after publishing corrections to public Firestore texts/calendar data.
// Deploy this change with the app. Old content remains readable while refreshed.
export const CONTENT_REVISION = '2026-11-14-pr245-reviewed-proper'; // Serve only after the guarded Proper write/readback; Advent policy remains included

// Change the schema only if stored result shapes are no longer render-compatible.
export const CONTENT_CACHE_SCHEMA = 1;
