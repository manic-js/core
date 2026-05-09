import { cp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import {
  cliEntry,
  demoSourceDir,
  newFixtureRoot,
  recordTiming,
  repoRoot,
} from './test-kit-context';

export const smokeEnv = {
  ...process.env,
  MANIC_TUI_SUPPRESS_SERVER_INFO: '1',
  PATH: `${join(repoRoot, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
  NO_PROXY: `127.0.0.1,localhost,${process.env.NO_PROXY ?? ''}`,
};

export const readStream = async (stream: ReadableStream<Uint8Array> | null) => {
  if (!stream) return '';
  return await new Response(stream).text();
};

export const runCli = async (args: string[]) => {
  const start = performance.now();
  const proc = Bun.spawn(['bun', cliEntry, ...args], {
    cwd: demoSourceDir,
    stdout: 'pipe',
    stderr: 'pipe',
    env: smokeEnv,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(proc.stdout),
    readStream(proc.stderr),
    proc.exited,
  ]);
  const elapsedMs = recordTiming(`cli ${args.join(' ')}`, start, 500);
  return { stdout, stderr, exitCode, elapsedMs };
};

export const waitForHttp = async (url: string, timeoutMs = 20000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await Bun.sleep(150);
    }
  }
  throw new Error(`Timed out waiting for server at ${url}`);
};

export const getFreePort = async (): Promise<number> => {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to resolve free port'));
        return;
      }
      const port = address.port;
      server.close(err => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
};

export const createDemoFixture = async (port = 6070) => {
  const fixtureRoot = await newFixtureRoot();
  const fixtureDir = join(fixtureRoot, 'app-under-test');

  await cp(join(demoSourceDir, 'app'), join(fixtureDir, 'app'), {
    recursive: true,
  });
  if (existsSync(join(demoSourceDir, 'assets'))) {
    await cp(join(demoSourceDir, 'assets'), join(fixtureDir, 'assets'), {
      recursive: true,
    });
  }

  await cp(join(demoSourceDir, '~manic.ts'), join(fixtureDir, '~manic.ts'));
  await cp(
    join(demoSourceDir, 'tsconfig.json'),
    join(fixtureDir, 'tsconfig.json')
  );
  if (existsSync(join(demoSourceDir, '.oxlintrc.json'))) {
    await cp(
      join(demoSourceDir, '.oxlintrc.json'),
      join(fixtureDir, '.oxlintrc.json')
    );
  }

  const packagesRoot = join(demoSourceDir, '..', 'packages');
  const pluginsRoot = join(demoSourceDir, '..', 'plugins');
  await writeFile(
    join(fixtureDir, 'package.json'),
    JSON.stringify(
      {
        name: 'manic-smoke-fixture',
        private: true,
        type: 'module',
        scripts: {
          dev: 'manic dev',
          build: 'manic build',
          start: 'manic start',
        },
        dependencies: {
          manicjs: `file:${join(packagesRoot, 'manic')}`,
          '@manicjs/api-docs': `file:${join(pluginsRoot, 'api-docs')}`,
          '@manicjs/mcp': `file:${join(pluginsRoot, 'mcp')}`,
          '@manicjs/seo': `file:${join(pluginsRoot, 'seo')}`,
          '@manicjs/sitemap': `file:${join(pluginsRoot, 'sitemap')}`,
          '@manicjs/tailwind': `file:${join(pluginsRoot, 'tailwind')}`,
          react: '^19.2.5',
          'react-dom': '^19.2.5',
          hono: '^4.12.14',
          tailwind: '^4.0.0',
          tailwindcss: '^4.2.2',
        },
      },
      null,
      2
    )
  );

  const installProc = Bun.spawn(['bun', 'install'], {
    cwd: fixtureDir,
    stdout: 'pipe',
    stderr: 'pipe',
    env: smokeEnv,
  });
  const [installOut, installErr, installExit] = await Promise.all([
    readStream(installProc.stdout),
    readStream(installProc.stderr),
    installProc.exited,
  ]);
  if (installExit !== 0) {
    throw new Error(
      `fixture bun install failed\nstdout:\n${installOut}\nstderr:\n${installErr}`
    );
  }

  await writeFile(
    join(fixtureDir, 'manic.config.ts'),
    [
      "import { defineConfig } from 'manicjs/config';",
      "import { apiDocs } from '@manicjs/api-docs';",
      "import { seo } from '@manicjs/seo';",
      "import { sitemap } from '@manicjs/sitemap';",
      "import { mcp } from '@manicjs/mcp';",
      "import { tailwind } from '@manicjs/tailwind';",
      '',
      'export default defineConfig({',
      "  app: { name: 'Manic Smoke Fixture' },",
      `  server: { port: ${port} },`,
      '  plugins: [',
      '    apiDocs(),',
      "    seo({ hostname: 'https://manic.test' }),",
      "    sitemap({ hostname: 'https://manic.test' }),",
      "    mcp({ name: 'manic-smoke' }),",
      '    tailwind(),',
      '  ],',
      '  providers: [],',
      '});',
      '',
    ].join('\n')
  );

  await rm(join(fixtureDir, '.manic'), { recursive: true, force: true });
  return fixtureDir;
};
