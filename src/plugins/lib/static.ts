import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

/** Serve a static directory through Hono/Bun middleware. @see https://www.manicjs.tech/docs/api/plugin-loaders/file-importer-plugin#framework-note */
export const fileImporterPlugin = (publicDir: string = 'public') => {
  const app = new Hono();
  app.use('/*', serveStatic({ root: `./${publicDir}` }));
  return app;
};
