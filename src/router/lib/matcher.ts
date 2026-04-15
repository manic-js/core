import type { RouteDef } from "./types";

interface RouteMatch {
  path: string;
  component: RouteDef["component"];
  params: Record<string, string>;
}

interface CompiledRoute {
  path: string;
  regex: RegExp;
  paramNames: string[];
  score: number;
}

function normalizePath(path: string): string {
  if (path === "/") return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function scoreRoute(path: string): number {
  const segments = path.split("/").filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith(":...") || segment.startsWith("[...")) {
      // Catch-all: lowest priority
      score += 1;
    } else if (segment.startsWith(":") || segment.startsWith("[")) {
      // Dynamic segment
      score += 10;
    } else {
      // Static segment: highest priority
      score += 100;
    }
  }

  return score;
}

function compileRoute(path: string): CompiledRoute {
  const paramNames: string[] = [];

  const regexPath = path
    // Catch-all: :...param
    .replace(/:\.\.\.([^/]+)/g, (_, key) => {
      paramNames.push(key);
      return "(.+)";
    })
    // Catch-all: [...param]
    .replace(/\[\.\.\.([^\]]+)\]/g, (_, key) => {
      paramNames.push(key);
      return "(.+)";
    })
    // Dynamic: :param
    .replace(/:([^/]+)/g, (_, key) => {
      paramNames.push(key);
      return "([^/]+)";
    })
    // Dynamic: [param]
    .replace(/\[([^\]]+)\]/g, (_, key) => {
      paramNames.push(key);
      return "([^/]+)";
    });

  return {
    path,
    regex: new RegExp(`^${regexPath}$`),
    paramNames,
    score: scoreRoute(path),
  };
}

/**
 * RouteRegistry holds compiled and pre-sorted routes.
 * It compiles routes exactly once to eliminate repeated regex creation and O(n log n) sorting.
 */
export class RouteRegistry {
  private compiledRoutes: CompiledRoute[] = [];
  private definitions: Map<string, RouteDef> = new Map();
  private isSorted = false;

  constructor(routes: RouteDef[] = []) {
    for (const def of routes) {
      this.register(def);
    }
  }

  register(def: RouteDef) {
    if (!this.definitions.has(def.path)) {
      this.definitions.set(def.path, def);
      this.compiledRoutes.push(compileRoute(def.path));
      this.isSorted = false;
    }
  }

  private sort() {
    if (this.isSorted) return;
    this.compiledRoutes.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: longer path first
      return b.path.length - a.path.length;
    });
    this.isSorted = true;
  }

  match(currentPath: string): RouteMatch | null {
    if (!this.isSorted) this.sort();
    
    const normalized = normalizePath(currentPath);

    for (const route of this.compiledRoutes) {
      const match = normalized.match(route.regex);

      if (match) {
        const params = match
          .slice(1)
          .reduce<Record<string, string>>((acc, val, i) => {
            acc[route.paramNames[i]!] = val;
            return acc;
          }, {});

        const def = this.definitions.get(route.path);
        
        return { 
          path: route.path, 
          component: def?.component || null, 
          params 
        };
      }
    }

    return null;
  }
}

/**
 * Match a URL path against route definitions
 * This is kept for backwards compatibility internally if anything used it.
 */
export function matchRoute(
  currentPath: string,
  routes: RouteDef[]
): RouteMatch | null {
  const registry = new RouteRegistry(routes);
  return registry.match(currentPath);
}
