import {
  createElement,
  useEffect,
  useState,
  useRef,
  useMemo,
  Component,
  type ComponentType,
  type ErrorInfo,
} from 'react';
import { flushSync } from 'react-dom';
import { NotFound } from '../../components/NotFound';
import { ServerError } from '../../components/ServerError';
import { RouterContext } from './context';
import { RouteRegistry } from './matcher';
import type { RouteDef } from './types';

type LazyLoader = () => Promise<{ default: ComponentType }>;

declare global {
  interface Window {
    __MANIC_ROUTES__?: Record<string, LazyLoader>;
    __MANIC_ERROR_PAGES__?: {
      notFound?: LazyLoader;
      error?: LazyLoader;
    };
    __MANIC_NAVIGATE__?: (to: string, options?: { replace?: boolean }) => void;
  }

  interface Document {
    startViewTransition?: (callback: () => void | Promise<void>) => {
      finished: Promise<void>;
      updateCallbackDone: Promise<void>;
      ready: Promise<void>;
    };
  }
}

/** Hook to access URL search parameters reactively — updates on popstate */
function useQueryParams(): URLSearchParams {
  const [params, setParams] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()
  );

  useEffect(() => {
    const update = (): void =>
      setParams(new URLSearchParams(window.location.search));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  return params;
}

export { useQueryParams };

// Cache loaded components
const componentCache = new Map<string, ComponentType>();

// Clear component cache during HMR so new components are picked up
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    componentCache.clear();
  });
}

async function loadComponent(
  path: string,
  loader: LazyLoader,
  signal?: AbortSignal
): Promise<ComponentType | null> {
  if (!componentCache.has(path)) {
    try {
      const module = await loader();
      if (signal?.aborted) return null;
      componentCache.set(path, module.default);
    } catch (e) {
      if (signal?.aborted) return null;
      throw e;
    }
  }
  return componentCache.get(path)!;
}

/** Preload a route's component module — called on link hover for instant navigation */
export function preloadRoute(path: string): void {
  if (typeof window === 'undefined' || !window.__MANIC_ROUTES__) return;

  const routes = window.__MANIC_ROUTES__;

  // Use registry to match the actual route loader
  const routeDefs = Object.entries(routes).map(([p, loader]) => ({
    path: p || '/',
    component: null,
    loader,
  }));
  const registry = new RouteRegistry(routeDefs);
  const match = registry.match(path);

  if (match) {
    const loader = routes[match.path];
    if (loader && !componentCache.has(match.path)) {
      loader().then(mod => componentCache.set(match.path, mod.default));
    }
  }
}

let viewTransitionsEnabled = true;

/** Enable or disable View Transitions API for client-side navigation */
export function setViewTransitions(enabled: boolean): void {
  viewTransitionsEnabled = enabled;
}

/** Navigate to a path programmatically */
export function navigate(to: string, options?: { replace?: boolean }): void {
  if (typeof window !== 'undefined' && window.__MANIC_NAVIGATE__) {
    window.__MANIC_NAVIGATE__(to, options);
  }
}

// Cache for custom error page components
const errorPageCache = new Map<string, ComponentType>();

async function loadErrorPage(
  key: string,
  loader: LazyLoader
): Promise<ComponentType> {
  if (!errorPageCache.has(key)) {
    const module = await loader();
    errorPageCache.set(key, module.default);
  }
  return errorPageCache.get(key)!;
}

function useErrorPage(
  key: string,
  loader?: LazyLoader,
  fallback?: ComponentType
): ComponentType {
  const [Component, setComponent] = useState<ComponentType>(
    () => errorPageCache.get(key) ?? fallback ?? NotFound
  );

  useEffect(() => {
    if (loader && !errorPageCache.has(key)) {
      loadErrorPage(key, loader).then(C => setComponent(() => C));
    }
  }, [key, loader]);

  return Component;
}

