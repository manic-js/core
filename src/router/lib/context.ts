import { createContext, useContext } from 'react';
import type { RouterContextValue } from './types';

/** React context for router state — use useRouter() to access. @see https://www.manicjs.tech/docs/api/router/router-context#provided-value-routercontextvalue */
export const RouterContext = createContext<RouterContextValue | null>(null);

/** Access current route path, params, and navigate function. Must be used within a Router. @see https://www.manicjs.tech/docs/api/router/use-router#hook-signature */
export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useRouter must be used within a <Router>');
  return context;
}
