<img src="demo/assets/wordmark.svg" alt="Manic" width="300" />

[![npm version](https://img.shields.io/npm/v/manicjs?logo=npm)](https://www.npmjs.com/package/manicjs)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](https://opensource.org/licenses/GPL-3.0)

Manic is a high-performance React framework built exclusively for Bun.

It ships with a custom build pipeline, first-class plugin architecture, and production-ready DX for local development, deployment, and AI-native workflows.

## Monorepo Layout

This repository is now an umbrella workspace that tracks core packages and plugins as git submodules from the [`manic-js`](https://github.com/manic-js) organization.

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/Rahuletto/manic
```

If you already cloned:

```bash
git submodule update --init --recursive
```

Pull latest submodule changes:

```bash
git submodule update --remote --recursive
```

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

| Package | Description |
| --- | --- |
| [manicjs](https://www.npmjs.com/package/manicjs) | Core framework runtime and CLI |
| [create-manic](https://www.npmjs.com/package/create-manic) | Project scaffolding CLI |
| [@manicjs/providers](https://www.npmjs.com/package/@manicjs/providers) | Deploy adapters (Vercel, Netlify, Cloudflare) |
| [@manicjs/tui](https://www.npmjs.com/package/@manicjs/tui) | Shared terminal UI primitives |
| [@manicjs/tailwind](https://www.npmjs.com/package/@manicjs/tailwind) | Tailwind CSS plugin |
| [@manicjs/unocss](https://www.npmjs.com/package/@manicjs/unocss) | UnoCSS plugin |
| [@manicjs/mdx](https://www.npmjs.com/package/@manicjs/mdx) | MDX support plugin |
| [@manicjs/seo](https://www.npmjs.com/package/@manicjs/seo) | SEO metadata and robots plugin |
| [@manicjs/sitemap](https://www.npmjs.com/package/@manicjs/sitemap) | Sitemap generation plugin |
| [@manicjs/mcp](https://www.npmjs.com/package/@manicjs/mcp) | Model Context Protocol plugin |
| [@manicjs/api-docs](https://www.npmjs.com/package/@manicjs/api-docs) | Scalar API docs plugin |

## Requirements

- [Bun](https://bun.sh) `>= 1.3.13`

## License

GPL-3.0
