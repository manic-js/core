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
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  /** Priority of URLs relative to other URLs on the site @default 0.8 */
  priority?: number;
  /** Route paths to exclude from the sitemap */
  exclude?: string[];
}

/** Route info for page routes */
export interface PageRoute {
  path: string;
  filePath: string;
  dynamic: boolean;
}

/** Route info for API routes */
export interface ApiRoute {
  mountPath: string;
  filePath: string;
}

/** Context passed to plugins */
export interface ManicPluginContext {
  config: ManicConfig;
  pageRoutes: PageRoute[];
  apiRoutes: ApiRoute[];
  prod: boolean;
  cwd: string;
  dist: string;
}

/** Extended context for server plugins */
export interface ManicServerPluginContext extends ManicPluginContext {
  addRoute(
    path: string,
    handler: (req: Request) => Response | Promise<Response>
  ): void;
  /** Add a Link header to all HTML page responses (RFC 8288) */
  addLinkHeader(value: string): void;
  /** Inject HTML tags (e.g. <meta>) into the <head> of every served HTML page */
  injectHtml(tags: string): void;
}

/** Extended context for build plugins */
export interface ManicBuildPluginContext extends ManicPluginContext {
  emitClientFile(
    relativePath: string,
    content: string | Uint8Array
  ): Promise<void>;
  /** Inject HTML tags (e.g. <meta>) into the <head> of the built index.html */
  injectHtml(tags: string): void;
}

/** Plugin interface for extending Manic */
export interface ManicPlugin {
  name: string;
  configureServer?(ctx: ManicServerPluginContext): void | Promise<void>;
  build?(ctx: ManicBuildPluginContext): void | Promise<void>;
}

/** Main configuration object for a Manic application */
export interface ManicConfig {
  /** Server mode — "fullstack" includes Hono API support, "frontend" is pure SPA @default "fullstack" */
  mode?: 'fullstack' | 'frontend';

  app?: {
    /** Application name, shown in browser title */
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
    scrollBehavior?: 'auto' | 'smooth';
  };

  build?: {
    /** Minify production bundles @default true */
    minify?: boolean;
    /** Generate sourcemaps @default "inline" */
    sourcemap?: boolean | 'inline' | 'external';
    /** Enable code splitting @default true */
    splitting?: boolean;
    /** Output directory for production builds @default ".manic" */
    outdir?: string;
  };

  /** Sitemap generation config, or false to disable */
  sitemap?: SitemapConfig | false;

  /** Custom OXC transform settings */
  oxc?: {
    /** Target ES version @default "esnext" in dev, "es2022" in prod */
    target?: string;
    /** Replace import extensions like .ts to .js @default true */
    rewriteImportExtensions?: boolean;
    /** Use React Fast Refresh @default true in dev */
    refresh?: boolean;
  };

  /** Deployment providers (Vercel, Cloudflare, Netlify) */
  providers?: ManicProvider[];

  /** Plugins for extending Manic */
  plugins?: ManicPlugin[];
}

const DEFAULT_CONFIG: ManicConfig = {
  mode: 'fullstack',
  app: { name: 'Manic App' },
  server: { port: 6070, hmr: true },
  router: {
    viewTransitions: true,
    preserveScroll: false,
    scrollBehavior: 'auto',
  },
  build: {
    minify: true,
    sourcemap: 'inline',
    splitting: true,
    outdir: '.manic',
  },
  oxc: {
    target: 'esnext',
    rewriteImportExtensions: true,
    refresh: true,
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

  const configFiles = ['manic.config.ts', 'manic.config.js'];

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
          sitemap: userConfig.sitemap === false ? false : userConfig.sitemap,
          oxc: { ...DEFAULT_CONFIG.oxc, ...userConfig.oxc },
          providers: userConfig.providers,
          plugins: userConfig.plugins,
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
