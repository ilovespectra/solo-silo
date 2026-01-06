/**
 * Backend client with retry logic and better error handling
 * Handles the ML model loading delay during backend startup
 */

const BACKEND_URL = 'http://127.0.0.1:8000';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic for backend initialization phase
 */
export async function fetchBackend(
  endpoint: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = method === 'POST' ? 30000 : 15000,
    retries = method === 'GET' ? MAX_RETRIES : 0, // Only retry GETs
  } = options;

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `${BACKEND_URL}${endpoint}`;
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(timeout),
      });

      // If successful or non-retryable error, return immediately
      if (response.ok || response.status === 404 || response.status === 400) {
        return response;
      }

      // For server errors, consider retrying
      if (response.status >= 500 && attempt < retries) {
        console.log(`[backendClient] Server error (${response.status}), retrying ${attempt + 1}/${retries}...`);
        lastError = new Error(`Backend returned ${response.status}`);
        await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a timeout or connection error
      const isConnectionError = 
        error instanceof TypeError ||
        (error as Error).name === 'AbortError' ||
        (error as Error).message.includes('fetch failed');

      if (isConnectionError && attempt < retries) {
        console.log(`[backendClient] Connection error, retrying ${attempt + 1}/${retries}...`, error);
        await sleep(RETRY_DELAY * (attempt + 1));
        continue;
      }

      // If not retrying or last attempt, throw
      if (attempt >= retries) {
        throw error;
      }
    }
  }

  // Should never reach here, but throw last error just in case
  throw lastError || new Error('Unknown error');
}

/**
 * Check if backend is ready (health check)
 */
export async function isBackendReady(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for backend to become ready
 */
export async function waitForBackend(
  maxWaitMs: number = 120000, // 2 minutes
  checkIntervalMs: number = 2000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    if (await isBackendReady()) {
      return true;
    }
    await sleep(checkIntervalMs);
  }
  
  return false;
}
