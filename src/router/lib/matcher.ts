import type { RouteDef } from "./types";

interface RouteMatch {
  path: string;
  component: RouteDef["component"];
  params: Record<string, string>;
}

export function matchRoute(
  currentPath: string,
  routes: RouteDef[]
): RouteMatch | null {
  for (const route of routes) {
    const paramNames: string[] = [];

    const regexPath = route.path
      .replace(/:([^/]+)/g, (_, key) => {
        paramNames.push(key);
        return "([^/]+)";
      })
      .replace(/\[([^\]]+)\]/g, (_, key) => {
        paramNames.push(key);
        return "([^/]+)";
      });

    const match = currentPath.match(new RegExp(`^${regexPath}$`));

    if (match) {
      const params = match
        .slice(1)
        .reduce<Record<string, string>>((acc, val, i) => {
          acc[paramNames[i]!] = val;
          return acc;
        }, {});

      return { path: route.path, component: route.component, params };
    }
  }

  return null;
}
