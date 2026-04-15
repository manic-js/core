import { edenTreaty } from "@elysiajs/eden";
import { type App } from "./index"; // Points to the user-space ~manic.ts where app is exported

/**
 * Type-safe Eden client setup helper for Manic
 */
export function createEdenClient<T = any>(
  baseUrl: string = typeof window !== "undefined" ? window.location.origin : "http://localhost:6070"
) {
  // Use generic so it can be typed with the user's generated API app type
  return edenTreaty<T>(baseUrl);
}
