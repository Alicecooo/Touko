import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialDesktopCapabilities } from "@/lib/desktop";
import { setLocale } from "@/lib/i18n";
import type { SidebarDensity } from "@/lib/sidebar-preferences";
import { StoreProvider } from "@/state/store";

const fixture = vi.hoisted(() => ({
  density: "comfortable" as SidebarDensity,
  windowChrome: undefined as "mac-inset" | "win-caption" | "native" | undefined,
  hostLabel: undefined as string | undefined,
}));

vi.mock("@/lib/sidebar-preferences", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/sidebar-preferences")>(),
  useSidebarDensity: () => fixture.density,
}));
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => {
    const capabilities = initialDesktopCapabilities();
    const host = { ...capabilities.host, label: fixture.hostLabel ?? capabilities.host.label };
    return { capabilities: { ...capabilities, host, windowChrome: fixture.windowChrome }, ready: true };
  },
}));

import { Sidebar } from "./Sidebar";

const render = () => renderToStaticMarkup(
  createElement(StoreProvider, null, createElement(Sidebar, { open: true, onClose: () => {} })),
);

beforeEach(() => {
  fixture.density = "comfortable";
  fixture.windowChrome = undefined;
  fixture.hostLabel = undefined;
  vi.stubGlobal("window", { innerWidth: 1280, location: { protocol: "http:", search: "" } });
  setLocale("en");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale("en");
});

describe("sidebar header", () => {
  it.each(["comfortable", "compact", "icons"] as const)(
    "keeps collapse, activity and add but no density menu at %s density in Advanced mode",
    (density) => {
      fixture.density = density;
      const html = render();
      expect(html).toContain(density === "icons" ? 'aria-label="Expand sidebar"' : 'aria-label="Collapse sidebar to avatars"');
      expect(html).toContain('aria-label="Active Threads"');
      expect(html).toContain('aria-label="New or share"');
      expect(html).not.toContain("Choose sidebar density");
      expect(html).not.toContain('title="Sidebar density"');
    },
  );

  it.each(["comfortable", "compact"] as const)("keeps collapse and add but no activity menu in Simple mode at %s density", (density) => {
    fixture.density = density;
    const html = render();
    expect(html).toContain('aria-label="Collapse sidebar to avatars"');
    expect(html).not.toContain('aria-label="Active Threads"');
    expect(html).toContain('aria-label="New or share"');
  });

  it("still offers Expand on an icons rail in Simple mode, so the rail is never a dead end", () => {
    fixture.density = "icons";
    const html = render();
    expect(html).toContain('aria-label="Expand sidebar"');
    expect(html).not.toContain('aria-label="Active Threads"');
  });
});

describe("sidebar glass head and foot", () => {
  it.each(["comfortable", "compact", "icons"] as const)(
    "puts the top row and search in the glass head, the places in the glass foot, and the list between at %s density",
    (density) => {
      fixture.density = density;
      const html = render();
      const at = (marker: string) => {
        const index = html.indexOf(marker);
        expect(index, marker).toBeGreaterThan(-1);
        return index;
      };
      const head = at('data-glass-bar="top"');
      const topRow = at("data-sidebar-top-row");
      const list = at('class="glass-scroller ');
      const foot = at('data-glass-bar="bottom"');
      expect(head).toBeLessThan(topRow);
      expect(list).toBeLessThan(foot);
      expect(html.match(/data-glass-frame=""/g)).toHaveLength(1);
      expect(at("data-glass-frame")).toBeLessThan(head);
    },
  );
});

describe("sidebar foot in Simple mode", () => {
  it.each(["comfortable", "compact"] as const)("keeps Automations above the profile row, with Apps at its end (%s)", (density) => {
    fixture.density = density;
    const html = render();
    const foot = html.indexOf('data-glass-bar="bottom"');
    expect(html).not.toContain('data-sidebar-nav="routines"');
    expect(html.match(/data-sidebar-nav="automations"/g)).toHaveLength(1);
    expect(html.indexOf('data-sidebar-nav="automations"')).toBeGreaterThan(foot);
    expect(html.indexOf('data-sidebar-nav="automations"')).toBeLessThan(html.indexOf('data-sidebar-nav="apps"'));
    expect(html.match(/data-sidebar-nav="apps"/g)).toHaveLength(1);
    expect(html.indexOf('data-sidebar-nav="apps"')).toBeGreaterThan(foot);
  });

  it("keeps one Automations row in the foot and no Routines row in Advanced mode, and still one Apps", () => {
    const html = render();
    expect(html).not.toContain('data-sidebar-nav="routines"');
    expect(html.match(/data-sidebar-nav="automations"/g)).toHaveLength(1);
    expect(html.indexOf('data-sidebar-nav="automations"')).toBeGreaterThan(html.indexOf('data-glass-bar="bottom"'));
    expect(html.match(/data-sidebar-nav="apps"/g)).toHaveLength(1);
  });
});
