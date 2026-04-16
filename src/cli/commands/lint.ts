import { spawn } from "bun";

export async function lint(): Promise<void> {
  const proc = spawn(["bun", "x", "oxlint", "--config", ".oxlintrc.json", "."], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  await proc.exited;
}
