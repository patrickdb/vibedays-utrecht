import { CommanderError } from "commander";
import { CliError, EXIT } from "./errors.ts";
import { buildProgram } from "./program.ts";

const json = process.argv.includes("--json");

function fail(code: string, message: string, exitCode: number) {
  process.stderr.write(
    json
      ? `${JSON.stringify({ error: { code, message } })}\n`
      : `error ${code}: ${message}\n`,
  );
  process.exitCode = exitCode;
}

async function main() {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander already printed its message. Help and version are not errors.
      process.exitCode = error.exitCode === 0 ? EXIT.ok : EXIT.usage;
    } else if (error instanceof CliError) {
      fail(error.code, error.message, error.exitCode);
    } else {
      fail(
        "unexpected",
        error instanceof Error ? error.message : String(error),
        EXIT.unexpected,
      );
    }
  }
}

await main();
