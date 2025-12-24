import { cyan, red } from "colorette";
import { existsSync } from "node:fs";
import { loadConfig } from "../../config";

interface StartOptions {
  port?: number;
  network?: boolean;
}

export async function start({ port, network }: StartOptions): Promise<void> {
  const config = await loadConfig();
  const finalPort = port ?? config.server?.port ?? 6070;
  const dist = config.build?.outdir ?? ".manic";

  if (!existsSync(`${dist}/server.js`)) {
    console.error(
      red(`\n✗ Build not found. Run ${cyan("bun run build")} first.\n`)
    );
    process.exit(1);
  }

  const proc = Bun.spawn(["bun", `${dist}/server.js`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: finalPort.toString(),
      NETWORK: network ? "true" : "false",
      NODE_ENV: "production",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  await proc.exited;
}
