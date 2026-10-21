import assert from "node:assert/strict";
import test from "node:test";
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDesktopPrefs, jsonFile, registerDesktopPrefs } from "./desktop-prefs.mjs";

test("analytics opt-out survives restart and a failed atomic write", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "touko-desktop-prefs-"));
  try {
    const file = path.join(directory, "desktop-prefs.json");
    createDesktopPrefs(jsonFile(file)).setAnalytics(false);
    const failingFiles = { ...fs, writeFileSync(target) {
      fs.writeFileSync(target, "");
      throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    } };
    assert.throws(() => jsonFile(file, failingFiles).write({ analytics: true }), /disk full/);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).analytics, false);
    assert.equal(createDesktopPrefs(jsonFile(file)).analytics(), false);
    assert.deepEqual(readdirSync(directory), ["desktop-prefs.json"]);
    assert.equal(createDesktopPrefs(jsonFile(path.join(directory, "missing.json"))).analytics(), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("only the local app may change analytics; saved-server pages learn only opt-out", async () => {
  const handlers = new Map(), listeners = new Map();
  let saved = null;
  registerDesktopPrefs({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: (name, handler) => listeners.set(name, handler) },
    read: () => saved, write: value => { saved = value; }, page: event => event.page,
  });
  const readState = page => {
    const event = { page };
    listeners.get("desktop-analytics:state")(event);
    return event.returnValue;
  };
  const writeState = (page, value) => handlers.get("desktop-analytics:set")({ page }, value);
  assert.equal(readState("local"), null);
  await writeState("local", false);
  assert.equal(readState("local"), false);
  assert.equal(readState("server"), false);
  assert.equal(readState(null), null);
  assert.throws(() => writeState("server", true), /local app/);
  await writeState("local", true);
  assert.equal(readState("local"), true);
  assert.equal(readState("server"), null);
  assert.equal(readState(null), null);
});
