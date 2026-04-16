import { red, green, bold, cyan, yellow, gray, dim } from "colorette";
import { discoverRoutes, watchRoutes, generateSitemap } from "./lib/discovery";
import { getConfig, loadConfig, type ManicConfig } from "../config/index";
import { join } from "path";

export async function createManicServer(options: {
  html: string | (() => string);
  config?: ManicConfig;
  routes?: any[];
  envKeys?: string[];
  startTime?: number;
}) {
  // Ensure we have the base functions available
  const _loadConfig = loadConfig;
  const _discoverRoutes = discoverRoutes;

  const config = options.config || await _loadConfig();
  const routes = options.routes || await _discoverRoutes();
  const envKeys = options.envKeys || [];
  const startTime = options.startTime || performance.now();
  const { html: htmlHandler } = options;
  const prod = process.env.NODE_ENV === "production";
  const port = config.server?.port ?? 6070;
  const hostname = "0.0.0.0";
  const favicon = (config.app as any)?.favicon;

  const logRouteChange = (routes: any[]) => {
    console.log(`\n\t${cyan("•")} ${dim("Routes updated")}`);
  };

  const apiApp: any = (config as any).apiApp || { handle: (req: Request) => new Response("Not Found", { status: 404 }), use: () => {} };

  const handleDynamicRequest = async (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/_manic/open")) {
      const file = url.searchParams.get("file");
      if (file) {
        const line = url.searchParams.get("line") || "1";
        const col = url.searchParams.get("column") || "1";
        const finalPath = file.replace(/^file:\/\/\//, "/").replace(/\\/g, "/");
        const editor = process.env.EDITOR || "code";
        const args = editor.includes("code") 
          ? ["-g", `${finalPath}:${line}:${col}`] 
          : [finalPath];
          
        Bun.spawn([editor, ...args]).unref();
        return new Response("OK");
      }
      return new Response("Missing file", { status: 400 });
    }

    const serveHtml = () => {
      const html = typeof htmlHandler === "function" ? htmlHandler() : htmlHandler;
      return new Response(String(html), { headers: { "Content-Type": "text/html" } });
    };

    if (prod) {
      // In production, try to serve from the build output first
      const dist = config.build?.outdir ?? ".manic";
      const assetFile = Bun.file(join(process.cwd(), dist, "client", pathname === "/" ? "index.html" : pathname));
      if (await assetFile.exists()) {
        return new Response(assetFile, {
          headers: {
            "Content-Type": assetFile.type,
            "Cache-Control": "public, max-age=31536000, immutable"
          }
        });
      }
      return serveHtml();
    }

    if (!prod && resolver) {
      let resolved = resolver.resolveSync(process.cwd(), pathname);
      
      // Fallback for app/ directory
      if (!resolved.path && !pathname.startsWith("/app/")) {
        resolved = resolver.resolveSync(process.cwd(), `./app${pathname}`);
      }
      
      if (resolved.path && (resolved.path.endsWith(".tsx") || resolved.path.endsWith(".ts"))) {
        const file = Bun.file(resolved.path);
        const mtime = file.lastModified;
        const cached = transpileCache.get(resolved.path);
        if (cached && cached.mtime === mtime) return new Response(cached.code, { headers: { "Content-Type": "application/javascript" } });

        const text = await file.text();
        const _config = getConfig();
        const oxcConfig = _config.oxc;
        const result = transformSync(resolved.path, text, {
          lang: resolved.path.endsWith(".tsx") ? "tsx" : "ts",
          target: (oxcConfig?.target || "esnext") as any,
          sourcemap: true,
          jsx: { 
            runtime: "automatic", 
            development: true, 
            refresh: oxcConfig?.refresh !== false 
          },
          typescript: { 
            rewriteImportExtensions: oxcConfig?.rewriteImportExtensions !== false,
            onlyRemoveTypeImports: true 
          }
        });

        const hmrGlue = `\nif (import.meta.hot) { import.meta.hot.accept(() => { window.__react_refresh_library__?.performRefresh(); }); }\n`;
        const mapStr = typeof result.map === "string" ? result.map : JSON.stringify(result.map);
        const mapBase64 = Buffer.from(mapStr).toString("base64");
        const codeResponse = `${result.code}${hmrGlue}//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        transpileCache.set(resolved.path, { code: codeResponse, mtime });
        return new Response(codeResponse, { headers: { "Content-Type": "application/javascript" } });
      }
    }

    if (pathname.startsWith("/assets/")) {
       const assetPath = pathname.substring(1); // Remove leading slash
       const assetFile = Bun.file(assetPath);
       if (await assetFile.exists()) return new Response(assetFile);
    }

    return serveHtml();
  };

  const htmlResponse = () => {
    const html = typeof htmlHandler === "function" ? htmlHandler() : htmlHandler;
    return new Response(String(html), { headers: { "Content-Type": "text/html" } });
  };

  const bunRoutes: Record<string, any> = {
    "/": htmlResponse,
  };

  for (const route of routes) {
    if (route.path !== "/") bunRoutes[route.path] = htmlResponse;
  }

  let resolver: any = null;
  let transformSync: any = null;
  const transpileCache = new Map<string, { code: string; mtime: number }>();

  if (!prod) {
    const oxc = await import("oxc-transform");
    const res = await import("oxc-resolver");
    transformSync = oxc.transformSync;
    resolver = new res.ResolverFactory({ 
      extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
      modules: ["app", "node_modules"] 
    });
  }

  if (config.mode === "frontend") {
    bunRoutes["/*"] = handleDynamicRequest;
    if (favicon) bunRoutes["/favicon.ico"] = () => new Response(Bun.file(`assets/${favicon.split("/").pop()}`));
    if (config.sitemap) {
      const sitemapXml = generateSitemap(routes, config.sitemap);
      bunRoutes["/sitemap.xml"] = () => new Response(sitemapXml, { headers: { "content-type": "application/xml" } });
    }

    const server = Bun.serve({
      port,
      hostname,
      routes: {
        ...bunRoutes,
        "/*": handleDynamicRequest
      },
      development: !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
    });

    if (!prod) watchRoutes("app/routes", logRouteChange).catch(() => { });
    logServerInfo(server, port, hostname, prod, startTime, envKeys);
    return;
  }

  // Fullstack mode
  const { Elysia } = await import("elysia");
  const { swagger } = await import("@elysiajs/swagger");
  const { staticPlugin } = await import("@elysiajs/static");
  
  if (config.swagger !== false) {
    apiApp.use(swagger({ path: config.swagger?.path ?? "/docs", documentation: { info: { title: config.app?.name || "Manic API", version: "1.0.0" } } }));
  }

  // In production, serve assets from the built client folder
  const assetsPath = prod ? `${config.build?.outdir ?? ".manic"}/client` : "assets";
  apiApp.use(staticPlugin({ assets: assetsPath, prefix: "/assets" }));

  if (prod) apiApp.use(staticPlugin({ assets: `${config.build?.outdir ?? ".manic"}/client`, prefix: "/.manic" }));

  const docsPath = config.swagger === false ? null : (config.swagger?.path ?? "/docs");
  if (docsPath) bunRoutes[docsPath] = (req: Request) => apiApp.handle(req);
  if (docsPath) bunRoutes[`${docsPath}/*`] = (req: Request) => apiApp.handle(req);

  bunRoutes["/api/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/_manic/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/assets/*"] = (req: Request) => apiApp.handle(req);
  if (favicon) bunRoutes["/favicon.ico"] = (req: Request) => apiApp.handle(req);

  const server = Bun.serve({
    port,
    hostname,
    routes: {
      ...bunRoutes,
      "/*": handleDynamicRequest
    },
    development: !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
  });

  if (!prod) watchRoutes("app/routes", logRouteChange).catch(() => { });

  logServerInfo(server, port, hostname, prod, startTime, envKeys);
  return apiApp;
}

function logServerInfo(server: any, port: number, hostname: string, prod: boolean, startTime: number, envKeys: string[]) {
  const duration = Math.round(performance.now() - startTime);
  const serverPort = server.port ?? port;
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
  const url = `http://${displayHost}:${serverPort}/`;

  console.log(`\n\n\t\t${red(bold("■ MANIC"))}            ${prod ? yellow(" PROD Server") : cyan(" DEV Server")}\n\t\t--- --- --- --- --- ---  --- ---`);
  console.log(`\n\t\t${cyan(bold("URL"))}:      ${green(url)}`);
  console.log(`\n\t\t${green("Ready in")} ${bold(duration + "ms")}`);
  if (envKeys.length > 0) console.log(`\n\t\t${dim(gray(`Loaded ${bold(envKeys.length)} env vars`))}`);
  console.log("");
}
