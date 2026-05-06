/**
 * Bounded retry + timeout helpers used by `PineconeClient` and re-exported
 * from `server.ts` for library consumers.
 */

/** Retry policy. */
export interface RetryOptions {
  /** Total number of attempts after the first try. Default 2. */
  retries?: number;
  /** Base backoff in ms (doubled per attempt). Default 250. */
  backoffMs?: number;
  /** Predicate that decides whether an error is retryable. */
  shouldRetry?: (error: unknown) => boolean;
  /** Logger called once per retry with attempt number and error. */
  onRetry?: (attempt: number, error: unknown) => void;
}

/** Timeout policy applied around any async call. */
export interface TimeoutOptions {
  /** Hard timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Label included in the timeout error message. */
  label?: string;
}

/** Default predicate: retry on common transient HTTP statuses (429/5xx) and network-ish messages. */
export function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    if (/\b(429|502|503|504)\b/.test(msg)) return true;
    if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(msg)) return true;
  }
  const status =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && (status === 429 || (status >= 500 && status < 600))) {
    return true;
  }
  return false;
}

/**
 * Run `fn` and retry on transient failures.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseBackoff = options.backoffMs ?? 250;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) {
        throw error;
      }
      options.onRetry?.(attempt + 1, error);
      const wait = baseBackoff * Math.pow(2, attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

/**
 * Race `fn()` against a timeout. Throws a descriptive error when the timeout fires.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  options: TimeoutOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const label = options.label ?? 'pinecone';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms while waiting for ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
