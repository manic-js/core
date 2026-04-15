import {
  createElement,
  useEffect,
  useState,
  useRef,
  type ComponentType,
} from "react";
import { flushSync } from "react-dom";
import { NotFound } from "../../components/NotFound";
import { ServerError } from "../../components/ServerError";
import { RouterContext } from "./context";
import { matchRoute } from "./matcher";
import type { RouteDef } from "./types";

type LazyLoader = () => Promise<{ default: ComponentType }>;

declare global {
  interface Window {
    __MANIC_ROUTES__?: Record<string, LazyLoader>;
    __MANIC_ERROR_PAGES__?: {
      notFound?: LazyLoader;
      error?: LazyLoader;
    };
    __MANIC_ROUTER_UPDATE__?: (
      path: string,
      component: ComponentType,
      params: Record<string, string>
    ) => void;
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
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()
  );

  useEffect(() => {
    const update = (): void =>
      setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
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
  loader: LazyLoader
): Promise<ComponentType> {
  if (!componentCache.has(path)) {
    const module = await loader();
    componentCache.set(path, module.default);
  }
  return componentCache.get(path)!;
}

/** Preload a route's component module — called on link hover for instant navigation */
export function preloadRoute(path: string): void {
  if (typeof window === "undefined" || !window.__MANIC_ROUTES__) return;
  const loader = window.__MANIC_ROUTES__[path];
  if (loader && !componentCache.has(path)) {
    loader().then((mod) => componentCache.set(path, mod.default));
  }
}

let viewTransitionsEnabled = true;

/** Enable or disable View Transitions API for client-side navigation */
export function setViewTransitions(enabled: boolean): void {
  viewTransitionsEnabled = enabled;
}

function buildRouteDefs(routes: Record<string, LazyLoader>): RouteDef[] {
  return Object.entries(routes).map(([path, loader]) => ({
    path: path || "/",
    component: null,
    loader,
  }));
}

/** Navigate to a path with component preloading and view transition support */
export async function navigate(to: string): Promise<void> {
  if (typeof window === "undefined") return;

  const routes = window.__MANIC_ROUTES__ ?? {};
  const routeDefs = buildRouteDefs(routes);

  // Find matching route
  const match = matchRoute(to, routeDefs);
  if (!match) {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }

  const matchedRoute = routeDefs.find((r) => r.path === match.path);
  const loader = matchedRoute?.loader;

  if (!loader) {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }

  // Load the component BEFORE transitioning
  const Component = await loadComponent(match.path, loader);

  const performUpdate = () => {
    window.history.pushState({}, "", to);
    // Use the router's update function to sync update
    if (window.__MANIC_ROUTER_UPDATE__) {
      window.__MANIC_ROUTER_UPDATE__(to, Component, match.params);
    }
  };

  if (viewTransitionsEnabled && document.startViewTransition) {
    document.startViewTransition(() => {
      flushSync(performUpdate);
    });
  } else {
    performUpdate();
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
      loadErrorPage(key, loader).then((C) => setComponent(() => C));
    }
  }, [key, loader]);

  return Component;
}

/** Client-side router with file-based routing, view transitions, and error boundaries */
export function Router({
  routes: manualRoutes,
}: {
  routes?: Record<string, LazyLoader>;
}): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(
    null
  );
  const [routeParams, setRouteParams] = useState<Record<string, string>>({});
  const [hasError, setHasError] = useState(false);
  const isInitialMount = useRef(true);

  const rawRoutes: Record<string, LazyLoader> =
    manualRoutes ??
    (typeof window !== "undefined" ? window.__MANIC_ROUTES__ ?? {} : {});

  const errorPages =
    typeof window !== "undefined" ? window.__MANIC_ERROR_PAGES__ : undefined;

  const NotFoundPage = useErrorPage("notFound", errorPages?.notFound, NotFound);
  const ErrorPage = useErrorPage("error", errorPages?.error, ServerError);

  // Build route definitions — sorting is handled inside matchRoute
  const routeDefs = buildRouteDefs(rawRoutes);

  // Register the update function for navigate() to use
  useEffect(() => {
    window.__MANIC_ROUTER_UPDATE__ = (
      path: string,
      component: ComponentType,
      params: Record<string, string>
    ) => {
      setHasError(false);
      setCurrentPath(path);
      setLoadedComponent(() => component);
      setRouteParams(params);
    };

    return () => {
      delete window.__MANIC_ROUTER_UPDATE__;
    };
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (): void => {
      const path = window.location.pathname;
      setCurrentPath(path);
      setHasError(false);

      // Load component for back/forward navigation
      const match = matchRoute(path, routeDefs);
      if (match) {
        const matchedRoute = routeDefs.find((r) => r.path === match.path);
        const loader = matchedRoute?.loader;
        if (loader) {
          loadComponent(match.path, loader)
            .then((Component) => {
              setLoadedComponent(() => Component);
              setRouteParams(match.params);
            })
            .catch(() => {
              setHasError(true);
            });
        }
      } else {
        setLoadedComponent(null);
        setRouteParams({});
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [routeDefs]);

  // Initial load
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const match = matchRoute(currentPath, routeDefs);
      if (match) {
        const matchedRoute = routeDefs.find((r) => r.path === match.path);
        const loader = matchedRoute?.loader;
        if (loader) {
          loadComponent(match.path, loader)
            .then((Component) => {
              setLoadedComponent(() => Component);
              setRouteParams(match.params);
            })
            .catch(() => {
              setHasError(true);
            });
        }
      }
    }
  }, []);

  if (hasError) {
    return createElement(
      RouterContext.Provider,
      { value: { path: currentPath, navigate, params: {} } },
      createElement(ErrorPage, null)
    );
  }

  if (!LoadedComponent) {
    const match = matchRoute(currentPath, routeDefs);
    if (!match) {
      return createElement(
        RouterContext.Provider,
        { value: { path: currentPath, navigate, params: {} } },
        createElement(NotFoundPage, null)
      );
    }
    // Show nothing while loading initial route
    return createElement(
      RouterContext.Provider,
      { value: { path: currentPath, navigate, params: {} } },
      null
    );
  }

  return createElement(
    RouterContext.Provider,
    { value: { path: currentPath, navigate, params: routeParams } },
    createElement(LoadedComponent, null)
  );
}
