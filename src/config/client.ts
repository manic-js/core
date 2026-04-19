import { hc } from 'hono/client';

/**
 * Creates a type-safe RPC client for Manic API endpoints.
 *
 * This helper uses Hono's RPC client to provide fully typed API calls
 * from the browser to Manic API routes. The generated types match the API
 * route handlers defined in app/api/*/index.ts files.
 *
 * @template T - The API route type (cast from the API module)
 * @param baseUrl - Base URL for API requests (defaults to current origin or localhost)
 * @returns Typed Hono client for making API calls
 *
 * @example
 * // Basic usage - call an API route
 * import { createClient } from 'manicjs/config';
 * const client = createClient();
 *
 * // Call an API endpoint with full type safety
 * const response = await client.api.hello.$get();
 * const data = await response.json();
 *
 * @example
 * // Using with a specific base URL
 * const client = createClient('https://api.example.com');
 * const result = await client.users[':id'].$get({ param: { id: '123' } });
 *
 * @example
 * // Typed API client from generated types
 * import type { AppRouter } from './app/api';
 * const client = createClient<AppRouter>();
 */
export function createClient<T>(
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:6070'
) {
  return hc<T>(baseUrl);
}
