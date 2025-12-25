#!/usr/bin/env bun
import { blue, bold, cyan, dim, red } from "colorette";
import { dev } from "./commands/dev";
import { build } from "./commands/build";
import { start } from "./commands/start";
import { deploy } from "./commands/deploy";

const commands = {
  dev,
  build,
  start,
  deploy,
} as const;

type Command = keyof typeof commands;

const helpText = `
${dim(red("========================"))}
${bold(red("\t■ MANIC"))}
${dim(red("========================"))}

${bold("Usage:")}
  ${blue("manic")} <command> [options]

${bold("Commands:")}
  ${cyan("dev")}       Start development server with HMR
  ${cyan("build")}     Build for production
  ${cyan("start")}     Start production server
  ${cyan("deploy")}    Deploy to configured provider

${bold("Options:")}
  -h, --help        Show this help message
  -v, --version     Show version number
  -p, --port PORT   Specify port
  --network         Expose to network (dev only)

${bold("Examples:")}
  ${blue("manic")} dev
  ${blue("manic")} dev --port 3000
  ${blue("manic")} dev --network
  ${blue("manic")} build
  ${blue("manic")} start
  ${blue("manic")} deploy
  ${blue("manic")} deploy --run
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] as Command | undefined;

  if (!command || args.includes("--help") || args.includes("-h")) {
    console.log(helpText);
    process.exit(0);
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log("v0.3.0");
    process.exit(0);
  }

  if (!(command in commands)) {
    console.error(red(`Unknown command: ${command}`));
    console.log(helpText);
    process.exit(1);
  }

  const portIndex =
    args.indexOf("--port") > -1 ? args.indexOf("--port") : args.indexOf("-p");
  const portArg = portIndex > -1 ? args[portIndex + 1] : undefined;
  const port = portArg ? parseInt(portArg, 10) : undefined;
  const network = args.includes("--network");

  try {
    await commands[command]({ port, network });
  } catch (error) {
    console.error(red(`Error running ${command}:`));
    console.error(error);
    process.exit(1);
  }
}

main();
