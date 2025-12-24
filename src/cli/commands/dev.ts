import { loadConfig } from "../../config";

interface DevOptions {
  port?: number;
}

export async function dev({ port }: DevOptions): Promise<void> {
  const config = await loadConfig();
  const finalPort = port ?? config.server?.port ?? 6070;
  const env = { ...process.env, PORT: finalPort.toString() };

  const proc = Bun.spawn(["bun", "--watch", "~manic.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env,
  });

  const cleanup = (): void => {
    proc.kill();
    process.exit();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await proc.exited;
}
