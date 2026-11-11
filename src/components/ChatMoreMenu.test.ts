import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Task } from "@/state/store";
import type { SidebarMenuItem } from "./SidebarPopoverMenu";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("window", {});
  return {
    menus: [] as { ariaLabel: string; items: SidebarMenuItem[]; placement?: string; openOnHover?: boolean; trigger: string }[],
    dispatch: vi.fn(),
    inspectorOpen: false,
    find: vi.fn(),
  };
});
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: { ...original.initialState, inspectorOpen: fixture.inspectorOpen }, dispatch: fixture.dispatch }) };
});
vi.mock("@/lib/chat-find", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/chat-find")>(),
  requestChatFind: fixture.find,
}));
vi.mock("./SidebarPopoverMenu", async (importOriginal) => ({
  ...await importOriginal<typeof import("./SidebarPopoverMenu")>(),
  SidebarPopoverMenu: (props: { ariaLabel: string; items: SidebarMenuItem[]; placement?: string; openOnHover?: boolean; renderTrigger: (state: { open: boolean }) => React.ReactNode }) => {
    const trigger = props.renderTrigger({ open: false });
    fixture.menus.push({ ...props, trigger: renderToStaticMarkup(createElement("div", null, trigger)) });
    return trigger;
  },
}));

const { ChatMoreMenu, ChatHeaderMenu } = await import("./ChatMoreMenu");
afterAll(() => vi.unstubAllGlobals());

const task = (threadId: string, title: string, at: number, extra: Partial<Task> = {}): Task => ({
  threadId, title, createdAt: at, busy: false, activity: "idle", ...extra,
});
const bot: Bot = {
  id: "pepper", threadId: "side", mainThreadId: "main", name: "Pepper", title: "", description: "", color: "green",
  notifications: true, unread: false, busy: false, activeLeafId: "hi",
  messages: [{ id: "hi", role: "bot", kind: "text", text: "Hello", at: 1 }],
  modelSelection: { instanceId: "test", model: "m" },
  tasks: [
    task("main", "Our chat", 1),
    task("side", "Trip plan", 3),
    task("routine", "Morning digest", 5, { routineRunId: "run-1" }),
    task("old", "", 2),
  ],
};

function menuOf(element: ReturnType<typeof createElement>) {
  fixture.menus = [];
  renderToStaticMarkup(element);
  return fixture.menus.at(-1)!;
}
const keys = (items: SidebarMenuItem[]) => items.map((item) => item.key);

beforeEach(() => {
  fixture.inspectorOpen = false;
  fixture.dispatch.mockClear();
  fixture.find.mockClear();
});

describe("ChatMoreMenu, the round ⋯ for the bot panel", () => {
  it("is a round 32px button labelled More", () => {
    const menu = menuOf(createElement(ChatMoreMenu, { bot }));
    expect(menu.ariaLabel).toBe("More");
    expect(menu.placement).toBeUndefined();
    expect(menu.trigger).toContain('data-testid="chat-more"');
    expect(menu.trigger).toMatch(/class="[^"]*\bsize-8\b[^"]*\brounded-full\b[^"]*\bbg-raised\/50\b/);
  });

  it("opens the chat's find bar for the thread on screen", () => {
    const menu = menuOf(createElement(ChatMoreMenu, { bot }));
    menu.items.find((item) => item.key === "find")!.onSelect();
    expect(fixture.find).toHaveBeenCalledWith("side");
  });
});

describe("ChatHeaderMenu, Advanced mode's header ⋯", () => {
  it("keeps main's items, trigger and hover menu below the header", () => {
    const menu = menuOf(createElement(ChatHeaderMenu, { bot }));
    expect(keys(menu.items)).toEqual(["find", "copy", "download", "activity", "inspector"]);
    expect(menu.items.find((item) => item.key === "inspector")).toMatchObject({ separatorBefore: true });
    expect(menu.items.every((item) => !item.disabled && item.heading !== "In Advanced mode")).toBe(true);
    expect(menu).toMatchObject({ placement: "below", openOnHover: true });
    expect(menu.trigger).toMatch(/data-testid="chat-more" class="flex rounded-md p-1.5 hover:bg-raised/);
  });

  it("has no thread items even if rendered by ChatMoreMenu in Advanced mode", () => {
    expect(keys(menuOf(createElement(ChatMoreMenu, { bot })).items)).not.toContain("threads");
  });
});
