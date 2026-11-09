import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_WIDTH_IDS, DEFAULT_CHAT_WIDTH, applyChatWidth, readChatWidth } from "./chat-width";

describe("chat width", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("document", { documentElement: { dataset: {} as DOMStringMap } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the standard width", () => {
    expect(DEFAULT_CHAT_WIDTH).toBe("standard");
    expect(readChatWidth()).toBe("standard");
  });

  it("stamps a chosen width, remembers it, and clears the attribute for the default", () => {
    applyChatWidth("full");
    expect(document.documentElement.dataset.chatWidth).toBe("full");
    expect(readChatWidth()).toBe("full");
    applyChatWidth(DEFAULT_CHAT_WIDTH);
    expect(document.documentElement.dataset.chatWidth).toBeUndefined();
    expect(readChatWidth()).toBe("standard");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem("omb-chat-width", "huge");
    expect(readChatWidth()).toBe("standard");
  });

  it.each(CHAT_WIDTH_IDS)("restores %s before paint without changing other appearance preferences", (id) => {
    localStorage.setItem("omb-chat-width", id);
    localStorage.setItem("omb-color-user-bubbles", "1");
    document.documentElement.dataset.skin = "midnight";
    applyChatWidth(readChatWidth());
    expect(document.documentElement.dataset.chatWidth).toBe(id === DEFAULT_CHAT_WIDTH ? undefined : id);
    expect(document.documentElement.dataset.skin).toBe("midnight");
    expect(localStorage.getItem("omb-color-user-bubbles")).toBe("1");
  });

  it("still applies a session choice when storage cannot be read or written", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
    });
    expect(readChatWidth()).toBe("standard");
    expect(() => applyChatWidth("wide")).not.toThrow();
    expect(document.documentElement.dataset.chatWidth).toBe("wide");
    applyChatWidth("standard");
    expect(document.documentElement.dataset.chatWidth).toBeUndefined();
  });
});
