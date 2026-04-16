import { red, green, bold, cyan, yellow, gray, dim } from "colorette";
import { discoverRoutes, watchRoutes, generateSitemap } from "./lib/discovery";
import { loadConfig, type ManicConfig } from "../config/index";
import { join } from "path";

export async function createManicServer(options: {
  html: any; // string | HTMLBundle | (() => string)
  config?: ManicConfig;
  routes?: any[];
  envKeys?: string[];
  startTime?: number;
}) {
  const config = options.config || await loadConfig();
  const routes = options.routes || await discoverRoutes();
  const envKeys = options.envKeys || [];
  const startTime = options.startTime || performance.now();
  const prod = process.env.NODE_ENV === "production";
  const port = config.server?.port ?? 6070;
  const hostname = "0.0.0.0";
  const dist = config.build?.outdir ?? ".manic";

  // Detect Bun HTMLBundle (has .index property pointing to the HTML file)
  const isHtmlBundle = options.html && typeof options.html === "object" && "index" in options.html;

  const serveHtml = async (): Promise<Response> => {
    if (isHtmlBundle) {
      // Fallback for dynamic routes in prod — serve the built index.html
      const f = Bun.file(join(process.cwd(), dist, "client", "index.html"));
      return new Response(f, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    const html = typeof options.html === "function" ? await options.html() : options.html;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  };

  const handleDynamicRequest = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/_manic/open")) {
      const file = url.searchParams.get("file");
      if (file) {
        const line = url.searchParams.get("line") || "1";
        const col = url.searchParams.get("column") || "1";
        const finalPath = file.replace(/^file:\/\/\//, "/").replace(/\\/g, "/");
        const editor = process.env.EDITOR || "code";
        const args = editor.includes("code") ? ["-g", `${finalPath}:${line}:${col}`] : [finalPath];
        Bun.spawn([editor, ...args]).unref();
        return new Response("OK");
      }
      return new Response("Missing file", { status: 400 });
    }

    if (prod) {
      const assetFile = Bun.file(join(process.cwd(), dist, "client", pathname === "/" ? "index.html" : pathname));
      if (await assetFile.exists()) {
        return new Response(assetFile, {
          headers: { "Content-Type": assetFile.type, "Cache-Control": "public, max-age=31536000, immutable" },
        });
      }
    }

    if (pathname.startsWith("/assets/")) {
      const assetFile = Bun.file(pathname.substring(1));
      if (await assetFile.exists()) return new Response(assetFile);
    }

    return serveHtml();
  };

  // In dev with HTMLBundle, Bun handles all JS/CSS serving via static
  // Page routes just need to return the HTML shell (Bun's static handles /_bun/* automatically)
  const pageHandler = isHtmlBundle && !prod
    ? options.html  // Bun serves this natively via static
    : () => serveHtml();

  const bunRoutes: Record<string, any> = { "/": pageHandler };
  for (const route of routes) {
    if (route.path !== "/") bunRoutes[route.path] = pageHandler;
  }

  if (config.mode === "frontend") {
    if (config.sitemap) {
      const sitemapXml = generateSitemap(routes, config.sitemap);
      bunRoutes["/sitemap.xml"] = () => new Response(sitemapXml, { headers: { "content-type": "application/xml" } });
    }

    const server = Bun.serve({
      port, hostname,
      static: isHtmlBundle && !prod ? { "/": options.html } : undefined,
      routes: { ...bunRoutes, "/*": handleDynamicRequest },
      development: !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
    });

    if (!prod) watchRoutes("app/routes", () => {}).catch(() => {});
    logServerInfo(server, port, hostname, prod, startTime, envKeys);
    return server;
  }

  // Fullstack mode (Hono)
  const { apiLoaderPlugin } = await import("../plugins/lib/api");
  const { app: apiApp, openApiSpec } = await apiLoaderPlugin(prod ? `${dist}/api` : "app/api");

  const specJson = JSON.stringify(openApiSpec);
  bunRoutes["/api"] = (req: Request) => apiApp.fetch(req);
  bunRoutes["/api/*"] = (req: Request) => apiApp.fetch(req);
  bunRoutes["/openapi.json"] = () => new Response(specJson, { headers: { "Content-Type": "application/json" } });

  if (config.plugins?.length) {
    const ctx = {
      config, prod, cwd: process.cwd(), dist,
      pageRoutes: routes.map(r => ({ path: r.path, filePath: r.filePath, dynamic: r.path.includes(":") })),
      apiRoutes: [] as any[],
      addRoute: (path: string, handler: (req: Request) => Response | Promise<Response>) => { bunRoutes[path] = handler; },
    };
    for (const plugin of config.plugins) {
      if (plugin.configureServer) await plugin.configureServer(ctx);
    }
  }

  const server = Bun.serve({
    port, hostname,
    static: isHtmlBundle && !prod ? { "/": options.html } : undefined,
    routes: { ...bunRoutes, "/*": handleDynamicRequest },
    development: !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
  });

  if (!prod) watchRoutes("app/routes", () => {}).catch(() => {});
  logServerInfo(server, port, hostname, prod, startTime, envKeys);
  return server;
}

function logServerInfo(server: any, port: number, hostname: string, prod: boolean, startTime: number, envKeys: string[]) {
  const duration = Math.round(performance.now() - startTime);
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
  const url = `http://${displayHost}:${server.port ?? port}/`;
  console.log(`\n\n\t\t${red(bold("■ MANIC"))}            ${prod ? yellow(" PROD Server") : cyan(" DEV Server")}\n\t\t--- --- --- --- --- ---  --- ---`);
  console.log(`\n\t\t${cyan(bold("URL"))}:      ${green(url)}`);
  console.log(`\n\t\t${green("Ready in")} ${bold(duration + "ms")}`);
  if (envKeys.length > 0) console.log(`\n\t\t${dim(gray(`Loaded ${bold(envKeys.length)} env vars`))}`);
  console.log("");
}
