/**
 * @file Manic Client-Side Router
 * @description Client-side routing for Manic SPA applications.
 * Provides file-based routing, dynamic imports, and View Transitions support.
 *
 * @example
 * // Basic usage in app/main.tsx
 * import { Router, Link } from 'manicjs/router';
 * import { routes, notFoundPage } from './app/~routes.generated';
 *
 * render(<Router { ...routes } notFound={notFoundPage} />, document.getElementById('root'));
 *
 * @example
 * // Programmatic navigation
 * import { navigate } from 'manicjs/router';
 * navigate('/about');
 *
 * @example
 * // Using Link component
 * import { Link } from 'manicjs/router';
 * <Link to="/users/123">View User</Link>
 */

export type { RouteDef, RouterContextValue } from './lib/types';
export {
  Router,
  useQueryParams,
  navigate,
  setViewTransitions,
  preloadRoute,
} from './lib/Router';
export { Link } from './lib/Link';
export { RouterContext, useRouter } from './lib/context';
