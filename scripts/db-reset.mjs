// Deletes the local SQLite file named by DATABASE_URL and migrates a fresh one.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

try {
  process.loadEnvFile(".env");
} catch {}

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) {
  console.error("db:reset only works on a local file: DATABASE_URL");
  process.exit(1);
}

const file = url.slice("file:".length);
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  rmSync(file + suffix, { force: true });
}
console.log(`deleted ${file}`);

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
