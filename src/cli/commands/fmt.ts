import { spawn } from 'bun';

/**
 * Formats code using oxfmt with project configuration.
 *
 * Uses .oxfmt.json configuration from the project root.
 *
 * @example
 * // Format all code
 * await fmt();
 *
 * @example
 * // Used via CLI
 * // manic fmt
 */
export async function fmt(): Promise<void> {
  const proc = spawn(['bun', 'x', 'oxfmt', '-c', '.oxfmt.json', '.'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });

  await proc.exited;
}
