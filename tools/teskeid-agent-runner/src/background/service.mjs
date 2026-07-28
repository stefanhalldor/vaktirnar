import { fileURLToPath } from "node:url";
import { AgentBridgeClient } from "../bridge-client.mjs";
import { createAdapter } from "../adapters/registry.mjs";
import { runConnection } from "../runner.mjs";
import { createWindowsDpapiCodec } from "./windows-dpapi.mjs";
import {
  createBackgroundProfileStore,
  resolveBackgroundPaths,
} from "./profile-store.mjs";
import {
  buildHiddenLauncher,
  createWindowsTaskManager,
} from "./windows-task.mjs";

const RUNNER_BIN_PATH = fileURLToPath(
  new URL("../../bin/teskeid-agent-runner.mjs", import.meta.url),
);

function expired(tokenExpiresAt, now = Date.now) {
  const value = Date.parse(tokenExpiresAt);
  return !Number.isFinite(value) || now() >= value;
}

export function createBackgroundService({
  store,
  taskManager,
  adapterFactory = createAdapter,
  bridgeFactory = (baseUrl) => new AgentBridgeClient({ baseUrl }),
  nodePath = process.execPath,
  runnerBinPath = RUNNER_BIN_PATH,
  now = Date.now,
} = {}) {
  return {
    async install(profile) {
      if (await taskManager.isInstalled() || await store.isPresent()) {
        const error = new Error("background_already_installed");
        error.category = "background_already_installed";
        throw error;
      }
      const adapter = await adapterFactory(profile.provider, {
        codexBin: profile.codexBin,
        cwd: profile.cwd,
      });
      adapter.clear?.();
      const bridge = bridgeFactory(profile.baseUrl);
      bridge.disconnect();

      let taskCreated = false;
      try {
        await taskManager.install(store.paths.launcher);
        taskCreated = true;
        await store.saveProfile(profile);
        await store.writeLauncher(buildHiddenLauncher({ nodePath, runnerBinPath }));
      } catch (error) {
        try {
          if (taskCreated) await taskManager.uninstall();
          await store.uninstallFiles();
        } catch {
          const cleanupError = new Error("background_cleanup_failed");
          cleanupError.category = "background_cleanup_failed";
          throw cleanupError;
        }
        throw error;
      }
    },

    async start({ code, signal }) {
      const profile = await store.loadProfile();
      if (!(await taskManager.isInstalled())) {
        const error = new Error("background_not_installed");
        error.category = "background_not_installed";
        throw error;
      }
      if (code !== undefined) {
        const bridge = bridgeFactory(profile.baseUrl);
        try {
          await bridge.pair({
            code,
            provider: profile.provider,
            signal,
            credentialSink: async (credential) => {
              if (credential.providerKey !== profile.provider) {
                const error = new Error("protocol_provider_mismatch");
                error.category = "protocol_provider_mismatch";
                throw error;
              }
              await store.saveCredential(credential);
            },
          });
        } finally {
          bridge.disconnect();
        }
      } else {
        const credential = await store.loadCredential();
        if (
          !credential ||
          credential.providerKey !== profile.provider ||
          expired(credential.tokenExpiresAt, now)
        ) {
          const error = new Error("background_pairing_required");
          error.category = "background_pairing_required";
          throw error;
        }
      }
      await taskManager.start();
    },

    async run({ logger, signal }) {
      const profile = await store.loadProfile();
      const credential = await store.loadCredential();
      if (!credential) {
        const error = new Error("background_pairing_required");
        error.category = "background_pairing_required";
        throw error;
      }
      if (
        credential.providerKey !== profile.provider ||
        expired(credential.tokenExpiresAt, now)
      ) {
        await store.clearPrivateState();
        const error = new Error("bridge_token_expired");
        error.category = "bridge_token_expired";
        throw error;
      }

      const bridge = bridgeFactory(profile.baseUrl);
      bridge.restoreCredential({ accessToken: credential.accessToken });
      const adapter = await adapterFactory(profile.provider, {
        codexBin: profile.codexBin,
        cwd: profile.cwd,
        sessionStore: store.createSessionStore(),
      });
      try {
        await runConnection({
          bridge,
          adapter,
          connectedPairing: credential,
          provider: profile.provider,
          logger,
          signal,
        });
      } catch (error) {
        if (error?.category === "bridge_token_expired" || error?.httpStatus === 401) {
          await store.clearPrivateState();
        }
        throw error;
      }
    },

    async stop() {
      await taskManager.stop();
    },

    async status() {
      const taskInstalled = await taskManager.isInstalled();
      const profilePresent = await store.isPresent();
      if (!taskInstalled) return profilePresent ? "invalid" : "not_installed";
      if (!profilePresent) return "invalid";
      try {
        await store.loadProfile();
        const credential = await store.loadCredential();
        if (!credential || expired(credential.tokenExpiresAt, now)) {
          return "pairing_required";
        }
        return "installed_paired";
      } catch {
        return "invalid";
      }
    },

    async uninstall() {
      await taskManager.stop({ allowMissing: true });
      await taskManager.uninstall();
      await store.uninstallFiles();
    },
  };
}

export function createDefaultBackgroundService({
  platform = process.platform,
  envSource = process.env,
} = {}) {
  const codec = createWindowsDpapiCodec({ platform, envSource });
  const store = createBackgroundProfileStore({
    codec,
    paths: resolveBackgroundPaths({ envSource }),
  });
  const taskManager = createWindowsTaskManager({
    platform,
    windowsDirectory: envSource.WINDIR,
    envSource,
  });
  return createBackgroundService({ store, taskManager });
}
