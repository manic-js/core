import { transformSync } from 'oxc-transform';
import type { BunPlugin } from 'bun';
import { getConfig } from '../../config/index.js';

export function oxcPlugin(isDev = false): BunPlugin {
  return {
    name: 'manic-oxc-transform',
    setup(build) {
      build.onLoad({ filter: /\.(tsx?|jsx)$/ }, async args => {
        if (
          args.path.includes('node_modules') ||
          args.path.includes('tui/src/') ||
          args.path.includes('\\tui\\src\\')
        )
          return undefined;

        try {
          const sourceText = await Bun.file(args.path).text();
          const ext = args.path.split('.').pop() as string;
          const config = getConfig();

          if (args.path.includes('/app/') && (ext === 'tsx' || ext === 'jsx')) {
            const isMainEntry =
              args.path.endsWith('/app/main.tsx') ||
              args.path.endsWith('/app/main.jsx');
            const hasRawImg = /<img\b[^>]*>/i.test(sourceText);
            const hasRawAnchor = /<a\b[^>]*>/i.test(sourceText);
            const relativePath = args.path.replace(process.cwd() + '/', '');

            // Initialize global warnings array if not present
            if (!(globalThis as any).__MANIC_BUILD_WARNINGS__) {
              (globalThis as any).__MANIC_BUILD_WARNINGS__ = [];
            }
            const warnings = (globalThis as any).__MANIC_BUILD_WARNINGS__;

            if (hasRawImg) {
              warnings.push(
                `\x1b[33m[Manic Performance Warning]\x1b[0m Raw <img> tag found in ${relativePath}. Use <Image /> from 'manicjs/router' for automatic layout stability and SIMD image compression.`
              );
            }
            if (hasRawAnchor) {
              warnings.push(
                `\x1b[33m[Manic Router Warning]\x1b[0m Raw <a> tag found in ${relativePath}. Use <Link /> from 'manicjs/router' for client-side routing.`
              );
            }

            // Check for <Image /> tag missing width and height
            const imageMatches = sourceText.match(/<Image\b[^>]*>/gi);
            if (imageMatches) {
              for (const tag of imageMatches) {
                const hasWidth = /\bwidth\s*=\s*/i.test(tag);
                const hasHeight = /\bheight\s*=\s*/i.test(tag);
                const isSvgAttr = /\bsrc\s*=\s*['"`][^'"`]*\.svg['"`]/i.test(
                  tag
                );
                if (!hasWidth && !hasHeight && !isSvgAttr) {
                  warnings.push(
                    `\x1b[33m[Manic Image Warning]\x1b[0m <Image /> tag missing both "width" and "height" attributes in ${relativePath}. Adding dimensions improves CLS performance.`
                  );
                  break; // Warn once per file
                }
              }
            }

            // Detect interactive features in Server Components
            const isClient = /^\s*['"]use client['"]/mu.test(sourceText);
            if (!isClient && !isMainEntry) {
              const hookMatch = sourceText.match(
                /\b(useState|useEffect|useRef|useReducer|useMemo|useCallback|useContext|useLayoutEffect|useTransition|useDeferredValue)\b/u
              );
              const eventMatch = sourceText.match(/\bon[A-Z]\w*\s*=/u);
              if (hookMatch || eventMatch) {
                const feature = hookMatch
                  ? `React hook "${hookMatch[1]}"`
                  : 'JSX event handler';
                const errorMsg = `[Manic Server Component Error] ${feature} found in Server Component ${relativePath}. Interactive features require client-side execution. Add the "use client" directive at the top of the file to mark it as a Client Component.`;
                console.error(`\x1b[31m${errorMsg}\x1b[0m`);
                throw new Error(errorMsg);
              }
            }
          }

          const result = transformSync(args.path, sourceText, {
            lang: ext as any,
            target: (isDev
              ? (config.oxc?.target ?? 'esnext')
              : 'es2022') as any,
            sourcemap: isDev,
            jsx: {
              runtime: 'automatic',
              development: isDev,
              refresh: isDev && config.oxc?.refresh !== false,
            },
            typescript: {
              rewriteImportExtensions:
                config.oxc?.rewriteImportExtensions !== false,
              onlyRemoveTypeImports: true,
            },
          });

          let contents = result.code;

          if (isDev && (ext === 'tsx' || ext === 'jsx')) {
            contents += `\nif(import.meta.hot){import.meta.hot.accept(()=>{window.__react_refresh_library__?.performRefresh?.();});}`;
          }

          return {
            contents,
            loader: ext === 'tsx' || ext === 'jsx' ? 'jsx' : 'js',
            map:
              result.map && typeof result.map === 'string'
                ? JSON.parse(result.map)
                : result.map,
          };
        } catch (e) {
          console.error(`[Manic OXC] Failed to transform ${args.path}:`, e);
          return undefined;
        }
      });
    },
  };
}
