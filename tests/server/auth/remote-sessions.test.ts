import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { removeTempDir, waitForExit } from "../../support/environment/process-cleanup.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "../../..");
const PORT = 18800 + Math.floor(Math.random() * 10_000);
const WEBHOOK_PORT = 39000 + Math.floor(Math.random() * 10_000);
const BASE = `http://127.0.0.1:${PORT}`;
const REMOTE_HOST = "mini.tail1234.ts.net:8799";
const PUBLIC_URL = "https://mini.tail1234.ts.net";

let home: string;
let child: ChildProcess;
let stderr = "";

/** A non-loopback Host and a distinct forwarded source, so the pairing lockout is exercised only on purpose. */
const remote = (source: string, extra: Record<string, string> = {}) => ({ host: REMOTE_HOST, "x-forwarded-for": source, ...extra });

/** Plain node:http: fetch silently drops a custom Host header. */
function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: any; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: PORT, path, method: init.method ?? "GET", headers: { "content-type": "application/json", ...init.headers } },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let body: any = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            body = { raw };
          }
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "omb-remote-test-"));
  const staticDir = join(home, "static");
  mkdirSync(join(home, ".openmausbot"), { recursive: true });
  mkdirSync(join(staticDir, "assets"), { recursive: true });
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>Served UI</title>");
  // Avoid probing whatever agent CLIs the test machine has installed.
  writeFileSync(join(home, ".openmausbot", "config.json"), JSON.stringify({
    instances: { fixture: { driver: "remote-session-test-shadow" } },
    profile: { name: "Security fixture", email: "private@example.invalid" },
    vps: { sshAlias: "fixture-private-host" },

  }));
  child = spawn(process.execPath, [join(SERVER_DIR, "../../../server/index.ts")], {
    cwd: ROOT,
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: home,
      USERPROFILE: home,
      OMB_PORT: String(PORT),
      OMB_WEBHOOK_PORT: String(WEBHOOK_PORT),
      OMB_STATIC_DIR: staticDir,
      OMB_PUBLIC_URL: `${PUBLIC_URL}/`,
      OMB_APP_VERSION: "9.9.9-test",
      OMB_ENVIRONMENT_LABEL: "cab mini",
      OMB_BROWSER_CONNECTION: join(home, "browser-test-connection.json"),
      // Slow heartbeat: the revocation test must prove the revoke itself ends the stream.
      OMB_SSE_HEARTBEAT_MS: "4000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${stderr}`);
}, 30_000);

afterAll(async () => {
  await waitForExit(child, { signal: "SIGTERM" });
  await removeTempDir(home);
});

describe("before pairing", () => {
  it.each(["//%5B", "//[", "http://["])("rejects malformed request target %s and stays healthy", async (path) => {
    const response = await call(path, { headers: remote("10.0.0.1") });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid request URL" });
    const health = await call("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ app: "openmausbot", pid: child.pid });
    expect(child.exitCode).toBeNull();
  });

  it("describes itself to anyone, but serves nothing else off-machine", async () => {
    const descriptor = await call("/.well-known/openmausbot/environment", { headers: remote("10.0.0.1") });
    expect(descriptor.status).toBe(200);
    expect(descriptor.body.environmentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(descriptor.body.label).toBe("cab mini");
    expect(descriptor.body.version).toBe("9.9.9-test");
    // Exact, so a new pre-pairing field has to be added here on purpose.
    expect(descriptor.body.capabilities).toEqual({
      remoteSessions: true,
      selfUpdate: "operator",
      emailSignIn: false,
      jobs: true,
    });
    const refused = await call("/api/bots", { headers: remote("10.0.0.1") });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/sign in to use the server remotely/);
  });

  it("serves the UI shell to a remote browser so it can reach the pair page", async () => {
    const res = await call("/pair", { headers: remote("10.0.0.1") });
    expect(res.status).toBe(200);
    expect(res.body.raw).toContain("Served UI");
  });

  it("keeps the owner's loopback path untouched", async () => {
    expect((await call("/api/bots")).status).toBe(200);
    const me = await call("/api/auth/session");
    expect(me.body).toMatchObject({ kind: "loopback", scopes: ["admin", "client"] });
    const ticket = await call("/api/auth/stream-ticket", { method: "POST" });
    expect(ticket.body.ticket).toBeNull();
  });
});

