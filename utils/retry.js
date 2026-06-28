/**
 * Retry with exponential backoff.
 * Required by master prompt: "Use exponential backoff"
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry = null,
    retryableErrors = ['timeout', 'ECONNREFUSED', 'ETIMEDOUT', 'network', 'rate limit']
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) break;

      const isRetryable = retryableErrors.some(e =>
        error.message?.toLowerCase().includes(e.toLowerCase()) ||
        error.code?.toLowerCase().includes(e.toLowerCase())
      );

      if (!isRetryable) throw error;

      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
      const jitter = delay * 0.1 * Math.random();
      const totalDelay = delay + jitter;

      if (onRetry) onRetry(attempt + 1, maxRetries, totalDelay, error.message);

      await new Promise(r => setTimeout(r, totalDelay));
    }
  }

  throw lastError;
}

/**
 * Network timeout wrapper
 */
export function withTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout (' + ms + 'ms)')), ms)
    )
  ]);
}
