import {
  Component,
  createElement,
  useEffect,
  useState,
  useRef,
  useMemo,
  type ComponentType,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { NotFound } from '../../components/NotFound';
import { ErrorOverlay } from '../../components/ErrorOverlay';
import { ServerError } from '../../components/ServerError';
import { RouterContext } from './context';
import { RouteRegistry } from './matcher';

type LazyLoader = () => Promise<{ default: ComponentType }>;

declare global {
  interface Window {
    __MANIC_ROUTES__?: Record<string, any>;
    __MANIC_ERROR_PAGES__?: {
      notFound?: any;
      error?: any;
    };
    __MANIC_LOADER_DATA__?: any;
    __MANIC_SSR_COMPONENT__?: ComponentType;
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

/** Query-param hook export. @see https://www.manicjs.tech/docs/api/router/use-query-params#hook-signature */
export { useQueryParams };

// Cache loaded components
const componentCache = new Map<string, ComponentType>();

let cachedLoaderData: any = null;
let parsedLoaderData = false;

function getSsrLoaderData(): any {
  if (typeof window === 'undefined') return null;
  if (parsedLoaderData) return cachedLoaderData;
  parsedLoaderData = true;
  const dataEl = document.getElementById('__MANIC_DATA__');
  if (dataEl && dataEl.textContent) {
    try {
      cachedLoaderData = JSON.parse(dataEl.textContent);
      dataEl.remove();
    } catch (e) {
      console.error('Failed to parse SSR loader data:', e);
    }
  }
  return cachedLoaderData;
}

function getInitialSsrState(routes: Record<string, any>): {
  component: ComponentType | null;
  params: Record<string, string>;
  loaderData: any;
} {
  if (typeof window === 'undefined') {
    return { component: null, params: {}, loaderData: null };
  }

  const root = document.getElementById('root');
  if (!root?.hasChildNodes()) {
    return { component: null, params: {}, loaderData: null };
  }

  const routeDefs = Object.entries(routes).map(([path, entry]) => ({
    path: path || '/',
    component: null,
    loader: typeof entry === 'function' ? entry : entry.import,
  }));
  const match = new RouteRegistry(routeDefs).match(window.location.pathname);
  if (window.__MANIC_SSR_COMPONENT__) {
    return {
      component: window.__MANIC_SSR_COMPONENT__,
      params: match?.params ?? {},
      loaderData: getSsrLoaderData(),
    };
  }

  if (!match) {
    return {
      component: null,
      params: {},
      loaderData: getSsrLoaderData(),
    };
  }

  const cached = componentCache.get(match.path);
  return {
    component: cached ?? null,
    params: match.params,
    loaderData: getSsrLoaderData(),
  };
}

// Clear component cache during HMR so new components are picked up
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    componentCache.clear();
  });
}

async function loadComponent(
  path: string,
  entry: any,
  signal?: AbortSignal
): Promise<ComponentType | null> {
  if (!componentCache.has(path)) {
    try {
      const loader = typeof entry === 'function' ? entry : entry.import;
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

/** Preload a route's component module — called on link hover for instant navigation. @see https://www.manicjs.tech/docs/api/router/preload-route#signature */
export function preloadRoute(path: string): void {
  if (typeof window === 'undefined' || !window.__MANIC_ROUTES__) return;

  const routes = window.__MANIC_ROUTES__;

  // Use registry to match the actual route loader
  const routeDefs = Object.entries(routes).map(([p, entry]) => ({
    path: p || '/',
    component: null,
    loader: typeof entry === 'function' ? entry : entry.import,
  }));
  const registry = new RouteRegistry(routeDefs);
  const match = registry.match(path);

  if (match) {
    const entry = routes[match.path];
    if (entry && !componentCache.has(match.path)) {
      const loader = typeof entry === 'function' ? entry : entry.import;
      loader().then(mod => componentCache.set(match.path, mod.default));
    }
  }
}

let viewTransitionsEnabled = true;

/** Enable or disable View Transitions API for client-side navigation. @see https://www.manicjs.tech/docs/api/transitions/set-view-transitions#signature */
export function setViewTransitions(enabled: boolean): void {
  viewTransitionsEnabled = enabled;
}

function isBenignTransitionAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === 'InvalidStateError' &&
    message.includes('transition was aborted because of invalid state')
  );
}

/** Navigate to a path programmatically. @see https://www.manicjs.tech/docs/api/router/navigate#function-signature */
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
  const [ResolvedComponent, setResolvedComponent] = useState<ComponentType>(
    () => errorPageCache.get(key) ?? fallback ?? NotFound
  );

  useEffect(() => {
    if (loader && !errorPageCache.has(key)) {
      loadErrorPage(key, loader).then(C => setResolvedComponent(() => C));
    }
  }, [key, loader]);

  return ResolvedComponent;
}

