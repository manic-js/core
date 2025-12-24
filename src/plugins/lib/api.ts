import { Elysia } from "elysia";
import { join } from "node:path";

export const apiLoaderPlugin = async (apiDir: string = "app/api") => {
  const app = new Elysia({ name: "manic.api" });
  const routes: string[] = [];

  const explorer = new Bun.Glob("**/*.{ts,tsx}");

  for await (const file of explorer.scan({ cwd: apiDir })) {
    const fullPath = join(process.cwd(), apiDir, file);

    try {
      const mod = await import(fullPath);

      if (mod.default) {
        let routePath = file
          .replace(/\.tsx?$/, "")
          .replace(/\/index$/, "")
          .replace(/^index$/, "");

        if (routePath === "") {
          console.warn(
            `[Manic API] Skipping ${file} - use folder structure like api/hello/index.ts`
          );
          continue;
        }

        const mountPath = `/api/${routePath}`;
        routes.push(mountPath);
        app.group(mountPath, (g) => g.use(mod.default));
      }
    } catch (err) {
      console.error(`[Manic API] Failed to load ${file}:`, err);
    }
  }

  return { app, routes };
};
