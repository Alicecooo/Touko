import { describe, expect, it } from "vitest";
import { glassPopupTopInset } from "./glass-popup";

describe("glass popup window insets", () => {
  it("clears caption controls while keeping native windows at the default inset", () => {
    expect(glassPopupTopInset("mac-inset")).toBe(56);
    expect(glassPopupTopInset("win-caption")).toBe(56);
    expect(glassPopupTopInset("native")).toBe(24);
  });
});
