import { createServer } from 'node:net';
import {
  PromptSession,
  cyan,
  debugLog,
  dim,
  eventLine,
  red,
  yellow,
} from '@manicjs/tui';
import { platform } from 'node:os';
import killPort from 'kill-port';

function isEaddrInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'EADDRINUSE'
  );
}

function debug(message: string): void {
  debugLog('port', message);
}

async function getPortPids(port: number): Promise<string[]> {
  const os = platform();

  if (os === 'win32') {
    try {
      const proc = Bun.spawn(
        ['cmd', '/c', `netstat -ano -p tcp | findstr :${port}`],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );
      const exit = await proc.exited;
      if (exit !== 0) return [];
      const output = await new Response(proc.stdout).text();
      const pids = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.split(/\s+/).pop() ?? '')
        .filter(Boolean);
      return [...new Set(pids)];
    } catch {
      return [];
    }
  }

  try {
    const proc = Bun.spawn(['lsof', '-ti', `tcp:${port}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exit = await proc.exited;
    if (exit !== 0) return [];
    const output = await new Response(proc.stdout).text();
    return output
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getProcessGroupId(pid: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['ps', '-o', 'pgid=', '-p', pid], {
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

async function killOwnerTree(pid: string): Promise<void> {
  const os = platform();
  if (os === 'win32') {
    await Bun.spawn(['taskkill', '/T', '/F', '/PID', pid], {
      stdout: 'ignore',
      stderr: 'ignore',
    }).exited;
    return;
  }

  const pgid = await getProcessGroupId(pid);
  const groupTarget = pgid ? `-${pgid}` : `-${pid}`;
  // Kill process group first (covers parents + children in same group).
  await Bun.spawn(['kill', '-TERM', groupTarget], {
    stdout: 'ignore',
    stderr: 'ignore',
  }).exited;
  // Kill direct children of this pid as a safety net.
  await Bun.spawn(['pkill', '-TERM', '-P', pid], {
    stdout: 'ignore',
    stderr: 'ignore',
  }).exited;
  await sleep(200);
  await Bun.spawn(['kill', '-KILL', groupTarget], {
    stdout: 'ignore',
    stderr: 'ignore',
  }).exited;
  await Bun.spawn(['pkill', '-KILL', '-P', pid], {
    stdout: 'ignore',
    stderr: 'ignore',
  }).exited;
}

export async function isPortInUse(
  port: number,
  host: string = '0.0.0.0'
): Promise<boolean> {
  // Prefer lsof when available; it catches listeners regardless of IPv4/v6 binding mode.
  const pids = await getPortPids(port);
  if (pids.length > 0) {
    debug(`port ${port} occupied by pid(s): ${pids.join(', ')}`);
    return true;
  }

  return await new Promise(resolve => {
    const server = createServer();
    server
      .once('error', err => {
        resolve(isEaddrInUseError(err));
      })
      .once('listening', () => {
        server.close(() => resolve(false));
      })
      .listen(port, host);
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function findNextAvailablePort(
  startPort: number,
  host: string
): Promise<number> {
  let candidate = startPort + 1;
  for (let i = 0; i < 50; i++) {
    const used = await isPortInUse(candidate, host);
    if (!used) return candidate;
    candidate++;
  }
  return startPort;
}

async function killPortProcess(port: number): Promise<boolean> {
  const ownerPids = await getPortPids(port);
  if (ownerPids.length > 0) {
    debug(`kill-owner-tree targets on ${port}: ${ownerPids.join(', ')}`);
    for (const pid of ownerPids) {
      try {
        await killOwnerTree(pid);
        debug(`owner tree killed for pid ${pid}`);
      } catch (err) {
        debug(
          `owner tree kill failed for pid ${pid}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
    await sleep(350);
    const freedByOwnerKill = !(await isPortInUse(port, '0.0.0.0'));
    debug(
      `after owner-tree kill on ${port}: ${freedByOwnerKill ? 'freed' : 'still busy'}`
    );
    if (freedByOwnerKill) return true;
  }

  debug(`attempting kill-port on ${port}`);
  try {
    await killPort(port, 'tcp');
    await sleep(400);
    const free = !(await isPortInUse(port, '0.0.0.0'));
    debug(`kill-port result on ${port}: ${free ? 'freed' : 'still busy'}`);
    return free;
  } catch {
    debug(`kill-port failed for ${port}; using native fallback`);
    // Keep a native fallback path if external kill fails on a host.
    const pids = await getPortPids(port);
    if (pids.length === 0) return false;

    const os = platform();
    if (os === 'win32') {
      debug(`windows fallback pids for ${port}: ${pids.join(', ')}`);
      for (const pid of pids) {
        await Bun.spawn(['taskkill', '/T', '/F', '/PID', pid], {
          stdout: 'ignore',
          stderr: 'ignore',
        }).exited;
      }
      await sleep(400);
      const free = !(await isPortInUse(port, '0.0.0.0'));
      debug(`windows fallback result on ${port}: ${free ? 'freed' : 'still busy'}`);
      return free;
    }

    debug(`posix fallback pids for ${port}: ${pids.join(', ')}`);
    await Bun.spawn(['kill', '-TERM', ...pids], {
      stdout: 'ignore',
      stderr: 'ignore',
    }).exited;
    await sleep(250);
    if (await isPortInUse(port, '0.0.0.0')) {
      await Bun.spawn(['kill', '-KILL', ...pids], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
      await sleep(250);
    }
    const free = !(await isPortInUse(port, '0.0.0.0'));
    debug(`posix fallback result on ${port}: ${free ? 'freed' : 'still busy'}`);
    return free;
  }
}

export async function forceReleasePort(port: number): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    const free = !(await isPortInUse(port, '0.0.0.0'));
    if (free) return true;
    debug(`forceRelease attempt ${i + 1} on ${port}`);
    await killPortProcess(port);
    await sleep(250);
  }
  const finalFree = !(await isPortInUse(port, '0.0.0.0'));
  debug(`forceRelease final on ${port}: ${finalFree ? 'freed' : 'still busy'}`);
  return finalFree;
}

