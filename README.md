# Manic

Stupidly fast, Crazy light React framework.

Built exclusively for [Bun](https://bun.sh).

## Requirements

- [Bun](https://bun.sh) v1.3.0 or higher

## Installation

```bash
bun add -g manicjs
```

## Quick Start

```bash
bunx create-manic my-app
cd my-app
bun install
bun dev
```

## Configuration

```typescript
import { defineConfig } from "manicjs/config";

export default defineConfig({
  app: {
    name: "My App",
  },
  server: {
    port: 6070,
  },
});
```

## Commands

```bash
manic dev     # Development server
manic build   # Production build
manic start   # Production server
```

## License

Manic is licensed under GPL-3.0
