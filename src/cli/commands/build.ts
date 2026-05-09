import {
  bold,
  brandTitle,
  debugLog,
  dim,
  divider,
  hint,
  sectionTitle,
  statusError,
  statusPending,
  statusSuccess,
  white,
} from '@manicjs/tui';
import bunPluginTailwind from 'bun-plugin-tailwind';
import {
  buildApplication,
  type PageRoute,
  formatSize,
  formatTime,
} from '@manicjs/bundler';
import { loadConfig } from '../../config';
import {
  discoverRoutes,
  writeRoutesManifest,
} from '../../server/lib/discovery';
import { oxcPlugin } from '../plugins/oxc';

const endStatusLine = () => process.stdout.write('\n');

export async function build() {
  const config = await loadConfig();
  const dist = config.build?.outdir ?? '.manic';
  const updateStatus = (m: string) =>
    process.stdout.write(`\r${statusSuccess(m)}${' '.repeat(24)}`);
  const updatePending = (m: string) =>
    process.stdout.write(`\r${statusPending(m)}${' '.repeat(24)}`);

  debugLog(
    'build',
    `pipeline start mode=${config.mode ?? 'fullstack'} outdir=${dist} plugins=${config.plugins?.length ?? 0}`
  );
  console.log(`\n${brandTitle('build')}\n`);
  console.log(sectionTitle('Pipeline', 'build'));
  console.log(`  ${hint('Mode:', config.mode ?? 'fullstack')}`);
  console.log(`  ${hint('Outdir:', dist)}`);
  console.log(`  ${hint('Plugins:', String(config.plugins?.length ?? 0))}`);
  console.log(divider());

  let summary;
  try {
    summary = await buildApplication({
      config,
      dist,
      runLint: true,
      writeRoutesManifest,
      discoverPageRoutes: async () =>
        (await discoverRoutes()).map(
          route =>
            ({
              path: route.path,
              filePath: route.filePath,
              dynamic: route.path.includes(':'),
            }) satisfies PageRoute
        ),
      clientPlugins: [oxcPlugin(), bunPluginTailwind],
      serverPlugins: [oxcPlugin()],
      plugins: config.plugins,
      providers: config.providers,
      onPending: updatePending,
      onSuccess: updateStatus,
      onError: message => {
        process.stdout.write(`\r${statusError(message)}${' '.repeat(24)}\n`);
      },
      onLog: debugLog,
    });
  } catch (error: any) {
    endStatusLine();
    console.error(statusError(error?.message ?? String(error)));
    if (error?.stack) {
      console.error(dim(error.stack));
    }
    process.exit(1);
  }

  updateStatus('All checks are done!');
  endStatusLine();
  console.log(dim('│'));

  console.log(statusSuccess('Build completed successfully'));
  console.log('');
  console.log(sectionTitle('Production Bundle', 'build'));
  console.log(divider());
  console.log(
    `${white('Server')}              ${formatSize(summary.serverSize).padStart(10)} ${dim(`(${summary.apiCount} routes)`)}`
  );
  console.log(
    `${white('Client')}              ${formatSize(summary.clientSize).padStart(10)} ${dim(`(${summary.pageCount} routes)`)}`
  );
  console.log(divider());
  console.log(
    bold(
      `${white('Total')}               ${formatSize(summary.totalSize).padStart(10)}\n`
    )
  );
  console.log(dim(`Built in ${formatTime(summary.buildTimeMs)}`));
  console.log(dim(`Output: ${summary.dist}/`));

  console.log('');
}
