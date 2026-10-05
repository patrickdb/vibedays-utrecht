import type { ErrorCode } from "@todo-cat/contract";

// Exit codes are part of the CLI's interface for agents; keep them in sync with
// the table printed by `todo-cat --help` (see EXIT_CODE_HELP).
export const EXIT = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  unauthorized: 3,
  notFound: 4,
  validation: 5,
  network: 6,
  loginFailed: 7,
} as const;

export const EXIT_CODE_HELP = `Exit codes:
  0  success
  1  unexpected error
  2  usage error (unknown command, missing argument, bad option)
  3  not logged in, or the session is no longer valid (run: todo-cat login)
  4  to-do not found
  5  validation failed (rejected by the server or by the contract schema)
  6  server unreachable or it sent an unexpected response
  7  login failed (denied, expired or timed out)`;

// Client-side codes next to the API's `ErrorCode`s.
type ClientErrorCode =
  | "not-logged-in"
  | "server-unreachable"
  | "bad-response"
  | "login-denied"
  | "login-expired";

export type CliErrorCode = ErrorCode | ClientErrorCode;

// A Record over the contract's codes: a new server error code fails typecheck
// until it is given an exit code here.
const exitByCode: Record<CliErrorCode, number> = {
  unauthorized: EXIT.unauthorized,
  "not-logged-in": EXIT.unauthorized,
  "todo-not-found": EXIT.notFound,
  "validation-failed": EXIT.validation,
  "server-unreachable": EXIT.network,
  "bad-response": EXIT.network,
  "login-denied": EXIT.loginFailed,
  "login-expired": EXIT.loginFailed,
};

export class CliError extends Error {
  readonly exitCode: number;

  constructor(
    readonly code: CliErrorCode,
    message: string,
  ) {
    super(message);
    this.exitCode = exitByCode[code];
  }
}
