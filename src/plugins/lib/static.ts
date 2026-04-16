import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

export const fileImporterPlugin = (publicDir: string = 'public') => {
  const app = new Hono();
  app.use('/*', serveStatic({ root: `./${publicDir}` }));
  return app;
};
