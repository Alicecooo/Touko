// Resolve spawned proxies only here: esbuild inlines modules into entry bundles, so a relative path must be anchored at the server root.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function serverRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let directory = here;
  // Bundled subprocesses keep their business subdirectory; locate the shared root entry.
  while (true) {
    if (existsSync(join(directory, "proxy-paths.ts")) || existsSync(join(directory, "proxy-paths.js"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return here;
    directory = parent;
  }
}

export const SERVER_ROOT = serverRoot();

export function resolveProxy(relative: string): string {
  const source = join(SERVER_ROOT, `${relative}.ts`);
  return existsSync(source) ? source : join(SERVER_ROOT, `${relative}.js`);
}

export const SPAWNED_PROXIES = {
  harnessMcp: resolveProxy("mcp/harness-mcp-proxy"),
  localComputer: resolveProxy("computers/local-computer-proxy"),
  permission: resolveProxy("agent/permission-proxy"),
  agents: resolveProxy("drivers/agents-proxy"),
  dweb: resolveProxy("drivers/dweb-proxy"),
  connectors: resolveProxy("integrations/connector-proxy"),
  mcpGate: resolveProxy("mcp/mcp-gate"),
  mcpRemote: resolveProxy("mcp/mcp-remote-proxy"),
  hook: resolveProxy("hooks/omb-hook"),
  piMcpExtension: resolveProxy("drivers/pi-mcp-extension"),
} as const;

// in the packaged app process.execPath is Electron — run the proxy as node
export const AGENTS_NODE_FLAG = { ELECTRON_RUN_AS_NODE: "1" };
