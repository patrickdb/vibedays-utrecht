import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { requireToken } from "./client.ts";
import {
  deleteCredentials,
  readCredentials,
  serverUrl,
  writeCredentials,
} from "./config.ts";
import { CliError } from "./errors.ts";

const CLIENT_ID = "todo-cat-cli";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function authClient(token?: string) {
  return createAuthClient({
    baseURL: serverUrl(),
    plugins: [deviceAuthorizationClient()],
    fetchOptions: token ? { auth: { type: "Bearer", token } } : undefined,
  });
}

// better-fetch reports a network failure as an error without an HTTP status.
function unreachable(): CliError {
  return new CliError(
    "server-unreachable",
    `Cannot reach ${serverUrl()} (set TODO_CAT_URL to change the server)`,
  );
}

export type User = { id: string; name: string; email: string };

export async function whoami(): Promise<{ user: User; server: string }> {
  const token = await requireToken();
  const { data, error } = await authClient(token).getSession();
  if (error) throw unreachable();
  if (!data) {
    throw new CliError(
      "not-logged-in",
      "The session is no longer valid. Run: todo-cat login",
    );
  }
  const { id, name, email } = data.user;
  return { user: { id, name, email }, server: serverUrl() };
}

export type DeviceCode = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// RFC 8628 device flow. `onCode` shows the code to the human; this function
// never opens a browser. Resolves once the code is approved and the token is
// saved.
export async function login(onCode: (code: DeviceCode) => void): Promise<User> {
  const client = authClient();
  const { data: code, error } = await client.device.code({
    client_id: CLIENT_ID,
  });
  if (error || !code) {
    throw error?.status
      ? new CliError(
          "bad-response",
          `The server refused the login request (HTTP ${error.status})`,
        )
      : unreachable();
  }
  onCode({
    userCode: code.user_code,
    verificationUri: code.verification_uri,
    verificationUriComplete: code.verification_uri_complete,
    expiresIn: code.expires_in,
  });

  const deadline = Date.now() + code.expires_in * 1000;
  let intervalMs = code.interval * 1000;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const { data, error } = await client.device.token({
      grant_type: DEVICE_GRANT,
      device_code: code.device_code,
      client_id: CLIENT_ID,
    });
    if (data) {
      await writeCredentials({ server: serverUrl(), token: data.access_token });
      return (await whoami()).user;
    }
    if (!error) continue;
    switch (error.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        intervalMs += 5000;
        break;
      case "access_denied":
        throw new CliError(
          "login-denied",
          "The login was denied in the browser",
        );
      case "expired_token":
        throw new CliError(
          "login-expired",
          "The code expired. Run: todo-cat login",
        );
      default:
        if (!error.status) throw unreachable();
        throw new CliError(
          "bad-response",
          `Login failed: ${error.error_description ?? error.error ?? error.statusText}`,
        );
    }
  }
  throw new CliError("login-expired", "The code expired. Run: todo-cat login");
}

// Revokes the session on the server, then forgets the token. The local token is
// deleted even when the server cannot be reached; the error then tells the
// caller that the server-side session may still be alive.
export async function logout(): Promise<{ wasLoggedIn: boolean }> {
  const credentials = await readCredentials();
  if (!credentials) return { wasLoggedIn: false };

  let failure: CliError | null = null;
  if (credentials.server === serverUrl()) {
    const { error } = await authClient(credentials.token).signOut();
    // 401: the session is already gone, which is what logout wants.
    if (error && error.status !== 401) {
      failure = error.status
        ? new CliError(
            "bad-response",
            `The server refused the logout (HTTP ${error.status})`,
          )
        : unreachable();
    }
  } else {
    failure = new CliError(
      "server-unreachable",
      `The session belongs to ${credentials.server}; revoke it there (TODO_CAT_URL=${credentials.server} todo-cat logout)`,
    );
  }
  await deleteCredentials();
  if (failure) {
    throw new CliError(
      failure.code,
      `${failure.message}. The local token was deleted, but the server session may still be valid`,
    );
  }
  return { wasLoggedIn: true };
}
