import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";

const MAX_DPAPI_OUTPUT_BYTES = 1024 * 1024;
const DPAPI_TIMEOUT_MS = 15_000;
const ENTROPY_LABEL = "Teskeid.AgentRunner.PrivateState.v1";

const PROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$plain = [Console]::In.ReadToEnd()
$bytes = [Text.Encoding]::UTF8.GetBytes($plain)
$entropy = [Text.Encoding]::UTF8.GetBytes('${ENTROPY_LABEL}')
$sealed = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($sealed))
`;

const UNPROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$sealedText = [Console]::In.ReadToEnd()
$sealed = [Convert]::FromBase64String($sealedText)
$entropy = [Text.Encoding]::UTF8.GetBytes('${ENTROPY_LABEL}')
$bytes = [Security.Cryptography.ProtectedData]::Unprotect($sealed, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))
`;

const ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$target = $args[0]
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $target -AclObject $acl
`;

export class BackgroundSecurityError extends Error {
  constructor(category = "background_credential_protection_failed") {
    super(category);
    this.name = "BackgroundSecurityError";
    this.category = category;
    this.retryable = false;
  }
}

function windowsProcessEnv(source = process.env) {
  const result = {};
  for (const key of [
    "COMSPEC",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "WINDIR",
  ]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function powershellExecutable(envSource) {
  const root = envSource.WINDIR ?? envSource.SYSTEMROOT;
  if (
    typeof root !== "string" ||
    !path.win32.isAbsolute(root) ||
    /["\r\n\0]/u.test(root)
  ) {
    throw new BackgroundSecurityError();
  }
  return path.win32.join(
    root,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function runPowerShell({
  script,
  input = "",
  args = [],
  spawnImpl = nodeSpawn,
  envSource = process.env,
}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stdoutBytes = 0;
    let settled = false;
    let child;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };

    try {
      child = spawnImpl(
        powershellExecutable(envSource),
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script, ...args],
        {
          env: windowsProcessEnv(envSource),
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
    } catch {
      throw new BackgroundSecurityError();
    }

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The fixed safe failure below is authoritative.
      }
      finish(new BackgroundSecurityError());
    }, DPAPI_TIMEOUT_MS);
    timeout.unref?.();

    child.once("error", () => finish(new BackgroundSecurityError()));
    child.stdout?.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_DPAPI_OUTPUT_BYTES) {
        try {
          child.kill("SIGKILL");
        } catch {
          // The fixed safe failure below is authoritative.
        }
        finish(new BackgroundSecurityError());
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.once("close", (code) => {
      if (code === 0) finish(null, stdout);
      else finish(new BackgroundSecurityError());
    });
    child.stdin?.once("error", () => finish(new BackgroundSecurityError()));
    child.stdin?.end(input, "utf8");
  });
}

export function createWindowsDpapiCodec({
  platform = process.platform,
  spawnImpl = nodeSpawn,
  envSource = process.env,
} = {}) {
  if (platform !== "win32") {
    throw new BackgroundSecurityError("background_windows_required");
  }

  return {
    async seal(plaintext) {
      if (typeof plaintext !== "string" || plaintext.length === 0) {
        throw new BackgroundSecurityError();
      }
      const sealed = await runPowerShell({
        script: PROTECT_SCRIPT,
        input: plaintext,
        spawnImpl,
        envSource,
      });
      if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(sealed)) {
        throw new BackgroundSecurityError();
      }
      return sealed;
    },

    async open(ciphertext) {
      if (
        typeof ciphertext !== "string" ||
        ciphertext.length === 0 ||
        ciphertext.length > MAX_DPAPI_OUTPUT_BYTES ||
        !/^[A-Za-z0-9+/]+={0,2}$/u.test(ciphertext)
      ) {
        throw new BackgroundSecurityError();
      }
      return runPowerShell({
        script: UNPROTECT_SCRIPT,
        input: ciphertext,
        spawnImpl,
        envSource,
      });
    },

    async restrictFileToCurrentUser(filePath) {
      if (
        typeof filePath !== "string" ||
        filePath.length === 0 ||
        /[\r\n\0]/u.test(filePath)
      ) {
        throw new BackgroundSecurityError();
      }
      await runPowerShell({
        script: ACL_SCRIPT,
        args: [filePath],
        spawnImpl,
        envSource,
      });
    },
  };
}