class ErrorBoundary extends Component<
  {
    fallback: React.ReactNode;
    children: React.ReactNode;
    onError: (error: Error) => void;
  },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Router caught an error during render:');
    console.error(error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/** Client-side router with file-based routing, view transitions, and error boundaries */
export function Router({
  routes: manualRoutes,
}: {
  routes?: Record<string, LazyLoader>;
}): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(
    null
  );
  const [routeParams, setRouteParams] = useState<Record<string, string>>({});
  const [errorDetails, setErrorDetails] = useState<Error | null>(null);
  const isNavigating = useRef(false);
  const abortController = useRef<AbortController | null>(null);

  const rawRoutes: Record<string, LazyLoader> =
    manualRoutes ??
    (typeof window !== 'undefined' ? (window.__MANIC_ROUTES__ ?? {}) : {});

  const errorPages =
    typeof window !== 'undefined' ? window.__MANIC_ERROR_PAGES__ : undefined;

  const NotFoundPage = useErrorPage('notFound', errorPages?.notFound, NotFound);
  const ErrorPage = useErrorPage('error', errorPages?.error, ServerError);

  // Compile routes into a registry exactly once
  const registry = useMemo(() => {
    const defs = Object.entries(rawRoutes).map(([path, loader]) => ({
      path: path || '/',
      component: null,
      loader,
    }));
    return new RouteRegistry(defs);
  }, [rawRoutes]);

  const loadAndTransition = async (
    path: string,
    isPopState: boolean,
    replace: boolean = false
  ) => {
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    const match = registry.match(path);
    if (!match) {
      if (!isPopState) {
        if (replace)
          window.history.replaceState({ scrollY: window.scrollY }, '', path);
        else window.history.pushState({ scrollY: window.scrollY }, '', path);
      }
      setCurrentPath(path);
      setLoadedComponent(null);
      setErrorDetails(null);
      return;
    }

    const matchedLoader = rawRoutes[match.path];
    if (matchedLoader) {
      isNavigating.current = true;
      try {
        const Cmp = await loadComponent(match.path, matchedLoader, signal);

        if (signal.aborted) return;

        const updateState = () => {
          if (!isPopState) {
            // Save current scroll position before pushing
            window.history.replaceState({ scrollY: window.scrollY }, '');
            if (replace) {
              window.history.replaceState({ scrollY: 0 }, '', path);
            } else {
              window.history.pushState({ scrollY: 0 }, '', path);
            }
          }

          setCurrentPath(path);
          setLoadedComponent(() => Cmp);
          setRouteParams(match.params);
          setErrorDetails(null);

          if (!isPopState && document.body) {
            // ensure we scroll to top on new navigation, leaving popstate intact
            window.scrollTo(0, 0);
          } else if (
            isPopState &&
            window.history.state?.scrollY !== undefined
          ) {
            window.scrollTo(0, window.history.state.scrollY);
          }
        };

        const shouldAnimate =
          viewTransitionsEnabled &&
          document.startViewTransition &&
          !isPopState &&
          !replace;

        if (shouldAnimate) {
          try {
            const transition = document.startViewTransition!(() => {
              flushSync(updateState);
            });
            transition.finished.catch(() => {});
          } catch (e) {
            updateState();
          }
        } else {
          updateState();
        }
      } catch (err) {
        if (signal.aborted) return;
        setErrorDetails(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!signal.aborted) isNavigating.current = false;
      }
    }
  };

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Assign globally for <Link> and manual navigation
    window.__MANIC_NAVIGATE__ = (to: string, options) => {
      loadAndTransition(to, false, options?.replace);
    };

    const handlePopState = () => {
      loadAndTransition(window.location.pathname, true);
    };

    window.addEventListener('popstate', handlePopState);

    // Initial mount load
    if (componentCache.size === 0) {
      loadAndTransition(window.location.pathname, true, true);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      delete window.__MANIC_NAVIGATE__;
    };
  }, [registry]);

  if (errorDetails) {
    return createElement(
      RouterContext.Provider,
      { value: { path: currentPath, navigate, params: {} } },
      createElement(ErrorPage as any, { error: errorDetails })
    );
  }

  if (!LoadedComponent) {
    const match = registry.match(currentPath);
    if (!match) {
      return createElement(
        RouterContext.Provider,
        { value: { path: currentPath, navigate, params: {} } },
        createElement(NotFoundPage, null)
      );
    }
    // Show nothing while loading initial route (suspense-like)
    return null;
  }

  return createElement(
    RouterContext.Provider,
    { value: { path: currentPath, navigate, params: routeParams } },
    createElement(
      ErrorBoundary,
      {
        fallback: createElement(ErrorPage as any, { error: errorDetails }),
        onError: err => setErrorDetails(err),
      },
      createElement(LoadedComponent, null)
    )
  );
}
