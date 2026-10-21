// Subprocess fakes run as bare node children, and a test copies the Codex fake out of the repo (to a temp
// bin dir as `codex`), where any relative import dies at ESM link time.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SUPPORT = fileURLToPath(new URL("../", import.meta.url));

/** Fakes a test copies out of the repo: nothing relative may be imported, not even a sibling. */
const COPIED_OUT = new Set(["drivers/fake-codex-app-server.ts"]);

/** Value imports only: `import type` is erased before the file runs. */
const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/^\s*import\s+(?!type\s)[^;]*?\sfrom\s+["']([^"']+)["']/gm), ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)]
    .map((match) => match[1]!);

describe("provider fakes stay self-contained", () => {
  // A subprocess fake starts with a node shebang; in-process helpers may import from the repo.
  const fakes = ["drivers", "auth"].flatMap((domain) =>
    readdirSync(join(SUPPORT, domain)).filter((file) =>
      /^fake-.*\.ts$/.test(file) && !file.endsWith(".test.ts") && readFileSync(join(SUPPORT, domain, file), "utf8").startsWith("#!"),
    ).map((file) => `${domain}/${file}`),
  );

  it("sees the fakes this guard exists for", () => {
    expect(fakes).toContain("drivers/fake-codex-app-server.ts");
    expect(fakes).toContain("drivers/fake-claude-cli.ts");
    expect(fakes).toContain("drivers/fake-acp-cli.ts");
  });

  it.each(fakes)("%s imports nothing from outside test support", (file) => {
    const filename = join(SUPPORT, file);
    const specifiers = importSpecifiers(readFileSync(filename, "utf8"));
    const outside = specifiers.filter((specifier) => {
      if (!specifier.startsWith(".")) return false;
      const target = relative(SUPPORT, resolve(dirname(filename), specifier));
      return target === ".." || target.startsWith(`..${sep}`) || isAbsolute(target);
    });
    expect(
      outside,
      `${file} imports ${outside.join(", ")} from outside test support. Fakes run as bare node subprocesses, some copied out of the repo; inline the helper instead.`,
    ).toEqual([]);
    if (COPIED_OUT.has(file)) {
      const relativeImports = specifiers.filter((specifier) => specifier.startsWith("."));
      expect(
        relativeImports,
        `${file} is copied out of the repo by a test and may import nothing relative, but imports ${relativeImports.join(", ")}.`,
      ).toEqual([]);
    }
  });
});
