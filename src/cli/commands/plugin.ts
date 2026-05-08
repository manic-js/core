import { $ } from 'bun';
import { existsSync } from 'fs';
import {
  brandTitle,
  cyan,
  dim,
  divider,
  eventLine,
  sectionTitle,
  statusError,
  statusPending,
  statusSuccess,
  yellow,
} from '@manicjs/tui';

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

function isValidManicPluginPackageName(pkgName: string): boolean {
  return /^@manicjs\/[a-z0-9-]+$/u.test(pkgName);
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
  const hasPackageImport = new RegExp(
    `^import\\s+.+\\s+from\\s+["']${pkgName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}["'];?$`,
    'mu'
  ).test(next);
  if (!hasPackageImport) {
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
    (full, content: string) => {
      void full;
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

  console.log(`\n${brandTitle('plugin')}`);
  console.log(divider());
  console.log(sectionTitle('Plugin Manager'));
  console.log(
    `  ${dim('Actions:')} ${cyan('list')} | ${cyan('add <package>')} | ${cyan(
      'remove <package>'
    )}`
  );
  console.log(divider());

  if (!action || !['add', 'remove', 'list'].includes(action)) {
    console.log(statusError('Usage: manic plugin <add|remove|list> [package-name]'));
    process.exit(1);
  }
  if ((action === 'add' || action === 'remove') && !pkgName) {
    console.log(statusError('Usage: manic plugin <add|remove> <package-name>'));
    process.exit(1);
  }
  if ((action === 'add' || action === 'remove') && !isValidManicPluginPackageName(pkgName!)) {
    console.log(
      statusError(
        `Invalid plugin package "${pkgName}". Use a valid Manic plugin like @manicjs/seo.`
      )
    );
    process.exit(1);
  }

  const configPath = resolveConfigPath();
  if (!configPath) {
    console.error(statusError('No manic.config.ts/js found in current directory.'));
    process.exit(1);
  }
  const config = await Bun.file(configPath).text();

  if (action === 'list') {
    const plugins = parsePluginList(config);
    if (!plugins.length) {
      console.log(eventLine('plugin', 'no plugins configured in manic.config.*', 'warn'));
      return;
    }
    console.log(statusSuccess('Configured plugins:'));
    for (const pluginPkg of plugins) {
      console.log(`  ${yellow('•')} ${cyan(pluginPkg)}`);
    }
    return;
  }

  const pkgManager = existsSync('bun.lock') ? 'bun' : 'bun';
  console.log(
    statusPending(
      action === 'add'
        ? `Installing ${pkgName!}...`
        : `Removing ${pkgName!}...`
    )
  );
  if (action === 'add') {
    await $`${pkgManager} add ${pkgName!}`;
  } else {
    await $`${pkgManager} remove ${pkgName!}`;
  }
  console.log(dim('│'));

  const factoryName = deriveFactoryName(pkgName!);
  const importClause = `{ ${factoryName} }`;
  const callExpr = `${factoryName}()`;

  const updated =
    action === 'add'
      ? addPluginToConfig(config, pkgName!, importClause, callExpr)
      : removePluginFromConfig(config, pkgName!, importClause, callExpr);

  await Bun.write(configPath, updated);
  console.log(
    action === 'add'
      ? statusSuccess(`Added ${pkgName!} and updated ${configPath}`)
      : statusSuccess(`Removed ${pkgName!} and updated ${configPath}`)
  );
}
