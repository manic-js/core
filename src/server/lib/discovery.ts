import { watch } from 'fs/promises';
import { cyan, dim, yellow } from 'colorette';

/**
 * Information about a discovered route
 * @interface RouteInfo
 */
export interface RouteInfo {
  /** URL path pattern (e.g., "/users/:id") */
  path: string;
  /** Relative file path to the route component (e.g., "app/routes/users/[id].tsx") */
  filePath: string;
}

/**
 * Discovers all routes in the app/routes directory.
 *
 * Scans for .tsx and .ts files, excluding files prefixed with ~.
 * Converts file-based routing patterns to URL paths:
 * - index.tsx -> /
 * - about.tsx -> /about
 * - users/index.tsx -> /users
 * - users/[id].tsx -> /users/:id
 * - [...slug].tsx -> /:...slug
 *
 * @param routesDir - Directory to scan for routes (default: "app/routes")
 * @returns Array of route information with path and filePath
 *
 * @example
 * const routes = await discoverRoutes();
 * // Returns [{ path: "/", filePath: "app/routes/index.tsx" }, ...]
 */
export async function discoverRoutes(
  routesDir: string = 'app/routes'
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const glob = new Bun.Glob('**/*.{tsx,ts}');

  for await (const file of glob.scan({ cwd: routesDir })) {
    if (file.startsWith('~')) continue;

    const filePath = `${routesDir}/${file}`;

    let urlPath = file
      .replace(/\.tsx?$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '');

    // Strip route groups: (groupName)/ → nothing
    urlPath = urlPath.replace(/\(([^)]+)\)\//g, '');
    // Handle route group as the only segment
    urlPath = urlPath.replace(/\(([^)]+)\)$/, '');

    // Convert catch-all [...slug] to :...slug
    urlPath = urlPath.replace(/\[\.\.\.([^\]]+)\]/g, ':...$1');
    // Convert dynamic [param] to :param
    urlPath = urlPath.replace(/\[([^\]]+)\]/g, ':$1');

    urlPath = urlPath === '' ? '/' : `/${urlPath}`;

    routes.push({ path: urlPath, filePath });
  }

  return routes;
}

/**
 * Discovers a favicon in the assets directory.
 *
 * Checks for common favicon filenames in priority order:
 * favicon.svg, favicon.png, favicon.ico, icon.svg, icon.png, icon.ico
 *
 * @param assetsDir - Directory to scan for favicons (default: "assets")
 * @returns Path to the favicon file or null if not found
 *
 * @example
 * const favicon = await discoverFavicon();
 * // Returns "/assets/favicon.svg" or null
 */
export async function discoverFavicon(
  assetsDir: string = 'assets'
): Promise<string | null> {
  const priorities = [
    'favicon.svg',
    'favicon.png',
    'favicon.ico',
    'icon.svg',
    'icon.png',
    'icon.ico',
  ];
  // Check all in parallel, pick first hit in priority order
  const results = await Promise.all(
    priorities.map(f => Bun.file(`${assetsDir}/${f}`).exists())
  );
  const idx = results.indexOf(true);
  return idx !== -1 ? `/assets/${priorities[idx]}` : null;
}

/**
 * Error page configuration
 * @interface ErrorPages
 */
export interface ErrorPages {
  /** File path to the custom 404 page */
  notFound?: string;
  /** File path to the custom 500 error page */
  error?: string;
}

/**
 * Discovers custom error pages in the routes directory.
 *
 * Looks for ~404.tsx and ~500.tsx files for custom error handling.
 *
 * @param routesDir - Directory to scan for error pages (default: "app/routes")
 * @returns ErrorPages object with paths to custom error pages
 *
 * @example
 * const errorPages = await discoverErrorRoutes();
 * // Returns { notFound: "app/routes/~404.tsx" } or {}
 */
export async function discoverErrorPages(
  routesDir: string = 'app/routes'
): Promise<ErrorPages> {
  const result: ErrorPages = {};

  const notFoundFile = Bun.file(`${routesDir}/~404.tsx`);
  if (await notFoundFile.exists()) {
    result.notFound = `${routesDir}/~404.tsx`;
  }

  const errorFile = Bun.file(`${routesDir}/~500.tsx`);
  if (await errorFile.exists()) {
    result.error = `${routesDir}/~500.tsx`;
  }

  return result;
}

/**
 * Generates the routes manifest content for dynamic imports.
 *
 * Creates a TypeScript module that exports route mappings for the client router.
 * Each route is mapped to a lazy import function.
 *
 * @param routesDir - Directory to scan for routes (default: "app/routes")
 * @returns TypeScript content for the routes manifest
 *
 * @example
 * const manifest = await generateRoutesManifest();
 * // Returns "export const routes = {\n  \"/\": () => import(\"./routes/index.tsx\"),\n ...\n};"
 */
