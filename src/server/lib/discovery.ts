import { watch } from "fs/promises";
import { cyan, dim, yellow } from "colorette";

export interface RouteInfo {
  path: string;
  filePath: string;
}

export async function discoverRoutes(
  routesDir: string = "app/routes"
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const glob = new Bun.Glob("**/*.{tsx,ts}");

  for await (const file of glob.scan({ cwd: routesDir })) {
    if (file.startsWith("~")) continue;

    const filePath = `${routesDir}/${file}`;

    let urlPath = file
      .replace(/\.tsx?$/, "")
      .replace(/\/index$/, "")
      .replace(/^index$/, "");

    // Strip route groups: (groupName)/ → nothing
    urlPath = urlPath.replace(/\(([^)]+)\)\//g, "");
    // Handle route group as the only segment
    urlPath = urlPath.replace(/\(([^)]+)\)$/, "");

    // Convert catch-all [...slug] to :...slug
    urlPath = urlPath.replace(/\[\.\.\.([^\]]+)\]/g, ":...$1");
    // Convert dynamic [param] to :param
    urlPath = urlPath.replace(/\[([^\]]+)\]/g, ":$1");

    urlPath = urlPath === "" ? "/" : `/${urlPath}`;

    routes.push({ path: urlPath, filePath });
  }

  return routes;
}

export async function discoverFavicon(
  assetsDir: string = "assets"
): Promise<string | null> {
  const priorities = [
    "favicon.svg",
    "favicon.png",
    "favicon.ico",
    "icon.svg",
    "icon.png",
    "icon.ico",
  ];

  for (const filename of priorities) {
    const file = Bun.file(`${assetsDir}/${filename}`);
    if (await file.exists()) {
      return `/assets/${filename}`;
    }
  }

  return null;
}

export interface ErrorPages {
  notFound?: string;
  error?: string;
}

export async function discoverErrorPages(
  routesDir: string = "app/routes"
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

export async function generateRoutesManifest(
  routesDir: string = "app/routes"
): Promise<string> {
  const routes = await discoverRoutes(routesDir);
  const errorPages = await discoverErrorPages(routesDir);

  const routeEntries = routes
    .map((r) => {
      const importPath = `./${r.filePath.replace("app/", "")}`;
      return `  "${r.path}": () => import("${importPath}"),`;
    })
    .join("\n");

  return `export const routes = {
${routeEntries}
};

export const notFoundPage = ${errorPages.notFound ? '() => import("./routes/~404.tsx")' : "undefined"};
export const errorPage = ${errorPages.error ? '() => import("./routes/~500.tsx")' : "undefined"};
`;
}

export function generateSitemap(
  routes: RouteInfo[],
  config: { hostname: string; changefreq?: string; priority?: number; exclude?: string[] }
): string {
  const hostname = config.hostname.replace(/\/$/, "");
  const changefreq = config.changefreq ?? "weekly";
  const priority = config.priority ?? 0.8;
  const exclude = config.exclude ?? [];

  const urls = routes
    .filter((r) => {
      if (r.path.includes(":")) return false;
      if (exclude.includes(r.path)) return false;
      return true;
    })
    .map((r) => {
      const loc = r.path === "/" ? hostname + "/" : hostname + r.path;
      return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

async function touchManicEntry(
  outPath: string = "app/~routes.generated.ts"
): Promise<void> {
  // Derive ~manic.ts path from the output path's directory parent
  const appDir = outPath.substring(0, outPath.lastIndexOf("/"));
  const manicPath = `${appDir}/../~manic.ts`;
  const file = Bun.file(manicPath);
  if (await file.exists()) {
    const content = await file.text();
    // Update or append a timestamp comment to trigger bun --watch
    const timestampComment = `// ~manic-touch: ${Date.now()}`;
    const updated = content.replace(
      /\n?\/\/ ~manic-touch: \d+$/,
      ""
    );
    await Bun.write(manicPath, updated + "\n" + timestampComment);
  }
}

export async function writeRoutesManifest(
  outPath: string = "app/~routes.generated.ts"
): Promise<string> {
  const content = await generateRoutesManifest();
  await Bun.write(outPath, content);
  await touchManicEntry(outPath);
  return content;
}

export async function watchRoutes(
  routesDir: string,
  onChange: (filename: string, duration: number) => void
): Promise<void> {
  const watcher = watch(routesDir, { recursive: true });
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  for await (const event of watcher) {
    if (
      event.filename &&
      /\.tsx?$/.test(event.filename) &&
      !event.filename.startsWith("~")
    ) {
      const filename = event.filename;

      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        const startTime = performance.now();
        await writeRoutesManifest();
        const duration = Math.round(performance.now() - startTime);
        const routeName = filename
          .replace(/\.tsx?$/, "")
          .replace(/\/index$/, "")
          .replace(/^index$/, "/");

        onChange(routeName || "/", duration);
      }, 50);
    }
  }
}

export function logRouteChange(filename: string, durationMs: number): void {
  const route = filename.startsWith("/") ? filename : `/${filename}`;
  console.log(
    `${yellow("[Manic]")} ${dim("Route updated:")} ${cyan(route)} ${dim(
      `(${durationMs}ms)`
    )}`
  );
}
