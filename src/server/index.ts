import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { apiLoaderPlugin } from "../plugins";
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
  watchRoutes,
  logRouteChange,
  writeRoutesManifest,
} from "./lib/discovery";
import { loadConfig } from "../config";
import { loadEnvFiles, getLoadedEnvKeys } from "../env";
import { setViewTransitions } from "../router/lib/Link";

export interface ManicServerOptions {
  html: unknown;
  port?: number;
}

export interface ManicServer {
  port: number;
}

export async function createManicServer(
  options: ManicServerOptions
): Promise<ManicServer> {
  const startTime = performance.now();
  const prod = process.env.NODE_ENV === "production";

  await loadEnvFiles();
  await writeRoutesManifest();

  const config = await loadConfig();
  const { app: apiApp, routes: apiRoutes } = await apiLoaderPlugin();
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

  apiApp.use(staticPlugin({ assets: "assets", prefix: "/assets" }));

  if (favicon) {
    apiApp.get("/favicon.ico", () =>
      Bun.file(`assets/${favicon.split("/").pop()}`)
    );
  }

  const bunRoutes: Record<string, unknown> = {
    "/": options.html,
  };

  for (const route of routes) {
    if (route.path !== "/") {
      bunRoutes[route.path] = options.html;
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

  bunRoutes["/*"] = options.html;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = Bun.serve({
    port,
    hostname,
    routes: bunRoutes,
    fetch: () => new Response("Not Found", { status: 404 }),
    development:
      !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
  } as any);

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

  return { port: serverPort };
}
