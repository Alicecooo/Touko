// `pnpm dev:server`: the harness from a source checkout, whose UI reaches it through Vite's dev proxy in a browser on
// this machine. OMB_DEV_TRUST_LOCAL_BROWSER=0 tries the sign-in a self-hosted server asks a browser for.
// The PA checkout keeps Web data beside the repository. This fallback also covers direct `pnpm dev:server`
// launches, so they cannot silently create a second data set under the user's home directory.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.OMB_DATA_DIR) {
  const repository = dirname(dirname(fileURLToPath(import.meta.url)));
  const developmentRoot = join(repository, "..", "dev-env");
  if (existsSync(developmentRoot)) process.env.OMB_DATA_DIR = join(developmentRoot, ".runtime", "touko");
}

process.env.OMB_DEV_TRUST_LOCAL_BROWSER ??= "1";
await import("./index.ts");
