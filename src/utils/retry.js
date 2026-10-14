/**
 * Retry utility for async operations
 */
import { isFirestoreCacheError } from './firestoreCacheRecovery.js';
import { assertFirestoreQuotaAvailable, firestoreErrorCode, isFirestoreQuotaError, noteFirestoreError } from './firestoreErrors.mjs';

export async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    onRetry = null,
    shouldRetry = () => true,
    timeout = 0, // 0 = no per-attempt timeout
  } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let timer;
      try { return timeout > 0
        ? await Promise.race([
            fn(),
            new Promise((_, reject) =>
              { timer = setTimeout(
                () => reject(new Error(`Operation timed out after ${timeout}ms`)),
                timeout,
              ); }
            ),
          ])
        : await fn();
      } finally { clearTimeout(timer); }
    } catch (error) {
      lastError = error;
      noteFirestoreError(error);
      if (isFirestoreQuotaError(error)) throw error;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(error, attempt, maxAttempts);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      currentDelay *= backoff;
    }
  }

  throw lastError;
}

/**
 * Retry with exponential backoff for Firestore operations.
 * Wait for the SDK request to settle. Promise.race timeouts cannot cancel
 * Firestore reads and otherwise start overlapping copies of the same query.
 */
export async function retryFirestore(fn, options = {}) {
  return retry(() => { assertFirestoreQuotaAvailable(); return fn(); }, {
    maxAttempts: 3,
    delay: 300,
    backoff: 2,
    timeout: 0,
    shouldRetry: (error) => {
      // Repeating a query against broken local persistence cannot repair it.
      if (isFirestoreCacheError(error)) return false;
      const code = firestoreErrorCode(error);
      return (
        code === 'unavailable' ||
        code === 'deadline-exceeded' ||
        code === 'aborted' ||
        // Also retry our own timeout sentinel
        error?.message?.startsWith('Operation timed out')
      );
    },
    ...options,
  });
}

/** Disable SDK retries; retry only server-reported transaction contention. */
export function quotaSafeTransaction(runTransaction, db, action) {
  return retryFirestore(() => runTransaction(db, action, { maxAttempts: 1 }), {
    maxAttempts: 3, delay: 50, timeout: 0,
    // Web/Lite optimistic transactions also report a changed document version
    // as failed-precondition (and a concurrent create as already-exists).
    shouldRetry: (error) => ['aborted', 'failed-precondition', 'already-exists'].includes(firestoreErrorCode(error)),
  });
}
