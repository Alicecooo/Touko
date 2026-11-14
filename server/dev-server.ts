// `pnpm dev:server`: the harness from a source checkout, whose UI reaches it through Vite's dev proxy in a browser on
// this machine. OMB_DEV_TRUST_LOCAL_BROWSER=0 tries the sign-in a self-hosted server asks a browser for.
// The PA checkout keeps Web data beside the repository. This fallback also covers direct `pnpm dev:server`
// launches, so they cannot silently create a second data set under the user's home directory.
import { existsSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const developmentRoot = resolve(repository, "..", "dev-env");
const paDevelopment = existsSync(join(developmentRoot, "dev.py")) && existsSync(join(developmentRoot, "start-web.ps1"));
if (paDevelopment) {
  const dataDir = join(developmentRoot, "data", "touko");
  process.env.OMB_DATA_DIR ||= dataDir;
  const configuredDataDir = resolve(process.env.OMB_DATA_DIR);
  const usesManagedData = process.platform === "win32"
    ? configuredDataDir.toLowerCase() === dataDir.toLowerCase()
    : configuredDataDir === dataDir;
  if (usesManagedData && !statSync(join(dataDir, "messages.db"), { throwIfNoEntry: false })?.isFile()) {
    const legacy = join(developmentRoot, ".runtime", "runtime-core", "touko");
    const recovery = statSync(join(legacy, "messages.db"), { throwIfNoEntry: false })?.isFile()
      ? `Existing data remains at ${legacy}; explicitly migrate the complete directory to ${dataDir}.`
      : `Explicitly restore a verified complete data backup into ${dataDir}.`;
    throw new Error(`Touko business database is missing: ${join(dataDir, "messages.db")}. ${recovery} No archive is imported automatically.`);
  }
  for (const key of Object.keys(process.env)) if (/^CODEX_/i.test(key)) delete process.env[key];
  process.env.CODEX_HOME = join(developmentRoot, ".runtime", "codex");
  const tools = join(developmentRoot, ".tools");
  const inheritedPath = (process.env.PATH ?? "").split(delimiter).filter((part) =>
    !/codex-runtimes|openai\.codexprimaryruntime|openai\.codex_|openai[\\/]codex|[\\/]\.codex[\\/](?:bin|tmp)(?:[\\/]|$)/i.test(part));
  process.env.PATH = [dirname(process.execPath), join(tools, "node_modules", ".bin"),
    join(tools, "pnpm-bin"), join(tools, "agent-clis"), join(tools, "agent-clis", "node_modules", ".bin"),
    ...inheritedPath].join(delimiter);
}

process.env.OMB_DEV_TRUST_LOCAL_BROWSER ??= "1";
await import("./index.ts");
