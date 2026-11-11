import { describe, expect, it } from "vitest";

import { parseMcpResultBudget, withResultBudget } from "./McpResultBudgetField";
import { t } from "@/lib/i18n";


describe("MCP server form", () => {
  it("reads the result size limit: blank is the default, 0 never trims, grouping is fine", () => {
    expect(parseMcpResultBudget("")).toEqual({ ok: true, value: undefined });
    expect(parseMcpResultBudget("  ")).toEqual({ ok: true, value: undefined });
    expect(parseMcpResultBudget("0")).toEqual({ ok: true, value: 0 });
    expect(parseMcpResultBudget("40000")).toEqual({ ok: true, value: 40_000 });
    expect(parseMcpResultBudget("40,000")).toEqual({ ok: true, value: 40_000 });
    expect(parseMcpResultBudget("40 000")).toEqual({ ok: true, value: 40_000 });
    expect(parseMcpResultBudget("40.000")).toEqual({ ok: true, value: 40_000 });
    expect(parseMcpResultBudget("1.234.567")).toEqual({ ok: true, value: 1_234_567 });
    expect(parseMcpResultBudget("40_000")).toEqual({ ok: true, value: 40_000 });
    // a decimal is refused, never read as a number ten times larger
    for (const bad of ["-1", "12.5k", "lots", "3000000", "12.5", "1,5", "1.5", "40,00", "1,234.567", "40,0000", ",000"]) {
      expect(parseMcpResultBudget(bad)).toEqual({ ok: false, error: { key: "mcp.err.resultBudget" } });
    }
    expect(t("mcp.resultBudgetHint")).toContain("8,000");
  });

  it("checks the limit before the rest of the form and adds it last, only when set", () => {
    const body = { ok: true as const, body: { command: "notes-mcp" } };
    expect(withResultBudget("40,000", () => body)).toEqual({ ok: true, body: { command: "notes-mcp", resultBudget: 40_000 } });
    expect(withResultBudget("0", () => body)).toEqual({ ok: true, body: { command: "notes-mcp", resultBudget: 0 } });
    expect(withResultBudget("", () => body)).toEqual(body);
    const nameMissing = { ok: false as const, error: { key: "mcp.err.nameAndCommand" as const } };
    expect(withResultBudget("lots", () => nameMissing)).toEqual({ ok: false, error: { key: "mcp.err.resultBudget" } });
    expect(withResultBudget("40000", () => nameMissing)).toEqual(nameMissing);
  });

});
