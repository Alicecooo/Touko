// @vitest-environment happy-dom
// Simple mode's composer: a round + holding attach, Finish together and the thread's approval level.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Group } from "@/state/store";
import { restoreComposerDraft } from "@/lib/drafts";

const fixture = vi.hoisted(() => ({
  advanced: false,
  dispatch: vi.fn(),
}));
const ENGINE = "claude-3f0c2b1e-9d1a-4c55-8a51-0a3a6f1e2b7c";
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({
    state: { ...original.initialState, bots: [bot, peer], instances: [{
      instanceId: ENGINE, driverKind: "claudeAgent", displayName: "Claude", capabilities: { agentsMcp: true },
    }] },
    dispatch: fixture.dispatch,
  }) };
});
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => true }));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => fixture.advanced, setAdvancedMode: vi.fn() }));

import { Composer } from "./Composer";

const bot: Bot = {
  id: "atlas", threadId: "atlas-thread", name: "Atlas", title: "", description: "",
  color: "purple", notifications: false, unread: false, busy: false, messages: [], approvalMode: "ask",
  modelSelection: { instanceId: ENGINE, model: "fake" },
};
const peer: Bot = { ...bot, id: "juniper", threadId: "juniper-thread", name: "Juniper", color: "teal" };
const room: Group = {
  id: "room", threadId: "room-thread", name: "Launch planning", memberIds: [bot.id, peer.id],
  defaultResponder: { kind: "member", botId: bot.id }, bulletin: "", unread: false,
  createdAt: 1, setupCompletedAt: 1, messages: [],
};

let root: Root;
let container: HTMLDivElement;
const render = (props: Parameters<typeof Composer>[0]) => flushSync(() => root.render(createElement(Composer, props)));
const plus = () => container.querySelector<HTMLElement>("[data-composer-plus]")?.closest("button") ?? null;
const menu = () => document.body.querySelector<HTMLElement>('[data-sidebar-popover-menu="anchored"]');
const item = (key: string) => document.body.querySelector<HTMLButtonElement>(`[data-menu-key="${key}"]`);
const click = (element: Element | null) => {
  if (!element) throw new Error("nothing to click");
  flushSync(() => (element as HTMLElement).click());
};
function openPlus() {
  click(plus());
  expect(menu()).not.toBeNull();
}

beforeEach(() => {
  fixture.advanced = false;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  for (const id of [`bot:${bot.id}:${bot.threadId}`, `group:${room.id}:${room.threadId}`]) restoreComposerDraft(id, { text: "", attachments: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the Simple composer in a bot chat", () => {
  it("puts attach and the approval level behind a round +", () => {
    render({ bot });
    expect(plus()?.getAttribute("aria-label")).toBe("Add");
    expect(container.querySelector('button[aria-label="Attach a file"]')).toBeNull();
    expect(container.querySelector('[aria-label^="Ask for approval for"]')).toBeNull();
    expect(container.querySelector('[aria-label="Finish together"]')).toBeNull();
    openPlus();
    expect([...menu()!.querySelectorAll("[data-menu-key]")].map((row) => row.getAttribute("data-menu-key")))
      .toEqual(["attach", "approval"]);
    expect(menu()!.textContent).toContain("Before Atlas acts");
  });

  it("leaves the area behind and below the composer see-through, with no solid backdrop", () => {
    render({ bot });
    expect(container.querySelector("[data-composer-backdrop]")).toBeNull();
  });

  it("attaches through the same file picker as the paperclip", () => {
    const picker = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render({ bot });
    openPlus();
    click(item("attach"));
    expect(picker).toHaveBeenCalledOnce();
    expect(plus()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("changes this thread's approval level from the submenu", () => {
    render({ bot });
    openPlus();
    click(item("approval"));
    const submenu = document.body.querySelector<HTMLElement>("[data-sidebar-popover-submenu]")!;
    expect(submenu.textContent).toContain("Command allowlist");
    const ask = submenu.querySelector('[data-menu-key="approval:ask"]')!;
    expect(ask.querySelector(".lucide-check")).not.toBeNull();
    click(submenu.querySelector('[data-menu-key="approval:full"]'));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateTask", botId: "atlas", threadId: "atlas-thread", patch: { approvalMode: "full" } });
  });
});

describe("the Simple composer in a group chat", () => {
  it("offers Finish together in the + menu and keeps the Goal chip in view while it is on", () => {
    render({ group: room, members: [bot, peer] });
    expect(container.querySelector('[aria-label="Finish together"]')).toBeNull();
    openPlus();
    expect([...menu()!.querySelectorAll("[data-menu-key]")].map((row) => row.getAttribute("data-menu-key"))).toEqual(["attach", "goal"]);
    click(item("goal"));
    const chip = container.querySelector('[aria-label="Finish together"]');
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("textarea")!.getAttribute("placeholder")).toContain("finish together");
    openPlus();
    expect(item("goal")!.querySelector(".lucide-check")).not.toBeNull();
    click(chip);
    expect(container.querySelector('[aria-label="Finish together"]')).toBeNull();
  });
});

describe("the Advanced composer", () => {
  it("keeps the paperclip and approval control, with no +", () => {
    fixture.advanced = true;
    render({ bot });
    expect(plus()).toBeNull();
    expect(container.querySelector('button[aria-label="Attach a file"]')).not.toBeNull();
    expect(container.querySelector('[aria-haspopup="menu"][aria-label$="for Claude"]')).not.toBeNull();
    expect(container.querySelector("[data-composer-backdrop]")).not.toBeNull();
  });

  it("keeps the room's Goal chip", () => {
    fixture.advanced = true;
    render({ group: room, members: [bot, peer] });
    expect(container.querySelector('[aria-label="Finish together"]')?.getAttribute("aria-pressed")).toBe("false");
  });
});
