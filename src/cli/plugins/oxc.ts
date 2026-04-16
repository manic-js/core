import { transformSync } from "oxc-transform";
import type { BunPlugin } from "bun";
import { getConfig } from "../../config/index.js";

export function oxcPlugin(): BunPlugin {
  return {
    name: "manic-oxc-transform",
    setup(build) {
      build.onLoad({ filter: /\.(tsx?|jsx)$/ }, async (args) => {
        // Skip node_modules so that third party code isn't slowed down by parsing
        if (args.path.includes("node_modules")) {
          return undefined;
        }

        try {
          let sourceText = await Bun.file(args.path).text();
          const ext = args.path.split(".").pop();
          const config = getConfig();

          if (sourceText.includes("lucide-react")) {
            sourceText = sourceText.replace(
              /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']lucide-react["']/g,
              (_, names: string) => {
                return names.split(",").map(n => {
                  const name = n.trim();
                  const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
                  return `import ${name} from "lucide-react/dist/esm/icons/${kebab}";`;
                }).join("\n");
              }
            );
          }

          const isDev = process.env.NODE_ENV === "development";

          const result = transformSync(args.path, sourceText, {
            lang: ext as any,
            target: (isDev ? config.oxc?.target : "es2022") as any,
            sourcemap: true,
            jsx: {
              runtime: "automatic",
              development: isDev,
              refresh: isDev && config.oxc?.refresh !== false,
            },
            typescript: {
              rewriteImportExtensions: config.oxc?.rewriteImportExtensions !== false,
              onlyRemoveTypeImports: true,
            },
          });

          let contents = result.code;

          // Inject HMR Glue for React Fast Refresh
          if (isDev && (ext === "tsx" || ext === "jsx")) {
            contents += `
              if (import.meta.hot) {
                import.meta.hot.accept((next) => {
                  try {
                    window.__react_refresh_library__.performRefresh?.();
                  } catch (e) {
                    window.location.reload();
                  }
                });
              }
            `;
          }

          return {
            contents,
            loader: ext === "tsx" || ext === "jsx" ? "jsx" : "js",
            map: (result.map && typeof result.map === "string") ? JSON.parse(result.map) : result.map,
          };
        } catch (error) {
          console.error(`[Manic OXC] Failed to transform ${args.path}`);
          console.error(error);
          return undefined; // fallback to default bun compilation
        }
      });
    },
  };
}
