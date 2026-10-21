import { describe, expect, it } from "vitest";

import type { ModelCatalog, ModelSelection, ProviderSnapshot } from "../harness/contracts.ts";
import { readyToRun, selectDefaultModelSelection, withNewBotEffort } from "./default-model-selection.ts";

const codex = {
  instanceId: "codex",
  driverKind: "codex",
  snapshot: { state: "available", authenticated: true } satisfies ProviderSnapshot,
  models: {
    default: "codex-default",
    options: [{ id: "codex-default", label: "Default" }, { id: "selected-model", label: "Selected" }],
  } satisfies ModelCatalog,
  capabilities: { effortLevels: ["low", "high"] as const },
};
const claude = {
  instanceId: "claude",
  driverKind: "claudeAgent",
  snapshot: { state: "available", authenticated: true } satisfies ProviderSnapshot,
  models: { default: "claude-default", options: [{ id: "claude-default", label: "Claude" }] },
};

describe("new bot default model selection", () => {
  it("accepts a configured API-key provider", () => {
    const instance = { ...codex, instanceId: "mistral", driverKind: "mistral", access: "api" as const };
    const preferred = { instanceId: "mistral", model: "selected-model" };
    expect(selectDefaultModelSelection([instance], preferred)).toEqual(preferred);
  });
  it("keeps a saved custom endpoint even when its account sign-in is false", () => {
    const instance = { ...codex, access: "custom" as const, snapshot: { state: "available", authenticated: false } satisfies ProviderSnapshot };
    const preferred = { instanceId: "codex", model: "selected-model" };
    expect(selectDefaultModelSelection([claude, instance], preferred)).toEqual(preferred);
  });
  it("preserves an intentional variant for ACP validation, including variants absent from the preview catalog", () => {
    const preferred = { instanceId: "codex", model: "selected-model", variant: "default" };
    expect(selectDefaultModelSelection([{ ...codex, capabilities: { modelVariants: true } }], preferred))
      .toEqual(preferred);
    expect(selectDefaultModelSelection([codex], preferred)).toEqual({ instanceId: "", model: "" });
    expect(preferred.variant).toBe("default");
  });
  it.each(["low", "high"] as const)("honors the configured provider, model, and supported %s effort ahead of the Claude preference", (effort) => {
    const preferred = { instanceId: "codex", model: "selected-model", effort };
    const selection = selectDefaultModelSelection([claude, codex], preferred);
    expect(selection).toEqual(preferred);
    expect(selection).not.toBe(preferred);
  });

  it.each([
    { label: "missing capabilities", capabilities: undefined },
    { label: "no effort control", capabilities: {} },
    { label: "empty effort list", capabilities: { effortLevels: [] } },
    { label: "changed effort support", capabilities: { effortLevels: ["low"] as const } },
  ])("omits stale effort for $label without changing the provider, model, or saved preference", ({ capabilities }) => {
    const preferred = { instanceId: "codex", model: "selected-model", effort: "high" as const };
    const selection = selectDefaultModelSelection([
      { ...claude, capabilities: { effortLevels: ["high"] } },
      { ...codex, capabilities },
    ], preferred);
    expect(selection).toEqual({ instanceId: "codex", model: "selected-model" });
    expect(selection).not.toHaveProperty("effort");
    expect(preferred.effort).toBe("high");
  });

  it("accepts the provider default even when it is not repeated in its options", () => {
    expect(selectDefaultModelSelection(
      [{ ...codex, models: { default: "codex-default", options: [] } }],
      { instanceId: "codex", model: "codex-default" },
    )).toEqual({ instanceId: "codex", model: "codex-default" });
  });

  it.each([
    { label: "missing provider", instances: [claude] },
    { label: "unavailable provider", instances: [claude, { ...codex, snapshot: { state: "unavailable" as const } }] },
    { label: "signed-out provider", instances: [claude, { ...codex, snapshot: { state: "available" as const, authenticated: false } }] },
    { label: "disabled provider", instances: [claude, { ...codex, enabled: false }] },
    { label: "removed model", instances: [claude, { ...codex, models: { default: "new-model", options: [] } }] },
  ])("returns setup for a saved $label without changing provider", ({ instances }) => {
    expect(selectDefaultModelSelection(instances, { instanceId: "codex", model: "selected-model" }))
      .toEqual({ instanceId: "", model: "" });
  });

  it("keeps the existing Claude preference when no default was saved", () => {
    expect(selectDefaultModelSelection([codex, claude])).toEqual({ instanceId: "claude", model: "claude-default" });
    expect(selectDefaultModelSelection([codex])).toEqual({ instanceId: "codex", model: "codex-default" });
    expect(selectDefaultModelSelection([])).toEqual({ instanceId: "", model: "" });
  });

  it("treats a fully empty saved default as unset, but keeps incomplete choices intentional", () => {
    expect(selectDefaultModelSelection([codex], { instanceId: "", model: "" }))
      .toEqual({ instanceId: "codex", model: "codex-default" });
    for (const preferred of [{ instanceId: "codex", model: "" }, { instanceId: "", model: "selected-model" }]) {
      expect(selectDefaultModelSelection([claude, codex], preferred)).toEqual({ instanceId: "", model: "" });
    }
  });

  it("skips empty model catalogs instead of choosing an unusable preferred provider", () => {
    const empty = { ...claude, models: { default: "", options: [] } };
    expect(selectDefaultModelSelection([empty, codex])).toEqual({ instanceId: "codex", model: "codex-default" });
    expect(selectDefaultModelSelection([empty])).toEqual({ instanceId: "", model: "" });
    expect(selectDefaultModelSelection([{ ...empty, models: { default: " ", options: [{ id: "", label: "Empty" }] } }]))
      .toEqual({ instanceId: "", model: "" });
  });

  it("uses the first nonempty model when a configured catalog has no default", () => {
    const models = { default: "", options: [{ id: "", label: "Empty" }, { id: " ", label: "Blank" }, { id: "usable-model", label: "Usable" }] };
    expect(selectDefaultModelSelection([{ ...claude, models }, codex]))
      .toEqual({ instanceId: "claude", model: "usable-model" });
    expect(selectDefaultModelSelection([{ ...codex, models: { default: "catalog-default", options: [] } }]))
      .toEqual({ instanceId: "codex", model: "catalog-default" });
  });

  it("never automatically chooses a disabled engine, even for signed-out setup", () => {
    const disabled = { ...claude, enabled: false };
    expect(readyToRun(disabled)).toBe(false);
    expect(selectDefaultModelSelection([disabled, codex])).toEqual({ instanceId: "codex", model: "codex-default" });
    expect(selectDefaultModelSelection([disabled])).toEqual({ instanceId: "", model: "" });
    const signedOutCodex = { ...codex, snapshot: { state: "available", authenticated: false } satisfies ProviderSnapshot };
    expect(selectDefaultModelSelection([disabled, signedOutCodex])).toEqual({ instanceId: "codex", model: "codex-default" });
  });

  it("prefers an engine that can run a turn now over a signed-out Claude", () => {
    const signedOut = { ...claude, snapshot: { state: "available", authenticated: false } satisfies ProviderSnapshot };
    expect(selectDefaultModelSelection([signedOut, codex])).toEqual({ instanceId: "codex", model: "codex-default" });
    expect(selectDefaultModelSelection([codex, signedOut])).toEqual({ instanceId: "codex", model: "codex-default" });
    // Nothing can run yet: the first available engine, Claude first.
    const codexOut = { ...codex, snapshot: { state: "available", authenticated: false } satisfies ProviderSnapshot };
    expect(selectDefaultModelSelection([codexOut, signedOut])).toEqual({ instanceId: "claude", model: "claude-default" });
    const custom = { ...codexOut, instanceId: "router", access: "custom" as const };
    expect(selectDefaultModelSelection([signedOut, custom])).toEqual({ instanceId: "router", model: "codex-default" });
  });
});

