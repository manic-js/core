import { Elysia } from "elysia";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const apiLoaderPlugin = async (apiDir: string = "app/api") => {
  let app = new Elysia({ name: "manic.api" });
  const routes: string[] = [];
  const apiRoot = isAbsolute(apiDir) ? apiDir : join(process.cwd(), apiDir);

  if (!existsSync(apiRoot)) {
    return { app, routes };
  }

  const explorer = new Bun.Glob("**/*.{ts,tsx}");

  for await (const file of explorer.scan({ cwd: apiRoot })) {
    const fullPath = join(apiRoot, file);

    try {
      const mod = await import(fullPath);

      if (mod.default) {
        let routePath = file
          .replace(/\.tsx?$/, "")
          .replace(/\/index$/, "")
          .replace(/^index$/, "");

        if (routePath === "") {
           // Handle root api index
           app = app.all("/api", (ctx) => mod.default(ctx));
           routes.push("/api");
           continue;
        }

        const mountPath = `/api/${routePath}`;
        routes.push(matchPathToPattern(mountPath));

        if (typeof mod.default === "function" && !(mod.default as any).fetch) {
           // If it's a plain function, register basic methods for Swagger
           app = app.get(mountPath, (ctx) => mod.default(ctx))
                    .post(mountPath, (ctx) => mod.default(ctx))
                    .put(mountPath, (ctx) => mod.default(ctx))
                    .delete(mountPath, (ctx) => mod.default(ctx));
        } else {
           // If it's an Elysia instance or plugin, use it directly.
           app = app.group(mountPath, (g) => g.use(mod.default));
        }
      }
    } catch (err) {
      console.error(`[Manic API] Failed to load ${file}:`, err);
    }
  }

  return { app, routes };
};

function matchPathToPattern(path: string) {
    return path.replace(/\[([^\]]+)\]/g, ":$1");
}
