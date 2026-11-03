import { describe, expect, it } from "vitest";

import { windowChromeOptions } from "./window-chrome.mjs";

describe("window chrome", () => {
  it("keeps macOS window chrome native", () => {
    expect(windowChromeOptions("darwin")).toEqual({});
  });

  it("hides the native title bar on Windows; caption buttons are renderer-drawn", () => {
    expect(windowChromeOptions("win32")).toEqual({
      titleBarStyle: "hidden",
    });
  });

  it("keeps Linux window chrome native", () => {
    expect(windowChromeOptions("linux")).toEqual({});
  });
});
