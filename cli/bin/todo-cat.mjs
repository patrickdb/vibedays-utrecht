#!/usr/bin/env node
// Launcher that `npm install` links as `todo-cat`. It is committed, the bundle
// it loads is not: `npm install` builds it (root `prepare` script).
import { existsSync } from "node:fs";

const bundle = new URL("../dist/cli.mjs", import.meta.url);
if (!existsSync(bundle)) {
  console.error("todo-cat is not built yet. Run: npm run build -w cli");
  process.exit(1);
}
await import(bundle.href);