class ErrorBoundary extends Component<
  {
    fallback: ReactNode;
    children: ReactNode;
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

/** Client-side router with file-based routing, view transitions, and error boundaries. @see https://www.manicjs.tech/docs/api/router/router#behavior-framework-context */
export function Router({
  routes: manualRoutes,
}: {
  routes?: Record<string, any>;
}): ReactElement {
  const [errorDetails, setErrorDetails] = useState<Error | null>(null);
  const [resolvedDevRoutes, setResolvedDevRoutes] = useState<
    { path: string; file: string; componentName: string }[] | undefined
  >(undefined);
  const isNavigating = useRef(false);
  const abortController = useRef<AbortController | null>(null);
  const activeTransition = useRef<ReturnType<
    typeof document.startViewTransition
  > | null>(null);

  const rawRoutes: Record<string, any> =
    manualRoutes ??
    (typeof window !== 'undefined' ? (window.__MANIC_ROUTES__ ?? {}) : {});

  const initialSsrState = useMemo(
    () => getInitialSsrState(rawRoutes),
    [rawRoutes]
  );

  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(
    () => initialSsrState.component
  );
  const [routeParams, setRouteParams] = useState<Record<string, string>>(
    () => initialSsrState.params
  );
  const [loaderData, setLoaderData] = useState<any>(
    () => initialSsrState.loaderData
  );

  const errorPages =
    typeof window !== 'undefined' ? window.__MANIC_ERROR_PAGES__ : undefined;

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    Promise.all(
      Object.entries(rawRoutes).map(async ([p, entry]) => {
        const normalized = p || '/';
        const loader = typeof entry === 'function' ? entry : entry.import;
        // Extract file path from the loader function source
        const src = loader.toString();
        const match = src.match(/import\(["']([^"']+)["']\)/);
        const file = match
          ? match[1].replace(/^\.\//, 'app/')
          : (() => {
              const filePart =
                normalized === '/'
                  ? 'index'
                  : normalized
                      .replace(/^\//, '')
                      .replace(/:\.\.\.([^/]+)/g, '[...$1]')
                      .replace(/:([^/]+)/g, '[$1]');
              return `app/routes/${filePart}.tsx`;
            })();
        let componentName = '';
        try {
          componentName = (await loader()).default?.name ?? '';
        } catch {}
        return { path: normalized, file, componentName };
      })
    ).then(setResolvedDevRoutes);
  }, []);

  const NotFoundPage = useErrorPage('notFound', errorPages?.notFound, NotFound);
  const ErrorPage = useErrorPage(
    'error',
    errorPages?.error,
    process.env.NODE_ENV === 'production' ? ServerError : ErrorOverlay
  );

  // Compile routes into a registry exactly once
  const registry = useMemo(() => {
    const defs = Object.entries(rawRoutes).map(([path, entry]) => ({
      path: path || '/',
      component: null,
      loader: typeof entry === 'function' ? entry : entry.import,
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
          !replace &&
          !activeTransition.current;

        if (shouldAnimate) {
          try {
            const transition = document.startViewTransition!(() => {
              flushSync(updateState);
            });
            activeTransition.current = transition;
            // Some browsers reject transition promises for benign abort states.
            // Suppress only the known noisy InvalidStateError and keep others visible.
            transition.ready.catch(err => {
              if (!isBenignTransitionAbort(err)) {
                console.warn('[manic] view transition ready failed:', err);
              }
            });
            transition.updateCallbackDone.catch(err => {
              if (!isBenignTransitionAbort(err)) {
                console.warn('[manic] view transition update failed:', err);
              }
            });
            transition.finished
              .catch(err => {
                if (!isBenignTransitionAbort(err)) {
                  console.warn('[manic] view transition finished failed:', err);
                }
              })
              .finally(() => {
                activeTransition.current = null;
              });
          } catch {
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

    // Read SSR-injected loader data for hydration
    if (componentCache.size === 0) {
      const ssrData = getSsrLoaderData();
      if (ssrData) {
        setLoaderData(ssrData);
      }
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

  const contextValue = {
    path: currentPath,
    navigate,
    params: routeParams,
    loaderData,
  };

  if (errorDetails) {
    return createElement(
      RouterContext.Provider,
      { value: contextValue },
      createElement(ErrorPage as any, { error: errorDetails })
    );
  }

  if (!LoadedComponent) {
    const match = registry.match(currentPath);
    if (!match) {
      const devRoutes = resolvedDevRoutes;
      return createElement(
        RouterContext.Provider,
        { value: contextValue },
        createElement(NotFoundPage, { routes: devRoutes, currentPath } as any)
      );
    }
    // Show nothing while loading initial route (suspense-like)
    return null;
  }

  return createElement(
    RouterContext.Provider,
    { value: contextValue },
    createElement(
      ErrorBoundary,
      {
        fallback: createElement(ErrorPage as any, { error: errorDetails }),
        onError: err => setErrorDetails(err),
      },
      createElement(LoadedComponent, { loaderData })
    )
  );
}
