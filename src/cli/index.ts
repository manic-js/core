#!/usr/bin/env bun
import { bold, cyan, dim, red, brandTitle, white, yellow } from '@manicjs/tui';
import { dev } from './commands/dev';
import { build } from './commands/build';
import { start } from './commands/start';
import { deploy } from './commands/deploy';
import { lint } from './commands/lint';
import { fmt } from './commands/fmt';
import { plugin } from './commands/plugin';

type CommandHandler = (ctx: {
  args: string[];
  port?: number;
  network: boolean;
}) => Promise<void>;

interface CliCommand {
  name: string;
  description: string;
  docs: string;
  usage: string[];
  examples: string[];
  handler: CommandHandler;
}

const createCommand = (definition: CliCommand): CliCommand => definition;

const commandList = [
  createCommand({
    name: 'dev',
    description: 'Start development server with HMR',
    docs: 'https://www.manicjs.tech/docs/cli/dev',
    usage: ['manic dev [--port <port>] [--network]'],
    examples: ['manic dev', 'manic dev --port 3000', 'manic dev --network'],
    handler: async ({ port, network }) => dev({ port, network }),
  }),
  createCommand({
    name: 'build',
    description: 'Build for production',
    docs: 'https://www.manicjs.tech/docs/cli/build',
    usage: ['manic build'],
    examples: ['manic build'],
    handler: async () => build(),
  }),
  createCommand({
    name: 'start',
    description: 'Start production server',
    docs: 'https://www.manicjs.tech/docs/cli/start',
    usage: ['manic start [--port <port>] [--network]'],
    examples: ['manic start', 'manic start --port 8080', 'manic start --network'],
    handler: async ({ port, network }) => start({ port, network }),
  }),
  createCommand({
    name: 'deploy',
    description: 'Deploy to configured provider',
    docs: 'https://www.manicjs.tech/docs/cli/deploy',
    usage: ['manic deploy [--run]'],
    examples: ['manic deploy', 'manic deploy --run'],
    handler: async () => deploy(),
  }),
  createCommand({
    name: 'lint',
    description: 'Run oxlint to check code quality',
    docs: 'https://www.manicjs.tech/docs/cli/lint-fmt',
    usage: ['manic lint'],
    examples: ['manic lint'],
    handler: async () => lint(),
  }),
  createCommand({
    name: 'fmt',
    description: 'Format code using oxfmt',
    docs: 'https://www.manicjs.tech/docs/cli/lint-fmt',
    usage: ['manic fmt'],
    examples: ['manic fmt'],
    handler: async () => fmt(),
  }),
  createCommand({
    name: 'plugin',
    description: 'Manage plugins (add/remove/list)',
    docs: 'https://www.manicjs.tech/docs/cli/plugin',
    usage: [
      'manic plugin list',
      'manic plugin add <package-name>',
      'manic plugin remove <package-name>',
    ],
    examples: [
      'manic plugin list',
      'manic plugin add @manicjs/seo',
      'manic plugin remove @manicjs/seo',
    ],
    handler: async ({ args }) => plugin(args),
  }),
] as const;

type CommandName = (typeof commandList)[number]['name'];
const commandMap = new Map(commandList.map(command => [command.name, command] as const));

function renderCliPrefix(): string {
  return red('manic');
}

function styleCliSnippet(input: string): string {
  const parts = input.split(/(\s+)/);
  let commandTokenCount = 0;
  return parts
    .map(part => {
      if (/^\s+$/u.test(part)) return part;
      if (/^<[^>]+>$/u.test(part)) return yellow(part);
      if (/^--?[A-Za-z0-9-]+$/u.test(part)) return cyan(part);
      if (/^[A-Za-z][A-Za-z0-9-]*$/u.test(part) && commandTokenCount < 2) {
        commandTokenCount++;
        return yellow(part);
      }
      return white(part);
    })
    .join('');
}

function renderCommandsHelp(): string {
  return commandList
    .map(command => {
      const line = `${cyan(command.name)}`.padEnd(16);
      return `  ${line}${command.description}`;
    })
    .join('\n');
}

