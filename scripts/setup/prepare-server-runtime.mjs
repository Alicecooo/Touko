// Stage the 1Password SDK and its WebAssembly core outside ASAR. The SDK reads
// the core beside itself, so both packages must remain real files at runtime.
import { cpSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ONEPASSWORD_SCOPE = "@1password";
export const ONEPASSWORD_PACKAGES = ["sdk", "sdk-core"];

export function pinnedOnePasswordVersion(root) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const pin = manifest.dependencies?.[`${ONEPASSWORD_SCOPE}/sdk`];
  if (!pin || !/^\d+\.\d+\.\d+$/.test(pin)) {
    throw new Error(`package.json must pin ${ONEPASSWORD_SCOPE}/sdk to an exact x.y.z version; found ${pin ?? "nothing"}`);
  }
  return pin;
}

function packageVersion(directory) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version;
}

function installedPackage(nodeModules, name) {
  const scope = join(nodeModules, ONEPASSWORD_SCOPE);
  const candidates = [join(scope, name)];
  try {
    const sdk = realpathSync(join(scope, "sdk"));
    candidates.push(join(dirname(sdk), name));
  } catch {
  }
  for (const candidate of candidates) {
    try {
      const real = realpathSync(candidate);
      if (statSync(real).isDirectory()) return real;
    } catch {
    }
  }
  return null;
}

function requireRegularFile(file) {
  let details;
  try {
    details = lstatSync(file);
  } catch {
    throw new Error(`Server runtime resource is missing: ${file}`);
  }
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Server runtime resource must be a regular file: ${file}`);
}

export async function verifyServerRuntime(directory, version) {
  const scope = join(directory, "node_modules", ONEPASSWORD_SCOPE);
  for (const name of ONEPASSWORD_PACKAGES) requireRegularFile(join(scope, name, "package.json"));
  if (packageVersion(join(scope, "sdk")) !== version) {
    throw new Error(`${ONEPASSWORD_SCOPE}/sdk in ${directory} does not match package.json pin ${version}`);
  }
  requireRegularFile(join(scope, "sdk", "dist", "sdk.js"));
  requireRegularFile(join(scope, "sdk-core", "nodejs", "core.js"));
  requireRegularFile(join(scope, "sdk-core", "nodejs", "core_bg.wasm"));
  const wanted = JSON.parse(readFileSync(join(scope, "sdk", "package.json"), "utf8")).dependencies?.[`${ONEPASSWORD_SCOPE}/sdk-core`];
  if (wanted && packageVersion(join(scope, "sdk-core")) !== wanted) {
    throw new Error(`${ONEPASSWORD_SCOPE}/sdk-core in ${directory} does not match the SDK dependency ${wanted}`);
  }
}

export function stageServerRuntime({
  root,
  nodeModules = join(root, "node_modules"),
  stage = join(root, "dist-native", "server-runtime"),
  log = console.log,
} = {}) {
  const version = pinnedOnePasswordVersion(root);
  rmSync(stage, { recursive: true, force: true });
  const destination = join(stage, "node_modules", ONEPASSWORD_SCOPE);
  mkdirSync(destination, { recursive: true });
  for (const name of ONEPASSWORD_PACKAGES) {
    const source = installedPackage(nodeModules, name);
    if (!source) throw new Error(`${ONEPASSWORD_SCOPE}/${name} is not installed; run pnpm install`);
    cpSync(source, join(destination, name), { recursive: true, dereference: true });
  }
  verifyServerRuntime(stage, version);
  log?.(`Staged 1Password SDK ${version} at ${stage}`);
  return stage;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  stageServerRuntime({ root: join(dirname(fileURLToPath(import.meta.url)), "../..") });
}
