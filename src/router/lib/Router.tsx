import { createElement, useEffect, useState, type ComponentType } from "react";
import { NotFound } from "../../components/NotFound";
import { RouterContext } from "./context";
import { matchRoute } from "./matcher";
import { navigate } from "./Link";
import type { RouteDef } from "./types";

declare global {
  interface Window {
    __MANIC_ROUTES__?: Record<string, { default: ComponentType }>;
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

interface RouteModule {
  default: ComponentType;
}

export function Router({
  routes: manualRoutes,
}: {
  routes?: Record<string, RouteModule>;
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

  const rawRoutes: Record<string, RouteModule> =
    manualRoutes ??
    (typeof window !== "undefined" ? window.__MANIC_ROUTES__ ?? {} : {});

  const routeDefs: RouteDef[] = Object.entries(rawRoutes)
    .map(([path, mod]) => ({
      path: path || "/",
      component: mod.default,
    }))
    .sort((a, b) => {
      const aIsDynamic = a.path.includes(":") || a.path.includes("[");
      const bIsDynamic = b.path.includes(":") || b.path.includes("[");
      if (aIsDynamic && !bIsDynamic) return 1;
      if (!aIsDynamic && bIsDynamic) return -1;
      return b.path.length - a.path.length;
    });

  const match = matchRoute(currentPath, routeDefs);
  const Component = match?.component;
  const params = match?.params ?? {};

  if (!Component) {
    return createElement(
      RouterContext.Provider,
      { value: { path: currentPath, navigate, params: {} } },
      createElement(NotFound, null)
    );
  }

  return createElement(
    RouterContext.Provider,
    { value: { path: currentPath, navigate, params } },
    createElement(Component, null)
  );
}
