import { platform } from 'node:os';
import { debugLog } from '@manicjs/tui';

async function sleep(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitForExit(
  proc: { exited: Promise<number> },
  timeoutMs: number
): Promise<boolean> {
  try {
    const result = await Promise.race([
      proc.exited.then(() => true),
      sleep(timeoutMs).then(() => false),
    ]);
    return result === true;
  } catch {
    return false;
  }
}

function debug(message: string): void {
  debugLog('process', message);
}

export async function stopSubprocessTree(
  proc:
    | { pid?: number; kill: () => void; exited: Promise<number> }
    | null
    | undefined
): Promise<void> {
  if (!proc) return;

  const pid = proc.pid;
  debug(`stopSubprocessTree start pid=${pid ?? 'unknown'}`);
  try {
    proc.kill();
  } catch {}

  // Give normal shutdown a chance.
  const exitedGracefully = await waitForExit(proc, 800);
  if (exitedGracefully) {
    debug(`pid=${pid ?? 'unknown'} exited gracefully`);
    return;
  }
  if (!pid) return;

  const os = platform();
  try {
    if (os === 'win32') {
      debug(`taskkill tree pid=${pid}`);
      await Bun.spawn(['taskkill', '/T', '/F', '/PID', String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
    } else {
      debug(`posix targeted kill pid=${pid}`);
      // Target only the spawned server process and its descendants.
      // Avoid process-group kill to prevent collateral app shutdowns
      // (e.g. browser processes that may share the same group).
      await Bun.spawn(['kill', '-TERM', String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
      await Bun.spawn(['pkill', '-TERM', '-P', String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
      await sleep(150);
      await Bun.spawn(['kill', '-KILL', String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
      await Bun.spawn(['pkill', '-KILL', '-P', String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
    }
  } catch {}

  const exitedAfterForce = await waitForExit(proc, 800);
  debug(
    exitedAfterForce
      ? `pid=${pid} exited after forced teardown`
      : `pid=${pid} still alive after forced teardown`
  );
}
