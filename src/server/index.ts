import { red, green, bold, cyan, yellow, gray, dim } from 'colorette';
import { discoverRoutes, watchRoutes, generateSitemap } from './lib/discovery';
import {
  htmlToMarkdown,
  estimateTokens,
  prefersMarkdown,
} from './lib/markdown';
import { loadConfig, type ManicConfig } from '../config/index';
import { join } from 'path';

export async function createManicServer(options: {
  html: any; // string | HTMLBundle | (() => string)
  config?: ManicConfig;
  routes?: any[];
  envKeys?: string[];
  startTime?: number;
}) {
  const [config, routes] = await Promise.all([
    options.config ? Promise.resolve(options.config) : loadConfig(),
    options.routes ? Promise.resolve(options.routes) : discoverRoutes(),
  ]);
  const envKeys = options.envKeys || [];
  const startTime = options.startTime || performance.now();
  const prod = process.env.NODE_ENV === 'production';
  const port = config.server?.port ?? 6070;
  const hostname = '0.0.0.0';
  const dist = config.build?.outdir ?? '.manic';

  // Detect Bun HTMLBundle (has .index property pointing to the HTML file)
  const isHtmlBundle =
    options.html && typeof options.html === 'object' && 'index' in options.html;

  // Link headers collected from plugins (RFC 8288)
  const linkHeaders: string[] = [];
  // HTML tags to inject into <head> (collected from plugins)
  const htmlInjections: string[] = [];

  const serveHtml = async (req?: Request): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
    };
    if (linkHeaders.length) {
      headers['Link'] = linkHeaders.join(', ');
    }

    let rawHtml: string;
    if (isHtmlBundle) {
      // In dev, serve from app/index.html; in prod, serve from .manic/client/index.html
      const htmlPath = prod
        ? join(process.cwd(), dist, 'client', 'index.html')
        : 'app/index.html';
      rawHtml = await Bun.file(htmlPath).text();
    } else {
      rawHtml =
        typeof options.html === 'function'
          ? await options.html()
          : options.html;
    }

    // Inject plugin HTML tags into <head>
    if (htmlInjections.length) {
      rawHtml = rawHtml.replace(
        '</head>',
        `${htmlInjections.join('\n')}\n</head>`
      );
    }

    // Markdown content negotiation (RFC 8288 / Markdown for Agents)
    if (req && prefersMarkdown(req)) {
      const md = htmlToMarkdown(rawHtml);
      const tokens = estimateTokens(md);
      headers['Content-Type'] = 'text/markdown; charset=utf-8';
      headers['Vary'] = 'Accept';
      headers['x-markdown-tokens'] = String(tokens);
      return new Response(md, { headers });
    }

    // Agent mode — return structured JSON about the app
    if (req && new URL(req.url).searchParams.get('mode') === 'agent') {
      const hasMcp = config.plugins?.some(p => p.name === '@manicjs/mcp');
      const hasApiDocs = config.plugins?.some(
        p => p.name === '@manicjs/api-docs'
      );
      const info = {
        name: config.app?.name ?? 'Manic App',
        mcp: hasMcp ? '/.well-known/mcp/server-card.json' : null,
        openapi: '/openapi.json',
        docs: hasApiDocs ? '/docs' : null,
        agentSkills: hasMcp ? '/.well-known/agent-skills/index.json' : null,
        discovery: '/.well-known/api-catalog',
      };
      headers['Content-Type'] = 'application/json';
      headers['Access-Control-Allow-Origin'] = '*';
      return new Response(JSON.stringify(info, null, 2), { headers });
    }

    return new Response(rawHtml, { headers });
  };

  // Hidden internal route so the catch-all can fetch the processed HTMLBundle
  // for unknown SPA routes (Bun only processes HTMLBundle on static route values)
  const htmlBundleNonce =
    isHtmlBundle && !prod ? `/__manic_html_${crypto.randomUUID()}` : null;

  const handleDynamicRequest = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname.startsWith('/_manic/open')) {
      const file = url.searchParams.get('file');
      if (file) {
        const line = url.searchParams.get('line') || '1';
        const col = url.searchParams.get('column') || '1';
        const finalPath = file.startsWith('/')
          ? file.replace(/\\/g, '/')
          : `${process.cwd()}/${file}`.replace(/\\/g, '/');
        try {
          const editor = process.env.EDITOR || process.env.VISUAL;
          if (editor) {
            const args = editor.includes('code')
              ? ['-g', `${finalPath}:${line}:${col}`]
              : [finalPath];
            Bun.spawn([editor, ...args]).unref();
          } else {
            // macOS: open in default editor; Linux: xdg-open
            const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
            Bun.spawn([opener, finalPath]).unref();
          }
        } catch {}
        return new Response('OK');
      }
      return new Response('Missing file', { status: 400 });
    }

    if (prod) {
      const assetFile = Bun.file(
        join(
          process.cwd(),
          dist,
          'client',
          pathname === '/' ? 'index.html' : pathname
        )
      );
      if (await assetFile.exists()) {
        return new Response(assetFile, {
          headers: {
            'Content-Type': assetFile.type,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    }

    if (pathname.startsWith('/assets/')) {
      const assetPath = prod
        ? join(process.cwd(), dist, 'client', pathname.substring(1))
        : pathname.substring(1);
      const assetFile = Bun.file(assetPath);
      if (await assetFile.exists())
        return new Response(assetFile, {
          headers: prod
            ? {
                'Content-Type': assetFile.type,
                'Cache-Control': 'public, max-age=3600, must-revalidate',
              }
            : {
                'Content-Type': assetFile.type,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
              },
        });
    }

    // In dev, check if the requested file exists on disk (e.g., main.tsx, .js, .css)
    // If it exists, serve it directly; otherwise fall through to SPA handler
    if (!prod) {
      // Skip index.html — let serveHtml handle it so Link headers, markdown
      // negotiation, and ?mode=agent all work correctly
      if (pathname !== '/') {
        const file = Bun.file(pathname);
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              'Content-Type': file.type,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
        }
      }

      if (htmlBundleNonce) {
        if (
          prefersMarkdown(req) ||
          new URL(req.url).searchParams.get('mode') === 'agent'
        ) {
          return serveHtml(req);
        }
        const res = await fetch(new Request(`${url.origin}${htmlBundleNonce}`));
        if (linkHeaders.length) {
          const h = new Headers(res.headers);
          h.set('Link', linkHeaders.join(', '));
          return new Response(res.body, { status: res.status, headers: h });
        }
        return res;
      }
    }

    return serveHtml(req);
  };

  const bunRoutes: Record<string, any> = {};
  if (isHtmlBundle && !prod) {
    // Only register the nonce route — Bun needs one static HTMLBundle route to
    // process assets (Tailwind, HMR, .tsx imports). All page routes go through
    // /* so Link headers, markdown, and ?mode=agent work correctly.
    if (htmlBundleNonce) bunRoutes[htmlBundleNonce] = options.html;
  } else {
    const pageHandler = (req: Request) => serveHtml(req);
    bunRoutes['/'] = pageHandler;
    for (const route of routes) {
      if (route.path !== '/') bunRoutes[route.path] = pageHandler;
    }
  }

  if (config.mode === 'frontend') {
    if (config.sitemap && !prod) {
      const sitemapXml = generateSitemap(routes, config.sitemap);
      bunRoutes['/sitemap.xml'] = () =>
        new Response(sitemapXml, {
          headers: { 'content-type': 'application/xml' },
        });
    }

    if (config.plugins?.length) {
      const ctx = {
        config,
        prod,
        cwd: process.cwd(),
        dist,
        pageRoutes: routes.map(r => ({
          path: r.path,
          filePath: r.filePath,
          dynamic: r.path.includes(':'),
        })),
        apiRoutes: [] as any[],
        addRoute: (
          path: string,
          handler: (req: Request) => Response | Promise<Response>
        ) => {
          bunRoutes[path] = handler;
        },
        addLinkHeader: (value: string) => {
          linkHeaders.push(value);
        },
        injectHtml: (tags: string) => {
          htmlInjections.push(tags);
        },
      };
      for (const plugin of config.plugins) {
        if (plugin.configureServer) await plugin.configureServer(ctx);
      }
    }

    const server = Bun.serve({
      port,
      hostname,
      static: undefined,
      routes: { ...bunRoutes, '/*': handleDynamicRequest },
      development:
        !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
    });

    if (!prod) watchRoutes('app/routes', () => {}).catch(() => {});
    logServerInfo(server, port, hostname, prod, startTime, envKeys, config);
    return server;
  }

  // Fullstack mode (Hono)
  const { apiLoaderPlugin } = await import('../plugins/lib/api');
  const { app: apiApp, openApiSpec } = await apiLoaderPlugin(
    prod ? `${dist}/api` : 'app/api'
  );

  const specJson = JSON.stringify(openApiSpec);
  bunRoutes['/api'] = (req: Request) => apiApp.fetch(req);
  bunRoutes['/api/*'] = (req: Request) => apiApp.fetch(req);
  bunRoutes['/openapi.json'] = () =>
    new Response(specJson, { headers: { 'Content-Type': 'application/json' } });

  // API catalog (RFC 9727) — /.well-known/api-catalog
  const apiCatalog = {
    linkset: [
      {
        anchor: '/api',
        'service-desc': [{ href: '/openapi.json', type: 'application/json' }],
      },
    ],
  };
  const apiCatalogJson = JSON.stringify(apiCatalog);
  bunRoutes['/.well-known/api-catalog'] = () =>
    new Response(apiCatalogJson, {
      headers: {
        'Content-Type':
          'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      },
    });

  // Built-in Link headers (RFC 8288 / RFC 9727)
  linkHeaders.push(
    '</openapi.json>; rel="service-desc"; type="application/json"'
  );
  linkHeaders.push(
    '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"'
  );

  // MCP auto-discovery — advertise if the plugin registers the endpoint
  // The plugin itself adds the route; we pre-add the Link header so agents
  // see it on every HTML response regardless of plugin load order.
  linkHeaders.push(
    '</.well-known/mcp/server-card.json>; rel="mcp"; type="application/json"'
  );

  if (config.plugins?.length) {
    const ctx = {
      config,
      prod,
      cwd: process.cwd(),
      dist,
      pageRoutes: routes.map(r => ({
        path: r.path,
        filePath: r.filePath,
        dynamic: r.path.includes(':'),
      })),
      apiRoutes: [] as any[],
      addRoute: (
        path: string,
        handler: (req: Request) => Response | Promise<Response>
      ) => {
        bunRoutes[path] = handler;
      },
      addLinkHeader: (value: string) => {
        linkHeaders.push(value);
      },
      injectHtml: (tags: string) => {
        htmlInjections.push(tags);
      },
    };
    for (const plugin of config.plugins) {
      if (plugin.configureServer) await plugin.configureServer(ctx);
    }
  }

  const server = Bun.serve({
    port,
    hostname,
    static: undefined,
    routes: { ...bunRoutes, '/*': handleDynamicRequest },
    development:
      !prod && config.server?.hmr !== false ? { hmr: true } : undefined,
  });

  if (!prod) watchRoutes('app/routes', () => {}).catch(() => {});
  logServerInfo(server, port, hostname, prod, startTime, envKeys, config);
  return server;
}

function logServerInfo(
  server: any,
  port: number,
  hostname: string,
  prod: boolean,
  startTime: number,
  envKeys: string[],
  config: ManicConfig
) {
  const duration = Math.round(performance.now() - startTime);
  const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
  const url = `http://${displayHost}:${server.port ?? port}/`;
  console.log(
    `\n\n\t\t${red(bold('■ MANIC'))}            ${prod ? yellow(' PROD Server') : cyan(' DEV Server')}\n\t\t--- --- --- --- --- ---  --- ---`
  );
  console.log(`\n\t\t${cyan(bold('URL'))}:      ${green(url)}`);

  const mcpPlugin = config.plugins?.find(p => p.name === '@manicjs/mcp');
  if (mcpPlugin) {
    const mcpPath = (mcpPlugin as any).path ?? '/mcp';
    console.log(
      `\n\t\t${cyan(bold('MCP'))}:      ${green(`${url.replace(/\/$/, '')}${mcpPath}`)}`
    );
  }

  console.log(`\n\t\t${green('Ready in')} ${bold(duration + 'ms')}`);
  if (envKeys.length > 0)
    console.log(
      `\n\t\t${dim(gray(`Loaded ${bold(envKeys.length)} env vars`))}`
    );
  console.log('');
}
