import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hook = path.join(root, "build", "linux-after-install.sh");
const directories = [];

function fixture() {
  const appRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "omb-deb-upgrade-"));
  directories.push(appRoot);
  const resources = path.join(appRoot, "resources");
  const cuaRoot = path.join(resources, "cua-linux-x64");
  fs.mkdirSync(cuaRoot, { recursive: true });
  for (const directory of [appRoot, resources, cuaRoot]) fs.chmodSync(directory, 0o775);
  for (const executable of ["cua-driver", "cua-cursor-theme"]) {
    fs.writeFileSync(path.join(cuaRoot, executable), "fixture");
    fs.chmodSync(path.join(cuaRoot, executable), 0o664);
  }
  const sandbox = path.join(appRoot, "chrome-sandbox");
  fs.writeFileSync(sandbox, "fixture");
  fs.chmodSync(sandbox, 0o664);
  return { appRoot, resources, cuaRoot, sandbox };
}

function run(appRoot) {
  return spawnSync("/bin/sh", [hook], {
    encoding: "utf8",
    env: { ...process.env, OPENMAUSBOT_POSTINSTALL_TEST_ROOT: appRoot },
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "linux")("Linux desktop installation without an automation browser", () => {
  it("repairs desktop driver and Electron sandbox permissions idempotently", () => {
    const f = fixture();
    for (let pass = 0; pass < 2; pass++) {
      const result = run(f.appRoot);
      expect(result.status, result.stderr).toBe(0);
      for (const directory of [f.appRoot, f.resources, f.cuaRoot]) expect(fs.statSync(directory).mode & 0o777).toBe(0o755);
      for (const name of ["cua-driver", "cua-cursor-theme"]) expect(fs.statSync(path.join(f.cuaRoot, name)).mode & 0o777).toBe(0o755);
      expect(fs.statSync(f.sandbox).mode & 0o7777).toBe(0o4755);
    }
  });

  it("refuses a driver symlink without changing its target", () => {
    const f = fixture();
    const target = path.join(f.appRoot, "outside-driver");
    fs.writeFileSync(target, "untouched");
    fs.chmodSync(target, 0o664);
    const executable = path.join(f.cuaRoot, "cua-driver");
    fs.unlinkSync(executable);
    fs.symlinkSync(target, executable);
    expect(run(f.appRoot).status).not.toBe(0);
    expect(fs.readFileSync(target, "utf8")).toBe("untouched");
    expect(fs.statSync(target).mode & 0o777).toBe(0o664);
  });
});
