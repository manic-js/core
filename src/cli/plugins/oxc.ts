import { transformSync } from 'oxc-transform';
import type { BunPlugin } from 'bun';
import { getConfig } from '../../config/index.js';

export function oxcPlugin(isDev = false): BunPlugin {
  return {
    name: 'manic-oxc-transform',
    setup(build) {
      build.onLoad({ filter: /\.(tsx?|jsx)$/ }, async args => {
        if (args.path.includes('node_modules')) return undefined;

        try {
          const sourceText = await Bun.file(args.path).text();
          const ext = args.path.split('.').pop() as string;
          const config = getConfig();

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
