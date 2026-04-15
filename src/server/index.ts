import {
  bold,
  cyan,
  green,
  dim,
  yellow,
  red,
  bgYellow,
  bgCyan,
  gray,
} from "colorette";
import {
  discoverRoutes,
  discoverFavicon,
  generateSitemap,
  watchRoutes,
  logRouteChange,
  writeRoutesManifest,
} from "./lib/discovery";
import { loadConfig } from "../config";
import { loadEnvFiles, getLoadedEnvKeys } from "../env";
import { setViewTransitions } from "../router/lib/Router";

export interface ManicServerOptions {
  html: string | (() => Response | Promise<Response>);
  port?: number;
}

export async function createManicServer(
  options: ManicServerOptions
): Promise<unknown> {
  const startTime = performance.now();
  const nodeEnv = process.env["NODE_ENV"];
  const prod = nodeEnv === "production";

  await loadEnvFiles();
  await writeRoutesManifest();

  const config = await loadConfig();
  const routes = await discoverRoutes();
  const favicon = await discoverFavicon();
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  const port = options.port ?? envPort ?? config.server?.port ?? 6070;
  const hostname =
    process.env.HOST ||
    (process.env.NETWORK === "true" ? "0.0.0.0" : "localhost");
  const envKeys = getLoadedEnvKeys();

  if (config.router?.viewTransitions !== undefined) {
    setViewTransitions(config.router.viewTransitions);
  }

  const { apiLoaderPlugin } = await import("../plugins");
  const { app: apiApp } = await apiLoaderPlugin();

  const htmlHandler =
    typeof options.html === "string"
      ? () => {
        let content = options.html as string;
        if (!prod) {
          const preamble = `
              <script type="importmap">
                {
                  "imports": {
                    "react": "https://esm.sh/react@19?dev",
                    "react-dom": "https://esm.sh/react-dom@19?dev",
                    "react-dom/client": "https://esm.sh/react-dom@19/client?dev",
                    "manicjs/router": "/packages/manic/src/router/index.ts",
                    "manicjs/config": "/packages/manic/src/config/index.ts"
                  }
                }
              </script>
              <script type="module">
                import RefreshRuntime from "https://esm.sh/react-refresh/runtime";
                RefreshRuntime.injectIntoGlobalHook(window);
                window.$RefreshReg$ = (type, id) => {
                  RefreshRuntime.register(type, id);
                };
                window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
                window.__react_refresh_library__ = {
                  performRefresh: () => RefreshRuntime.performReactRefresh()
                };
              </script>
            `;
          content = content.replace("</head>", `${preamble}\n</head>`);
        }
        return new Response(content, {
          headers: {
            "content-type": "text/html",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
      : options.html;

  const bunRoutes: Record<string, any> = {
    "/": htmlHandler,
  };

  for (const route of routes) {
    if (route.path !== "/") bunRoutes[route.path] = htmlHandler;
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
      modules: ["app", "node_modules"] // Help it find files in app/
    });
  }

  const handleDynamicRequest = async (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    if (pathname.startsWith("/api/")) return apiApp.handle(req);

    if (pathname === "/_manic/open") {
      const fileParam = url.searchParams.get("file");
      if (fileParam) {
        // Resolve URL or relative path to absolute filesystem path
        const filePath = fileParam.startsWith("http") 
          ? new URL(fileParam).pathname 
          : fileParam;
        
        const resolved = resolver ? resolver.resolveSync(process.cwd(), filePath) : { path: filePath };
        const finalPath = resolved.path || filePath;

        const line = url.searchParams.get("line") || "1";
        const col = url.searchParams.get("col") || "1";
        const editor = process.env.EDITOR || "code";
        
        const args = (editor === "code" || editor.endsWith("code")) 
          ? ["-g", `${finalPath}:${line}:${col}`] 
          : [finalPath];
          
        Bun.spawn([editor, ...args]).unref();
        return new Response("OK");
      }
      return new Response("Missing file", { status: 400 });
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
        const result = transformSync(resolved.path, text, {
          lang: resolved.path.endsWith(".tsx") ? "tsx" : "ts",
          target: "esnext",
          sourcemap: true,
          jsx: { runtime: "automatic", development: true, refresh: true },
          typescript: { onlyRemoveTypeImports: true }
        });

        const hmrGlue = `\nif (import.meta.hot) { import.meta.hot.accept(() => { window.__react_refresh_library__?.performRefresh(); }); }\n`;
        const mapBase64 = Buffer.from(result.map!).toString("base64");
        const codeResponse = `${result.code}${hmrGlue}//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        transpileCache.set(resolved.path, { code: codeResponse, mtime });
        return new Response(codeResponse, { headers: { "Content-Type": "application/javascript" } });
      }
    }

    if (pathname.startsWith("/assets/")) {
       const assetFile = Bun.file(pathname.substring(1));
       if (await assetFile.exists()) return new Response(assetFile);
    }

    return typeof htmlHandler === "function" ? htmlHandler() : htmlHandler;
  };

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
      routes: bunRoutes,
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

  apiApp.use(staticPlugin({ assets: "assets", prefix: "/assets" }));
  if (prod) apiApp.use(staticPlugin({ assets: `${config.build?.outdir ?? ".manic"}/client`, prefix: "/" }));

  bunRoutes["/api/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/_manic/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/assets/*"] = (req: Request) => apiApp.handle(req);
  if (favicon) bunRoutes["/favicon.ico"] = (req: Request) => apiApp.handle(req);

  const server = Bun.serve({
    port,
    hostname,
    routes: bunRoutes,
    fetch: handleDynamicRequest,
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
