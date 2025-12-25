import { green, red, dim, bold } from "colorette";
import {
  rmSync,
  mkdirSync,
  cpSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import bunPluginTailwind from "bun-plugin-tailwind";
import { loadConfig } from "../../config";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getDirSize(dir: string): number {
  let size = 0;
  if (!existsSync(dir)) return 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    size += entry.isDirectory() ? getDirSize(path) : statSync(path).size;
  }
  return size;
}

async function countRoutes(dir: string, pattern: string): Promise<number> {
  let count = 0;
  if (!existsSync(dir)) return 0;
  const glob = new Bun.Glob(pattern);
  for await (const file of glob.scan({ cwd: dir })) {
    if (!file.startsWith("~")) count++;
  }
  return count;
}

export async function build() {
  const buildStart = performance.now();
  const config = await loadConfig();
  const dist = config.build?.outdir ?? ".manic";

  console.log(`\n${red(bold("■ MANIC"))} ${dim("build")}\n`);

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(`${dist}/client`, { recursive: true });

  process.stdout.write(dim("● Bundling client..."));

  const clientBuild = await Bun.build({
    entrypoints: ["./app/main.tsx"],
    outdir: `${dist}/client`,
    target: "browser",
    minify: true,
    splitting: true,
    sourcemap: "linked",
    naming: {
      entry: "[name]-[hash].[ext]",
      chunk: "chunks/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    plugins: [bunPluginTailwind],
  });

  process.stdout.write(`\r${dim(green("● Bundling client... done"))}\n`);

  if (!clientBuild.success) {
    console.log(red("Client build failed"));
    clientBuild.logs.forEach((l) => console.error(l));
    process.exit(1);
  }

  const jsEntry = clientBuild.outputs.find((o) => o.kind === "entry-point");
  const cssOutput = clientBuild.outputs.find((o) => o.path.endsWith(".css"));
  const jsFile = jsEntry?.path.split("/").pop() ?? "main.js";
  const cssFile = cssOutput?.path.split("/").pop();

  if (existsSync("assets")) {
    cpSync("assets", `${dist}/client/assets`, { recursive: true });
  }

  let html = "";
  const htmlPath = "app/index.html";

  if (existsSync(htmlPath)) {
    html = await Bun.file(htmlPath).text();

    if (cssFile) {
      if (html.includes('href="tailwindcss"')) {
        html = html.replace('href="tailwindcss"', `href="/${cssFile}"`);
      } else {
        html = html.replace(
          "</head>",
          `  <link rel="stylesheet" href="/${cssFile}">\n</head>`
        );
      }
    }

    if (html.includes('src="./main.tsx"')) {
      html = html.replace('src="./main.tsx"', `src="/${jsFile}"`);
    } else if (html.includes('src="/main.tsx"')) {
      html = html.replace('src="/main.tsx"', `src="/${jsFile}"`);
    } else {
      html = html.replace(
        "</body>",
        `  <script type="module" src="/${jsFile}"></script>\n</body>`
      );
    }
  } else {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.app?.name ?? "Manic"}</title>
  ${cssFile ? `<link rel="stylesheet" href="/${cssFile}">` : ""}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/${jsFile}"></script>
</body>
</html>`;
  }

  await Bun.write(`${dist}/client/index.html`, html);

  const apiDir = "app/api";
  const apiEntries: string[] = [];
  if (existsSync(apiDir)) {
    process.stdout.write(dim("● Bundling API routes..."));
    const glob = new Bun.Glob("**/index.ts");
    for await (const file of glob.scan({ cwd: apiDir })) {
      apiEntries.push(join(apiDir, file));
    }

    if (apiEntries.length > 0) {
      mkdirSync(`${dist}/api`, { recursive: true });
      for (const entry of apiEntries) {
        const outName = entry
          .replace("app/api/", "")
          .replace("/index.ts", "")
          .replace("index.ts", "root");

        await Bun.build({
          entrypoints: [entry],
          outdir: `${dist}/api`,
          target: "bun",
          minify: true,
          external: ["*"],
          naming: `${outName}.js`,
        });
      }
      process.stdout.write(
        `\r${dim(green("● Bundling API routes... done"))}\n`
      );
    }
  }

  process.stdout.write(dim("● Bundling server..."));

  const serverEntry = "~manic.ts";
  if (!existsSync(serverEntry)) {
    console.error(
      red(`\n✗ ${serverEntry} not found. Create your server entry file.\n`)
    );
    process.exit(1);
  }

  let serverCode = await Bun.file(serverEntry).text();

  serverCode = serverCode.replace(
    /import\s+\w+\s+from\s+["']\.\/app\/index\.html["'];?/,
    `const html = await Bun.file("${dist}/client/index.html").text();`
  );

  serverCode = serverCode.replace(
    /createManicServer\s*\(\s*\{\s*html:\s*\w+/,
    `createManicServer({ html`
  );

  const prodEntry = `${dist}/_entry.ts`;
  await Bun.write(prodEntry, serverCode);

  const serverBuild = await Bun.build({
    entrypoints: [prodEntry],
    outdir: dist,
    target: "bun",
    minify: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    naming: {
      entry: "server.js",
    },
  });

  rmSync(prodEntry, { force: true });

  if (!serverBuild.success) {
    console.error(red("\nServer build failed:"));
    serverBuild.logs.forEach((l) => console.error(l));
    process.exit(1);
  }

  process.stdout.write(`\r${dim(green("● Bundling server... done"))}\n`);

  const buildTime = performance.now() - buildStart;
  const clientSize = getDirSize(`${dist}/client`);
  const serverJsSize = statSync(`${dist}/server.js`).size;
  const apiSize = existsSync(`${dist}/api`) ? getDirSize(`${dist}/api`) : 0;
  const serverSize = serverJsSize + apiSize;
  const totalSize = clientSize + serverSize;
  const pageCount = await countRoutes("app/routes", "**/*.tsx");
  const apiCount = await countRoutes("app/api", "**/index.ts");

  console.log(bold(green("\n✓ Build completed successfully\n")));
  console.log(bold("Production Bundle:"));
  console.log(dim("────────────────────────────────────────"));
  console.log(
    `${dim("Server")}              ${formatSize(serverSize).padStart(10)} ${dim(
      `(${apiCount} routes)`
    )}`
  );
  console.log(
    `${dim("Client")}              ${formatSize(clientSize).padStart(10)} ${dim(
      `(${pageCount} routes)`
    )}`
  );
  console.log(dim("────────────────────────────────────────"));
  console.log(
    bold(
      `${dim("Total")}               ${formatSize(totalSize).padStart(10)}` +
        "\n"
    )
  );

  console.log(dim(`Built in ${formatTime(buildTime)}`));
  console.log(dim(`Output: ${dist}/`));

  if (config.providers?.length) {
    console.log("");
    for (const provider of config.providers) {
      if (!provider || typeof provider.build !== "function") {
        console.error(
          red(`\n✗ Invalid provider: ${JSON.stringify(provider)}`)
        );
        console.error(dim("  Make sure the provider is correctly imported from @manicjs/providers"));
        continue;
      }
      try {
        await provider.build({
          dist,
          config,
          apiEntries,
          clientDir: `${dist}/client`,
          serverFile: `${dist}/server.js`,
        });
      } catch (err) {
        console.error(red(`\n✗ Provider "${provider.name}" failed:`));
        console.error(dim(`  ${err}`));
      }
    }
  }

  console.log(dim(`Start: ${green("bun start")}\n`));
}
