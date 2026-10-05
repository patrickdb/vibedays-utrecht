// Bundles the CLI (and the contract it shares with the app) into dist/cli.mjs.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/cli.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // CommonJS dependencies bundled into ESM need `require`.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
