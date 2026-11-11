import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LAST_BOT_SECTION_KEY,
  readLastBotSection,
  rememberBotSection,
} from "./last-bot-section";

const surface = (initial: Record<string, string> = {}) => {
  const stored = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    stored,
  };
};

describe("last bot section", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("readLastBotSection returns null with nothing stored", () => {
    vi.stubGlobal("localStorage", surface());
    expect(readLastBotSection()).toBeNull();
  });

  it("readLastBotSection ignores an unknown section id", () => {
    vi.stubGlobal("localStorage", surface({ [LAST_BOT_SECTION_KEY]: "not-a-section" }));
    expect(readLastBotSection()).toBeNull();
  });

  it("rememberBotSection round-trips through storage", () => {
    const store = surface();
    vi.stubGlobal("localStorage", store);
    rememberBotSection("model");
    expect(store.stored.get(LAST_BOT_SECTION_KEY)).toBe("model");
    expect(readLastBotSection()).toBe("model");
  });

  it("a throwing storage surface never breaks reads or writes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readLastBotSection()).toBeNull();
    expect(() => rememberBotSection("soul")).not.toThrow();
  });
});
