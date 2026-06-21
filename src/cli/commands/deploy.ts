import {
  brandTitle,
  dim,
  divider,
  eventLine,
  hint,
  sectionTitle,
  statusPending,
} from '@manicjs/tui';
import { existsSync } from 'fs';
import { loadConfig } from '../../config';
import { build } from './build';

/**
 * Prepares a provider-free production build.
 *
 * Manic now emits a generic Bun server artifact by default. Deployment hosts
 * can run the built server with `bun .manic/server.js` without adding provider
 * configuration to `manic.config.ts`.
 */
export async function deploy() {
  const config = await loadConfig();
  const shouldRun =
    process.argv.includes('--run') || process.argv.includes('-r');
  const dist = config.build?.outdir ?? '.manic';

  console.log(`\n${brandTitle('deploy')}`);
  console.log(divider());
  console.log(sectionTitle('Deployment Session', 'production'));
  console.log(`  ${hint('Target:', 'generic Bun server')}`);
  console.log(`  ${hint('Mode:', shouldRun ? 'run' : 'preview')}`);
  console.log(divider());

  if (!existsSync(dist)) {
    console.log(statusPending('Build output missing, running build first...'));
    await build();
    console.log(dim('│'));
  }

  const command = `bun ${dist}/server.js`;
  console.log(eventLine('deploy', 'provider-free build is ready', 'success'));
  console.log(`  ${hint('Command:', command)}`);

  if (!shouldRun) return;

  console.log(statusPending('Starting built Manic server...'));
  const proc = Bun.spawn(['bun', `${dist}/server.js`], {
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: process.cwd(),
  });
  const code = await proc.exited;
  if (code !== 0) process.exit(code);
}
