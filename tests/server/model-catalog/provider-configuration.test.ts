// Provider configuration behavior, independent of the removed documentation site.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { PROVIDER_CREDENTIAL_ENV, WORKSPACE_CREDENTIAL_ENV, stripWorkspaceCredentialEnv } from "../../../server/config/config.ts";
import { discoverOpenCodeModels, resetOpenCodeModelCache } from "../../../server/drivers/acp/opencode-go.ts";
import { readClaudeAuthSettings, readClaudeModelCatalog } from "../../../server/drivers/claude.ts";
import { removeTempDir } from "../../support/environment/process-cleanup.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const scratchDirs: string[] = [];
const scratch = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
};

afterEach(async () => {
  resetOpenCodeModelCache();
  for (const dir of scratchDirs.splice(0)) await removeTempDir(dir);
});

describe("Claude provider settings", () => {
  // Shell exports as copied into the env block, plus FireConnect's header and model settings. Every value is fake.
  const settingsHome = (env: Record<string, string>, extra: Record<string, unknown> = {}) => {
    const home = scratch("omb-docs-claude-");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ ...extra, env }));
    return home;
  };
  const providerEnv = {
    ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    ANTHROPIC_AUTH_TOKEN: "sk-or-fake",
    ANTHROPIC_CUSTOM_HEADERS: "X-Fireworks-Api-Key: fw_fake",
    ANTHROPIC_MODEL: "deepseek/deepseek-chat",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek/deepseek-reasoner",
    CLAUDE_CODE_SUBAGENT_MODEL: "deepseek/deepseek-subagent",
  };

  it("carries connection settings from the settings.json env block", () => {
    const home = settingsHome(providerEnv);

    expect(readClaudeAuthSettings({ HOME: home }).env).toEqual({
      ANTHROPIC_BASE_URL: providerEnv.ANTHROPIC_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: providerEnv.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_CUSTOM_HEADERS: providerEnv.ANTHROPIC_CUSTOM_HEADERS,
    });
  });

  it("lists ANTHROPIC_MODEL and non-Claude tier models as custom model choices, and nothing else from the file", () => {
    const home = settingsHome(providerEnv, {
      modelPicker: { options: [{ model: "glm-latest[1m]", label: "GLM" }] },
    });
    const catalog = readClaudeModelCatalog({ HOME: home });
    const custom = catalog.options.filter((option) => option.custom).map((option) => option.id);

    expect(custom).toEqual([providerEnv.ANTHROPIC_MODEL, providerEnv.ANTHROPIC_DEFAULT_SONNET_MODEL]);
    expect(JSON.stringify(catalog)).not.toContain(providerEnv.CLAUDE_CODE_SUBAGENT_MODEL);
    expect(JSON.stringify(catalog)).not.toContain("glm-latest");
    const carried = Object.keys(readClaudeAuthSettings({ HOME: home }).env ?? {});
    expect(carried.filter((key) => /MODEL/u.test(key))).toEqual([]);
  });

  it("drops that setup while an Anthropic key is saved in Connections", () => {
    const home = settingsHome(providerEnv);
    expect(readClaudeAuthSettings({ HOME: home }, { ANTHROPIC_API_KEY: "connections-fake-key" })).toEqual({});
  });
});

describe("OpenCode model discovery", () => {
  it("lists provider models from ACP even when OpenCode 2 rejects models --verbose", async () => {
    const dir = scratch("omb-docs-opencode2-");
    const catalog = await discoverOpenCodeModels({
      ...process.env, HOME: dir, USERPROFILE: dir,
      XDG_CONFIG_HOME: join(dir, "config"), XDG_DATA_HOME: join(dir, "data"),
      FAKE_ACP_MODELS_LIST: "v2",
      FAKE_ACP_MODELS: "openrouter/deepseek/deepseek-chat,opencode/longcat-2.5-preview-free",
    }, join(ROOT, "./tests/support/drivers/fake-acp-cli.ts"));
    expect(catalog.options.map((option) => option.id)).toEqual([
      "openrouter/deepseek/deepseek-chat", "opencode/longcat-2.5-preview-free",
    ]);
  });
});

describe("Keys exported on a server", () => {
  const exported = ["OPENROUTER_API_KEY", "FIREWORKS_API_KEY", "DEEPSEEK_API_KEY"];

  it("remain inherited by engines", () => {
    // Every engine filters its inherited environment through these two lists (or stripWorkspaceCredentialEnv).
    const filtered = new Set<string>([...PROVIDER_CREDENTIAL_ENV, ...WORKSPACE_CREDENTIAL_ENV]);
    expect(exported.filter((name) => filtered.has(name))).toEqual([]);
    const env: Record<string, string | undefined> = Object.fromEntries(exported.map((name) => [name, "fake"]));
    stripWorkspaceCredentialEnv(env);
    expect(Object.keys(env).sort()).toEqual([...exported].sort());
  });

});
