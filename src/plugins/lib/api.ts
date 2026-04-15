import { Elysia } from "elysia";

export const apiLoaderPlugin = async (apiDir: string = "app/api") => {
  let app = new Elysia({ name: "manic.api" });
  const routes: string[] = [];

  const dirFile = Bun.file(apiDir);
  const exists = await dirFile.exists();
  
  if (!exists) {
    return { app, routes };
  }

  const explorer = new Bun.Glob("**/*.{ts,tsx}");

  for await (const file of explorer.scan({ cwd: apiDir })) {
    const fullPath = `${process.cwd()}/${apiDir}/${file}`;

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
        routes.push(matchPathToPattern(mountPath));
        app = app.group(`/api/${routePath}`, (g) => g.use(mod.default));
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
