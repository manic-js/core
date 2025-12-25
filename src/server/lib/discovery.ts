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
  const glob = new Bun.Glob("**/*.tsx");

  for await (const file of glob.scan({ cwd: routesDir })) {
    if (file.startsWith("~")) continue;

    const filePath = `${routesDir}/${file}`;

    let urlPath = file
      .replace(/\.tsx$/, "")
      .replace(/\/index$/, "")
      .replace(/^index$/, "");

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

export async function generateRoutesManifest(
  routesDir: string = "app/routes"
): Promise<string> {
  const routes = await discoverRoutes(routesDir);

  const routeEntries = routes
    .map((r) => {
      const importPath = `./${r.filePath.replace("app/", "")}`;
      return `  "${r.path}": () => import("${importPath}"),`;
    })
    .join("\n");

  return `export const routes = {
${routeEntries}
};
`;
}

export async function writeRoutesManifest(
  outPath: string = "app/~routes.generated.ts"
): Promise<string> {
  const content = await generateRoutesManifest();
  await Bun.write(outPath, content);
  return content;
}

export async function watchRoutes(
  routesDir: string,
  onChange: (filename: string, duration: number) => void
): Promise<void> {
  const watcher = watch(routesDir, { recursive: true });

  for await (const event of watcher) {
    if (event.filename?.endsWith(".tsx") && !event.filename.startsWith("~")) {
      const startTime = performance.now();
      await writeRoutesManifest();
      const duration = Math.round(performance.now() - startTime);
      const routeName = event.filename
        .replace(/\.tsx$/, "")
        .replace(/\/index$/, "")
        .replace(/^index$/, "/");

      onChange(routeName || "/", duration);
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
