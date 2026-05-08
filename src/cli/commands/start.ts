import {
  brandTitle,
  cyan,
  debugLog,
  dim,
  divider,
  eventLine,
  hint,
  red,
  sectionTitle,
} from '@manicjs/tui';
import { existsSync } from 'fs';
import { loadConfig } from '../../config';
import { platform } from 'node:os';
import { forceReleasePort, resolvePortConflict } from '../lib/port';
import { stopSubprocessTree } from '../lib/process';

/**
 * Options for the start command
 * @interface StartOptions
 */
interface StartOptions {
  /** Port to run the production server on */
  port?: number;
  /** Whether to expose the server to the network */
  network?: boolean;
}

/**
 * Starts the production server from a built Manic application.
 *
 * @param options - Start server configuration options
 * @param options.port - Port to run on (default: 6070 or config value)
 * @param options.network - Whether to expose to network
 *
 * @example
 * // Start production server
 * await start({});
 *
 * @example
 * // Start on custom port
 * await start({ port: 8080 });
 *
 * @example
 * // Used via CLI
 * // manic start --port 8080
 */
export async function start({ port, network }: StartOptions): Promise<void> {
  const config = await loadConfig();
  debugLog('start', `loaded config mode=${config.mode ?? 'fullstack'}`);
  let finalPort = port ?? config.server?.port ?? 6070;
  const host = network ? '0.0.0.0' : 'localhost';
  finalPort = await resolvePortConflict('start', finalPort, '0.0.0.0');
  debugLog('start', `resolved host=${host} port=${finalPort}`);
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const dist = config.build?.outdir ?? '.manic';
  const openBrowser = (url: string): void => {
    const os = platform();
    if (os === 'win32') {
      Bun.spawn(['cmd', '/c', 'start', '', url], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).unref();
      return;
    }
    const opener = os === 'darwin' ? 'open' : 'xdg-open';
    Bun.spawn([opener, url], { stdout: 'ignore', stderr: 'ignore' }).unref();
  };

  if (!existsSync(`${dist}/server.js`)) {
    console.error(
      red(`\n✗ Build not found. Run ${cyan('bun run build')} first.\n`)
    );
    process.exit(1);
  }

  console.log(`\n${brandTitle('start')}`);
  console.log(divider());
  console.log(sectionTitle('Production Session', 'production'));
  console.log(`  ${hint('URL:', `http://${displayHost}:${finalPort}`)}`);
  console.log(`  ${hint('Host:', host)}`);
  const mcpPlugin = config.plugins?.find(p => p.name === '@manicjs/mcp');
  if (mcpPlugin) {
    const mcpPath = (mcpPlugin as any).path ?? '/mcp';
    console.log(`  ${hint('MCP:', `http://${displayHost}:${finalPort}${mcpPath}`)}`);
  }
  console.log(`  ${dim('Runtime:')} ${cyan('NODE_ENV=production')}`);
  console.log(
    `  ${dim('Keys:')} ${cyan('[b]')} ${dim('browser')}  ${cyan('[r]')} ${dim(
      'restart'
    )}  ${cyan('[q]')} ${dim('quit')}`
  );
  console.log(divider());

  const spawnServer = () => {
    debugLog('start', `spawning production server from ${dist}/server.js`);
    return Bun.spawn(['bun', `${dist}/server.js`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: finalPort.toString(),
        NETWORK: network ? 'true' : 'false',
        NODE_ENV: 'production',
        MANIC_TUI_SUPPRESS_SERVER_INFO: '1',
      },
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'ignore',
    });
  };

  let proc = spawnServer();
  let keyListener: ((data: Buffer) => void) | null = null;
  const hadRawMode = process.stdin.isRaw;
  const url = `http://${displayHost}:${finalPort}`;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    keyListener = async (data: Buffer) => {
      const key = data.toString('utf8').toLowerCase();
      if (key === '\u0003' || key === 'q') {
        console.log(`\n${eventLine('start', 'stopping production server', 'warn')}`);
        await stopSubprocessTree(proc);
        await forceReleasePort(finalPort);
        process.exit(0);
      }
      if (key === 'b') {
        openBrowser(url);
        debugLog('start', `open browser requested for ${url}`);
        console.log(eventLine('start', `opened ${url}`, 'info'));
      }
      if (key === 'r') {
        console.log(eventLine('start', 'restarting production server', 'warn'));
        debugLog('start', 'manual restart requested');
        await stopSubprocessTree(proc);
        await forceReleasePort(finalPort);
        proc = spawnServer();
        console.log(eventLine('start', 'server restarted', 'success'));
      }
    };
    process.stdin.on('data', keyListener);
  }

  const cleanup = (): void => {
    (async () => {
      if (keyListener) process.stdin.off('data', keyListener);
      if (process.stdin.isTTY) process.stdin.setRawMode?.(hadRawMode ?? false);
      await stopSubprocessTree(proc);
      await forceReleasePort(finalPort);
      process.exit();
    })();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  await proc.exited;
}
