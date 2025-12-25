import {
  createElement,
  useEffect,
  useState,
  useRef,
  type ComponentType,
} from "react";
import { flushSync } from "react-dom";
import { NotFound } from "../../components/NotFound";
import { RouterContext } from "./context";
import { matchRoute } from "./matcher";
import type { RouteDef } from "./types";

type LazyLoader = () => Promise<{ default: ComponentType }>;

declare global {
  interface Window {
    __MANIC_ROUTES__?: Record<string, LazyLoader>;
    __MANIC_ROUTER_UPDATE__?: (path: string, component: ComponentType, params: Record<string, string>) => void;
  }
}

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

async function loadComponent(path: string, loader: LazyLoader): Promise<ComponentType> {
  if (!componentCache.has(path)) {
    const module = await loader();
    componentCache.set(path, module.default);
  }
  return componentCache.get(path)!;
}

// Preload a route (called on hover)
export function preloadRoute(path: string): void {
  if (typeof window === "undefined" || !window.__MANIC_ROUTES__) return;
  const loader = window.__MANIC_ROUTES__[path];
  if (loader && !componentCache.has(path)) {
    loader().then((mod) => componentCache.set(path, mod.default));
  }
}

let viewTransitionsEnabled = true;

export function setViewTransitions(enabled: boolean): void {
  viewTransitionsEnabled = enabled;
}

// Navigate with component preloading and proper view transitions
export async function navigate(to: string): Promise<void> {
  if (typeof window === "undefined") return;

  const routes = window.__MANIC_ROUTES__ ?? {};
  const routeDefs = Object.entries(routes).map(([path, loader]) => ({
    path: path || "/",
    component: null as any,
    loader,
  }));

  // Find matching route
  const match = matchRoute(to, routeDefs as any);
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

  if (
    viewTransitionsEnabled &&
    "startViewTransition" in document &&
    typeof (document as any).startViewTransition === "function"
  ) {
    (document as any).startViewTransition(() => {
      flushSync(performUpdate);
    });
  } else {
    performUpdate();
  }
}

export function Router({
  routes: manualRoutes,
}: {
  routes?: Record<string, LazyLoader>;
}): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(null);
  const [routeParams, setRouteParams] = useState<Record<string, string>>({});
  const isInitialMount = useRef(true);

  const rawRoutes: Record<string, LazyLoader> =
    manualRoutes ??
    (typeof window !== "undefined" ? window.__MANIC_ROUTES__ ?? {} : {});

  // Build route definitions
  const routeDefs: RouteDef[] = Object.entries(rawRoutes)
    .map(([path, loader]) => ({
      path: path || "/",
      component: loader as unknown as ComponentType,
      loader,
    }))
    .sort((a, b) => {
      const aIsDynamic = a.path.includes(":") || a.path.includes("[");
      const bIsDynamic = b.path.includes(":") || b.path.includes("[");
      if (aIsDynamic && !bIsDynamic) return 1;
      if (!aIsDynamic && bIsDynamic) return -1;
      return b.path.length - a.path.length;
    });

  // Register the update function for navigate() to use
  useEffect(() => {
    window.__MANIC_ROUTER_UPDATE__ = (path: string, component: ComponentType, params: Record<string, string>) => {
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

      // Load component for back/forward navigation
      const match = matchRoute(path, routeDefs);
      if (match) {
        const matchedRoute = routeDefs.find((r) => r.path === match.path);
        const loader = (matchedRoute as any)?.loader as LazyLoader | undefined;
        if (loader) {
          loadComponent(match.path, loader).then((Component) => {
            setLoadedComponent(() => Component);
            setRouteParams(match.params);
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
        const loader = (matchedRoute as any)?.loader as LazyLoader | undefined;
        if (loader) {
          loadComponent(match.path, loader).then((Component) => {
            setLoadedComponent(() => Component);
            setRouteParams(match.params);
          });
        }
      }
    }
  }, []);

  if (!LoadedComponent) {
    const match = matchRoute(currentPath, routeDefs);
    if (!match) {
      return createElement(
        RouterContext.Provider,
        { value: { path: currentPath, navigate, params: {} } },
        createElement(NotFound, null)
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