export async function generateRoutesManifest(
  routesDir: string = 'app/routes'
): Promise<string> {
  const routes = await discoverRoutes(routesDir);
  const errorPages = await discoverErrorPages(routesDir);

  const routeEntries = routes
    .map(r => {
      const importPath = `./${r.filePath.replace('app/', '')}`;
      return `  "${r.path}": () => import("${importPath}"),`;
    })
    .join('\n');

  return `export const routes = {
${routeEntries}
};

export const notFoundPage = ${errorPages.notFound ? '() => import("./routes/~404.tsx")' : 'undefined'};
export const errorPage = ${errorPages.error ? '() => import("./routes/~500.tsx")' : 'undefined'};
`;
}

/**
 * Generates an XML sitemap from route information.
 *
 * Creates a sitemap.xml compatible with search engines.
 * Excludes dynamic routes (containing :), and respects exclude list.
 *
 * @param routes - Array of route information
 * @param config - Sitemap configuration options
 * @param config.hostname - Base URL for the site (required)
 * @param config.changefreq - How frequently pages change (default: "weekly")
 * @param config.priority - Default priority for URLs (default: 0.8)
 * @param config.exclude - Array of paths to exclude from sitemap
 * @returns XML sitemap string
 *
 * @example
 * const sitemap = generateSitemap(routes, { hostname: "https://example.com" });
 * // Returns full sitemap.xml content
 */
export function generateSitemap(
  routes: RouteInfo[],
  config: {
    hostname: string;
    changefreq?: string;
    priority?: number;
    exclude?: string[];
  }
): string {
  const hostname = config.hostname.replace(/\/$/, '');
  const changefreq = config.changefreq ?? 'weekly';
  const priority = config.priority ?? 0.8;
  const exclude = config.exclude ?? [];

  const urls = routes
    .filter(r => {
      if (r.path.includes(':')) return false;
      if (exclude.includes(r.path)) return false;
      return true;
    })
    .map(r => {
      const loc = r.path === '/' ? hostname + '/' : hostname + r.path;
      return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

async function touchManicEntry(
  outPath: string = 'app/~routes.generated.ts'
): Promise<void> {
  // Derive ~manic.ts path from the output path's directory parent
  const appDir = outPath.substring(0, outPath.lastIndexOf('/'));
  const manicPath = `${appDir}/../~manic.ts`;
  const file = Bun.file(manicPath);
  if (await file.exists()) {
    const content = await file.text();
    // Update or append a timestamp comment to trigger bun --watch
    const timestampComment = `// ~manic-touch: ${Date.now()}`;
    const updated = content.replace(/\n?\/\/ ~manic-touch: \d+$/, '');
    await Bun.write(manicPath, updated + '\n' + timestampComment);
  }
}

/**
 * Writes the routes manifest to a file.
 *
 * Generates and writes the routes manifest to ~routes.generated.ts.
 * Optionally touches ~manic.ts to trigger a server restart.
 *
 * @param outPath - Output file path (default: "app/~routes.generated.ts")
 * @param touch - Whether to touch ~manic.ts to trigger restart (default: false)
 * @returns The generated manifest content
 *
 * @example
 * await writeRoutesManifest();
 * // Writes to app/~routes.generated.ts
 *
 * @example
 * await writeRoutesManifest("app/routes.ts", true);
 * // Writes and touches ~manic.ts
 */
export async function writeRoutesManifest(
  outPath: string = 'app/~routes.generated.ts',
  touch: boolean = false
): Promise<string> {
  const content = await generateRoutesManifest();
  await Bun.write(outPath, content);
  if (touch) await touchManicEntry(outPath);
  return content;
}

/**
 * Watches the routes directory for changes and triggers callbacks.
 *
 * Monitors app/routes for file additions, modifications, and deletions.
 * Debounces changes and calls the onChange callback with the affected route.
 *
 * @param routesDir - Directory to watch for changes
 * @param onChange - Callback fired when routes change
 * @param onChange.filename - The route/file that changed
 * @param onChange.duration - Time taken to regenerate manifest
 *
 * @example
 * await watchRoutes("app/routes", (filename, duration) => {
 *   console.log(`Route ${filename} changed in ${duration}ms`);
 * });
 */
export async function watchRoutes(
  routesDir: string,
  onChange: (filename?: string, duration?: number) => void
): Promise<void> {
  const watcher = watch(routesDir, { recursive: true });
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  for await (const event of watcher) {
    if (
      event.filename &&
      /\.tsx?$/.test(event.filename) &&
      !event.filename.startsWith('~')
    ) {
      const filename = event.filename;
      const isStructureChange = event.eventType === 'rename';

      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        if (isStructureChange) {
          const startTime = performance.now();
          // Only trigger server restart (touch: true) if a file was added/deleted
          await writeRoutesManifest('app/~routes.generated.ts', true);
          const duration = Math.round(performance.now() - startTime);
          const routeName = filename
            .replace(/\.tsx?$/, '')
            .replace(/\/index$/, '')
            .replace(/^index$/, '/');

          onChange(routeName || '/', duration);
        }
      }, 50);
    }
  }
}

export function logRouteChange(filename: string, durationMs: number): void {
  const route = filename.startsWith('/') ? filename : `/${filename}`;
  console.log(
    `${yellow('[Manic]')} ${dim('Route updated:')} ${cyan(route)} ${dim(
      `(${durationMs}ms)`
    )}`
  );
}
