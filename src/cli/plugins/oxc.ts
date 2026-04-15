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
          let sourceText = await Bun.file(args.path).text();
          const ext = args.path.split(".").pop();
          
          // Optimization: Automated Import Rewriting for known bloated libraries
          // This happens at the text level before parsing for speed, 
          // but we only do it if the keyword exists to avoid wasted cycles.
          if (sourceText.includes("lucide-react")) {
             // Example: import { Mail } from "lucide-react" -> import Mail from "lucide-react/dist/esm/icons/mail"
             // However, OXC transform doesn't support complex import rewriting natively yet in the JS wrapper easily.
             // We'll use a fast regex for this specific "breaking/oxc" branch to show off.
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
            target: isDev ? "esnext" : "es2022",
            jsx: {
              runtime: "automatic",
              development: isDev,
              refresh: isDev, // THE MAGIC FLAG
            },
            typescript: {
              rewriteImportExtensions: true,
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
                    // Trigger React Refresh after the module is re-executed
                    // This is picked up by the preamble in index.html
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
