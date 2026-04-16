import { green, red, dim, bold } from "colorette";
import { $ } from "bun";
import { statSync, readdirSync, existsSync } from "fs";
import bunPluginTailwind from "bun-plugin-tailwind";
import { loadConfig } from "../../config";
import { discoverRoutes, generateSitemap, writeRoutesManifest } from "../../server/lib/discovery";
import { oxcPlugin } from "../plugins/oxc";
import { minifySync } from "oxc-minify";
import { ResolverFactory } from "oxc-resolver";

const resolver = new ResolverFactory({
  extensions: [".ts", ".tsx", ".js", ".jsx"],
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  if (!existsSync(dir)) return 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isFile() && path.endsWith(".map")) {
      continue;
    }
    size += entry.isDirectory() ? await getDirSize(path) : statSync(path).size;
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

async function minifyDir(dir: string) {
  const glob = new Bun.Glob("**/*.js");
  for await (const file of glob.scan({ cwd: dir })) {
    const filePath = `${dir}/${file}`;
    const code = await Bun.file(filePath).text();
    
    try {
      const minified = minifySync(filePath, code, {
        compress: {
          target: "es2022",
        },
        mangle: true,
        codegen: {
          removeWhitespace: true,
        }
      });
      
      if (minified.errors && minified.errors.length > 0) {
        console.warn(`[Manic Minify] Warning in ${file}:`, minified.errors);
      }
      
      await Bun.write(filePath, minified.code);
    } catch (e) {
      console.error(`[Manic Minify] Failed to minify ${file}:`, e);
    }
  }
}

export async function build() {
  const buildStart = performance.now();
  const config = await loadConfig();
  const dist = config.build?.outdir ?? ".manic";

  console.log(`\n${red(bold("■ MANIC"))} ${dim("build")}\n`);

  // Auto-lint with oxlint before build
  process.stdout.write(dim("● Linting with oxlint..."));
  const oxlintBin = existsSync("node_modules/.bin/oxlint") ? "node_modules/.bin/oxlint" : "oxlint";
  const lintResult = await $`${oxlintBin} . --deny-warnings`;
  
  if (lintResult.exitCode !== 0) {
    process.stdout.write(`\r${dim(red("● Linting failed      "))}\n`);
    console.log(lintResult.stderr.toString());
    process.exit(1);
  }
  process.stdout.write(`\r${dim(green("● Linting passed      "))}\n`);

  await $`rm -rf ${dist}`;
  await $`mkdir -p ${dist}/client`;

  process.stdout.write(dim("● Bundling client..."));

  await writeRoutesManifest("app/~routes.generated.ts");

  const mainEntry = resolver.sync(process.cwd(), "./app/main");
  if (!mainEntry.path) {
    console.error(red("\n✗ Core entry 'app/main.tsx' not found.\n"));
    process.exit(1);
  }

  const clientBuild = await Bun.build({
    entrypoints: [mainEntry.path],
    outdir: `${dist}/client`,
    target: "browser",
    naming: {
      entry: "[name]-[hash].[ext]",
      chunk: "chunks/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    plugins: [oxcPlugin(), bunPluginTailwind],
  });

  process.stdout.write(`\r${dim(green("● Bundling client... done"))}       \n`);
  
  process.stdout.write(dim("● Minifying with oxc-minify..."));
  await minifyDir(`${dist}/client`);
  process.stdout.write(`\r${dim(green("● Minifying with oxc-minify... done"))}\n`);

  if (!clientBuild.success) {
    console.log(red("Client build failed"));
    clientBuild.logs.forEach((l) => console.error(l));
    process.exit(1);
  }

  const jsEntry = clientBuild.outputs.find((o) => o.kind === "entry-point");
  const cssOutput = clientBuild.outputs.find((o) => o.path.endsWith(".css"));
  const jsFile = jsEntry?.path.split("/").pop() ?? "main.js";
  const cssFile = cssOutput?.path.split("/").pop();

  if (await Bun.file("assets").exists()) {
    await $`cp -r assets ${dist}/client/assets`;
  }

  let html = "";
  const htmlPath = "app/index.html";

  if (await Bun.file(htmlPath).exists()) {
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

  if (config.sitemap && config.sitemap !== false) {
    const routes = await discoverRoutes();
    const sitemapXml = generateSitemap(routes, config.sitemap);
    await Bun.write(`${dist}/client/sitemap.xml`, sitemapXml);
    process.stdout.write(dim(green("● Generated sitemap.xml\n")));
  }

  const apiDir = "app/api";
  const apiEntries: string[] = [];
  if (config.mode !== "frontend" && existsSync(apiDir)) {
    process.stdout.write(dim("● Bundling API routes..."));
    const glob = new Bun.Glob("**/index.ts");
    for await (const file of glob.scan({ cwd: apiDir })) {
      apiEntries.push(`${apiDir}/${file}`);
    }

    if (apiEntries.length > 0) {
      await $`mkdir -p ${dist}/api`;
      for (const entry of apiEntries) {
        const outName = entry
          .replace("app/api/", "")
          .replace("/index.ts", "")
          .replace("index.ts", "root");

        await Bun.build({
          entrypoints: [entry],
          outdir: `${dist}/api`,
          target: "bun",
          minify: false,
          external: ["*"],
          naming: `${outName}.js`,
          plugins: [oxcPlugin()],
        });
      }
      
      process.stdout.write(`\r${dim(green("● Bundling API routes... done"))}       \n`);
      
      process.stdout.write(dim("��� Minifying API with oxc-minify..."));
      await minifyDir(`${dist}/api`);
      process.stdout.write(`\r${dim(green("● Minifying API with oxc-minify... done"))}\n`);
    }
  }

  process.stdout.write(dim("● Bundling server..."));

  const serverResolution = resolver.sync(process.cwd(), "./~manic");
  if (!serverResolution.path) {
    console.error(
      red(`\n✗ ~manic.ts not found. Create your server entry file.\n`)
    );
    process.exit(1);
  }
  const serverEntry = serverResolution.path;

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
    minify: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    naming: {
      entry: "server.js",
    },
    plugins: [oxcPlugin()],
  });

  await $`rm -f ${prodEntry}`;

  if (!serverBuild.success) {
    console.error(red("\nServer build failed:"));
    serverBuild.logs.forEach((l) => console.error(l));
    process.exit(1);
  }
  
  process.stdout.write(`\r${dim(green("● Bundling server... done"))}       \n`);

  process.stdout.write(dim("● Minifying server with oxc-minify..."));
  const serverPath = `${dist}/server.js`;
  const serverContent = await Bun.file(serverPath).text();
  const minifiedServer = minifySync(serverPath, serverContent, {
    compress: { target: "es2022" },
    mangle: true,
  });
  await Bun.write(serverPath, minifiedServer.code);
  process.stdout.write(`\r${dim(green("● Minifying server with oxc-minify... done"))}\n`);

  const buildTime = performance.now() - buildStart;
  const clientSize = await getDirSize(`${dist}/client`);
  const serverJsSize = statSync(`${dist}/server.js`).size;
  const apiSize = existsSync(`${dist}/api`) ? await getDirSize(`${dist}/api`) : 0;
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