describe("new bot default model selection while enrolled in an organisation", () => {
  const signedOut = { ...claude, instanceId: "personal-claude", snapshot: { state: "available", authenticated: false } satisfies ProviderSnapshot };
  const companyClaude = { ...claude, instanceId: "company.fixture.anthropic", models: { default: "company-claude", options: [{ id: "company-claude", label: "Company" }] } };
  const companyRouter = {
    instanceId: "company.fixture.openrouter", driverKind: "openai-compat",
    snapshot: { state: "available", authenticated: true } satisfies ProviderSnapshot,
    models: { default: "company/router", options: [{ id: "company/router", label: "Router" }] },
  };
  const company = (instanceId: string) => instanceId.startsWith("company.");

  it("picks a Company model that can run over an installed but signed-out personal Claude", () => {
    expect(selectDefaultModelSelection([signedOut, companyClaude], undefined, { company }))
      .toEqual({ instanceId: "company.fixture.anthropic", model: "company-claude" });
    expect(selectDefaultModelSelection([signedOut, companyRouter, companyClaude], undefined, { company }))
      .toEqual({ instanceId: "company.fixture.anthropic", model: "company-claude" });
    expect(selectDefaultModelSelection([signedOut, companyRouter], undefined, { company }))
      .toEqual({ instanceId: "company.fixture.openrouter", model: "company/router" });
  });

  it("keeps a signed-in personal engine, so billing stays the person's choice", () => {
    expect(selectDefaultModelSelection([companyClaude, claude], undefined, { company }))
      .toEqual({ instanceId: "claude", model: "claude-default" });
    expect(selectDefaultModelSelection([signedOut, companyClaude, codex], undefined, { company }))
      .toEqual({ instanceId: "codex", model: "codex-default" });
  });

  it("falls back to today's choice when nothing can run yet", () => {
    const companyMissingCli = { ...companyClaude, snapshot: { state: "unavailable", reason: "claude CLI not found" } satisfies ProviderSnapshot };
    expect(selectDefaultModelSelection([signedOut, companyMissingCli], undefined, { company }))
      .toEqual({ instanceId: "personal-claude", model: "claude-default" });
  });

  it("is the same choice as without an enrolment when no Company model exists", () => {
    for (const instances of [[signedOut, codex], [codex, signedOut], [codex], [signedOut], []]) {
      expect(selectDefaultModelSelection(instances, undefined, {})).toEqual(selectDefaultModelSelection(instances));
      expect(selectDefaultModelSelection(instances, undefined, { company, refusal: () => undefined })).toEqual(selectDefaultModelSelection(instances));
    }
    expect(selectDefaultModelSelection([codex, signedOut], undefined, { company })).toEqual({ instanceId: "codex", model: "codex-default" });
  });

  it("never picks an engine the organisation's policy refuses", () => {
    // companyModelsOnly: every personal instance is refused.
    const companyOnly = (instance: { instanceId: string }) => company(instance.instanceId) ? undefined : "Fixture Company allows only company models on this computer.";
    expect(selectDefaultModelSelection([claude, codex, companyRouter], undefined, { company, refusal: companyOnly }))
      .toEqual({ instanceId: "company.fixture.openrouter", model: "company/router" });
    expect(selectDefaultModelSelection([claude, codex], undefined, { company, refusal: companyOnly }))
      .toEqual({ instanceId: "", model: "" });
    // An allow-list without Claude skips Claude, personal or Company.
    const noClaude = (instance: { driverKind: string }) => instance.driverKind === "claudeAgent" ? "Fixture Company does not allow the Claude engine on this computer." : undefined;
    expect(selectDefaultModelSelection([claude, companyClaude, companyRouter], undefined, { company, refusal: noClaude }))
      .toEqual({ instanceId: "company.fixture.openrouter", model: "company/router" });
    expect(selectDefaultModelSelection([claude, companyRouter], { instanceId: "claude", model: "claude-default" }, { company, refusal: companyOnly }))
      .toEqual({ instanceId: "", model: "" });
  });
});

describe("new bot effort default", () => {
  const selection: ModelSelection = { instanceId: "codex", model: "codex-default" };

  it("adds the workspace effort when the engine offers it", () => {
    expect(withNewBotEffort(selection, "high", ["low", "high"])).toEqual({ ...selection, effort: "high" });
  });

  it("keeps the caller's explicit effort or model variant", () => {
    expect(withNewBotEffort({ ...selection, effort: "low" }, "high", ["low", "high"])).toEqual({ ...selection, effort: "low" });
    const variant = { instanceId: "opencodeGo", model: "provider/model", variant: "minimal" };
    expect(withNewBotEffort(variant, "high", ["high"])).toEqual(variant);
  });

  it("sends no level when none is configured or the engine does not offer it", () => {
    expect(withNewBotEffort(selection, undefined, ["high"])).toEqual(selection);
    expect(withNewBotEffort(selection, "max", ["low", "high"])).toEqual(selection);
    expect(withNewBotEffort(selection, "high", undefined)).toEqual(selection);
  });
});
