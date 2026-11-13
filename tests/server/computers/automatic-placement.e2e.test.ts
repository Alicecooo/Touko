import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer, type VerificationServer } from "../../../scripts/dev/isolated-environment.ts";

const places = ["browser", "cloud", "local", "off"] as const;

function client(fixture: VerificationServer) {
  return async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json", origin: fixture.info.url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
}

it("keeps creation, updates and legacy profiles on automatic placement through HTTP", async () => {
  // The former selector could leave old profiles and per-thread pins active
  // after being hidden. Exercise both the HTTP contract and a fresh process.
  let fixture = await launchVerificationServer();
  const evidencePath = `${fixture.info.logPath}.automatic-placement.json`;
  const manifest: Record<string, unknown> = {};
  try {
    let api = client(fixture);
    const config = await api("PATCH", "/api/config", { newBotDefaults: { profile: { computer: "local" } } });
    expect(config.status).toBe(200);
    const defaults = await api("GET", "/api/bot-defaults");
    manifest.template = defaults.body.defaults.profile.computer;
    const created: Record<string, unknown> = {};
    const updates: Record<string, number> = {};
    const pins: Record<string, number> = {};
    const ids: string[] = [];
    for (const place of places) {
      const response = await api("POST", "/api/bots", { name: `Placement ${place}`, settings: { computer: place } });
      expect(response.status).toBe(201);
      const bot = response.body.bot;
      ids.push(bot.id);
      created[place] = bot.computer ?? null;
      updates[place] = (await api("PATCH", `/api/bots/${bot.id}`, { computer: place })).status;
      const threadId = bot.threadId as string;
      pins[place] = (await api("PATCH", `/api/bots/${bot.id}/tasks/${threadId}`, { surface: place })).status;
      expect((await api("PATCH", `/api/bots/${bot.id}/tasks/${threadId}`, { surface: null })).status).toBe(200);
      expect((await api("PATCH", `/api/bots/${bot.id}`, { computer: null })).status).toBe(200);
      const saved = await api("GET", "/api/bots");
      expect(saved.body.bots.find((candidate: any) => candidate.id === bot.id).computer).toBeUndefined();
    }
    manifest.created = created;
    manifest.updates = updates;
    manifest.pins = pins;
    // Construct an old-format record directly; users can no longer create these sibling conversations.
    const records = JSON.parse(readFileSync(join(fixture.info.dataDir, "bots.json"), "utf8"));
    ids.forEach((id, index) => {
      const bot = records.find((record: any) => record.id === id);
      bot.computer = places[index];
      bot.tasks[0].surface = "local";
      bot.tasks[0].surfaceSource = "user";
      const legacyAutoTask = structuredClone(bot.tasks[0]);
      legacyAutoTask.threadId = `legacy-auto-${id}`;
      legacyAutoTask.title = "Legacy automatic pin";
      legacyAutoTask.surface = "browser";
      legacyAutoTask.surfaceSource = "auto";
      bot.tasks.push(legacyAutoTask);
    });
    await fixture.close();
    const restored: unknown[] = [];
    for (const id of ids) {
      fixture = await launchVerificationServer({
        env: process.env,
        prepareDataDir: (dataDir) => writeFileSync(join(dataDir, "bots.json"), JSON.stringify(records.filter((record: any) => record.id === id))),
      });
      api = client(fixture);
      const bots = (await api("GET", "/api/bots")).body.bots;
      const bot = bots.find((candidate: any) => candidate.id === id);
      restored.push({
        placement: bot.computer ?? null,
        manualPin: bot.tasks[0].surface ?? null,
        automaticPin: bot.tasks[1].surface,
        automaticPinOwnedByServer: bot.tasks[1].surfaceAuto === true,
      });
      const disk = JSON.parse(readFileSync(join(fixture.info.dataDir, "bots.json"), "utf8"));
      const savedBot = disk.find((candidate: any) => candidate.id === id);
      expect(savedBot.computer).toBeUndefined();
      expect(savedBot.tasks[0].surface).toBeUndefined();
      await fixture.close();
    }
    manifest.restored = restored;
    const expected = JSON.parse(readFileSync(new URL("../../fixtures/server/computers/automatic-placement.json", import.meta.url), "utf8"));
    expect(manifest).toEqual(expected);
  } finally {
    writeFileSync(evidencePath, JSON.stringify(manifest, null, 2) + "\n");
    await fixture.close();
    console.info(JSON.stringify({ evidencePath }));
  }
}, 60_000);
