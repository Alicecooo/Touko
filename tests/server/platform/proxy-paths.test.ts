import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { SERVER_ROOT, SPAWNED_PROXIES } from "../../../server/proxy-paths.ts";

describe("local computer proxy runtime path", () => {
  it("resolves an existing TypeScript entry in development", () => {
    expect(SPAWNED_PROXIES.localComputer).toBe(join(SERVER_ROOT, "computers/local-computer-proxy.ts"));
    expect(existsSync(SPAWNED_PROXIES.localComputer)).toBe(true);
  });


  it("resolves the bundled JavaScript sibling without a source tree", async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "omb-proxy-paths-")));
    try {
      await build({
        entryPoints: ["proxy-paths.ts", "computers/local-computer-proxy.ts"].map((entry) => join(SERVER_ROOT, entry)),
        bundle: true,
        platform: "node",
        target: "node20",
        format: "esm",
        outbase: SERVER_ROOT,
        outdir: directory,
        logLevel: "silent",
      });
      const manifest = pathToFileURL(join(directory, "proxy-paths.js")).href;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", [
        `import { SERVER_ROOT, SPAWNED_PROXIES } from ${JSON.stringify(manifest)};`,
        "console.log(JSON.stringify({ root: SERVER_ROOT, localComputer: SPAWNED_PROXIES.localComputer }));",
      ].join("\n")], { encoding: "utf8", timeout: 10_000 });
      const packaged = JSON.parse(output);

      expect(packaged.root).toBe(directory);
      expect(packaged.localComputer).toBe(join(directory, "computers/local-computer-proxy.js"));
      expect(existsSync(packaged.localComputer)).toBe(true);
      expect(existsSync(join(directory, "computers/local-computer-proxy.ts"))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("harness MCP proxy runtime path", () => {
  it("resolves the shared harness MCP process", () => {
    expect(SPAWNED_PROXIES.harnessMcp).toBe(join(SERVER_ROOT, "mcp/harness-mcp-proxy.ts"));
    expect(existsSync(SPAWNED_PROXIES.harnessMcp)).toBe(true);
  });
});
