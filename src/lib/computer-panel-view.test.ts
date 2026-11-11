import { describe, expect, it, vi } from "vitest";

import { readComputerPanelView, resolveComputerPanelView, writeComputerPanelView } from "./computer-panel-view";

describe("computer panel view persistence", () => {
  it("restores the files tab for the same bot after the expanded workspace closes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    writeComputerPanelView("sprout", "files", storage);

    expect(readComputerPanelView("sprout", storage)).toBe("files");
    expect(readComputerPanelView("another-bot", storage)).toBe("files");
  });

  it("falls back safely for stale values or blocked storage", () => {
    expect(readComputerPanelView("sprout", { getItem: () => "unknown" })).toBe("files");
    expect(readComputerPanelView("sprout", { getItem: () => { throw new Error("blocked"); } })).toBe("files");

    const setItem = vi.fn(() => { throw new Error("blocked"); });
    expect(() => writeComputerPanelView("sprout", "files", { setItem })).not.toThrow();
  });

  it("remembers a bot's routines tab without changing another bot's view", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    writeComputerPanelView("scout", "routines", storage);
    expect(readComputerPanelView("scout", storage)).toBe("routines");
    expect(readComputerPanelView("other", storage)).toBe("files");
  });

  it("round-trips the Data tab", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    writeComputerPanelView("scout", "data", storage);
    expect(readComputerPanelView("scout", storage)).toBe("data");
  });
});

describe("computer panel view availability", () => {

  it("drops the tabs the current mode does not render", () => {
    expect(resolveComputerPanelView("routines")).toBe("routines");
    expect(resolveComputerPanelView("files")).toBe("files");
  });

  it("keeps a view whose trigger is on the row", () => {
    for (const view of ["files", "data"] as const) {
      expect(resolveComputerPanelView(view)).toBe(view);
      expect(resolveComputerPanelView(view)).toBe(view);
    }
    expect(resolveComputerPanelView("files")).toBe("files");
  });
});
