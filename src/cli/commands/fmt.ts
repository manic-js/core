import { spawn } from 'bun';

export async function fmt(): Promise<void> {
  const proc = spawn(['bun', 'x', 'oxfmt', '-c', '.oxfmt.json', '.'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });

  await proc.exited;
}
