import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

// Tailwind v4 wraps every hover:/group-hover: rule in @media (hover: hover), so on a touch screen a hover-revealed
// control never shows: each needs a touch: counterpart and a keyboard-focus reveal.

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");
const stylesPath = join(srcRoot, "styles.css");
const styles = readFileSync(stylesPath, "utf8");

describe("hover-only actions on touch screens", () => {

  it("compiles touch: utilities inside the no-hover media query and leaves hover gated to mice", async () => {
    const tailwindRoot = dirname(fileURLToPath(import.meta.resolve("tailwindcss/package.json")));
    const compiler = await compile(styles, {
      base: srcRoot,
      loadStylesheet: async (id, base) => {
        const path = id === "tailwindcss" ? join(tailwindRoot, "index.css") : id.startsWith("tailwindcss/")
          ? join(tailwindRoot, id.slice("tailwindcss/".length))
          : join(base, id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    const css = compiler.build(["touch:opacity-100", "group-hover:opacity-100"]);
    // One media query holding both conditions: a comma in the shorthand variant would be read as a selector list.
    expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\) \{\s*\.touch\\:opacity-100 \{\s*opacity: 100%;/);
    expect(css).not.toMatch(/\.touch\\:opacity-\d+ \(pointer/);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.group-hover\\:opacity-100:is\(:where\(\.group\):hover \*\)/);
  });
});
