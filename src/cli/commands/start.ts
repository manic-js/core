import { cyan } from "colorette";
import { loadConfig } from "../../config";

interface StartOptions {
  port?: number;
}

export async function start({ port }: StartOptions): Promise<void> {
  const config = await loadConfig();
  const finalPort = port ?? config.server?.port ?? 6070;
  const distDir = config.build?.outdir ?? ".manic";

  console.log(cyan(`Starting production server on port ${finalPort}...`));

  const proc = Bun.spawn(["bun", `${distDir}/~manic.js`], {
    env: { ...process.env, PORT: finalPort.toString(), NODE_ENV: "production" },
    stdout: "inherit",
    stderr: "inherit",
  });

  await proc.exited;
}
