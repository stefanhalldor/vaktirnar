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

  if (command === "background") {
    const [action, ...actionArgs] = rest;
    if (action === "install") {
      const values = parseCommandOptions(actionArgs, {
        url: { type: "string" },
        provider: { type: "string", default: PROVIDER_CODEX },
        cwd: { type: "string" },
        "codex-bin": { type: "string" },
        help: { type: "boolean", default: false },
      });
      if (!values.help && (!values.url || !values.cwd)) throw new CliError();
      return {
        command,
        action,
        url: values.url,
        provider: values.provider,
        cwd: values.cwd,
        codexBin: values["codex-bin"],
        help: values.help,
      };
    }
    if (action === "start") {
      const values = parseCommandOptions(actionArgs, {
        code: { type: "string" },
        help: { type: "boolean", default: false },
      });
      return { command, action, code: values.code, help: values.help };
    }
    if (["run", "stop", "status", "uninstall"].includes(action)) {
      const values = parseCommandOptions(actionArgs, {
        help: { type: "boolean", default: false },
      });
      return { command, action, help: values.help };
    }
    if (action === undefined || action === "--help" || action === "-h") {
      return { command, action: "help", help: true };
    }
    throw new CliError("cli_unknown_command");
  }

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
  teskeid-agent-runner background install --url=URL --provider=codex --cwd=DIR [--codex-bin=PATH]
  teskeid-agent-runner background start [--code=CODE]
  teskeid-agent-runner background status
  teskeid-agent-runner background stop
  teskeid-agent-runner background uninstall

Security:
  Interactive connect keeps the connector credential in process memory only.
  Windows background mode protects it with current-user DPAPI and a user-only
  file ACL. Codex always uses approval=never and sandbox=read-only. Pairing
  codes, prompts, replies, and provider/API secrets are never persisted.
`;
