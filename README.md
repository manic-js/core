# `manicjs`

Core framework package for Manic.

## Documentation

- Website: [manicjs.tech](https://www.manicjs.tech/)
- Framework docs: [manicjs.tech/docs/framework](https://www.manicjs.tech/docs/framework)
- Getting started: [manicjs.tech/docs/framework/getting-started](https://www.manicjs.tech/docs/framework/getting-started)
- CLI reference: [manicjs.tech/docs/cli](https://www.manicjs.tech/docs/cli)

## Requirements

- [Bun](https://bun.sh) `>= 1.3.13`

## Install

```bash
bun add manicjs
```

## Quick Start

```bash
bunx create-manic my-app
cd my-app
bun install
bun dev
```

## Minimal Config

```ts
import { defineConfig } from 'manicjs/config';

export default defineConfig({
  app: { name: 'My App' },
  server: { port: 6070 },
});
```

## CLI

```bash
manic dev
manic build
manic start
manic deploy
```

## License

GPL-3.0
