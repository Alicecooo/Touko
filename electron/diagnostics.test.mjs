import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { linkSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { appendDesktopCrashRecord, formatDesktopCrashRecord, installDesktopCrashListeners } = require("./diagnostics.mjs");

describe("formatDesktopCrashRecord", () => {
  it("records renderer and child failures without accepting arbitrary fields", () => {
    expect(
      formatDesktopCrashRecord({
        kind: "renderer",
        surface: "main-window",
        reason: "crashed",
        exitCode: 9,
        url: "https://example.test/private?token=secret",
      }),
    ).toBe("event=render-process-gone surface=main-window reason=crashed exitCode=9");
    expect(
      formatDesktopCrashRecord({
        kind: "child",
        type: "GPU",
        reason: "oom",
        exitCode: 34,
        commandLine: "--password=secret",
      }),
    ).toBe("event=child-process-gone type=GPU reason=oom exitCode=34");
  });

  it("omits normal clean exits", () => {
    expect(formatDesktopCrashRecord({ kind: "renderer", reason: "clean-exit" })).toBeNull();
    expect(formatDesktopCrashRecord({ kind: "child", reason: "clean-exit" })).toBeNull();
  });

  it("reduces a fatal main-process error to its type without reading its message or stack", () => {
    const error = new TypeError("secret user text from C:\\Users\\Ada\\private.txt");
    error.stack = [
      "TypeError: secret user text from C:\\Users\\Ada\\private.txt",
      "secret-client.ts:1:1",
      "    at boot (file:///C:/Users/Ada/TOUKO/electron/main.mjs:412:7)",
    ].join("\n");
    const record = formatDesktopCrashRecord({ kind: "main", origin: "unhandledRejection", error });
    expect(record).toBe("event=main-process-failure origin=unhandledRejection error=TypeError");
    expect(record).not.toContain("Ada");
    expect(record).not.toContain("secret user text");
    expect(record).not.toContain("secret-client");
  });

  it("fails closed for unknown Electron metadata", () => {
    expect(
      formatDesktopCrashRecord({
        kind: "renderer",
        surface: "private-window-name",
        reason: "token=super-secret",
        exitCode: "5; password=secret",
      }),
    ).toBe("event=render-process-gone surface=auxiliary reason=unknown exitCode=unknown");
    expect(formatDesktopCrashRecord({ kind: "anything", payload: "secret" })).toBeNull();
  });
});

describe("installDesktopCrashListeners", () => {
  it("observes fatal, renderer and child failures through structural fields only", () => {
    const appTarget = new EventEmitter();
    const processTarget = new EventEmitter();
    const records = [];
    const mainContents = {};
    const dispose = installDesktopCrashListeners({
      appTarget,
      processTarget,
      record: (event) => records.push(event),
      mainWebContents: () => mainContents,
    });
    const error = new TypeError("private message");
    processTarget.emit("uncaughtExceptionMonitor", error, "unhandledRejection");
    appTarget.emit(
      "render-process-gone",
      {},
      mainContents,
      { reason: "crashed", exitCode: 7, url: "https://private.test" },
    );
    appTarget.emit(
      "child-process-gone",
      {},
      { type: "GPU", reason: "oom", exitCode: 34, name: "private-service" },
    );
    expect(records).toEqual([
      { kind: "main", error, origin: "unhandledRejection" },
      { kind: "renderer", surface: "main-window", reason: "crashed", exitCode: 7 },
      { kind: "child", type: "GPU", reason: "oom", exitCode: 34 },
    ]);
    dispose();
    expect(processTarget.listenerCount("uncaughtExceptionMonitor")).toBe(0);
    expect(appTarget.listenerCount("render-process-gone")).toBe(0);
    expect(appTarget.listenerCount("child-process-gone")).toBe(0);
  });

  it("ignores process exits after Electron has begun its normal shutdown", () => {
    const appTarget = new EventEmitter();
    const processTarget = new EventEmitter();
    const records = [];
    installDesktopCrashListeners({
      appTarget,
      processTarget,
      record: (event) => records.push(event),
      isShuttingDown: () => true,
    });
    appTarget.emit("render-process-gone", {}, {}, { reason: "killed", exitCode: 0 });
    appTarget.emit("child-process-gone", {}, { type: "Utility", reason: "killed", exitCode: 0 });
    expect(records).toEqual([]);
  });
});

it("appends a crash line, truncates a full log, and refuses a hard-linked one", () => {
  const dir = mkdtempSync(join(tmpdir(), "omb-crash-"));
  const file = join(dir, "logs", "desktop-crashes.log");
  appendDesktopCrashRecord(file, 64, "first crash");
  expect(readFileSync(file, "utf8")).toMatch(/^\[.+\] first crash\n$/);
  appendDesktopCrashRecord(file, 10, "second crash");
  expect(readFileSync(file, "utf8")).toMatch(/^\[.+\] second crash\n$/);
  linkSync(file, join(dir, "other"));
  appendDesktopCrashRecord(file, 1_000, "third crash");
  expect(readFileSync(file, "utf8")).not.toContain("third crash");
  rmSync(dir, { recursive: true, force: true });
});
