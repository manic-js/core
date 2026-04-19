/**
 * Summary of loaded environment variables
 * @interface EnvSummary
 */
export interface EnvSummary {
  /** Total number of loaded environment variables */
  total: number;
  /** Number of public variables (MANIC_PUBLIC_*) */
  publicCount: number;
  /** Number of private variables */
  privateCount: boolean;
  /** Whether environment files have been loaded */
  loaded: boolean;
}

/** Prefix for environment variables exposed to the browser */
const PUBLIC_PREFIX = 'MANIC_PUBLIC_';
let loadedEnvVars: Set<string> = new Set();
let envLoaded = false;

/**
 * Loads environment variables from .env and .env.local files.
 *
 * Automatically called during server startup. Parses quoted values
 * and handles # comments.
 *
 * @example
 * await loadEnvFiles();
 * // Loads .env and .env.local into process.env
 */
export async function loadEnvFiles(): Promise<void> {
  if (envLoaded) return;

  const envFiles = ['.env', '.env.local'];

  for (const file of envFiles) {
    const envFile = Bun.file(file);

    if (await envFile.exists()) {
      const content = await envFile.text();
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        process.env[key] = value;
        loadedEnvVars.add(key);
      }
    }
  }

  envLoaded = true;
}

/**
 * Gets list of all loaded environment variable keys
 * @returns Array of environment variable names
 */
export function getLoadedEnvKeys(): string[] {
  return Array.from(loadedEnvVars);
}

/**
 * Gets all public environment variables (those with MANIC_PUBLIC_ prefix)
 * @returns Object with public env vars
 */
export function getPublicEnv(): Record<string, string> {
  const publicEnv: Record<string, string> = {};
  for (const key of loadedEnvVars) {
    if (key.startsWith(PUBLIC_PREFIX)) {
      const value = process.env[key];
      if (value !== undefined) {
        publicEnv[key] = value;
      }
    }
  }
  return publicEnv;
}

/**
 * Gets a summary of loaded environment variables
 * @returns EnvSummary with counts
 */
export function getEnvSummary(): EnvSummary {
  let publicCount = 0;
  for (const key of loadedEnvVars) {
    if (key.startsWith(PUBLIC_PREFIX)) publicCount++;
  }
  return {
    total: loadedEnvVars.size,
    publicCount,
    privateCount: loadedEnvVars.size - publicCount,
    loaded: envLoaded,
  };
}

/**
 * Generates JavaScript to inject public env vars into the browser
 * @returns JavaScript string that sets window.__MANIC_ENV__
 */
export function generateEnvScript(): string {
  return `window.__MANIC_ENV__ = ${JSON.stringify(getPublicEnv())};`;
}
