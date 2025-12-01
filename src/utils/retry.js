/**
 * Retry utility for async operations
 */
export async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    onRetry = null,
    shouldRetry = (error) => true,
  } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
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
 * Retry with exponential backoff for Firestore operations
 */
export async function retryFirestore(fn, options = {}) {
  return retry(fn, {
    maxAttempts: 3,
    delay: 500,
    backoff: 2,
    shouldRetry: (error) => {
      // Retry on network errors or rate limit errors
      const code = error?.code;
      return code === 'unavailable' || 
             code === 'deadline-exceeded' || 
             code === 'resource-exhausted' ||
             code === 'aborted';
    },
    ...options,
  });
}

