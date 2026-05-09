import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  cliEntry,
  cleanupSmokeContext,
  recordTiming,
  stopProcess,
  trackProcess,
  untrackProcess,
} from '../helpers/test-kit-context';
import {
  createDemoFixture,
  getFreePort,
  readStream,
  smokeEnv,
  waitForHttp,
} from '../helpers/test-kit-utils';

describe('demo lifecycle smoke', () => {
  test('build succeeds and emits output artifacts', async () => {
    const fixtureDir = await createDemoFixture(await getFreePort());
    const start = performance.now();
    const proc = Bun.spawn(['bun', cliEntry, 'build'], {
      cwd: fixtureDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: smokeEnv,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      readStream(proc.stdout),
      readStream(proc.stderr),
      proc.exited,
    ]);
    recordTiming('demo build', start, 1000);
    if (exitCode !== 0) {
      throw new Error(
        `demo build failed\nstdout:\n${stdout}\nstderr:\n${stderr}`
      );
    }
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('Error running build');
    expect(stdout).toContain('Build completed successfully');
    expect(existsSync(join(fixtureDir, '.manic', 'server.js'))).toBe(true);
    expect(existsSync(join(fixtureDir, '.manic', 'client', 'index.html'))).toBe(
      true
    );
    expect(
      existsSync(join(fixtureDir, '.manic', 'client', 'sitemap.xml'))
    ).toBe(true);
    expect(existsSync(join(fixtureDir, '.manic', 'client', 'robots.txt'))).toBe(
      true
    );
    expect(
      existsSync(
        join(fixtureDir, '.manic', 'client', '.well-known', 'mcp.json')
      )
    ).toBe(true);
  }, 180000);

  test('dev boots and serves demo app', async () => {
    const port = await getFreePort();
    const fixtureDir = await createDemoFixture(port);
    const start = performance.now();
    const proc = Bun.spawn(['bun', cliEntry, 'dev'], {
      cwd: fixtureDir,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: smokeEnv,
    });
    trackProcess(proc);

    let failureMessage: string | null = null;
    try {
      const baseUrl = `http://127.0.0.1:${String(port)}`;
      await waitForHttp(baseUrl, 30000);
      recordTiming('demo dev boot', start, 1000);
      expect(existsSync(join(fixtureDir, 'app', '~routes.generated.ts'))).toBe(
        true
      );
      const [sitemapRes, robotsRes, mcpDiscoveryRes] = await Promise.all([
        fetch(`${baseUrl}/sitemap.xml`),
        fetch(`${baseUrl}/robots.txt`),
        fetch(`${baseUrl}/.well-known/mcp.json`),
      ]);
      expect(sitemapRes.status).toBe(200);
      expect((await sitemapRes.text()).includes('<urlset')).toBe(true);
      expect(robotsRes.status).toBe(200);
      expect((await robotsRes.text()).includes('Sitemap:')).toBe(true);
      expect(mcpDiscoveryRes.status).toBe(200);
      const mcpDiscovery = await mcpDiscoveryRes.json();
      expect(JSON.stringify(mcpDiscovery)).toContain('mcp');
    } catch (error) {
      const [stdout, stderr] = await Promise.all([
        readStream(proc.stdout),
        readStream(proc.stderr),
      ]);
      failureMessage = `demo dev boot failed\nreason: ${String(error)}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
    } finally {
      await stopProcess(proc);
      untrackProcess(proc);
    }
    if (failureMessage) throw new Error(failureMessage);
  }, 90000);

  test('start boots built output and serves app', async () => {
    const port = await getFreePort();
    const fixtureDir = await createDemoFixture(port);
    {
      const buildProc = Bun.spawn(['bun', cliEntry, 'build'], {
        cwd: fixtureDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: smokeEnv,
      });
      const [buildOut, buildErr, exitCode] = await Promise.all([
        readStream(buildProc.stdout),
        readStream(buildProc.stderr),
        buildProc.exited,
      ]);
      if (exitCode !== 0) {
        throw new Error(
          `demo prebuild failed\nstdout:\n${buildOut}\nstderr:\n${buildErr}`
        );
      }
      expect(exitCode).toBe(0);
    }
    const start = performance.now();
    const proc = Bun.spawn(['bun', cliEntry, 'start'], {
      cwd: fixtureDir,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: smokeEnv,
    });
    trackProcess(proc);

    let failureMessage: string | null = null;
    try {
      const baseUrl = `http://127.0.0.1:${String(port)}`;
      await waitForHttp(baseUrl, 25000);
      recordTiming('demo start boot', start, 1000);
      const [homeRes, docsRes, mcpCardRes, webMcpRes, openApiRes] =
        await Promise.all([
          fetch(baseUrl),
          fetch(`${baseUrl}/docs`),
          fetch(`${baseUrl}/.well-known/mcp/server-card.json`),
          fetch(`${baseUrl}/webmcp.js`),
          fetch(`${baseUrl}/openapi.json`),
        ]);
      expect(homeRes.status).toBe(200);
      const homeHtml = await homeRes.text();
      expect(homeHtml.includes('meta')).toBe(true);
      expect(homeHtml.includes('/webmcp.js')).toBe(true);
      expect(docsRes.status).toBe(200);
      expect((await docsRes.text()).includes('scalar')).toBe(true);
      expect(mcpCardRes.status).toBe(200);
      const mcpCard = await mcpCardRes.json();
      expect(JSON.stringify(mcpCard)).toContain('tools');
      expect(webMcpRes.status).toBe(200);
      expect((await webMcpRes.text()).includes('navigator.modelContext')).toBe(
        true
      );
      expect(openApiRes.status).toBe(200);
      const openApi = await openApiRes.json();
      expect(openApi).toHaveProperty('openapi');
    } catch (error) {
      const [stdout, stderr] = await Promise.all([
        readStream(proc.stdout),
        readStream(proc.stderr),
      ]);
      failureMessage = `demo start boot failed\nreason: ${String(error)}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
    } finally {
      await stopProcess(proc);
      untrackProcess(proc);
    }
    if (failureMessage) throw new Error(failureMessage);
  }, 90000);
});

afterAll(async () => {
  await cleanupSmokeContext();
});
