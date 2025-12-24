declare global {
  interface Window {
    __MANIC_ENV__?: Record<string, string>;
  }
}

const PUBLIC_PREFIX = "MANIC_PUBLIC_";

export function getEnv(key: string): string | undefined {
  if (typeof window === "undefined") {
    return process.env[key];
  }

  if (!key.startsWith(PUBLIC_PREFIX)) {
    console.warn(
      `[Manic] Cannot access non-public env var "${key}" on client-side`
    );
    return undefined;
  }

  return window.__MANIC_ENV__?.[key];
}

export function getPublicEnv(): Record<string, string> {
  if (typeof window === "undefined") {
    const publicEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(PUBLIC_PREFIX) && value !== undefined) {
        publicEnv[key] = value;
      }
    }
    return publicEnv;
  }

  return window.__MANIC_ENV__ || {};
}
