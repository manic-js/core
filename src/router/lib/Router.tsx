import {
  createElement,
  useEffect,
  useState,
  useMemo,
  Suspense,
  lazy,
  type ComponentType,
} from "react";
import { NotFound } from "../../components/NotFound";
import { RouterContext } from "./context";
import { matchRoute } from "./matcher";
import { navigate } from "./Link";
import type { RouteDef } from "./types";

interface RouteModule {
  default: ComponentType;
}

type RouteLoader = () => Promise<RouteModule>;

declare global {
  interface Window {
    __MANIC_ROUTES__?: Record<string, RouteLoader | RouteModule>;
  }
}

function useQueryParams(): URLSearchParams {
  const [params, setParams] = useState(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      )
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

const lazyCache = new Map<string, ComponentType>();

export function Router({
  routes: manualRoutes,
  loading: LoadingComponent,
}: {
  routes?: Record<string, RouteLoader | RouteModule>;
  loading?: ComponentType;
}): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  useEffect(() => {
    const handlePopState = (): void => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const rawRoutes = useMemo(() => {
    return (
      manualRoutes ??
      (typeof window !== "undefined" ? window.__MANIC_ROUTES__ ?? {} : {})
    );
  }, [manualRoutes]);

  const routeDefs: RouteDef[] = useMemo(() => {
    return Object.entries(rawRoutes)
      .map(([path, loader]) => {
        let Component: ComponentType;

        if (typeof loader === "function") {
          const pathKey = path || "/";
          if (!lazyCache.has(pathKey)) {
            lazyCache.set(pathKey, lazy(loader as RouteLoader));
          }
          Component = lazyCache.get(pathKey)!;
        } else {
          Component = (loader as RouteModule).default;
        }

        return {
          path: path || "/",
          component: Component,
        };
      })
      .sort((a, b) => {
        const aIsDynamic = a.path.includes(":") || a.path.includes("[");
        const bIsDynamic = b.path.includes(":") || b.path.includes("[");
        if (aIsDynamic && !bIsDynamic) return 1;
        if (!aIsDynamic && bIsDynamic) return -1;
        return b.path.length - a.path.length;
      });
  }, [rawRoutes]);

  const match = matchRoute(currentPath, routeDefs);
  const Component = match?.component;
  const params = match?.params ?? {};

  const content = useMemo(() => {
    if (!Component) {
      return createElement(NotFound);
    }

    return createElement(
      Suspense,
      { fallback: LoadingComponent ? createElement(LoadingComponent) : null },
      createElement(Component, null)
    );
  }, [Component, LoadingComponent]);

  return createElement(
    RouterContext.Provider,
    { value: { path: currentPath, navigate, params } },
    content
  );
}
