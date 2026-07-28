import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";

export const WINDOWS_TASK_NAME = "Teskeid Agent Runner";

export class BackgroundTaskError extends Error {
  constructor(category = "background_task_failed") {
    super(category);
    this.name = "BackgroundTaskError";
    this.category = category;
    this.retryable = false;
  }
}

function requireSafePath(value) {
  if (
    typeof value !== "string" ||
    !path.win32.isAbsolute(value) ||
    /["\r\n\0]/u.test(value)
  ) {
    throw new BackgroundTaskError("background_invalid_path");
  }
  return value;
}

function quoteWindowsCommandArgument(value) {
  return `"${value.replace(/(\\*)"/gu, "$1$1\\\"").replace(/(\\+)$/u, "$1$1")}"`;
}

function escapeVbsString(value) {
  return value.replace(/"/gu, '""');
}

export function buildHiddenLauncher({ nodePath, runnerBinPath }) {
  const command = [
    quoteWindowsCommandArgument(requireSafePath(nodePath)),
    quoteWindowsCommandArgument(requireSafePath(runnerBinPath)),
    "background",
    "run",
  ].join(" ");
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run "${escapeVbsString(command)}", 0, True`,
    "",
  ].join("\r\n");
}

export function buildTaskArguments({ action, launcherPath, windowsDirectory }) {
  switch (action) {
    case "install": {
      const launcher = requireSafePath(launcherPath);
      const wscript = path.win32.join(
        requireSafePath(windowsDirectory),
        "System32",
        "wscript.exe",
      );
      const taskCommand = [
        quoteWindowsCommandArgument(wscript),
        "//B",
        "//Nologo",
        quoteWindowsCommandArgument(launcher),
      ].join(" ");
      return [
        "/Create",
        "/TN",
        WINDOWS_TASK_NAME,
        "/SC",
        "ONLOGON",
        "/RL",
        "LIMITED",
        "/TR",
        taskCommand,
      ];
    }
    case "start":
      return ["/Run", "/TN", WINDOWS_TASK_NAME];
    case "stop":
      return ["/End", "/TN", WINDOWS_TASK_NAME];
    case "status":
      return ["/Query", "/TN", WINDOWS_TASK_NAME];
    case "uninstall":
      return ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"];
    default:
      throw new BackgroundTaskError("background_invalid_action");
  }
}

function defaultExecutor(file, args, options) {
  return new Promise((resolve) => {
    nodeExecFile(file, args, options, (error) => {
      resolve({ code: error?.code ?? 0 });
    });
  });
}

function windowsProcessEnv(source) {
  const result = {};
  for (const key of ["COMSPEC", "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

export function createWindowsTaskManager({
  platform = process.platform,
  windowsDirectory = process.env.WINDIR,
  envSource = process.env,
  execute = defaultExecutor,
} = {}) {
  if (platform !== "win32") {
    throw new BackgroundTaskError("background_windows_required");
  }
  const windowsRoot = requireSafePath(windowsDirectory);
  const taskExecutable = path.win32.join(
    windowsRoot,
    "System32",
    "schtasks.exe",
  );

  const invoke = async (action, launcherPath) => {
    const result = await execute(
      taskExecutable,
      buildTaskArguments({ action, launcherPath, windowsDirectory: windowsRoot }),
      {
        encoding: "utf8",
        windowsHide: true,
        shell: false,
        timeout: 15_000,
        maxBuffer: 64 * 1024,
        env: windowsProcessEnv(envSource),
      },
    );
    return result?.code === 0;
  };

  return {
    async install(launcherPath) {
      if (!(await invoke("install", launcherPath))) throw new BackgroundTaskError();
    },
    async start() {
      if (!(await invoke("start"))) throw new BackgroundTaskError();
    },
    async stop({ allowMissing = false } = {}) {
      if (!(await invoke("stop")) && !allowMissing) throw new BackgroundTaskError();
    },
    async isInstalled() {
      return invoke("status");
    },
    async uninstall({ allowMissing = false } = {}) {
      if (!(await invoke("uninstall")) && !allowMissing) {
        throw new BackgroundTaskError();
      }
    },
  };
}
