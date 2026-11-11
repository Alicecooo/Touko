import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import { PAGE_IDS, PAGES, PANEL_TABS, setupTarget, TAB_LABEL } from "./page-registry";

describe("the bot panel's page registry", () => {

  it("sends each setup idea to the page that sets it up", () => {
    expect(setupTarget("soul")).toEqual({ tab: "details", page: "instructions" });
    expect(setupTarget("folder")).toEqual({ tab: "computer", page: "folder" });
    expect(setupTarget("apps")).toEqual({ tab: "details", page: "apps" });
    expect(setupTarget("schedule")).toEqual({ tab: "details", page: "routines" });
    expect(setupTarget("identity")).toEqual({ tab: "details" });
  });

  it("names every page and where it lives in English copy", () => {
    const keys = en as Record<string, string>;
    for (const id of PAGE_IDS) {
      expect(keys[PAGES[id].title], id).toBeTruthy();
      expect(keys[PAGES[id].where], id).toBeTruthy();
      expect(PAGES[id].keywords.length, id).toBeGreaterThan(0);
    }
    for (const tab of PANEL_TABS) expect(keys[TAB_LABEL[tab]]).toBeTruthy();
  });
});
