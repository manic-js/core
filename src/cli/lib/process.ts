import { platform } from 'node:os';
import { debugLog } from '@manicjs/tui';

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
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

async function getProcessGroupId(pid: number): Promise<string | null> {
  try {
    const proc = Bun.spawn(['ps', '-o', 'pgid=', '-p', String(pid)], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const exit = await proc.exited;
    if (exit !== 0) return null;
    const out = (await new Response(proc.stdout).text()).trim();
    return out || null;
  } catch {
    return null;
  }
}

export async function stopSubprocessTree(
  proc: { pid?: number; kill: () => void; exited: Promise<number> } | null | undefined
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
      const pgid = await getProcessGroupId(pid);
      const groupTarget = pgid ? `-${pgid}` : `-${pid}`;
      debug(`posix kill group target=${groupTarget} pid=${pid}`);
      // Kill process group, then any remaining direct children.
      await Bun.spawn(['kill', '-TERM', groupTarget], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
      await Bun.spawn(['pkill', '-TERM', '-P', String(pid)], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
      await sleep(150);
      await Bun.spawn(['kill', '-KILL', groupTarget], {
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
