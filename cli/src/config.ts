import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const DEFAULT_SERVER = "http://localhost:3000";

export function serverUrl(): string {
  const raw = process.env.TODO_CAT_URL?.trim() || DEFAULT_SERVER;
  return raw.replace(/\/+$/, "");
}

export function configDir(): string {
  const override = process.env.TODO_CAT_CONFIG_DIR;
  if (override) return override;
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "todo-cat",
    );
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "todo-cat",
  );
}

const credentialsSchema = z.object({ server: z.string(), token: z.string() });
export type Credentials = z.infer<typeof credentialsSchema>;

function credentialsFile(): string {
  return join(configDir(), "credentials.json");
}

export async function readCredentials(): Promise<Credentials | null> {
  let text: string;
  try {
    text = await readFile(credentialsFile(), "utf8");
  } catch {
    return null;
  }
  try {
    return credentialsSchema.parse(JSON.parse(text));
  } catch {
    return null; // unreadable file counts as logged out
  }
}

// The file is created fresh with mode 0600 (a temp file renamed into place), so
// the token is never readable by others, not even briefly.
export async function writeCredentials(credentials: Credentials) {
  const file = credentialsFile();
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(credentials)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600).catch(() => {}); // no-op on Windows
  await rename(temp, file);
}

export async function deleteCredentials() {
  await rm(credentialsFile(), { force: true });
}
