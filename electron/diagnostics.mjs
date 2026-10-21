import fs from "node:fs";
import path from "node:path";

const PROCESS_GONE_REASONS = new Set([
  "abnormal-exit",
  "clean-exit",
  "crashed",
  "integrity-failure",
  "killed",
  "launch-failed",
  "oom",
]);
const CHILD_PROCESS_TYPES = new Set([
  "GPU",
  "Pepper Plugin",
  "Pepper Plugin Broker",
  "Sandbox helper",
  "Unknown",
  "Utility",
  "Zygote",
]);
const MAIN_FAILURE_ORIGINS = new Set(["uncaughtException", "unhandledRejection"]);
const ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

function known(value, allowed, fallback = "unknown") {
  return typeof value === "string" && allowed.has(value) ? value.replaceAll(" ", "-") : fallback;
}

function exitCode(value) {
  return Number.isSafeInteger(value) ? value : "unknown";
}

function safeErrorName(error) {
  try {
    return known(error?.name, ERROR_NAMES, "Error");
  } catch {
    return "Error";
  }
}

/** Unknown event shapes are dropped, not serialised, so new Electron fields cannot leak. */
export function formatDesktopCrashRecord(event = {}) {
  try {
    if (event.kind === "renderer") {
      const reason = known(event.reason, PROCESS_GONE_REASONS);
      if (reason === "clean-exit") return null;
      const surface = event.surface === "main-window" ? "main-window" : "auxiliary";
      return `event=render-process-gone surface=${surface} reason=${reason} exitCode=${exitCode(event.exitCode)}`;
    }
    if (event.kind === "child") {
      const reason = known(event.reason, PROCESS_GONE_REASONS);
      if (reason === "clean-exit") return null;
      const type = known(event.type, CHILD_PROCESS_TYPES);
      return `event=child-process-gone type=${type} reason=${reason} exitCode=${exitCode(event.exitCode)}`;
    }
    if (event.kind === "main") {
      const origin = known(event.origin, MAIN_FAILURE_ORIGINS, "uncaughtException");
      return `event=main-process-failure origin=${origin} error=${safeErrorName(event.error)}`;
    }
  } catch {
  }
  return null;
}

export function installDesktopCrashListeners({
  appTarget,
  processTarget,
  record,
  isShuttingDown = () => false,
  mainWebContents = () => null,
}) {
  const onMainFailure = (error, origin) => record({ kind: "main", error, origin });
  const onRendererGone = (_event, contents, details) => {
    if (isShuttingDown()) return;
    record({
      kind: "renderer",
      surface: contents === mainWebContents() ? "main-window" : "auxiliary",
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
  };
  const onChildGone = (_event, details) => {
    if (isShuttingDown()) return;
    record({
      kind: "child",
      type: details?.type,
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
  };

  processTarget.on("uncaughtExceptionMonitor", onMainFailure);
  appTarget.on("render-process-gone", onRendererGone);
  appTarget.on("child-process-gone", onChildGone);
  return () => {
    processTarget.off("uncaughtExceptionMonitor", onMainFailure);
    appTarget.off("render-process-gone", onRendererGone);
    appTarget.off("child-process-gone", onChildGone);
  };
}

/** One line in the desktop crash log: refuses a link or a hard-linked target, starts over past maxBytes, owner-only. */
export function appendDesktopCrashRecord(file, maxBytes, record) {
  if (!record) return;
  let handle = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const win = process.platform === "win32";
    // On Windows an O_APPEND handle has no plain write access, so it cannot be truncated: write at an explicit offset there.
    const flags = fs.constants.O_WRONLY | (win ? 0 : fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
    let before = null;
    try {
      before = fs.lstatSync(file);
      if (!before.isFile() || before.nlink !== 1) return;
      handle = fs.openSync(file, flags);
    } catch (error) {
      if (error?.code !== "ENOENT") return;
      // O_EXCL makes first creation race-safe on Windows, which has no O_NOFOLLOW.
      try { handle = fs.openSync(file, flags | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600); } catch { return; }
    }
    const stats = fs.fstatSync(handle);
    if (!stats.isFile() || stats.nlink !== 1) return;
    if (before && (before.dev !== stats.dev || before.ino !== stats.ino)) return;
    let offset = stats.size;
    if (stats.size >= maxBytes) { fs.ftruncateSync(handle, 0); offset = 0; }
    if (!win) fs.fchmodSync(handle, 0o600);
    const line = Buffer.from(`[${new Date().toISOString()}] ${record}\n`, "utf8");
    fs.writeSync(handle, line, 0, line.length, win ? offset : null);
  } catch {
  } finally {
    if (handle !== null) { try { fs.closeSync(handle); } catch {} }
  }
}
