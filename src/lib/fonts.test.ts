import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FONT, applyFont, readFont } from "./fonts";

describe("fonts", () => {
  // Vitest runs in node here: stand in the two globals the module touches.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("document", { documentElement: { dataset: {} as DOMStringMap } });
  });

  it("stamps a chosen font and remembers it", () => {
    applyFont("poppins");
    expect(document.documentElement.dataset.font).toBe("poppins");
    expect(readFont()).toBe("poppins");
  });

  it("clears the attribute for the skin default", () => {
    applyFont("poppins");
    applyFont(DEFAULT_FONT);
    expect(document.documentElement.dataset.font).toBeUndefined();
    expect(readFont()).toBe(DEFAULT_FONT);
  });

  it("falls back to the default for an unknown stored value", () => {
    localStorage.setItem("omb-font", "comic-sans");
    expect(readFont()).toBe(DEFAULT_FONT);
  });
});
