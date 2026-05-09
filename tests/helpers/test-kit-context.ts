import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const repoRoot = join(import.meta.dir, '..', '..', '..');
export const demoSourceDir = join(repoRoot, 'demo');
export const cliEntry = join(
  import.meta.dir,
  '..',
  '..',
  'src',
  'cli',
  'index.ts'
);

const timingWarnings: string[] = [];
const trackedProcesses = new Set<ReturnType<typeof Bun.spawn>>();
const cleanupDirs: string[] = [];

export const trackProcess = (proc: ReturnType<typeof Bun.spawn>) => {
  trackedProcesses.add(proc);
};

export const untrackProcess = (proc: ReturnType<typeof Bun.spawn>) => {
  trackedProcesses.delete(proc);
};

export const trackCleanupDir = (dir: string) => {
  cleanupDirs.push(dir);
};

export const recordTiming = (
  label: string,
  start: number,
  thresholdMs = 1000
) => {
  const elapsedMs = Math.round(performance.now() - start);
  if (elapsedMs > thresholdMs) {
    timingWarnings.push(
      `[perf-warning] ${label} took ${elapsedMs}ms (target: ~${thresholdMs}ms)`
    );
  }
  return elapsedMs;
};

export const newFixtureRoot = async () => {
  const fixtureBase = join(repoRoot, '.tmp');
  await mkdir(fixtureBase, { recursive: true });
  const fixtureRoot = await mkdtemp(join(fixtureBase, 'manic-smoke-'));
  trackCleanupDir(fixtureRoot);
  return fixtureRoot;
};

export const stopProcess = async (proc: ReturnType<typeof Bun.spawn>) => {
  if (proc.killed) return;
  proc.kill('SIGTERM');
  const timeout = Bun.sleep(3000).then(() => 'timeout');
  const result = await Promise.race([proc.exited.then(() => 'done'), timeout]);
  if (result === 'timeout') {
    proc.kill('SIGKILL');
    await proc.exited;
  }
};

export const cleanupSmokeContext = async () => {
  await Promise.all([...trackedProcesses].map(proc => stopProcess(proc)));
  if (timingWarnings.length > 0) {
    console.warn('\n[manic-smoke] Timing telemetry warnings:');
    for (const warning of timingWarnings) console.warn(warning);
  }
  await Promise.all(
    cleanupDirs.map(dir => rm(dir, { recursive: true, force: true }))
  );
};
