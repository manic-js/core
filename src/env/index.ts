export interface EnvSummary {
  total: number;
  publicCount: number;
  privateCount: number;
  loaded: boolean;
}

const PUBLIC_PREFIX = "MANIC_PUBLIC_";
let loadedEnvVars: Set<string> = new Set();
let envLoaded = false;

export async function loadEnvFiles(): Promise<void> {
  if (envLoaded) return;

  const envFiles = [".env", ".env.local"];

  for (const file of envFiles) {
    const envFile = Bun.file(file);

    if (await envFile.exists()) {
      const content = await envFile.text();
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eqIndex = trimmed.indexOf("=");
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

export function getLoadedEnvKeys(): string[] {
  return Array.from(loadedEnvVars);
}

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

export function generateEnvScript(): string {
  return `window.__MANIC_ENV__ = ${JSON.stringify(getPublicEnv())};`;
}
