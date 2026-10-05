import {
  type AddTodoInput,
  type ErrorCode,
  errorBodySchema,
  type Todo,
  type TodoFilter,
  todoSchema,
  type UpdateTodoInput,
} from "@todo-cat/contract";
import { type ZodType, z } from "zod";
import { readCredentials, serverUrl } from "./config.ts";
import { CliError } from "./errors.ts";

// Validates user input with the contract schema, before any request is made.
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new CliError(
    "validation-failed",
    result.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; "),
  );
}

// The stored token, but only for the server it was issued by: sending it
// elsewhere would leak it.
export async function requireToken(): Promise<string> {
  const credentials = await readCredentials();
  if (!credentials) {
    throw new CliError("not-logged-in", "Not logged in. Run: todo-cat login");
  }
  if (credentials.server !== serverUrl()) {
    throw new CliError(
      "not-logged-in",
      `Logged in to ${credentials.server}, not ${serverUrl()}. Run: todo-cat login`,
    );
  }
  return credentials.token;
}

async function request<T>(
  method: string,
  path: string,
  schema: ZodType<T> | null,
  body?: unknown,
): Promise<T> {
  const token = await requireToken();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${serverUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CliError(
      "server-unreachable",
      `Cannot reach ${serverUrl()} (set TODO_CAT_URL to change the server)`,
    );
  }

  if (!response.ok) throw await apiError(response);
  if (!schema) return undefined as T;
  try {
    return schema.parse(await response.json());
  } catch {
    throw new CliError(
      "bad-response",
      `Unexpected response from ${serverUrl()}${path}`,
    );
  }
}

async function apiError(response: Response): Promise<CliError> {
  const parsed = errorBodySchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    return new CliError(
      "bad-response",
      `Unexpected HTTP ${response.status} from ${serverUrl()}`,
    );
  }
  const { code, message }: { code: ErrorCode; message: string } =
    parsed.data.error;
  const hint =
    code === "unauthorized"
      ? " (the session may have expired: todo-cat login)"
      : "";
  return new CliError(code, message + hint);
}

const idPath = (id: string) => `/api/todos/${encodeURIComponent(id)}`;

export const api = {
  list(filter: TodoFilter): Promise<Todo[]> {
    const params = new URLSearchParams({ status: filter.status });
    if (filter.q) params.set("q", filter.q);
    return request("GET", `/api/todos?${params}`, z.array(todoSchema));
  },
  get: (id: string): Promise<Todo> => request("GET", idPath(id), todoSchema),
  add: (input: AddTodoInput): Promise<Todo> =>
    request("POST", "/api/todos", todoSchema, input),
  update: (id: string, patch: UpdateTodoInput): Promise<Todo> =>
    request("PATCH", idPath(id), todoSchema, patch),
  delete: (id: string): Promise<void> => request("DELETE", idPath(id), null),
};
