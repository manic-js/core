<img src="https://raw.githubusercontent.com/Rahuletto/manic/main/demo/assets/wordmark.svg" alt="Manic" width="300" />

[![npm version](https://img.shields.io/npm/v/manicjs?logo=npm)](https://www.npmjs.com/package/manicjs)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](https://opensource.org/licenses/GPL-3.0)

**Manic** is a production React **framework** built exclusively on **Bun**: file-based routing, colocated APIs, a custom OXC-powered client/server build pipeline, and first-class plugins. This repository ships **`manicjs`**—the **framework core** that every first-party package is built around.

## About this package

**`manicjs`** is the engine the rest of the ecosystem plugs into: the **`manic`** CLI, config and plugin loading, dev and production **build orchestration**, the **file-based router**, and the **Hono**-based SSR server. Tooling such as **`@manicjs/bundler`**, **`@manicjs/providers`**, **`create-manic`**, and the official **`@manicjs/*`** plugins are separate npm packages; **`manicjs`** coordinates them when you author an app or extend the framework.

Source and issues: **[github.com/manic-js/core](https://github.com/manic-js/core)**.

The **[Rahuletto/manic](https://github.com/Rahuletto/manic)** repo is an optional coordinator workspace for maintainers who want every `manic-js/*` package and the demo in one tree (`./setup.sh`). You do not need it to install **`manicjs`** from npm or to follow **Quick Start** below.

## Benchmarks

Methodology and comparative results for dev startup, production builds, and bundle size live in the docs: **[Framework benchmarks](https://www.manicjs.tech/docs/framework/benchmarks)**.

## Documentation

- Website: [manicjs.tech](https://www.manicjs.tech/)
- Docs: [manicjs.tech/docs](https://www.manicjs.tech/docs)
- Framework guide: [manicjs.tech/docs/framework](https://www.manicjs.tech/docs/framework)
- Getting started: [manicjs.tech/docs/framework/getting-started](https://www.manicjs.tech/docs/framework/getting-started)
- CLI reference: [manicjs.tech/docs/cli](https://www.manicjs.tech/docs/cli)

## Quick Start

```bash
bunx create-manic my-app
cd my-app
bun install
bun dev
```

## Why Manic

- Bun-first runtime and tooling
- Fast transforms/minification powered by OXC
- File-based routing and SSR-ready architecture
- Provider adapters for major deployment targets
- AI-focused plugins (`@manicjs/mcp`, API docs, SEO, sitemap)

## Packages

| Package                                                                | Description                                   |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| [manicjs](https://www.npmjs.com/package/manicjs)                       | Core framework runtime and CLI                |
| [create-manic](https://www.npmjs.com/package/create-manic)             | Project scaffolding CLI                       |
| [@manicjs/providers](https://www.npmjs.com/package/@manicjs/providers) | Deploy adapters (Vercel, Netlify, Cloudflare) |
| [@manicjs/tui](https://www.npmjs.com/package/@manicjs/tui)             | Shared terminal UI primitives                 |
| [@manicjs/tailwind](https://www.npmjs.com/package/@manicjs/tailwind)   | Tailwind CSS plugin                           |
| [@manicjs/unocss](https://www.npmjs.com/package/@manicjs/unocss)       | UnoCSS plugin                                 |
| [@manicjs/mdx](https://www.npmjs.com/package/@manicjs/mdx)             | MDX support plugin                            |
| [@manicjs/seo](https://www.npmjs.com/package/@manicjs/seo)             | SEO metadata and robots plugin                |
| [@manicjs/sitemap](https://www.npmjs.com/package/@manicjs/sitemap)     | Sitemap generation plugin                     |
| [@manicjs/mcp](https://www.npmjs.com/package/@manicjs/mcp)             | Model Context Protocol plugin                 |
| [@manicjs/api-docs](https://www.npmjs.com/package/@manicjs/api-docs)   | Scalar API docs plugin                        |

## Requirements

- [Bun](https://bun.sh) `>= 1.3.13`

## License

GPL-3.0
