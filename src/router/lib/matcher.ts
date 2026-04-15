import type { RouteDef } from "./types";

interface RouteMatch {
  path: string;
  component: RouteDef["component"];
  params: Record<string, string>;
}

interface CompiledRoute {
  regex: RegExp;
  paramNames: string[];
  score: number;
}

const compiledCache = new Map<string, CompiledRoute>();

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
  const cached = compiledCache.get(path);
  if (cached) return cached;

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

  const compiled: CompiledRoute = {
    regex: new RegExp(`^${regexPath}$`),
    paramNames,
    score: scoreRoute(path),
  };

  compiledCache.set(path, compiled);
  return compiled;
}

/**
 * Match a URL path against route definitions, returning the best match
 * 
 * Routes are scored and sorted automatically — static segments beat dynamic,
 * dynamic beats catch-all. Trailing slashes are normalized.
 */
export function matchRoute(
  currentPath: string,
  routes: RouteDef[]
): RouteMatch | null {
  const normalized = normalizePath(currentPath);

  const sorted = [...routes].sort((a, b) => {
    const sa = compileRoute(a.path).score;
    const sb = compileRoute(b.path).score;
    if (sb !== sa) return sb - sa;
    // Tie-break: longer path first
    return b.path.length - a.path.length;
  });

  for (const route of sorted) {
    const compiled = compileRoute(route.path);
    const match = normalized.match(compiled.regex);

    if (match) {
      const params = match
        .slice(1)
        .reduce<Record<string, string>>((acc, val, i) => {
          acc[compiled.paramNames[i]!] = val;
          return acc;
        }, {});

      return { path: route.path, component: route.component, params };
    }
  }

  return null;
}
