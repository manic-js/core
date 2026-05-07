import { $ } from 'bun';
import { existsSync } from 'fs';

type PluginAction = 'add' | 'remove' | 'list';

function toCamelCase(value: string): string {
  return value
    .replace(/^@[^/]+\//u, '')
    .split(/[-_/]/gu)
    .filter(Boolean)
    .map((part, idx) =>
      idx === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

function deriveFactoryName(pkgName: string): string {
  const base = toCamelCase(pkgName);
  return base.startsWith('manic') ? base.slice('manic'.length) || base : base;
}

function ensurePluginsArray(config: string): string {
  if (/plugins\s*:\s*\[/u.test(config)) return config;
  return config.replace(/\}\s*[)]\s*$/u, '  plugins: [],\n});\n');
}

function addPluginToConfig(
  config: string,
  pkgName: string,
  importClause: string,
  callExpr: string
): string {
  let next = config;

  const importLine = `import ${importClause} from "${pkgName}";`;
  if (!next.includes(importLine)) {
    const lines = next.split('\n');
    let insertAt = 0;
    while (insertAt < lines.length && lines[insertAt].startsWith('import ')) {
      insertAt++;
    }
    lines.splice(insertAt, 0, importLine);
    next = lines.join('\n');
  }

  next = ensurePluginsArray(next);
  next = next.replace(/plugins\s*:\s*\[([\s\S]*?)\]/mu, (full, content) => {
    if (content.includes(callExpr)) return full;
    const trimmed = content.trim();
    if (!trimmed) return `plugins: [${callExpr}]`;
    const normalized = trimmed.endsWith(',') ? trimmed : `${trimmed},`;
    return `plugins: [\n    ${normalized}\n    ${callExpr}\n  ]`;
  });

  return next;
}

function removePluginFromConfig(
  config: string,
  pkgName: string,
  importClause: string,
  callExpr: string
): string {
  let next = config;
  const localIds = new Set<string>([deriveFactoryName(pkgName)]);
  const importRegex = new RegExp(
    `^import\\s+(.+)\\s+from\\s+["']${pkgName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}["'];\\n?`,
    'gmu'
  );
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(next)) !== null) {
    const clause = match[1].trim();
    if (clause.startsWith('{') && clause.endsWith('}')) {
      const names = clause
        .slice(1, -1)
        .split(',')
        .map(v => v.trim().split(/\s+as\s+/u).pop() || '')
        .filter(Boolean);
      names.forEach(n => localIds.add(n));
    } else if (!clause.includes(',')) {
      localIds.add(clause);
    }
  }
  next = next.replace(importRegex, '');

  next = next.replace(
    /plugins\s*:\s*\[([\s\S]*?)\]/mu,
    (_full, content: string) => {
      const entries = content
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .filter(entry => entry !== callExpr)
        .filter(entry => {
          for (const id of localIds) {
            if (entry === `${id}()`) return false;
          }
          return true;
        });
      return `plugins: [${entries.length ? `\n    ${entries.join(',\n    ')}\n  ` : ''}]`;
    }
  );
  return next;
}

function resolveConfigPath(): string | null {
  if (existsSync('manic.config.ts')) return 'manic.config.ts';
  if (existsSync('manic.config.js')) return 'manic.config.js';
  return null;
}

function parsePluginList(config: string): string[] {
  const importMap = new Map<string, string>();
  const importLines = config.match(/^import\s+.+$/gmu) ?? [];
  for (const line of importLines) {
    const m = line.match(
      /^import\s+(.+)\s+from\s+["']([^"']+)["'];?$/u
    );
    if (!m) continue;
    const clause = m[1].trim();
    const source = m[2].trim();
    if (clause.startsWith('{') && clause.endsWith('}')) {
      const parts = clause
        .slice(1, -1)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      for (const part of parts) {
        const alias = part.split(/\s+as\s+/u).pop()?.trim();
        if (alias) importMap.set(alias, source);
      }
    } else {
      const defaultId = clause.split(',')[0]?.trim();
      if (defaultId) importMap.set(defaultId, source);
    }
  }

  const pluginsBlock = config.match(/plugins\s*:\s*\[([\s\S]*?)\]/mu)?.[1];
  if (!pluginsBlock) return [];
  const entries = pluginsBlock
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  const packages = new Set<string>();
  for (const entry of entries) {
    const fn = entry.match(/^([A-Za-z_$][\w$]*)\s*\(/u)?.[1];
    if (!fn) continue;
    const pkg = importMap.get(fn);
    if (pkg) packages.add(pkg);
  }
  return [...packages].sort();
}

export async function plugin(args: string[]): Promise<void> {
  const action = args[0] as PluginAction | undefined;
  const pkgName = args[1];

  if (!action || !['add', 'remove', 'list'].includes(action)) {
    console.log('Usage: manic plugin <add|remove|list> [package-name]');
    process.exit(1);
  }
  if ((action === 'add' || action === 'remove') && !pkgName) {
    console.log('Usage: manic plugin <add|remove> <package-name>');
    process.exit(1);
  }

  const configPath = resolveConfigPath();
  if (!configPath) {
    console.error('No manic.config.ts/js found in current directory.');
    process.exit(1);
  }
  const config = await Bun.file(configPath).text();

  if (action === 'list') {
    const plugins = parsePluginList(config);
    if (!plugins.length) {
      console.log('No plugins configured in manic.config.*');
      return;
    }
    console.log('Configured plugins:');
    for (const pluginPkg of plugins) {
      console.log(`- ${pluginPkg}`);
    }
    return;
  }

  const pkgManager = existsSync('bun.lock') ? 'bun' : 'bun';
  if (action === 'add') {
    await $`${pkgManager} add ${pkgName!}`;
  } else {
    await $`${pkgManager} remove ${pkgName!}`;
  }

  let importClause = `{ ${deriveFactoryName(pkgName)} }`;
  let callExpr = `${deriveFactoryName(pkgName)}()`;

  if (action === 'add') {
    try {
      const mod = await import(pkgName!);
      const guessed = deriveFactoryName(pkgName!);
      if (typeof mod.default === 'function') {
        const alias = `${guessed}Plugin`;
        importClause = `${alias}`;
        callExpr = `${alias}()`;
      } else if (typeof mod[guessed] === 'function') {
        importClause = `{ ${guessed} }`;
        callExpr = `${guessed}()`;
      } else {
        const firstFn = Object.keys(mod).find(k => typeof mod[k] === 'function');
        if (firstFn) {
          importClause = `{ ${firstFn} }`;
          callExpr = `${firstFn}()`;
        }
      }
    } catch {
      // Keep heuristic import/call. Config update can be fixed manually if package has unusual exports.
    }
  }

  const updated =
    action === 'add'
      ? addPluginToConfig(config, pkgName!, importClause, callExpr)
      : removePluginFromConfig(config, pkgName!, importClause, callExpr);

  await Bun.write(configPath, updated);
  console.log(
    action === 'add'
      ? `Added ${pkgName!} and updated ${configPath}.`
      : `Removed ${pkgName!} and updated ${configPath}.`
  );
}
