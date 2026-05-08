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
  console.log(`\n${brandTitle('fmt')}`);
  console.log(divider());
  console.log(sectionTitle('Format Session', 'build'));
  console.log(`  ${dim('Engine:')} oxfmt`);
  console.log(divider());
  console.log(statusPending('Running oxfmt...'));

  const proc = spawn(['bun', 'x', 'oxfmt', '-c', '.oxfmt.json', '.'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.log(statusError(`Format failed (exit ${exitCode})`));
    process.exit(exitCode);
  }
  console.log(statusSuccess('Format completed'));
}
