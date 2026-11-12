// Bundles each harness-server entry point into one ESM graph. Shared modules
// are emitted once as chunks beside the entries. The packaged app ships no
// node_modules. Entry points keep their exact relative paths under dist-server,
// where the server locates each proxy by path.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const server = join(root, "server");
const outdir = join(root, "dist-server");
// Output is only this script's bundles. Wiping first drops the old tsc tree
// (rootDir "." wrote a second unbundled copy under server/, shared/, scripts/,
// and src/ next to the bundles) and any chunk left from a previous run.
rmSync(outdir, { recursive: true, force: true });

// yaml's Node export is CommonJS with dynamic requires that cannot run once
// inlined into ESM; its browser export is the same parser without them.
const yamlEsmPlugin = {
  name: "yaml-esm",
  setup(build) {
    build.onResolve({ filter: /^yaml$/ }, () => ({
      path: join(root, "node_modules", "yaml", "browser", "index.js"),
    }));
  },
};

// ws is CommonJS and requires Node's own modules, which an ESM bundle reaches
// only through a require of its own (esbuild otherwise throws "Dynamic require
// of "events" is not supported" when it loads).
const NODE_REQUIRE = {
  js: 'import { createRequire as __ombCreateRequire } from "node:module";\nconst require = __ombCreateRequire(import.meta.url);',
};

// Every file run as its own process. Chunks stay in dist-server/ (not a
// subdirectory): several modules resolve sibling files from import.meta.url,
// which bundling already points at the output directory.
const ENTRY_POINTS = [
  "index.ts",
  "storage/message-search.worker.ts",
  // the `openmausbot` command
  "openmausbot.ts",
  "workspace/workspace-backup.worker.ts",
  // the container image's entry point
  "server-launcher.ts",
  // Imported directly by the packaged smoke probes as ./proxy-paths.js.
  "proxy-paths.ts",
  "computers/local-computer.ts",
  "computers/local-computer-proxy.ts",
  // the hook helper Claude Code runs at PostToolUse/PreCompact/SessionStart/Stop
  "hooks/omb-hook.ts",
  "agent/permission-proxy.ts",
  "integrations/connector-proxy.ts",
  "mcp/mcp-gate.ts",
  "mcp/mcp-remote-proxy.ts",
  "mcp/harness-mcp-proxy.ts",
  "drivers/agents-proxy.ts",
  "drivers/dweb-proxy.ts",
];

const entryPoints = Object.fromEntries(
  ENTRY_POINTS.map((entry) => [entry.replace(/\.ts$/, ""), join(server, entry)]),
);
// The CLI's `openmausbot mcp` loads this module, and external clients launch
// mcp-server.js. One shared chunk instead of a second copy inside openmausbot.js.
entryPoints["mcp-server"] = join(root, "scripts/dev/developer-mcp-server.ts");

await build({
  entryPoints,
  bundle: true,
  splitting: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir,
  logLevel: "info",
  plugins: [yamlEsmPlugin],
  banner: NODE_REQUIRE,
});

// `openmausbot serve --tunnel` spawns the connector guardian as its own
// process, so it must exist as a file beside the server. Kept out of the
// shared graph so starting the guardian does not load the server chunks.
await build({
  entryPoints: [join(root, "server/network/tunnel-guardian.mjs")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: join(outdir, "tunnel-guardian.js"),
  logLevel: "info",
});

// Runs itself when executed directly, so it must never be inlined into another
// entry.
await build({
  entryPoints: [join(root, "scripts/setup/prepare-https-tunnel.mjs")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: join(outdir, "prepare-cloudflared.js"),
  logLevel: "info",
});

// The packaged desktop forks this bootstrap to turn on Node's compile cache.
// Copied, not bundled: esbuild would inline index.js into it.
copyFileSync(join(root, "scripts/build/desktop-server-entry.mjs"), join(outdir, "desktop-entry.mjs"));

// The model catalog snapshot (server/model-catalog/catalog.ts) is read from
// disk, not inlined: 1.5 MB of JSON has no place in index.js. The bundle looks
// for it under model-catalog/ beside itself. Its MIT notice is inside the file.
const catalogSnapshot = join(outdir, "model-catalog", "models-dev.snapshot.json");
mkdirSync(dirname(catalogSnapshot), { recursive: true });
copyFileSync(join(server, "model-catalog", "models-dev.snapshot.json"), catalogSnapshot);

// Pi loads this through its own jiti and supplies TypeBox. Inline our local
// policy module so the extension also works without the source checkout;
// keep the Pi-owned dependency external and retain the .ts loading contract.
const piMcpExtSrc = join(server, "drivers", "pi-mcp-extension.ts");
const piMcpExtDest = join(outdir, "drivers", "pi-mcp-extension.ts");
mkdirSync(dirname(piMcpExtDest), { recursive: true });
await build({ entryPoints: [piMcpExtSrc], outfile: piMcpExtDest, bundle: true,
  platform: "node", target: "node24", format: "esm", external: ["typebox"], });

// Desktop resources live outside app.asar, so its package.json cannot mark
// these .js bundles as ESM. Do not inherit a user's CommonJS package scope.
writeFileSync(join(outdir, "package.json"), '{"type":"module"}\n');
