// UI verification uses an operator-provided browser CLI. This is not mounted as a Bot tool or packaged with the app.
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { resolveCliSpawn } from "../../server/platform/env-path.ts";

const run = promisify(execFile);
type Options = { dataDir?: string; env?: NodeJS.ProcessEnv; log?: (line: string) => void };

export function resolveQaBrowser(options: Options = {}): string | null {
  const env = options.env ?? process.env;
  const binary = env.OMB_QA_AGENT_BROWSER_PATH?.trim() || "agent-browser";
  const resolved = resolveCliSpawn(binary, ["--version"], env);
  const result = spawnSync(resolved.command, resolved.args, { env, timeout: 5_000, windowsHide: true, stdio: "ignore" });
  return result.status === 0 ? binary : null;
}

export async function requireQaBrowser(options: Options = {}): Promise<string> {
  const binary = resolveQaBrowser(options);
  if (!binary) throw new Error("UI verification requires an external agent-browser CLI. Configure OMB_QA_AGENT_BROWSER_PATH; the app no longer installs a browser.");
  return binary;
}

export async function checkQaBrowser(binary: string, options: Options = {}): Promise<void> {
  const env = options.env ?? process.env;
  const resolved = resolveCliSpawn(binary, ["--version"], env);
  await run(resolved.command, resolved.args, { env, timeout: 10_000, windowsHide: true });
}

export async function closeQaBrowser(binary: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const resolved = resolveCliSpawn(binary, ["close"], env);
  try {
    await run(resolved.command, resolved.args, { env, timeout: 15_000, windowsHide: true });
    return true;
  } catch { return false; }
}

export const qaCredentialFlags = () => ["--password-store=basic", "--use-mock-keychain"];
