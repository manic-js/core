import { spawn } from 'bun';

/**
 * Runs oxlint to check code quality and enforce linting rules.
 *
 * Uses .oxlintrc.json configuration from the project root.
 *
 * @example
 * // Run linting
 * await lint();
 *
 * @example
 * // Used via CLI
 * // manic lint
 */
export async function lint(): Promise<void> {
  const proc = spawn(
    ['bun', 'x', 'oxlint', '--config', '.oxlintrc.json', '.'],
    {
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    }
  );

  await proc.exited;
}
