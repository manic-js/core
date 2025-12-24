import { cyan, green, red, dim, bold } from "colorette";
import { rmSync, mkdirSync, cpSync } from "node:fs";
import bunPluginTailwind from "bun-plugin-tailwind";
import { loadConfig } from "../../config";

export async function build() {
  const config = await loadConfig();
  const distDir = config.build?.outdir || ".manic";

  console.log(cyan("Building for production..."));

  try {
    rmSync(distDir, { recursive: true, force: true });
  } catch {}
  mkdirSync(distDir, { recursive: true });

  console.log(dim("Bundling server..."));

  const serverBuild = await Bun.build({
    entrypoints: ["./~manic.ts"],
    outdir: distDir,
    target: "bun",
    minify: config.build?.minify ?? true,
    sourcemap: config.build?.sourcemap,
  });

  if (!serverBuild.success) {
    console.error(red("Server build failed:"));
    console.error(serverBuild.logs.join("\n"));
    process.exit(1);
  }

  console.log(dim("Bundling client..."));

  const clientBuild = await Bun.build({
    entrypoints: ["./app/main.tsx"],
    outdir: `${distDir}/public`,
    target: "browser",
    minify: config.build?.minify ?? true,
    splitting: config.build?.splitting ?? true,
    sourcemap: config.build?.sourcemap,
    naming: "[dir]/[name]-[hash].[ext]",
    plugins: [bunPluginTailwind],
  });

  if (!clientBuild.success) {
    console.error(red("Client build failed:"));
    console.error(clientBuild.logs.join("\n"));
    process.exit(1);
  }

  try {
    cpSync("public", `${distDir}/public`, { recursive: true });
  } catch {}

  const mainEntry = clientBuild.outputs.find((o) => o.kind === "entry-point");
  const mainScript = mainEntry ? mainEntry.path.split("/").pop() : "main.js";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.app?.name || "Manic App"}</title>
    <link rel="stylesheet" href="tailwindcss">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${mainScript}"></script>
  </body>
</html>`;

  await Bun.write(`${distDir}/public/index.html`, html);

  console.log(green(bold("Build complete!")));
  console.log(dim(`Output: ./${distDir}`));
}
