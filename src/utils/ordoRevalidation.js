/** Bounded online checks, independent of CONTENT_REVISION. Failed/offline reads back off. */
// A public-launch visitor should not poll calendar metadata every five minutes.
// One startup check plus six-hour rechecks; admin updates still take effect on reload.
export const CALENDAR_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
export function createCalendarRevalidator({ run, online, now = Date.now, interval = CALENDAR_CHECK_INTERVAL }) {
  let nextCheck = 0;
  let pending = null;
  return (options = {}) => {
    if (pending) return pending;
    if (!online() || (!options.revalidate && now() < nextCheck)) return Promise.resolve(false);
    nextCheck = now() + interval;
    pending = Promise.resolve().then(() => run({ ...options, fresh: true, revalidate: true }))
      .finally(() => { pending = null; });
    return pending;
  };
}
