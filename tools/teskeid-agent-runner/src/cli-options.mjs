import { parseArgs } from "node:util";
import { PROVIDER_CODEX } from "./constants.mjs";

export class CliError extends Error {
  constructor(category = "cli_invalid_arguments") {
    super(category);
    this.name = "CliError";
    this.category = category;
  }
}

function parseCommandOptions(args, optionDefinitions) {
  try {
    return parseArgs({
      args,
      allowPositionals: false,
      strict: true,
      options: optionDefinitions,
    }).values;
  } catch {
    throw new CliError();
  }
}

export function parseCli(argv) {
  const [command, ...rest] = argv;

  if (command === "doctor") {
    const values = parseCommandOptions(rest, {
      provider: { type: "string", default: PROVIDER_CODEX },
      "codex-bin": { type: "string" },
      help: { type: "boolean", default: false },
    });
    return {
      command,
      provider: values.provider,
      codexBin: values["codex-bin"],
      help: values.help,
    };
  }

  if (command === "connect") {
    const values = parseCommandOptions(rest, {
      url: { type: "string" },
      code: { type: "string" },
      provider: { type: "string", default: PROVIDER_CODEX },
      cwd: { type: "string" },
      "codex-bin": { type: "string" },
      help: { type: "boolean", default: false },
    });

    if (!values.help && (!values.url || !values.code || !values.cwd)) {
      throw new CliError();
    }

    return {
      command,
      url: values.url,
      code: values.code,
      provider: values.provider,
      cwd: values.cwd,
      codexBin: values["codex-bin"],
      help: values.help,
    };
  }

  if (command === "--help" || command === "-h" || command === undefined) {
    return { command: "help" };
  }

  throw new CliError("cli_unknown_command");
}

export const HELP_TEXT = `Teskeið agent runner (reference adapter)

Usage:
  teskeid-agent-runner doctor [--provider=codex] [--codex-bin=PATH]
  teskeid-agent-runner connect --url=URL --code=CODE --provider=codex --cwd=DIR [--codex-bin=PATH]

Security:
  The connector credential is kept in process memory only. Codex is always run
  with approval=never and sandbox=read-only. See README.md for limitations.
`;
