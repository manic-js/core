import { green, bold, cyan, yellow, gray, dim } from '@manicjs/tui';
import { discoverRoutes, watchRoutes, generateSitemap } from './lib/discovery';
import {
  htmlToMarkdown,
  estimateTokens,
  prefersMarkdown,
} from './lib/markdown';
import { loadConfig, type ManicConfig } from '../config/index';
import { join } from 'path';
import { existsSync } from 'fs';

function resolveRuntimePort(configuredPort?: number): number {
  const envPort = Number.parseInt(process.env.PORT ?? '', 10);
  return Number.isFinite(envPort) && envPort > 0
    ? envPort
    : (configuredPort ?? 6070);
}

function serializeHydrationData(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

/**
 * Creates and starts the Manic production/development server.
 *
 * This is the main server entry point that handles:
 * - Static asset serving (client build, assets directory)
 * - HTML serving with plugin injection
 * - Markdown content negotiation (RFC 8288)
 * - Agent mode for AI agents (?mode=agent)
 * - API routes (in fullstack mode)
 * - OpenAPI spec generation
 * - Link headers (RFC 8288)
 * - Plugin route registration
 *
 * @param options - Server configuration options
 * @param options.html - HTML content (string, Bun.file, or HTMLBundle)
 * @param options.config - Manic configuration (loads from manic.config.ts if not provided)
 * @param options.routes - Discovered routes (auto-discovered if not provided)
 * @param options.envKeys - Environment variable keys to expose to client
 * @param options.startTime - Start time for performance measurement
 * @returns The Bun server instance
 * @see https://www.manicjs.tech/docs/api/server/create-manic-server#options
 * @see https://www.manicjs.tech/docs/core/server-runtime#high-level-branches
 *
 * @example
 * // Basic usage with ~manic.ts
 * import { createManicServer } from 'manicjs';
 * import app from './app/index.html';
 *
 * const server = await createManicServer({
 *   html: app,
 * });
 *
 * @example
 * // Full configuration
 * const server = await createManicServer({
 *   html: app,
 *   config: myConfig,
 *   routes: discoveredRoutes,
 *   envKeys: ['API_KEY'],
 *   startTime: performance.now(),
 * });
 */
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
  const port = resolveRuntimePort(config.app?.port);
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

  const getDevHtmlShell = async (req: Request): Promise<string> => {
    if (!htmlBundleNonce) {
      return Bun.file('app/index.html').text();
    }

    const res = await fetch(
      new Request(`${new URL(req.url).origin}${htmlBundleNonce}`)
    );
    return res.text();
  };

  // SSR handler for development when ssr is enabled
  const serveSsrHtml = async (req: Request): Promise<Response> => {
    if (config.router?.ssr === false) return serveHtml(req);

    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    };
    if (linkHeaders.length) {
      headers['Link'] = linkHeaders.join(', ');
    }

    try {
      // Load SSR manifest
      const ssrManifestPath = join(process.cwd(), 'app/~routes.generated.ts');
      const ssrManifestModule = await import(ssrManifestPath);
      const ssrRoutes = Object.fromEntries(
        Object.entries(ssrManifestModule.routes).map(([path, entry]: any) => [
          path,
          typeof entry === 'function' ? entry : entry.import,
        ])
      );
      const notFoundPage = ssrManifestModule.notFoundPage;

      const url = new URL(req.url);
      const pathname = url.pathname;

      const reactDomServerPath = Bun.resolveSync(
        'react-dom/server',
        process.cwd()
      );
      const { renderToReadableStream } = await import(reactDomServerPath);
      const { RouterContext } = await import('../router');
      const { ThemeProvider } = await import('../theme');

      // Find matching route
      const routeDefs = Object.entries(ssrRoutes).map(([path, mod]) => ({
        path: path || '/',
        component: null,
        loader: typeof mod === 'function' ? mod : () => mod,
      }));
      const { RouteRegistry } = await import('../router/lib/matcher');
      const registry = new RouteRegistry(routeDefs);
      const match = registry.match(pathname);

      // Get HTML shell
      let htmlShell: string;
      if (isHtmlBundle) {
        htmlShell = prod
          ? await Bun.file(
              join(process.cwd(), dist, 'client', 'index.html')
            ).text()
          : await getDevHtmlShell(req);
      } else {
        htmlShell =
          typeof options.html === 'function'
            ? await options.html()
            : options.html;
      }

      // Inject plugin HTML tags into <head>
      if (htmlInjections.length) {
        htmlShell = htmlShell.replace(
          '</head>',
          `${htmlInjections.join('\n')}\n</head>`
        );
      }

      // In dev, replace raw .tsx script tag with bundled entry
      if (!prod && devClientEntry) {
        htmlShell = htmlShell.replace(
          /<script[^>]*src="[^"]*main\.tsx"[^>]*><\/script>/,
          `<script type="module" src="${devClientEntry}"></script>`
        );
        htmlShell = htmlShell.replace(
          /<link rel="stylesheet" href="(?:"|')tailwindcss(?:"|')\s*\/?>/,
          '<link rel="stylesheet" href="/tailwindcss" />'
        );
      }

      if (!match) {
        if (notFoundPage) {
          const res = await notFoundPage();
          const NotFound = res.default || res;
          const stream = await renderToReadableStream(
            <ThemeProvider>
              <NotFound />
            </ThemeProvider>
          );
          return streamToResponse(stream, htmlShell, null, headers);
        }
        return new Response('404 Not Found', { status: 404, headers });
      }

      const routeModule = await ssrRoutes[match.path]();
      const Component = routeModule.default;

      let loaderData = null;
      if (routeModule.loader) {
        loaderData = await routeModule.loader({
          params: match.params,
          request: req,
        });
      }

      const stream = await renderToReadableStream(
        <ThemeProvider>
          <RouterContext.Provider
            value={{
              path: pathname,
              navigate: () => {},
              params: match.params,
              loaderData,
            }}
          >
            <Component loaderData={loaderData} />
          </RouterContext.Provider>
        </ThemeProvider>
      );

      return streamToResponse(stream, htmlShell, loaderData, headers);
    } catch (error) {
      console.error('Dev SSR error:', error);
      return serveHtml(req);
    }
  };

  const streamToResponse = (
    stream: ReadableStream<Uint8Array>,
    htmlShell: string,
    loaderData: any,
    headers: Record<string, string>
  ): Response => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Write HTML head and stream the rest in the background to prevent deadlock
    (async () => {
      try {
        const rootMarker = '<div id="root"></div>';
        const rootIndex = htmlShell.indexOf(rootMarker);
        if (rootIndex === -1) {
          await writer.write(encoder.encode(htmlShell));
          return;
        }

        const beforeRoot = htmlShell.slice(0, rootIndex);
        await writer.write(encoder.encode(`${beforeRoot}<div id="root">`));

        // Stream body content from React's readable stream (React yields Uint8Array directly)
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              await writer.write(value);
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Write HTML tail with injected loader data script for client router hydration
        const loaderScript =
          loaderData !== null && loaderData !== undefined
            ? `<script type="application/json" id="__MANIC_DATA__">${serializeHydrationData(loaderData)}</script>`
            : '';
        const tailHtml = `</div>${loaderScript}${htmlShell.slice(rootIndex + rootMarker.length)}`;
        await writer.write(encoder.encode(tailHtml));
      } catch (err) {
        console.error('[SSR Stream Error]', err);
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, { headers });
  };

  // Hidden internal route so the catch-all can fetch the processed HTMLBundle
  // for unknown SPA routes (Bun only processes HTMLBundle on static route values)
  const htmlBundleNonce =
    isHtmlBundle && !prod ? `/__manic_html_${crypto.randomUUID()}` : null;

  const handleDynamicRequest = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (!prod && pathname.startsWith('/_manic/open')) {
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

    if (!prod) {
      if (htmlBundleNonce) {
        if (
          prefersMarkdown(req) ||
          new URL(req.url).searchParams.get('mode') === 'agent'
        ) {
          return serveHtml(req);
        }
        const res = await fetch(new Request(`${url.origin}${htmlBundleNonce}`));
        let body = await res.text();
        if (htmlInjections.length) {
          body = body.replace(
            '</head>',
            `${htmlInjections.join('\n')}\n</head>`
          );
        }
        const h = new Headers(res.headers);
        h.delete('content-length');
        if (linkHeaders.length) {
          h.set('Link', linkHeaders.join(', '));
        }
        return new Response(body, { status: res.status, headers: h });
      }
    }

    return config.router?.ssr !== false && !prod
      ? serveSsrHtml(req)
      : serveHtml(req);
  };

  const bunRoutes: Record<string, any> = {};

  // High-performance image optimization endpoint
  bunRoutes['/api/_manic/image'] = async (req: Request) => {
    try {
      const url = new URL(req.url);
      const imageUrl = url.searchParams.get('url');
      if (!imageUrl) {
        return new Response('Missing url parameter', { status: 400 });
      }

      const wParam = url.searchParams.get('w');
      const width = wParam ? parseInt(wParam, 10) : null;
      const qParam = url.searchParams.get('q');
      const quality = qParam ? parseInt(qParam, 10) : 95;

      let imageFile: any;
      const imageUrlStr = imageUrl;
      const isLocal = !/^(https?:|\/\/)/.test(imageUrlStr);

      if (isLocal) {
        const path = imageUrlStr.startsWith('/')
          ? imageUrlStr.substring(1)
          : imageUrlStr;
        const publicFile = Bun.file(join(process.cwd(), 'public', path));
        if (await publicFile.exists()) {
          imageFile = publicFile;
        } else {
          const clientFile = Bun.file(join(process.cwd(), path));
          if (await clientFile.exists()) {
            imageFile = clientFile;
          }
        }
      } else {
        const response = await fetch(imageUrlStr);
        if (!response.ok) {
          return new Response('Failed to fetch remote image', { status: 502 });
        }
        imageFile = await response.blob();
      }

      if (!imageFile) {
        return new Response('Image not found', { status: 404 });
      }

      if ((imageUrlStr.split('?')[0] || '').toLowerCase().endsWith('.svg')) {
        return new Response(imageFile, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      if (typeof (imageFile as any).image !== 'function') {
        const ext = (imageUrlStr.split('?')[0] || '')
          .split('.')
          .pop()
          ?.toLowerCase();
        let contentType = imageFile.type;
        if (!contentType) {
          switch (ext) {
            case 'png':
              contentType = 'image/png';
              break;
            case 'jpg':
            case 'jpeg':
              contentType = 'image/jpeg';
              break;
            case 'gif':
              contentType = 'image/gif';
              break;
            case 'webp':
              contentType = 'image/webp';
              break;
            case 'avif':
              contentType = 'image/avif';
              break;
            default:
              contentType = 'application/octet-stream';
          }
        }
        return new Response(imageFile, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      let img = (imageFile as any).image();
      if (width && !isNaN(width)) {
        img = img.resize(width, null, { fit: 'inside' });
      }

      const buffer = await img
        .webp({ quality, lossless: quality >= 95 })
        .bytes();

      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (err: any) {
      return new Response(`Image optimization failed: ${err.message}`, {
        status: 500,
      });
    }
  };

  if (isHtmlBundle && !prod) {
    // Only register the nonce route — Bun needs one static HTMLBundle route to
    // process assets (Tailwind, HMR, .tsx imports). All page routes go through
    // /* so Link headers, markdown, and ?mode=agent work correctly.
    if (htmlBundleNonce) bunRoutes[htmlBundleNonce] = options.html;
  } else if (config.router?.ssr && prod) {
    // In production SSR mode, don't register explicit page routes.
    // Let the /* catch-all (serveSSR) handle all pages with proper SSR rendering.
  } else {
    const pageHandler = (req: Request) =>
      config.router?.ssr !== false && !prod
        ? serveSsrHtml(req)
        : serveHtml(req);
    bunRoutes['/'] = pageHandler;
    for (const route of routes) {
      if (route.path !== '/') bunRoutes[route.path] = pageHandler;
    }
  }

  // Fullstack mode (Hono)
  const { apiLoaderPlugin } = await import('../plugins/lib/api');
  const { app: apiApp, openApiSpec } = await apiLoaderPlugin(
    prod ? `${dist}/api` : 'app/api'
  );

  // ── SSR infrastructure (only when config.ssr is enabled) ──────
  let serveSSR: ((req: Request) => Promise<Response>) | null = null;
  let devClientEntry: string | null = null;
  const devClientFiles = new Map<string, { data: Uint8Array; type: string }>();

  if (config.router?.ssr !== false) {
    // Loader deduplication for concurrent requests to the same route
    const loaderDedupe = new Map<string, Promise<any>>();

    const executeLoaderWithCache = async (
      loader: (...args: any[]) => any,
      params: Record<string, string>,
      request: Request,
      pathname: string
    ): Promise<any> => {
      const loaderName = loader.name || 'anonymous';
      const cacheKey = `${pathname}:${loaderName}`;
      if (loaderDedupe.has(cacheKey)) {
        return loaderDedupe.get(cacheKey)!;
      }
      const promise = loader({ params, request });
      loaderDedupe.set(cacheKey, promise);
      try {
        return await promise;
      } finally {
        loaderDedupe.delete(cacheKey);
      }
    };

    // Load SSR manifest once at startup
    const ssrManifestPath = join(process.cwd(), 'app/~routes.generated.ts');
    const ssrManifestModule = await import(ssrManifestPath);
    const ssrRoutes = Object.fromEntries(
      Object.entries(ssrManifestModule.routes).map(([path, entry]: any) => [
        path,
        typeof entry === 'function' ? entry : entry.import,
      ])
    );
    const ssrNotFoundPage = ssrManifestModule.notFoundPage;
    const clientRoutes = Object.fromEntries(
      Object.entries(ssrManifestModule.routes).map(([path, entry]: any) => [
        path,
        typeof entry === 'function' ? false : (entry.client ?? false),
      ])
    );

    // RouteRegistry setup at startup
    const ssrRouteDefs = Object.entries(ssrRoutes).map(([path, mod]) => ({
      path: path || '/',
      component: null,
      loader: typeof mod === 'function' ? mod : () => mod,
    }));
    const { RouteRegistry } = await import('../router/lib/matcher');
    const registry = new RouteRegistry(ssrRouteDefs);

    // Default render function using React SSR with streaming
    const defaultRender = async (
      pathname: string,
      manifest: any
    ): Promise<ReadableStream<Uint8Array> | string> => {
      const reactDomServerPath = Bun.resolveSync(
        'react-dom/server',
        process.cwd()
      );
      const reactPath = Bun.resolveSync('react', process.cwd());
      const { renderToReadableStream } = await import(reactDomServerPath);
      const { RouterContext } = await import('../router');
      const { ThemeProvider } = await import('../theme');
      const { createElement } = await import(reactPath);

      const match = registry.match(pathname);

      if (!match) {
        if (ssrNotFoundPage) {
          const res = await ssrNotFoundPage();
          const NotFound = res.default || res;
          return renderToReadableStream(
            createElement(ThemeProvider, null, createElement(NotFound))
          );
        }
        return '<html><body>404 Not Found</body></html>';
      }

      if (clientRoutes[match.path]) {
        if (!prod) {
          console.warn(
            `[Manic SSR] ${match.path} is marked "use client"; serving the HTML shell and hydrating on the client.`
          );
        }
        return '';
      }

      const routeModule = await manifest[match.path]();
      const Component = routeModule.default;

      let loaderData = null;
      if (routeModule.loader) {
        const request = new Request(`http://localhost${pathname}`);
        loaderData = await executeLoaderWithCache(
          routeModule.loader,
          match.params,
          request,
          pathname
        );
      }

      return renderToReadableStream(
        createElement(
          ThemeProvider,
          null,
          createElement(
            RouterContext.Provider,
            {
              value: {
                path: pathname,
                navigate: () => {},
                params: match.params,
                loaderData,
              },
            },
            createElement(Component, { loaderData })
          )
        ),
        {
          onError(err: any) {
            console.error('[React SSR Stream Error]', err);
          },
        }
      );
    };

    // Dev client bundling at startup
    if (!prod) {
      const mainEntry = join(process.cwd(), 'app', 'main.tsx');
      if (existsSync(mainEntry)) {
        const buildResult = await Bun.build({
          entrypoints: [mainEntry],
          outdir: join(process.cwd(), dist),
          target: 'browser',
          splitting: true,
          minify: true,
          define: {
            'process.env.NODE_ENV': '"development"',
          },
          naming: {
            entry: 'dev/[name]-[hash].[ext]',
            chunk: 'dev/chunks/[name]-[hash].[ext]',
          },
          sourcemap: 'inline',
        });
        if (buildResult.success) {
          const outdirAbs = join(process.cwd(), dist);
          for (const output of buildResult.outputs) {
            if (output.path.endsWith('.css')) continue;
            const data = await output.arrayBuffer();
            const filePath = '/' + output.path.slice(outdirAbs.length + 1);
            devClientFiles.set(filePath, {
              data: new Uint8Array(data),
              type: 'application/javascript',
            });
            if (output.kind === 'entry-point') {
              devClientEntry = filePath;
            }
          }
        } else {
          console.error(
            '[Manic Dev] Client build failed:',
            buildResult.logs.join('\n')
          );
        }
      }
    }

    // serveSSR handler — serves dev files, static assets,
    // APIs, then SSR for pages
    serveSSR = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Editor opener (/_manic/open)
      if (!prod && pathname.startsWith('/_manic/open')) {
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
              const opener =
                process.platform === 'darwin' ? 'open' : 'xdg-open';
              Bun.spawn([opener, finalPath]).unref();
            }
          } catch {}
          return new Response('OK');
        }
        return new Response('Missing file', {
          status: 400,
        });
      }

      // Serve pre-built dev client files from memory
      if (!prod && devClientFiles.has(pathname)) {
        const file = devClientFiles.get(pathname)!;
        return new Response(file.data, {
          headers: {
            'Content-Type': file.type,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }

      // Serve static assets
      if (prod) {
        if (!registry.match(pathname)) {
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
      } else if (pathname !== '/') {
        const searchPaths = [
          pathname.substring(1),
          join('app', pathname),
          join('assets', pathname),
          join('public', pathname),
        ];
        for (const p of searchPaths) {
          if (existsSync(p)) {
            const file = Bun.file(p);
            return new Response(file, {
              headers: {
                'Content-Type': file.type,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
              },
            });
          }
        }
      }

      // Image optimization
      if (pathname === '/api/_manic/image') {
        return bunRoutes['/api/_manic/image'](req);
      }

      // API routes
      if (pathname.startsWith('/api/')) {
        return apiApp.fetch(req);
      }

      // Markdown content negotiation (RFC 8288)
      if (prefersMarkdown(req)) {
        let rawHtml: string;
        if (isHtmlBundle) {
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
        const md = htmlToMarkdown(rawHtml);
        const tokens = estimateTokens(md);
        const mdHeaders: Record<string, string> = {
          'Content-Type': 'text/markdown; charset=utf-8',
          Vary: 'Accept',
          'x-markdown-tokens': String(tokens),
        };
        if (linkHeaders.length) {
          mdHeaders['Link'] = linkHeaders.join(', ');
        }
        return new Response(md, { headers: mdHeaders });
      }

      // Agent mode — return structured JSON about the app
      if (url.searchParams.get('mode') === 'agent') {
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
        const agentHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        };
        if (linkHeaders.length) {
          agentHeaders['Link'] = linkHeaders.join(', ');
        }
        return new Response(JSON.stringify(info, null, 2), {
          headers: agentHeaders,
        });
      }

      // Get HTML shell
      let htmlShell: string;
      if (prod) {
        htmlShell = await Bun.file(
          join(process.cwd(), dist, 'client', 'index.html')
        ).text();
      } else if (typeof options.html === 'function') {
        htmlShell = await options.html();
      } else if (
        options.html &&
        typeof options.html === 'object' &&
        'index' in options.html
      ) {
        htmlShell = await Bun.file(options.html.index).text();
      } else {
        htmlShell = await Bun.file(
          join(process.cwd(), dist, 'client', 'index.html')
        ).text();
      }

      // In dev mode, replace raw .tsx script tag with bundled entry
      if (!prod && devClientEntry) {
        htmlShell = htmlShell.replace(
          /<script[^>]*src="[^"]*main\.tsx"[^>]*><\/script>/,
          `<script type="module" src="${devClientEntry}"></script>`
        );
        htmlShell = htmlShell.replace(
          /<link rel="stylesheet" href="(?:"|')tailwindcss(?:"|')\s*\/?>/,
          '<link rel="stylesheet" href="/tailwindcss" />'
        );
      }

      // Inject plugin HTML tags into <head>
      if (htmlInjections.length) {
        htmlShell = htmlShell.replace(
          '</head>',
          `${htmlInjections.join('\n')}\n</head>`
        );
      }

      // Render page with SSR (streaming)
      const headers: Record<string, string> = {
        'Content-Type': 'text/html; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      };
      if (linkHeaders.length) {
        headers['Link'] = linkHeaders.join(', ');
      }

      try {
        const match = registry.match(pathname);
        let loaderData = null;
        if (match) {
          const routeModule = await ssrRoutes[match.path]();
          if (!clientRoutes[match.path] && routeModule.loader) {
            loaderData = await executeLoaderWithCache(
              routeModule.loader,
              match.params,
              req,
              pathname
            );
          }
        }

        const stream = await defaultRender(pathname, ssrRoutes);

        if (typeof stream === 'string') {
          const loaderScript =
            loaderData !== null && loaderData !== undefined
              ? `<script type="application/json" id="__MANIC_DATA__">${serializeHydrationData(loaderData)}</script>`
              : '';
          const fullHtml = htmlShell.replace(
            '<div id="root"></div>',
            `<div id="root">${stream}</div>${loaderScript}`
          );
          return new Response(fullHtml, { headers });
        }

        if (stream instanceof ReadableStream) {
          return streamToResponse(stream, htmlShell, loaderData, headers);
        }

        return new Response('Invalid render result', {
          status: 500,
          headers,
        });
      } catch (error) {
        console.error('SSR render error:', error);
        return new Response(htmlShell, {
          headers,
          status: 500,
        });
      }
    };
  }

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
        if (
          path === '/*' ||
          path === '*' ||
          path.startsWith('/api/') ||
          path === '/api' ||
          path.startsWith('/api*') ||
          path === '/api/*'
        ) {
          let honoPath = path.startsWith('/api')
            ? path.replace(/^\/api/u, '') || '/'
            : path;
          if (honoPath === '/*') {
            honoPath = '*';
          }
          apiApp.all(honoPath, async (c: any) => {
            const res = await handler(c.req.raw);
            return res;
          });
        }
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

  if (config.router?.ssr !== false && serveSSR) {
    // Register explicit routes for dev client JS files so they
    // aren't caught by static middleware. CSS files are NOT
    // registered here — they go through static middleware so
    // bun-plugin-tailwind can scan source files and generate
    // utility classes.
    if (!prod) {
      for (const [key] of devClientFiles) {
        if (!key.endsWith('.css')) {
          bunRoutes[key] = serveSSR;
        }
      }
    }
  }

  const server = Bun.serve({
    port,
    hostname,
    static: undefined,
    routes: {
      ...bunRoutes,
      '/*':
        config.router?.ssr !== false && serveSSR
          ? serveSSR
          : handleDynamicRequest,
    },
    development: !prod ? { hmr: true } : undefined,
  });

  if (!prod) watchRoutes('app/routes', () => {}).catch(() => {});
  logServerInfo(server, port, hostname, prod, startTime, envKeys, config);
  return server;
}

// Backward-compatible re-export
export const createManicSSRServer = createManicServer;

function logServerInfo(
  server: any,
  port: number,
  hostname: string,
  prod: boolean,
  startTime: number,
  envKeys: string[],
  config: ManicConfig
) {
  if (process.env.MANIC_TUI_SUPPRESS_SERVER_INFO === '1') {
    return;
  }
  const duration = Math.round(performance.now() - startTime);
  const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
  const url = `http://${displayHost}:${server.port ?? port}/`;
  console.log(`\n${dim('────────────────────────────────────────')}`);
  console.log(
    `${bold('Server')} ${prod ? yellow('[production]') : cyan('[development]')}`
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
