// Source conventions belong to lint, not the behavioral test suite.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../src", import.meta.url));
const css = readFileSync(join(src, "styles.css"), "utf8");
const theme = css.match(/@theme\s*\{([^}]*)\}/)?.[1] ?? "";
const defined = new Set([...theme.matchAll(/--color-([\w-]+)\s*:/g)].map(([, name]) => name));
const families = new Set([...defined].map(name => name.split("-")[0]).concat(["line", "surface"]));
const inkCarriedByFill = {
  "accent-ink": /\.bg-accent\s*\{\s*color:\s*var\(--color-accent-ink\)/,
  "danger-ink": /\.bg-danger\s*\{\s*color:\s*var\(--color-danger-ink\)/,
};
const prefix = "bg|text|border(?:-[xytblrse])?|ring-offset|ring|divide|outline|fill|stroke|placeholder|decoration|caret|shadow|from|via|to";
const utility = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${prefix})-([a-z][a-z-]*)(?:/[\\w.\\[\\]]+)?(?![\\w-])`, "g");
const directWrite = /navigator\s*\??\.\s*clipboard\s*\??\.\s*writeText/;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path)
      : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const errors = [];
if (defined.size === 0) errors.push("src/styles.css: no @theme color tokens found");
for (const [name, rule] of Object.entries(inkCarriedByFill)) {
  if (!rule.test(css)) errors.push(`src/styles.css: missing fill rule for ${name}`);
}
for (const path of sources(src)) {
  const file = relative(src, path).replaceAll("\\", "/");
  const source = readFileSync(path, "utf8");
  const direct = directWrite.exec(source);
  if (file !== "lib/copy-text.ts" && direct) {
    const line = source.slice(0, direct.index).split("\n").length;
    errors.push(`src/${file}:${line}: use copyText instead of navigator.clipboard.writeText`);
  }
  source.split("\n").forEach((line, index) => {
    const at = `src/${file}:${index + 1}`;
    for (const [token, name] of line.matchAll(utility)) {
      if (families.has(name.split("-")[0]) && !defined.has(name) && !(name in inkCarriedByFill)) {
        errors.push(`${at}: undefined color utility ${token}`);
      }
    }
  });
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log("Source conventions passed (clipboard writes and color tokens).");
