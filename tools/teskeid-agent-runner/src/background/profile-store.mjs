import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateProviderKey } from "../adapters/contract.mjs";
import {
  MAX_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
} from "../constants.mjs";
import { SessionStoreError } from "../session-store.mjs";
import { BackgroundSecurityError } from "./windows-dpapi.mjs";

const STATE_VERSION = 1;
const MAX_SESSIONS = 500;

export class BackgroundProfileError extends Error {
  constructor(category = "background_profile_invalid") {
    super(category);
    this.name = "BackgroundProfileError";
    this.category = category;
    this.retryable = false;
  }
}

function requireBoundedString(value, max = 4096) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new BackgroundProfileError();
  }
  return value;
}

function validatePublicProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new BackgroundProfileError();
  }
  if (profile.version !== undefined && profile.version !== STATE_VERSION) {
    throw new BackgroundProfileError();
  }
  return {
    version: STATE_VERSION,
    baseUrl: requireBoundedString(profile.baseUrl),
    provider: validateProviderKey(profile.provider),
    cwd: requireBoundedString(profile.cwd),
    codexBin:
      profile.codexBin === null || profile.codexBin === undefined
        ? null
        : requireBoundedString(profile.codexBin),
  };
}

function validateCredential(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackgroundProfileError();
  }
  const tokenExpiresAt = requireBoundedString(value.tokenExpiresAt, 64);
  if (!/T/u.test(tokenExpiresAt) || !Number.isFinite(Date.parse(tokenExpiresAt))) {
    throw new BackgroundProfileError();
  }
  return {
    accessToken: requireBoundedString(value.accessToken),
    connectorId: requireBoundedString(value.connectorId, 512),
    providerKey: validateProviderKey(value.providerKey),
    tokenExpiresAt,
    pollIntervalMs:
      Number.isFinite(value.pollIntervalMs) &&
      value.pollIntervalMs >= MIN_POLL_INTERVAL_MS
        ? Math.min(MAX_POLL_INTERVAL_MS, Math.trunc(value.pollIntervalMs))
        : 3_000,
  };
}

function validateSessions(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_SESSIONS) {
    throw new BackgroundProfileError();
  }
  const sessions = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new BackgroundProfileError();
    }
    sessions.set(
      requireBoundedString(entry[0], 512),
      requireBoundedString(entry[1], 512),
    );
  }
  return sessions;
}

function parsePrivateState(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BackgroundProfileError();
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== STATE_VERSION
  ) {
    throw new BackgroundProfileError();
  }
  return {
    credential: value.credential === null ? null : validateCredential(value.credential),
    sessions: validateSessions(value.sessions),
  };
}

function serializePrivateState(state) {
  return JSON.stringify({
    version: STATE_VERSION,
    credential: state.credential,
    sessions: [...state.sessions.entries()],
  });
}

export function resolveBackgroundPaths({
  envSource = process.env,
  baseDirectory,
} = {}) {
  const root = baseDirectory ?? envSource.LOCALAPPDATA;
  if (
    !root ||
    typeof root !== "string" ||
    !path.isAbsolute(root) ||
    /[\r\n\0]/u.test(root)
  ) {
    throw new BackgroundProfileError("background_local_app_data_unavailable");
  }
  const directory = path.resolve(root, "Teskeid", "AgentRunner");
  return Object.freeze({
    directory,
    profile: path.join(directory, "profile.json"),
    privateState: path.join(directory, "private-state.dpapi"),
    launcher: path.join(directory, "launch-hidden.vbs"),
  });
}

async function atomicWrite(filePath, contents, { restrictFile } = {}) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600);
    if (restrictFile) await restrictFile(temporary);
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export function createBackgroundProfileStore({
  codec,
  paths = resolveBackgroundPaths(),
} = {}) {
  if (
    !codec ||
    typeof codec.seal !== "function" ||
    typeof codec.open !== "function" ||
    typeof codec.restrictFileToCurrentUser !== "function"
  ) {
    throw new BackgroundSecurityError();
  }

  let privateState = null;

  async function loadPrivateState() {
    if (privateState) return privateState;
    let ciphertext;
    try {
      ciphertext = await readFile(paths.privateState, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        privateState = { credential: null, sessions: new Map() };
        return privateState;
      }
      throw new BackgroundProfileError();
    }
    privateState = parsePrivateState(await codec.open(ciphertext));
    return privateState;
  }

  async function persistPrivateState() {
    const state = await loadPrivateState();
    await mkdir(paths.directory, { recursive: true, mode: 0o700 });
    const ciphertext = await codec.seal(serializePrivateState(state));
    await atomicWrite(paths.privateState, ciphertext, {
      restrictFile: codec.restrictFileToCurrentUser,
    });
  }

  return {
    paths,

    async isPresent() {
      try {
        await access(paths.directory);
        return true;
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw new BackgroundProfileError();
      }
    },

    async saveProfile(profile) {
      const value = validatePublicProfile(profile);
      await mkdir(paths.directory, { recursive: true, mode: 0o700 });
      await atomicWrite(paths.profile, `${JSON.stringify(value, null, 2)}\n`, {
        restrictFile: codec.restrictFileToCurrentUser,
      });
    },

    async loadProfile() {
      try {
        return validatePublicProfile(JSON.parse(await readFile(paths.profile, "utf8")));
      } catch (error) {
        if (error instanceof BackgroundProfileError) throw error;
        throw new BackgroundProfileError();
      }
    },

    async saveCredential(credential) {
      const state = await loadPrivateState();
      state.credential = validateCredential(credential);
      await persistPrivateState();
    },

    async loadCredential() {
      const state = await loadPrivateState();
      return state.credential;
    },

    async clearPrivateState() {
      privateState = { credential: null, sessions: new Map() };
      try {
        await rm(paths.privateState, { force: true });
      } catch {
        throw new BackgroundProfileError("background_cleanup_failed");
      }
    },

    createSessionStore() {
      return {
        async get(conversationId) {
          const state = await loadPrivateState();
          return state.sessions.get(requireBoundedString(conversationId, 512)) ?? null;
        },
        async set(conversationId, providerSessionId) {
          const state = await loadPrivateState();
          const key = requireBoundedString(conversationId, 512);
          const value = requireBoundedString(providerSessionId, 512);
          if (!state.sessions.has(key) && state.sessions.size >= MAX_SESSIONS) {
            throw new SessionStoreError();
          }
          state.sessions.set(key, value);
          await persistPrivateState();
        },
        async delete(conversationId) {
          const state = await loadPrivateState();
          if (state.sessions.delete(requireBoundedString(conversationId, 512))) {
            await persistPrivateState();
          }
        },
        release() {
          // Persistent mappings intentionally survive a process restart.
        },
      };
    },

    async writeLauncher(contents) {
      await mkdir(paths.directory, { recursive: true, mode: 0o700 });
      await atomicWrite(paths.launcher, contents, {
        restrictFile: codec.restrictFileToCurrentUser,
      });
    },

    async uninstallFiles() {
      const expected = path.resolve(paths.directory);
      const parent = path.resolve(path.dirname(expected));
      if (
        expected === parent ||
        path.basename(expected) !== "AgentRunner" ||
        path.basename(parent) !== "Teskeid"
      ) {
        throw new BackgroundProfileError("background_cleanup_failed");
      }
      privateState = null;
      await rm(expected, { recursive: true, force: true });
    },
  };
}
