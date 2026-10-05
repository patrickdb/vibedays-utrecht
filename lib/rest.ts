import "server-only";
import type { ErrorBody, ErrorCode } from "@todo-cat/contract";
import type { ZodType } from "zod";
import { getUserId } from "@/lib/session";
import { TodoError } from "@/lib/todo-service";

// Shared plumbing of the REST adapter: resolve the user, parse input with a
// contract schema, map errors to `{ error: { code, message } }` responses.

const statusByCode: Record<ErrorCode, number> = {
  unauthorized: 401,
  "todo-not-found": 404,
  "validation-failed": 400,
};

function errorResponse(code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return Response.json(body, { status: statusByCode[code] });
}

// Thrown by `parse`; never leaves this module.
class ValidationError extends Error {}

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; "),
    );
  }
  return result.data;
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ValidationError("body: expected a JSON object");
  }
  return parse(schema, json);
}

// Runs `handler` for the signed-in user; maps every known failure to its status.
export async function withUser(
  request: Request,
  handler: (userId: string) => Promise<Response>,
): Promise<Response> {
  const userId = await getUserId(request.headers);
  if (!userId) {
    return errorResponse(
      "unauthorized",
      "Sign in, or send Authorization: Bearer <token>",
    );
  }
  try {
    return await handler(userId);
  } catch (error) {
    if (error instanceof TodoError) {
      return errorResponse(error.code, error.message);
    }
    if (error instanceof ValidationError) {
      return errorResponse("validation-failed", error.message);
    }
    throw error;
  }
}
