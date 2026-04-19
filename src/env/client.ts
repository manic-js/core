declare global {
  interface Window {
    /** Environment variables injected at build time */
    __MANIC_ENV__?: Record<string, string>;
  }
}

/** Prefix for environment variables exposed to the client */
const PUBLIC_PREFIX = 'MANIC_PUBLIC_';

/**
 * Gets an environment variable value.
 * In browser context, only MANIC_PUBLIC_* variables are accessible.
 *
 * @param key - Environment variable name
 * @returns Variable value or undefined
 *
 * @example
 * // Get a public env var in browser
 * const apiUrl = getEnv('MANIC_PUBLIC_API_URL');
 *
 * @example
 * // Server-side access (Node/Bun)
 * const secret = getEnv('API_SECRET');
 */
export function getEnv(key: string): string | undefined {
  if (typeof window === 'undefined') {
    return process.env[key];
  }

  if (!key.startsWith(PUBLIC_PREFIX)) {
    console.warn(
      `[Manic] Cannot access non-public env var "${key}" on client-side`
    );
    return undefined;
  }

  return window.__MANIC_ENV__?.[key];
}

/**
 * Gets all public environment variables (MANIC_PUBLIC_*).
 *
 * @returns Object containing all public env vars
 *
 * @example
 * const env = getPublicEnv();
 * // Returns { MANIC_PUBLIC_API_URL: "https://api.example.com", ... }
 */
export function getPublicEnv(): Record<string, string> {
  if (typeof window === 'undefined') {
    const publicEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(PUBLIC_PREFIX) && value !== undefined) {
        publicEnv[key] = value;
      }
    }
    return publicEnv;
  }

  return window.__MANIC_ENV__ || {};
}
