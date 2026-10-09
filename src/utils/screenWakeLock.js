/** One screen lock for the app, restored after returning from a hidden tab. */
export function createScreenWakeLock({ navigator, document, onError = () => {} }) {
  let enabled = false;
  let lock = null;
  let pending = null;

  async function release(sentinel) {
    if (!sentinel || sentinel.released) return;
    try { await sentinel.release(); } catch (error) { onError(error); }
  }

  function acquire() {
    if (!enabled || document.visibilityState !== 'visible' || !navigator.wakeLock?.request) {
      return Promise.resolve(null);
    }
    if (lock && !lock.released) return Promise.resolve(lock);
    if (pending) return pending;
    pending = (async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        // Turning off the switch while a request was pending must release it.
        if (!enabled || document.visibilityState !== 'visible') {
          await release(sentinel);
          return null;
        }
        lock = sentinel;
        sentinel.addEventListener('release', () => {
          if (lock === sentinel) lock = null;
        }, { once: true });
        return sentinel;
      } catch (error) {
        onError(error);
        return null;
      }
    })().finally(() => { pending = null; });
    return pending;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) return acquire();
    const previous = lock;
    lock = null;
    return release(previous);
  }

  // Browsers release screen locks when a tab is hidden. A user gesture also
  // retries an initial request refused before the document was active.
  const resume = () => { acquire(); };
  document.addEventListener('visibilitychange', resume);
  document.addEventListener('pointerdown', resume, { passive: true });
  return {
    setEnabled,
    async dispose() {
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('pointerdown', resume);
      await setEnabled(false);
    },
  };
}
