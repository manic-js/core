import { transformSync } from "oxc-transform";
import type { BunPlugin } from "bun";

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
          const sourceText = await Bun.file(args.path).text();
          const ext = args.path.split(".").pop();
          
          const isDev = process.env.NODE_ENV === "development";
          
          const result = transformSync(args.path, sourceText, {
            lang: ext as any,
            target: isDev ? "esnext" : "es2022",
            jsx: {
              runtime: "automatic",
              development: isDev,
            },
            typescript: {
              rewriteImportExtensions: true,
              onlyRemoveTypeImports: true,
            },
          });

          if (result.errors && result.errors.length > 0) {
            console.error(`[Manic OXC] Transform errors in ${args.path}:`, result.errors);
            return undefined; // fallback
          }

          return {
            contents: result.code,
            loader: ext === "tsx" || ext === "jsx" ? "jsx" : "js",
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
