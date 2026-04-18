import { Hono } from 'hono';
import { existsSync } from 'fs';
import { join, isAbsolute } from 'path';

export const apiLoaderPlugin = async (apiDir: string = 'app/api') => {
  const app = new Hono().basePath('/api');
  const routes: string[] = [];
  const apiRoot = isAbsolute(apiDir) ? apiDir : join(process.cwd(), apiDir);

  if (!existsSync(apiRoot))
    return { app, routes, openApiSpec: buildSpec(app, routes) };

  const glob = new Bun.Glob('**/*.{ts,tsx,js}');
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: apiRoot })) files.push(file);

  await Promise.all(
    files.map(async file => {
      try {
        const mod = await import(join(apiRoot, file));
        if (!mod.default) return;

        const routePath = (
          '/' +
          file
            .replace(/\.(?:tsx?|js)$/, '')
            .replace(/\/index$/, '')
            .replace(/^index$/, '')
        )
          .replace(/\/+/g, '/')
          .replace(/\[([^\]]+)\]/g, ':$1');

        routes.push(`/api${routePath === '/' ? '' : routePath}`);

        const h = mod.default;
        // Hono instance has .fetch; plain functions don't
        if (typeof h.fetch === 'function') {
          app.route(routePath, h);
        } else if (typeof h === 'function') {
          app.all(routePath, c => h(c));
        }
      } catch (err) {
        console.error(`[Manic API] Failed to load ${file}:`, err);
      }
    })
  );

  return { app, routes, openApiSpec: buildSpec(app, routes) };
};

function buildSpec(app: any, registeredRoutes: string[]) {
  const paths: Record<string, any> = {};
  // Use the registered routes array which already includes the /api prefix,
  // rather than app.routes which stores paths relative to the basePath.
  for (const route of registeredRoutes) {
    const oaPath = route.replace(/:([^/]+)/g, '{$1}');
    if (!paths[oaPath]) paths[oaPath] = {};
    paths[oaPath]['get'] = {
      responses: { 200: { description: 'OK' } },
    };
  }
  return {
    openapi: '3.0.0',
    info: { title: 'Manic API', version: '1.0.0' },
    paths,
  };
}
