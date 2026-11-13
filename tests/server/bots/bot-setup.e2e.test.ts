import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../../../scripts/dev/isolated-environment.ts";

it("dispatches setup and canonical standing instructions through the real isolated app", async () => {
  const fixture = await launchVerificationServer();
  const env = { OPENMAUSBOT_URL: fixture.info.url };
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as any;
    expect(response.ok, JSON.stringify(result)).toBe(true);
    return result;
  };
  try {
    const { bot } = await runControlOmb(["new-bot", "--name", "Setup fixture"], { env }) as any;
    const turn = async (text: string) => {
      await runControlOmb(["send", "--bot", bot.id, "--text", text], { env });
      await runControlOmb(["wait", "--bot", bot.id, "--timeout", "30"], { env });
      return JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8"));
    };
    const setup = await turn("/setup Help me track garden watering");
    expect(setup.systemPrompt).toContain("The user explicitly asked you to set yourself up");
    expect(setup.systemPrompt).toContain("propose_profile");
    expect(JSON.stringify(setup.prompt)).toContain("Set yourself up for this job: Help me track garden watering");

    await api("PATCH", `/api/bots/${bot.id}`, { description: "Garden helper" });
    const configured = await turn("What is your job?");
    expect(configured.systemPrompt).toContain("About: Garden helper");
    expect(configured.systemPrompt).not.toContain("The user explicitly asked you to set yourself up");
    expect((await api("GET", "/api/bots")).bots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bot.id, description: "Garden helper" }),
    ]));
    const messages = await runControlOmb(["messages", "--bot", bot.id, "--limit", "10"], { env });
    expect(JSON.stringify(messages)).toContain("hello from fake claude");
  } finally {
    await fixture.close();
  }
}, 90_000);
