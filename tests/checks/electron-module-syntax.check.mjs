import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDirectory = fileURLToPath(new URL("../../electron", import.meta.url));
const modules = readdirSync(electronDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:cjs|mjs)$/.test(entry.name))
  .map((entry) => path.join(electronDirectory, entry.name))
  .sort();

if (modules.length === 0) throw new Error("No Electron modules were found to syntax-check");
for (const modulePath of modules) {
  execFileSync(process.execPath, ["--check", modulePath], {
    stdio: "inherit",
  });
}

console.log(`Syntax-checked ${modules.length} Electron modules.`);