export async function resolvePortConflict(
  context: 'dev' | 'start',
  initialPort: number,
  host: string
): Promise<number> {
  const inUse =
    (await isPortInUse(initialPort, host)) ||
    (host !== '0.0.0.0' && (await isPortInUse(initialPort, '0.0.0.0'))) ||
    (await isPortInUse(initialPort, '::'));
  if (!inUse) return initialPort;

  const nextPort = await findNextAvailablePort(initialPort, host);
  console.log(
    `\n${eventLine(
      context,
      `port ${cyan(String(initialPort))} is already in use`,
      'warn'
    )}`
  );

  if (!process.stdin.isTTY) {
    // In non-interactive shells, auto-fallback to next available port.
    console.log(
      eventLine(
        context,
        `port ${initialPort} busy in non-interactive shell, using ${nextPort}`,
        'warn'
      )
    );
    return nextPort;
  }

  const prompts = new PromptSession();
  const choice = await prompts.select(
    'Port conflict detected',
    [
      `Use next available port (${nextPort})`,
      `Kill process on port ${initialPort} and continue`,
      'Abort',
    ],
    0
  );
  prompts.close();

  if (choice.startsWith('Use next available')) {
    console.log(eventLine(context, `switching to port ${nextPort}`, 'info'));
    return nextPort;
  }

  if (choice.startsWith('Kill process')) {
    const killed = await killPortProcess(initialPort);
    if (!killed) {
      const fallback = await findNextAvailablePort(initialPort, host);
      console.log(
        eventLine(
          context,
          `could not release port ${initialPort}; switching to ${fallback}`,
          'warn'
        )
      );
      return fallback;
    }
    console.log(
      eventLine(
        context,
        `killed process on port ${initialPort}, retrying`,
        'success'
      )
    );
    return initialPort;
  }

  console.log(yellow('Aborted by user.'));
  process.exit(0);
}
