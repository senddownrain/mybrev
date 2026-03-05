/**
 * Retry utility for async operations
 */
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
      const result = timeout > 0
        ? await Promise.race([
            fn(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`Operation timed out after ${timeout}ms`)),
                timeout,
              )
            ),
          ])
        : await fn();
      return result;
    } catch (error) {
      lastError = error;

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
 * Adds a 10 s per-attempt timeout so a hung network request
 * doesn't block the retry loop indefinitely.
 */
export async function retryFirestore(fn, options = {}) {
  return retry(fn, {
    maxAttempts: 3,
    delay: 300,
    backoff: 2,
    timeout: 10_000, // 10 s per attempt
    shouldRetry: (error) => {
      const code = error?.code;
      return (
        code === 'unavailable' ||
        code === 'deadline-exceeded' ||
        code === 'resource-exhausted' ||
        code === 'aborted' ||
        // Also retry our own timeout sentinel
        error?.message?.startsWith('Operation timed out')
      );
    },
    ...options,
  });
}