function renderExamplesHelp(): string {
  return commandList
    .flatMap(command => command.examples.slice(0, 2))
    .map(example => {
      const prefixed = example.startsWith('manic ') ? example.slice('manic '.length) : example;
      return `  ${renderCliPrefix()} ${styleCliSnippet(prefixed)}`;
    })
    .join('\n');
}

function renderGeneralHelp(): string {
  return `
${dim(red('========================'))}
${brandTitle()}
${dim(red('========================'))}

${bold('Usage:')}
  ${renderCliPrefix()} ${styleCliSnippet('<command> [options]')}
  ${renderCliPrefix()} ${styleCliSnippet('help <command>')}

${bold('Commands:')}
${renderCommandsHelp()}

${bold('Options:')}
  -h, --help        Show this help message
  -v, --version     Show version number
  -p, --port PORT   Specify port
  --network         Expose to network (dev/start only)
  --debug           Enable CLI debug logs

${bold('Examples:')}
${renderExamplesHelp()}
`;
}

function renderCommandHelp(command: CliCommand): string {
  const usage = command.usage
    .map(line => {
      const value = line.startsWith('manic ') ? line.slice('manic '.length) : line;
      return `  ${renderCliPrefix()} ${styleCliSnippet(value)}`;
    })
    .join('\n');
  const examples = command.examples
    .map(line => {
      const value = line.startsWith('manic ') ? line.slice('manic '.length) : line;
      return `  ${renderCliPrefix()} ${styleCliSnippet(value)}`;
    })
    .join('\n');

  return `
${dim(red('========================'))}
${brandTitle(`help ${command.name}`)}
${dim(red('========================'))}

${bold('Description:')}
  ${command.description}

${bold('Usage:')}
${usage}

${bold('Examples:')}
${examples}

${bold('Docs:')}
  ${cyan(command.docs)}
`;
}

function parseCommonOptions(args: string[]): { port?: number; network: boolean } {
  const portIndex =
    args.indexOf('--port') > -1 ? args.indexOf('--port') : args.indexOf('-p');
  const portArg = portIndex > -1 ? args[portIndex + 1] : undefined;
  const port = portArg ? parseInt(portArg, 10) : undefined;
  return { port, network: args.includes('--network') };
}

function getCommand(name: string): CliCommand | undefined {
  return commandMap.get(name as CommandName);
}

function printUnknownCommandHelp(command: string): void {
  console.error(red(`Unknown command: ${command}`));
  console.log(renderGeneralHelp());
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--debug')) {
    process.env['MANIC_DEBUG'] = '1';
  }
  const commandName = args[0];

  if (args.includes('-v') || args.includes('--version')) {
    try {
      const pkg = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as { version?: string };
      console.log(pkg.version ?? 'latest');
    } catch {
      console.log('latest');
    }
    process.exit(0);
  }

  if (!commandName) {
    console.log(renderGeneralHelp());
    process.exit(0);
  }

  if (commandName === '--help' || commandName === '-h') {
    console.log(renderGeneralHelp());
    process.exit(0);
  }

  if (commandName === 'help') {
    const target = args[1];
    if (!target) {
      console.log(renderGeneralHelp());
      process.exit(0);
    }
    const targetCommand = getCommand(target);
    if (!targetCommand) {
      printUnknownCommandHelp(target);
      process.exit(1);
    }
    console.log(renderCommandHelp(targetCommand));
    process.exit(0);
  }

  const command = getCommand(commandName);
  if (!command) {
    printUnknownCommandHelp(commandName);
    process.exit(1);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(renderCommandHelp(command));
    process.exit(0);
  }

  const { port, network } = parseCommonOptions(args);
  const commandArgs = args.slice(1);

  try {
    await command.handler({ args: commandArgs, port, network });
  } catch (error) {
    console.error(red(`Error running ${command.name}:`));
    console.error(error);
    process.exit(1);
  }
}

main();
