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

  if (config.mode === "frontend") {
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

    const bunRoutes: Record<string, unknown> = {
      "/": htmlHandler,
    };

    for (const route of routes) {
      if (route.path !== "/") {
        bunRoutes[route.path] = htmlHandler;
      }
    }

    // Extreme On-Demand OXC Transpiler with Caching
    if (!prod) {
      const { transformSync } = await import("oxc-transform");
      const { ResolverFactory } = await import("oxc-resolver");
      
      const resolver = new ResolverFactory({
        extensions: [".tsx", ".ts", ".jsx", ".js", ".json"]
      });

      // Simple in-memory cache
      const transpileCache = new Map<string, { code: string; mtime: number }>();

      bunRoutes["/*"] = async (req: Request) => {
        const url = new URL(req.url);
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        
        const resolved = resolver.resolveSync(process.cwd(), pathname);
        
        if (resolved.path && (resolved.path.endsWith(".tsx") || resolved.path.endsWith(".ts"))) {
          try {
            const file = Bun.file(resolved.path);
            const mtime = file.lastModified;
            
            // CACHE HIT: Return immediately if file hasn't changed
            const cached = transpileCache.get(resolved.path);
            if (cached && cached.mtime === mtime) {
              return new Response(cached.code, {
                headers: { "Content-Type": "application/javascript" }
              });
            }

            const text = await file.text();
            const isTsx = resolved.path.endsWith(".tsx");
            
            const result = transformSync(resolved.path, text, {
              lang: isTsx ? "tsx" : "ts",
              target: "esnext",
              sourcemap: true,
              jsx: { runtime: "automatic", development: true, refresh: true },
              typescript: { onlyRemoveTypeImports: true }
            });

            const hmrGlue = `
              if (import.meta.hot) {
                import.meta.hot.accept(() => {
                  if (window.__react_refresh_library__) {
                    window.__react_refresh_library__.performRefresh();
                  }
                });
              }
            `;

            const mapBase64 = Buffer.from(result.map!).toString("base64");
            const codeResponse = `${result.code}\n${hmrGlue}\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;

            // Update Cache
            transpileCache.set(resolved.path, { code: codeResponse, mtime });

            return new Response(codeResponse, {
              headers: { "Content-Type": "application/javascript" }
            });
          } catch (err) {
            console.error(red("[Manic Cache Error]:"), err);
          }
        }

        if (!pathname.includes(".")) {
          return typeof htmlHandler === "function" ? htmlHandler() : htmlHandler;
        }

        return new Response("Not Found", { status: 404 });
      };
    }

    if (favicon) {
      const faviconFile = `assets/${favicon.split("/").pop()}`;
      bunRoutes["/favicon.ico"] = () => {
        const headers: Record<string, string> = prod
          ? {}
          : {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            };
        return new Response(Bun.file(faviconFile), { headers });
      };
    }

    if (config.sitemap && config.sitemap !== false) {
      const sitemapXml = generateSitemap(routes, config.sitemap);
      bunRoutes["/sitemap.xml"] = () =>
        new Response(sitemapXml, {
          headers: { "content-type": "application/xml" },
        });
    }

    bunRoutes["/*"] = async (req: Request) => {
      const url = new URL(req.url);

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return apiApp.handle(req);
      }

      if (url.pathname.startsWith("/assets/")) {
        const assetPath = `assets${url.pathname.replace("/assets", "")}`;
        const file = Bun.file(assetPath);
        if (await file.exists()) {
          return new Response(file, {
            headers: prod
              ? { "Cache-Control": "public, max-age=31536000, immutable" }
              : {
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                  Pragma: "no-cache",
                  Expires: "0",
                },
          });
        }
      }

      return typeof htmlHandler === "function" ? htmlHandler() : htmlHandler;
    };

    const server = Bun.serve({
      port,
      hostname,
      routes: bunRoutes,
      fetch: () => new Response("Not Found", { status: 404 }),
      development:
        !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
    });

    if (!prod) {
      watchRoutes("app/routes", logRouteChange).catch(() => {});
    }

    const duration = Math.round(performance.now() - startTime);
    const serverPort = server.port ?? port;
    const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
    const url = `http://${displayHost}:${serverPort}/`;

    console.log(
      `\n\n\t\t${red(bold("■ MANIC"))}            ${
        prod
          ? yellow(`${bgYellow(" PROD ")} Server`)
          : cyan(` ${bgCyan(" DEV ")} Server`)
      }\n\t\t--- --- --- --- --- ---  --- ---`
    );

    console.log(`\n\t\t${cyan(bold("URL"))}:      ${green(url)}`);

    if (process.env.NETWORK === "true") {
      const nets = await import("os").then((os) => os.networkInterfaces());
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] ?? []) {
          if (net.family === "IPv4" && !net.internal) {
            console.log(
              `\t\t${cyan(bold("Network"))}:  ${green(
                `http://${net.address}:${serverPort}/`
              )}`
            );
          }
        }
      }
    }

    console.log(`\n\t\t${green("Ready in")} ${bold(duration + "ms")}`);

    if (envKeys.length > 0) {
      const publicEnvs = envKeys.filter((k) => k.startsWith("PUBLIC_")).length;
      const privateEnvs = envKeys.length - publicEnvs;
      console.log(
        `\n\t\t${dim(gray(`Loaded ${bold(envKeys.length)} env vars`))} ${dim(
          `(${publicEnvs} public, ${privateEnvs} private)`
        )}`
      );
    }

    console.log("");

    return;
  }

  // Fullstack mode — dynamically import Elysia dependencies
  const { Elysia } = await import("elysia");
  const { swagger } = await import("@elysiajs/swagger");
  const { staticPlugin } = await import("@elysiajs/static");
  const { apiLoaderPlugin } = await import("../plugins");

  const { app: apiApp } = await apiLoaderPlugin();

  if (config.swagger !== false) {
    const swaggerConfig = config.swagger ?? {};
    apiApp.use(
      swagger({
        path: swaggerConfig.path ?? "/docs",
        exclude: [
          "/",
          "/assets",
          "/favicon.ico",
          "/api/docs",
          swaggerConfig.path ?? "/docs",
        ],
        documentation: {
          info: {
            title:
              swaggerConfig.documentation?.info?.title ??
              config.app?.name ??
              "Manic API",
            description:
              swaggerConfig.documentation?.info?.description ??
              "API documentation powered by Manic",
            version: swaggerConfig.documentation?.info?.version ?? "1.0.0",
          },
        },
      })
    );
  }

  apiApp.use(
    staticPlugin({
      assets: "assets",
      prefix: "/assets",
      headers: prod
        ? undefined
        : {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
    })
  );

  if (prod) {
    const dist = config.build?.outdir ?? ".manic";
    apiApp.use(
      staticPlugin({
        assets: `${dist}/client`,
        prefix: "/",
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
    );
  }

  if (favicon) {
    const faviconFile = `assets/${favicon.split("/").pop()}`;
    apiApp.get("/favicon.ico", () => {
      const headers: Record<string, string> = prod
        ? {}
        : {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          };
      return new Response(Bun.file(faviconFile), { headers });
    });
  }

  const htmlHandler =
    typeof options.html === "string"
    ? () => {
        let content = options.html as string;
        if (!prod) {
          const preamble = `
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

  const bunRoutes: Record<string, unknown> = {
    "/": htmlHandler,
  };

  for (const route of routes) {
    if (route.path !== "/") {
      bunRoutes[route.path] = htmlHandler;
    }
  }

  bunRoutes["/api/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/_manic/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/assets/*"] = (req: Request) => apiApp.handle(req);
  bunRoutes["/favicon.ico"] = (req: Request) => apiApp.handle(req);

  if (config.swagger !== false) {
    const docsPath = config.swagger?.path ?? "/docs";
    bunRoutes[docsPath] = (req: Request) => apiApp.handle(req);
    bunRoutes[`${docsPath}/*`] = (req: Request) => apiApp.handle(req);
  }

  if (config.sitemap && config.sitemap !== false) {
    const sitemapXml = generateSitemap(routes, config.sitemap);
    bunRoutes["/sitemap.xml"] = () =>
      new Response(sitemapXml, {
        headers: { "content-type": "application/xml" },
      });
  }

  if (!prod) {
    const { transformSync } = await import("oxc-transform");
    const { ResolverFactory } = await import("oxc-resolver");
    const resolver = new ResolverFactory({ extensions: [".tsx", ".ts", ".jsx", ".js", ".json"] });
    const transpileCache = new Map<string, { code: string; mtime: number }>();

    bunRoutes["/*"] = async (req: Request) => {
      const url = new URL(req.url);
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const resolved = resolver.sync(process.cwd(), pathname);
      
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

        const hmrGlue = `if (import.meta.hot) { import.meta.hot.accept(() => { window.__react_refresh_library__?.performRefresh(); }); }`;
        const mapBase64 = Buffer.from(result.map!).toString("base64");
        const codeResponse = `${result.code}\n${hmrGlue}\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        transpileCache.set(resolved.path, { code: codeResponse, mtime });
        return new Response(codeResponse, { headers: { "Content-Type": "application/javascript" } });
      }

      // If it's not a source file and not an asset, it's a frontend route
      if (!pathname.includes(".")) {
        return typeof htmlHandler === "function" ? (htmlHandler() as Response) : (htmlHandler as Response);
      }

      return new Response("Not Found", { status: 404 });
    };
  } else {
    bunRoutes["/*"] = (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return apiApp.handle(req) as unknown as Response;
      }
      return typeof htmlHandler === "function" ? (htmlHandler() as Response) : (htmlHandler as Response);
    };
  }

  const server = Bun.serve({
    port,
    hostname,
    routes: bunRoutes,
    fetch: (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return apiApp.handle(req);
      }
      const isAsset = url.pathname.includes(".");
      if (isAsset) return new Response("Not Found", { status: 404 });
      return typeof htmlHandler === "function" ? (htmlHandler() as Response) : (htmlHandler as Response);
    },
    development:
      !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
  });

  if (!prod) {
    watchRoutes("app/routes", logRouteChange).catch(() => {});
  }

  const duration = Math.round(performance.now() - startTime);
  const serverPort = server.port ?? port;
  const protocol = "http";
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
  const url = `${protocol}://${displayHost}:${serverPort}/`;
  const docsPath =
    config.swagger !== false ? config.swagger?.path ?? "/docs" : null;

  console.log(
    `\n\n\t\t${red(bold("■ MANIC"))}            ${
      prod
        ? yellow(`${bgYellow(" PROD ")} Server`)
        : cyan(` ${bgCyan(" DEV ")} Server`)
    }\n\t\t--- --- --- --- --- ---  --- ---`
  );

  console.log(`\n\t\t${cyan(bold("URL"))}:      ${green(url)}`);

  if (process.env.NETWORK === "true") {
    const nets = await import("os").then((os) => os.networkInterfaces());
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === "IPv4" && !net.internal) {
          console.log(
            `\t\t${cyan(bold("Network"))}:  ${green(
              `http://${net.address}:${serverPort}/`
            )}`
          );
        }
      }
    }
  }

  if (docsPath) {
    console.log(
      `\t\t${cyan(bold("Docs"))}:     ${green(url.slice(0, -1) + docsPath)}`
    );
  }

  console.log(`\n\t\t${green("Ready in")} ${bold(duration + "ms")}`);

  if (envKeys.length > 0) {
    const publicEnvs = envKeys.filter((k) => k.startsWith("PUBLIC_")).length;
    const privateEnvs = envKeys.length - publicEnvs;
    console.log(
      `\n\t\t${dim(gray(`Loaded ${bold(envKeys.length)} env vars`))} ${dim(
        `(${publicEnvs} public, ${privateEnvs} private)`
      )}`
    );
  }

  console.log("");

  return apiApp;
}
