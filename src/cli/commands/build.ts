import { green, red, dim, bold, cyan } from "colorette";
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
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      size += entry.isDirectory() ? getDirSize(path) : statSync(path).size;
    }
  } catch {}
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

  try {
    rmSync(dist, { recursive: true, force: true });
  } catch {}
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

    // Replace CSS Link
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

    // Replace Script Entry
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
    // Fallback template
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

  // API build
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
          external: ["*"], // Keep API bundles small, resolve at runtime
          naming: `${outName}.js`,
        });
      }
      process.stdout.write(
        `\r${dim(green("● Bundling API routes... done"))}\n`
      );
    }
  }

  const docsPath =
    config.swagger !== false ? config.swagger?.path ?? "/docs" : null;

  process.stdout.write(dim("● Generating server..."));

  // Load project environment variables to embed their keys in the server bundle
  await import("../../env").then((m) => m.loadEnvFiles());
  const projectEnvKeys = await import("../../env").then((m) =>
    m.getLoadedEnvKeys()
  );

  const serverCode = `import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { networkInterfaces } from "os";
import { existsSync } from "node:fs";
${
  config.swagger !== false ? 'import { swagger } from "@elysiajs/swagger";' : ""
}

const projectEnvKeys = ${JSON.stringify(projectEnvKeys)};
const PORT = process.env.PORT ? parseInt(process.env.PORT) : ${
    config.server?.port ?? 6070
  };
const HOST = process.env.HOST || "0.0.0.0";
const IS_NETWORK = process.env.NETWORK === "true";

const html = await Bun.file("./${dist}/client/index.html").text();

const app = new Elysia()
  ${
    config.swagger !== false
      ? `.use(swagger({ 
    path: "${docsPath}",
    exclude: ["/", "/assets", "/favicon.ico", "/api/docs", "${docsPath}"],
    documentation: {
      info: {
        title: "${
          config.swagger?.documentation?.info?.title ??
          config.app?.name ??
          "Manic API"
        }",
        description: "${
          config.swagger?.documentation?.info?.description ??
          "API documentation powered by Manic"
        }",
        version: "${config.swagger?.documentation?.info?.version ?? "1.0.0"}"
      }
    }
  }))`
      : ""
  }
  .use(staticPlugin({ assets: "./${dist}/client", prefix: "/" }));

// Dynamic API loading
const apiPath = "./${dist}/api";
const loadedRoutes = [];
if (existsSync(apiPath)) {
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(apiPath);
  for (const file of files) {
    if (file.endsWith(".js")) {
      const mod = await import(\`./api/\${file}\`);
      if (mod.default) {
        const route = file === "root.js" ? "" : "/" + file.replace(".js", "");
        const mountPath = \`/api\${route}\`;
        app.group(mountPath, (g) => g.use(mod.default));
        loadedRoutes.push(mountPath);
      }
    }
  }
}

app.get("/favicon.ico", () => {
  for (const n of ["favicon.svg", "favicon.png", "icon.svg"]) {
    const f = Bun.file(\`./${dist}/client/assets/\${n}\`);
    if (f.size) return f;
  }
  return new Response(null, { status: 404 });
});

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(req) {
    const { pathname } = new URL(req.url);
    const hasExt = pathname.includes(".") && !pathname.endsWith("/");
    if (pathname.startsWith("/api") || pathname.startsWith("/docs") || hasExt) {
      return app.handle(req);
    }
    return new Response(html, { headers: { "content-type": "text/html" } });
  },
});

const url = \`http://localhost:\${PORT}/\`;

console.log(\`


\\t\\t\\x1b[31m\\x1b[1m■ MANIC\\x1b[0m            \\x1b[33m\\x1b[43m PROD \\x1b[0m\\x1b[33m Server\\x1b[0m
\\t\\t--- --- --- --- --- ---  --- ---

\\t\\t\\x1b[36m\\x1b[1mURL\\x1b[0m:      \\x1b[32m\${url}\\x1b[0m\`);

if (IS_NETWORK) {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(\`\\t\\t\\x1b[36m\\x1b[1mNetwork\\x1b[0m:  \\x1b[32mhttp://\${net.address}:\${PORT}/\\x1b[0m\`);
      }
    }
  }
}

if (${docsPath ? "true" : "false"}) {
  console.log(\`\\t\\t\\x1b[36m\\x1b[1mDocs\\x1b[0m:     \\x1b[32m\${url.slice(0, -1)}${docsPath}\\x1b[0m\`);
}

const presentEnvKeys = projectEnvKeys.filter(k => process.env[k] !== undefined);
const publicEnvs = presentEnvKeys.filter(k => k.startsWith("PUBLIC_")).length;
if (presentEnvKeys.length > 0) {
  console.log(\`\\n\\t\\t\\x1b[90mLoaded \\x1b[1m\${presentEnvKeys.length}\\x1b[22m env vars\\x1b[0m \\x1b[90m(\${publicEnvs} public, \${presentEnvKeys.length - publicEnvs} private)\\x1b[0m\`);
}

console.log(\`\\n\\t\\t\\x1b[32mReady\\x1b[0m\\n\`);
`;

  await Bun.write(`${dist}/server.js`, serverCode);
  process.stdout.write(`\r${dim(green("● Generating server... done"))}\n`);

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
  console.log(dim(`Start: ${green("bun start")}\n`));
}
