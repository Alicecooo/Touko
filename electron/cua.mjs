// Packaged: an embedded cua-driver daemon, so macOS TCC grants attribute to OpenMausBot; dev attaches to CuaDriver.app.
// Agents use the stdio MCP proxy, which executes nothing; the host-owned daemon does.

// Packaged: an embedded cua-driver daemon, so macOS TCC grants attribute to OpenMausBot; dev attaches to CuaDriver.app.
// Agents use the stdio MCP proxy, which executes nothing; the host-owned daemon does.
import { app, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import localOriginModule from "./local-origin.cjs";

const { localOnly } = localOriginModule;

const require = createRequire(import.meta.url);
const { createCuaConnectionStore } = require("./cua-connection.cjs");
const {
  createLinuxCuaPreferenceStore,
  createLinuxCuaRuntime,
  createUnavailableLinuxRuntime,
} = require("./cua-linux-runtime.cjs");
const {
  cleanupAppImageCuaBundle,
  reapStaleAppImageCuaBundles,
  stageAppImageCuaBundle,
} = require("./cua-linux-bundle.cjs");
const { linuxLocalControlSupport } = require("./capabilities.cjs");



const HOST_BUNDLE_ID = "com.openmausbot.app";
const CUA_ENV = { CUA_DRIVER_RS_TELEMETRY_ENABLED: "0" };
const execFileAsync = promisify(execFile);
process.env.CUA_DRIVER_RS_TELEMETRY_ENABLED ??= "0";

// Where cua-driver installs itself on Windows; the installer's own directory is the fallback.
const WIN_INSTALLED_DRIVERS = [
  path.join(app.getPath("home"), ".cua-driver", "packages", "current", "cua-driver.exe"),
  path.join(app.getPath("home"), "AppData", "Local", "Programs", "CuaDriver", "cua-driver.exe"),
];
let embeddedHost = null;
let startupAbort = null;
let lifecycleGeneration = 0;
let retryInFlight = null;
let linuxRuntime = null;
let linuxBundleStage = null;
let stateListener = () => {};
const connectionStore = createCuaConnectionStore({
  getUserData: () => app.getPath("userData"),
});

function ensureLinuxRuntime() {
  if (!linuxRuntime) {
    const support = linuxLocalControlSupport(process.platform, process.env);
    if (!support.available) {
      linuxRuntime = createUnavailableLinuxRuntime({
        connectionStore,
        preferenceStore: createLinuxCuaPreferenceStore({
          getUserData: () => app.getPath("userData"),
        }),
        clearPreference: true,
        reasonCode: support.reasonCode,
        message: support.message,
        onChange: (connection) => stateListener(connection),
      });
      return linuxRuntime;
    }
    try {
      let bundledDriverPath;
      if (app.isPackaged && !process.env.CUA_DRIVER_PATH) {
        bundledDriverPath = path.join(process.resourcesPath, "cua-linux-x64", "cua-driver");
        // AppImage builders may normalize the resource tree to 0755/0775: copy the pinned binaries to a fresh 0700 dir and re-verify.
        if (process.env.APPIMAGE) {
          reapStaleAppImageCuaBundles();
          linuxBundleStage ??= stageAppImageCuaBundle({ resourcesPath: process.resourcesPath });
          bundledDriverPath = linuxBundleStage.driverPath;
        }
      }
      linuxRuntime = createLinuxCuaRuntime({
        getUserData: () => app.getPath("userData"),
        connectionStore,
        bundledDriverPath,
        onChange: (connection) => stateListener(connection),
      });
    } catch (error) {
      console.error("[cua] Bundled Linux driver failed integrity validation:", error);
      linuxRuntime = createUnavailableLinuxRuntime({
        connectionStore,
        onChange: (connection) => stateListener(connection),
      });
    }
  }
  return linuxRuntime;
}

export function setCuaStateListener(listener) {
  stateListener = typeof listener === "function" ? listener : () => {};
}

function persistAndNotify(next) {
  const connection = connectionStore.persist(next);
  stateListener(connection);
  return connection;
}

export function resolveWindowsDriver() {
  for (const candidate of WIN_INSTALLED_DRIVERS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveDriverBinary() {
  if (process.env.CUA_DRIVER_PATH) return process.env.CUA_DRIVER_PATH;
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, "cua-driver" + (process.platform === "win32" ? ".exe" : ""));
    if (fs.existsSync(bundled)) return bundled;
  }
  
  if (process.platform === "win32") {
    const staged = path.join(app.getAppPath(), "dist-native", "cua-win32-x64", "cua-driver.exe");
    return fs.existsSync(staged) ? staged : resolveWindowsDriver();
  }
  return null;
}

export function resolveEmbeddedDriverBinary(binary) {
  if (process.platform !== "win32" || !app.isPackaged || process.env.CUA_DRIVER_PATH ||
      binary !== path.join(process.resourcesPath, "cua-driver.exe")) return binary;
  const background = path.join(process.resourcesPath, "cua-driver-background.exe");
  if (!fs.existsSync(background)) throw new Error("Packaged background CUA driver is missing; reinstall OpenMausBot");
  return background;
}



async function loadEmbeddedSdk() {
 if (!app.isPackaged) return import("@trycua/cua-driver/embedded");
 process.env.OPENMAUSBOT_CUA_SDK_LIBRARY = path.join(process.resourcesPath, "cua-sdk", "native", "cua_driver_sdk.dll");
 return import(pathToFileURL(path.join(process.resourcesPath, "cua-sdk", "cua-sdk.mjs")).href);
}



async function startEmbedded(binary, signal) {
  // The packaged app ships no general node_modules, so a bare package import only works in dev.
  const sdk = await loadEmbeddedSdk();
  signal.throwIfAborted();
  // CUA's embedding contract needs grants before the daemon starts, asked from Electron main so macOS attributes them here.
  
  // The native SDK owns the child lifecycle but exposes no windowsHide option.
  const host = new sdk.EmbeddedCuaDriverHost(resolveEmbeddedDriverBinary(binary), HOST_BUNDLE_ID);
  try {
    const conn = await host.start({ signal });
    signal.throwIfAborted();
    embeddedHost = host;
    return {
      mode: "embedded",
      socketPath: conn.socketPath,
      mcpCommand: binary,
      mcpArgs: ["mcp", "--embedded", "--socket", conn.socketPath],
      mcpEnv: { ...CUA_ENV, CUA_DRIVER_EMBEDDED: "1", CUA_DRIVER_HOST_BUNDLE_ID: HOST_BUNDLE_ID },
    };
  } catch (err) {
    try {
      await host.stop();
    } catch {
    }
    host.uniffiDestroy?.();
    throw err;
  }
}

export async function startCua() {
  if (process.platform === "linux") return ensureLinuxRuntime().initialize();
  lifecycleGeneration++;
  startupAbort?.abort();
  startupAbort = new AbortController();
  const { signal } = startupAbort;
  const binary = resolveDriverBinary();
  if (!binary) {
    return persistAndNotify({
      mode: "unavailable",
      reason: "cua-driver binary not found",
    });
  }

  const wantEmbedded =
    process.platform === "win32" || app.isPackaged || process.env.OPENMAUSBOT_CUA_EMBEDDED === "1";
  let nextConnection;

  if (wantEmbedded) {
    try {
      nextConnection = await startEmbedded(binary, signal);
    } catch (err) {
      signal.throwIfAborted();
      try {
        nextConnection = await null;
      } catch (standaloneError) {
        signal.throwIfAborted();
        nextConnection = {
          mode: "unavailable",
          reason: `embedded host failed: ${err?.message ?? err}; standalone launch failed: ${standaloneError?.message ?? standaloneError}`,
        };
      }
      if (!nextConnection) {
        nextConnection = {
          mode: "unavailable",
          reason: `embedded host failed: ${err?.message ?? err}`,
        };
      }
    }
  } else {
    nextConnection = {
      mode: "unavailable",
      reason:
        "no running cua-driver daemon; run `cua-driver serve` or grant via `cua-driver permissions grant`",
    };
  }

  signal.throwIfAborted();
  return persistAndNotify(nextConnection);
}

export async function cuaPermissionsStatus() {
  const binary = resolveDriverBinary();
  if (!binary) return { available: false };
  const out = await execFileAsync(binary, ["permissions", "status", "--json"], {
    encoding: "utf8",
    timeout: 5000,
    killSignal: "SIGKILL",
    maxBuffer: 65_536,
    env: { ...process.env, ...CUA_ENV },
  }).catch((error) => ({ stdout: error.stdout }));
  try {
    return { available: true, ...JSON.parse(out.stdout) };
  } catch {
    return { available: true, raw: out.stdout?.trim() };
  }
}

export async function stopCua() {
  lifecycleGeneration++;
  startupAbort?.abort();
  startupAbort = null;
  if (linuxRuntime) {
    await linuxRuntime.shutdown();
    if (linuxBundleStage) {
      cleanupAppImageCuaBundle(linuxBundleStage);
      linuxBundleStage = null;
    }
    return;
  }
  const host = embeddedHost;
  embeddedHost = null;
  if (host) {
    try {
      await host.stop();
      host.uniffiDestroy?.();
    } catch {
    }
  }
  if (!startupAbort && connectionStore.get()) {
    persistAndNotify({ mode: "unavailable", reason: "desktop-host-stopped" });
  }
}

export function registerCuaIpc() {
  ipcMain.handle("cua:connection", localOnly("cua:connection", () => connectionStore.get()));
  ipcMain.handle("cua:permissions", localOnly("cua:permissions", () => cuaPermissionsStatus()));
  ipcMain.handle("cua:linux-status", localOnly("cua:linux-status", () =>
    process.platform === "linux"
      ? ensureLinuxRuntime().getStatus()
      : { enabled: false, status: "unavailable", reasonCode: "unsupported-platform" },
  ));
  ipcMain.handle("cua:linux-enable", localOnly("cua:linux-enable", async () => {
    if (process.platform !== "linux") {
      return { enabled: false, status: "unavailable", reasonCode: "unsupported-platform" };
    }
    try {
      await ensureLinuxRuntime().enable();
    } catch (error) {
      console.error("[cua] Linux enable failed:", error);
    }
    return ensureLinuxRuntime().getStatus();
  }));
  ipcMain.handle("cua:linux-disable", localOnly("cua:linux-disable", async () => {
    if (process.platform !== "linux") {
      return { enabled: false, status: "unavailable", reasonCode: "unsupported-platform" };
    }
    try {
      await ensureLinuxRuntime().disable();
    } catch (error) {
      console.error("[cua] Linux disable failed:", error);
    }
    return ensureLinuxRuntime().getStatus();
  }));
  ipcMain.handle("cua:linux-retry", localOnly("cua:linux-retry", async () => {
    if (process.platform === "win32") {
      // Concurrent requests share one stop/start sequence; a later explicit Stop (or quit) cancels its delayed restart.
      const platformLabel = "Windows";
      retryInFlight ??= (async () => {
        try {
          const stopping = stopCua();
          const generation = lifecycleGeneration;
          await stopping;
          if (generation !== lifecycleGeneration) throw new Error("Computer use restart cancelled");
          const connection = await startCua();
          const ready = connection?.mode === "embedded" || connection?.mode === "standalone";
          return {
            enabled: ready,
            status: ready ? "ready" : "error",
            reasonCode: ready ? undefined : "permissions-required",
            message: connection?.reason,
          };
        } catch (error) {
          console.error(`[cua] ${platformLabel} retry failed:`, error);
          return {
            enabled: false,
            status: "error",
            reasonCode: "permissions-required",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      })().finally(() => { retryInFlight = null; });
      return retryInFlight;
    }
    if (process.platform !== "linux") {
      return { enabled: false, status: "unavailable", reasonCode: "unsupported-platform" };
    }
    try {
      await ensureLinuxRuntime().retry();
    } catch (error) {
      console.error("[cua] Linux retry failed:", error);
    }
    return ensureLinuxRuntime().getStatus();
  }));
}
