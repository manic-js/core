import type { ComponentType } from 'react';

/** Route definition with path pattern, component, and optional lazy loader */
export interface RouteDef {
  /** URL path pattern (e.g. "/blog/:id", "/docs/:...slug") */
  path: string;
  /** Resolved component, or null if lazy-loaded */
  component: ComponentType | null;
  /** Lazy loader function for code-split routes */
  loader?: () => Promise<{ default: ComponentType }>;
}

/** Value provided by RouterContext to child components */
export interface RouterContextValue {
  /** Current URL pathname */
  path: string;
  /** Navigate programmatically to a new path */
  navigate: (to: string, options?: { replace?: boolean }) => void;
  /** Dynamic route parameters (e.g. { id: "123" }) */
  params: Record<string, string>;
}
