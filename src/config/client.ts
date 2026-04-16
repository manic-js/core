import { hc } from 'hono/client';

/**
 * Type-safe Hono RPC client setup helper for Manic
 */
export function createClient<T>(
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:6070'
) {
  return hc<T>(baseUrl);
}
