import { cyan, red } from 'colorette';
import { existsSync } from 'fs';
import { loadConfig } from '../../config';

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
  const finalPort = port ?? config.server?.port ?? 6070;
  const dist = config.build?.outdir ?? '.manic';

  if (!existsSync(`${dist}/server.js`)) {
    console.error(
      red(`\n✗ Build not found. Run ${cyan('bun run build')} first.\n`)
    );
    process.exit(1);
  }

  const proc = Bun.spawn(['bun', `${dist}/server.js`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: finalPort.toString(),
      NETWORK: network ? 'true' : 'false',
      NODE_ENV: 'production',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await proc.exited;
}
