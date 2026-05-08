/**
 * @file Manic Client-Side Router
 * @description Client-side routing for Manic SPA applications.
 * Provides file-based routing, dynamic imports, and View Transitions support.
 *
 * @see https://www.manicjs.tech/docs/api/router#components
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
/** @see https://www.manicjs.tech/docs/api/router/router#props */
export { Router } from './lib/Router';
/** @see https://www.manicjs.tech/docs/api/router/use-query-params#hook-signature */
export { useQueryParams } from './lib/Router';
/** @see https://www.manicjs.tech/docs/api/router/navigate#function-signature */
export { navigate } from './lib/Router';
/** @see https://www.manicjs.tech/docs/api/transitions/set-view-transitions#signature */
export { setViewTransitions } from './lib/Router';
/** @see https://www.manicjs.tech/docs/api/router/preload-route#signature */
export { preloadRoute } from './lib/Router';
/** @see https://www.manicjs.tech/docs/api/router/link#props */
export { Link } from './lib/Link';
/** @see https://www.manicjs.tech/docs/api/router/router-context#provided-value-routercontextvalue */
export { RouterContext } from './lib/context';
/** @see https://www.manicjs.tech/docs/api/router/use-router#hook-signature */
export { useRouter } from './lib/context';
