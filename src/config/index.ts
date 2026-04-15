/** Swagger/OpenAPI documentation configuration */
export interface SwaggerConfig {
  /** URL path to serve docs at @default "/docs" */
  path?: string;
  documentation?: {
    info?: {
      title?: string;
      description?: string;
      version?: string;
    };
  };
}

/** Deployment provider interface (Vercel, Cloudflare, Netlify, etc.) */
export interface ManicProvider {
  name: string;
  build(context: BuildContext): Promise<void>;
}

/** Context passed to deployment provider build functions */
export interface BuildContext {
  dist: string;
  config: ManicConfig;
  apiEntries: string[];
  clientDir: string;
  serverFile: string;
}

/** Sitemap auto-generation configuration */
export interface SitemapConfig {
  /** Base URL for the site (e.g. "https://example.com") */
  hostname: string;
  /** How frequently pages change @default "weekly" */
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  /** Priority of URLs relative to other URLs on the site @default 0.8 */
  priority?: number;
  /** Route paths to exclude from the sitemap */
  exclude?: string[];
}

/** Main configuration object for a Manic application */
export interface ManicConfig {
  /** Server mode — "fullstack" includes Elysia API support, "frontend" is pure SPA with no Elysia @default "fullstack" */
  mode?: "fullstack" | "frontend";

  app?: {
    /** Application name, shown in browser title and swagger docs */
    name?: string;
  };

  server?: {
    /** Port to run the dev/prod server on @default 6070 */
    port?: number;
    /** Enable HMR in development @default true */
    hmr?: boolean;
  };

  router?: {
    /** Enable View Transitions API for client-side navigation @default true */
    viewTransitions?: boolean;
    /** Preserve scroll position on navigation @default false */
    preserveScroll?: boolean;
    /** Scroll behavior when navigating @default "auto" */
    scrollBehavior?: "auto" | "smooth";
  };

  build?: {
    /** Minify production bundles @default true */
    minify?: boolean;
    /** Generate sourcemaps @default "inline" */
    sourcemap?: boolean | "inline" | "external";
    /** Enable code splitting @default true */
    splitting?: boolean;
    /** Output directory for production builds @default ".manic" */
    outdir?: string;
  };

  /** Swagger docs config, or false to disable */
  swagger?: SwaggerConfig | false;

  /** Sitemap generation config, or false to disable */
  sitemap?: SitemapConfig | false;

  /** Deployment providers (Vercel, Cloudflare, Netlify) */
  providers?: ManicProvider[];
}

const DEFAULT_CONFIG: ManicConfig = {
  mode: "fullstack",
  app: { name: "Manic App" },
  server: { port: 6070, hmr: true },
  router: {
    viewTransitions: true,
    preserveScroll: false,
    scrollBehavior: "auto",
  },
  build: {
    minify: true,
    sourcemap: "inline",
    splitting: true,
    outdir: ".manic",
  },
  swagger: {
    path: "/docs",
    documentation: {
      info: {
        title: "API",
        description: "API documentation",
        version: "1.0.0",
      },
    },
  },
};

/** Define a typed Manic configuration — use in manic.config.ts */
export function defineConfig(config: ManicConfig): ManicConfig {
  return config;
}

let cachedConfig: ManicConfig | null = null;

/** Loads and merges the user's manic.config.ts with defaults */
export async function loadConfig(
  cwd: string = process.cwd()
): Promise<ManicConfig> {
  if (cachedConfig) return cachedConfig;

  const configFiles = ["manic.config.ts", "manic.config.js"];

  for (const file of configFiles) {
    const configPath = `${cwd}/${file}`;
    const configFile = Bun.file(configPath);

    if (await configFile.exists()) {
      try {
        const mod = await import(configPath);
        const userConfig = mod.default || mod;

        cachedConfig = {
          mode: userConfig.mode ?? DEFAULT_CONFIG.mode,
          app: { ...DEFAULT_CONFIG.app, ...userConfig.app },
          server: { ...DEFAULT_CONFIG.server, ...userConfig.server },
          router: { ...DEFAULT_CONFIG.router, ...userConfig.router },
          build: { ...DEFAULT_CONFIG.build, ...userConfig.build },
          swagger:
            userConfig.swagger === false
              ? false
              : { ...DEFAULT_CONFIG.swagger, ...userConfig.swagger },
          sitemap: userConfig.sitemap === false ? false : userConfig.sitemap,
          providers: userConfig.providers,
        };

        return cachedConfig;
      } catch (e) {
        console.error(`[Manic] Failed to load config from ${file}:`, e);
      }
    }
  }

  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

/** Returns the cached config — call loadConfig() first */
export function getConfig(): ManicConfig {
  return cachedConfig || DEFAULT_CONFIG;
}
