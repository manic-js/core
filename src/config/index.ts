export interface SwaggerConfig {
  path?: string;
  documentation?: {
    info?: {
      title?: string;
      description?: string;
      version?: string;
    };
  };
}

export interface ManicConfig {
  app?: {
    name?: string;
  };

  server?: {
    port?: number;
    hmr?: boolean;
  };

  router?: {
    viewTransitions?: boolean;
    preserveScroll?: boolean;
    scrollBehavior?: "auto" | "smooth";
  };

  build?: {
    minify?: boolean;
    sourcemap?: boolean | "inline" | "external";
    splitting?: boolean;
    outdir?: string;
  };

  swagger?: SwaggerConfig | false;
}

const DEFAULT_CONFIG: Required<ManicConfig> = {
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

export function defineConfig(config: ManicConfig): ManicConfig {
  return config;
}

let cachedConfig: ManicConfig | null = null;

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
          app: { ...DEFAULT_CONFIG.app, ...userConfig.app },
          server: { ...DEFAULT_CONFIG.server, ...userConfig.server },
          router: { ...DEFAULT_CONFIG.router, ...userConfig.router },
          build: { ...DEFAULT_CONFIG.build, ...userConfig.build },
          swagger:
            userConfig.swagger === false
              ? false
              : { ...DEFAULT_CONFIG.swagger, ...userConfig.swagger },
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

export function getConfig(): ManicConfig {
  return cachedConfig || DEFAULT_CONFIG;
}
