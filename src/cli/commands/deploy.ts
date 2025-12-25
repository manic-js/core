import { green, red, dim, bold, cyan, yellow } from "colorette";
import { existsSync } from "node:fs";
import { loadConfig } from "../../config";
import { build } from "./build";

export async function deploy() {
  const config = await loadConfig();

  if (!config.providers?.length) {
    console.log(red("\n✗ No providers configured in manic.config.ts\n"));
    console.log(dim("Add a provider to deploy:"));
    console.log(cyan('\n  import { vercel } from "@manicjs/providers";\n'));
    console.log(dim("  providers: [vercel()]"));
    process.exit(1);
  }

  const provider = config.providers[0];
  if (!provider) {
    console.log(yellow(`■ No provider configured in manic.config.ts`));
    console.log(dim("Add a provider to generate config file:"));
    console.log(cyan('\n  import { vercel } from "@manicjs/providers";\n'));
    console.log(dim("  providers: [vercel()]"));
    process.exit(1);
  }

  console.log(
    `\n${red(bold("■ MANIC"))} ${dim("deploy")} → ${cyan(provider.name)}\n`
  );

  const dist = config.build?.outdir ?? ".manic";
  if (!existsSync(dist)) {
    console.log(dim("● Building first..."));
    await build();
    console.log("");
  }

  const deployCommands: Record<
    string,
    { configFile: string; command: string }
  > = {
    vercel: {
      configFile: "vercel.json",
      command: "bunx vercel deploy",
    },
    cloudflare: {
      configFile: "wrangler.toml",
      command: "bunx wrangler pages deploy dist",
    },
    netlify: {
      configFile: "netlify.toml",
      command: "bunx netlify deploy --prod",
    },
  };

  const deployInfo = deployCommands[provider.name];
  if (!deployInfo) {
    console.log(yellow(`⚠ Unknown provider: ${provider.name}`));
    console.log(dim("Run the deploy command manually for your platform."));
    process.exit(1);
  }

  if (!existsSync(deployInfo.configFile)) {
    console.log(dim(`● Generating ${deployInfo.configFile}...`));

    if (provider.name === "vercel") {
      await Bun.write(
        "vercel.json",
        JSON.stringify({ bunVersion: "1.x" }, null, 2)
      );
    } else if (provider.name === "cloudflare") {
      const compatDate = new Date().toISOString().split("T")[0];
      const wranglerConfig = `name = "${
        config.app?.name?.toLowerCase().replace(/\s+/g, "-") ?? "manic-app"
      }"
compatibility_date = "${compatDate}"

[assets]
directory = "./dist"
`;
      await Bun.write("wrangler.toml", wranglerConfig);
    } else if (provider.name === "netlify") {
      const docsPath =
        config.swagger !== false ? config.swagger?.path ?? "/docs" : null;
      const netlifyToml = `[build]
  command = "bun run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "none"

# API routes -> serverless function
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api"
  status = 200

${
  docsPath
    ? `# Docs routes -> serverless function
[[redirects]]
  from = "${docsPath}"
  to = "/.netlify/functions/api"
  status = 200

[[redirects]]
  from = "${docsPath}/*"
  to = "/.netlify/functions/api"
  status = 200

`
    : ""
}# SPA fallback
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
      await Bun.write("netlify.toml", netlifyToml);
    }

    console.log(dim(green(`● Generated ${deployInfo.configFile}`)));
  }

  console.log(`\n${bold("Deploy Command:")}`);
  console.log(green(`  ${deployInfo.command}\n`));

  const shouldRun =
    process.argv.includes("--run") || process.argv.includes("-r");

  if (shouldRun) {
    console.log(dim("● Running deploy...\n"));
    const proc = Bun.spawn(deployInfo.command.split(" "), {
      stdio: ["inherit", "inherit", "inherit"],
      cwd: process.cwd(),
    });
    await proc.exited;
  } else {
    console.log(
      dim("Add --run or -r flag to execute the deploy command automatically.\n")
    );
  }
}
