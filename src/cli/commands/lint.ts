import { spawn } from 'bun';
import {
  brandTitle,
  dim,
  divider,
  sectionTitle,
  statusError,
  statusPending,
  statusSuccess,
} from '@manicjs/tui';

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
  console.log(`\n${brandTitle('lint')}`);
  console.log(divider());
  console.log(sectionTitle('Lint Session', 'build'));
  console.log(`  ${dim('Engine:')} oxlint`);
  console.log(divider());
  console.log(statusPending('Running oxlint...'));

  const proc = spawn(
    ['bun', 'x', 'oxlint', '--config', '.oxlintrc.json', '.'],
    {
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.log(statusError(`Lint failed (exit ${exitCode})`));
    process.exit(exitCode);
  }
  console.log(statusSuccess('Lint passed'));
}
