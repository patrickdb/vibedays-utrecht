import {
  addTodoInputSchema,
  todoFilterSchema,
  todoStatusSchema,
  updateTodoInputSchema,
} from "@todo-cat/contract";
import { Command, Option } from "commander";
import { login, logout, whoami } from "./auth.ts";
import { api, parseInput } from "./client.ts";
import { CliError, EXIT_CODE_HELP } from "./errors.ts";
import { formatTodo, formatTodoDetails, formatTodos } from "./format.ts";

type JsonFlag = { json?: boolean };

// stdout carries results only; instructions and diagnostics go to stderr.
function out(text: string) {
  process.stdout.write(`${text}\n`);
}
function err(text: string) {
  process.stderr.write(`${text}\n`);
}

// Prints `value` as JSON with --json, otherwise the readable `text`.
function show(opts: JsonFlag, value: unknown, text: string) {
  out(opts.json ? JSON.stringify(value) : text);
}

function examples(...lines: string[]): string {
  return `\nExamples:\n${lines.map((line) => `  $ ${line}`).join("\n")}\n`;
}

function command(program: Command, name: string, description: string) {
  return program
    .command(name)
    .description(description)
    .option("--json", "print JSON instead of text");
}

export function buildProgram(): Command {
  const program = new Command("todo-cat")
    .description(
      "Command-line client for todo-cat, Lissie's to-do list.\n\nBuilt for AI agents and humans alike: it never prompts, `--json` gives machine-readable output, and errors go to stderr as `error <code>: <message>` (or JSON with --json).",
    )
    .version("0.1.0")
    .exitOverride()
    .showHelpAfterError("(run with --help for usage)")
    .addHelpText(
      "after",
      `
Environment:
  TODO_CAT_URL         server URL (default http://localhost:3000)
  TODO_CAT_CONFIG_DIR  where the login token is kept (default: your user config directory)

${EXIT_CODE_HELP}
${examples(
  "todo-cat login",
  'todo-cat add "Buy tuna" --due 2026-10-12',
  "todo-cat list --status open --json",
  "todo-cat done <id>",
  "todo-cat delete <id> --yes",
)}`,
    );

  command(
    program,
    "login",
    "Log in with the device flow (you approve a code in the browser)",
  )
    .addHelpText(
      "after",
      `
Prints a code and a URL; open the URL in a browser where you are signed in to
todo-cat and approve the code. The command waits until you do. It never opens a
browser itself. With --json it prints one JSON object per line: first
{"userCode","verificationUri","verificationUriComplete","expiresIn"}, then
{"loggedIn":true,"user":{...}}.
${examples("todo-cat login", "TODO_CAT_URL=https://todo.example.com todo-cat login")}`,
    )
    .action(async (opts: JsonFlag) => {
      const user = await login((code) => {
        if (opts.json) {
          out(JSON.stringify(code));
        } else {
          err(
            `Open ${code.verificationUri} in a browser, sign in, and enter the code:\n\n  ${code.userCode}\n\nOr open ${code.verificationUriComplete}\nWaiting for approval (expires in ${Math.round(code.expiresIn / 60)} minutes)...`,
          );
        }
      });
      show(
        opts,
        { loggedIn: true, user },
        `Logged in as ${user.name} <${user.email}>`,
      );
    });

  command(
    program,
    "logout",
    "Revoke the session on the server and forget the token",
  )
    .addHelpText("after", examples("todo-cat logout"))
    .action(async (opts: JsonFlag) => {
      const { wasLoggedIn } = await logout();
      show(
        opts,
        { loggedOut: wasLoggedIn },
        wasLoggedIn ? "Logged out." : "Not logged in.",
      );
    });

  command(program, "whoami", "Show who you are logged in as")
    .addHelpText("after", examples("todo-cat whoami", "todo-cat whoami --json"))
    .action(async (opts: JsonFlag) => {
      const { user, server } = await whoami();
      show(opts, { user, server }, `${user.name} <${user.email}> at ${server}`);
    });

  command(program, "list", "List to-dos, newest first")
    .alias("ls")
    .addOption(
      new Option("-s, --status <status>", "which to-dos to show")
        .choices(todoStatusSchema.options)
        .default("all"),
    )
    .option("-q, --query <text>", "only to-dos whose title contains the text")
    .addHelpText(
      "after",
      examples(
        "todo-cat list",
        "todo-cat list --status open",
        "todo-cat ls -q tuna --json",
      ),
    )
    .action(async (opts: JsonFlag & { status: string; query?: string }) => {
      const filter = parseInput(todoFilterSchema, {
        status: opts.status,
        q: opts.query,
      });
      const todos = await api.list(filter);
      show(opts, todos, formatTodos(todos));
    });

  command(program, "add", "Add a to-do")
    .argument("<title>", "what to do (max 200 characters)")
    .option("-d, --due <date>", "due date, yyyy-mm-dd")
    .addHelpText(
      "after",
      examples(
        'todo-cat add "Buy tuna"',
        'todo-cat add "Call the vet" --due 2026-10-12 --json',
      ),
    )
    .action(async (title: string, opts: JsonFlag & { due?: string }) => {
      const input = parseInput(addTodoInputSchema, {
        title,
        dueDate: opts.due ?? null,
      });
      const todo = await api.add(input);
      show(opts, todo, `Added: ${formatTodo(todo)}`);
    });

  command(program, "get", "Show one to-do in detail")
    .argument("<id>", "to-do id (see `todo-cat list`)")
    .addHelpText("after", examples("todo-cat get <id> --json"))
    .action(async (id: string, opts: JsonFlag) => {
      const todo = await api.get(id);
      show(opts, todo, formatTodoDetails(todo));
    });

  command(program, "edit", "Change a to-do's title or due date")
    .argument("<id>", "to-do id")
    .option("-t, --title <title>", "new title")
    .option("-d, --due <date>", "new due date, yyyy-mm-dd")
    .option("--clear-due", "remove the due date")
    .addHelpText(
      "after",
      examples(
        'todo-cat edit <id> --title "Buy salmon"',
        "todo-cat edit <id> --due 2026-10-20",
        "todo-cat edit <id> --clear-due",
      ),
    )
    .action(
      async (
        id: string,
        opts: JsonFlag & { title?: string; due?: string; clearDue?: boolean },
      ) => {
        if (opts.due !== undefined && opts.clearDue) {
          throw new CliError(
            "validation-failed",
            "Use either --due or --clear-due, not both",
          );
        }
        const patch = parseInput(updateTodoInputSchema, {
          title: opts.title,
          dueDate: opts.clearDue ? null : opts.due,
        });
        const todo = await api.update(id, patch);
        show(opts, todo, `Updated: ${formatTodo(todo)}`);
      },
    );

  command(program, "done", "Mark a to-do as done")
    .argument("<id>", "to-do id")
    .addHelpText("after", examples("todo-cat done <id>"))
    .action(async (id: string, opts: JsonFlag) => {
      const todo = await api.update(id, { done: true });
      show(opts, todo, `Done: ${formatTodo(todo)}`);
    });

  command(program, "reopen", "Mark a done to-do as open again")
    .argument("<id>", "to-do id")
    .addHelpText("after", examples("todo-cat reopen <id>"))
    .action(async (id: string, opts: JsonFlag) => {
      const todo = await api.update(id, { done: false });
      show(opts, todo, `Reopened: ${formatTodo(todo)}`);
    });

  command(program, "delete", "Delete a to-do for good (requires --yes)")
    .alias("rm")
    .argument("<id>", "to-do id")
    .option("-y, --yes", "confirm the deletion; the CLI never asks")
    .addHelpText("after", examples("todo-cat delete <id> --yes"))
    .action(async (id: string, opts: JsonFlag & { yes?: boolean }) => {
      if (!opts.yes) {
        throw new CliError(
          "validation-failed",
          "Refusing to delete without --yes (deleting is permanent)",
        );
      }
      await api.delete(id);
      show(opts, { deleted: id }, `Deleted ${id}`);
    });

  return program;
}
