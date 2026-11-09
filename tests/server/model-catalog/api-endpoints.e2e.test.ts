import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../../../scripts/dev/isolated-environment.ts";

it("saves both API protocols and routes actual agent turns to each endpoint with only its own key", async () => {
  const traffic: Array<{ path: string; openaiKey: boolean; anthropicKey: boolean; otherKeyAbsent: boolean }> = [];
  const openaiKey = "fixture-only-openai-endpoint-key";
  const anthropicKey = "fixture-only-anthropic-endpoint-key";
  const endpoint = createServer(async (req, res) => {
    for await (const _chunk of req) { /* Drain the provider request. */ }
    const path = req.url ?? "";
    traffic.push({ path, openaiKey: req.headers.authorization === `Bearer ${openaiKey}`,
      anthropicKey: req.headers["x-api-key"] === anthropicKey,
      otherKeyAbsent: path.startsWith("/openai/") ? req.headers["x-api-key"] === undefined : req.headers.authorization === undefined });
    if (path.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "fixture-openai" }] }));
    } else if (path === "/openai/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ id: "fixture-completion", choices: [{ index: 0, delta: { role: "assistant", content: "Fixture reply." }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`);
    } else if (path === "/anthropic/v1/messages") {
      res.writeHead(200, { "content-type": "application/json" }); res.end("{}");
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => endpoint.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}`;
  const fixture = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_MODE: "happy", FAKE_CLAUDE_ROUTER_PING: "1" });
  const manifest: Record<string, unknown> = { protocols: [] };
  try {
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(fixture.info.url + path, { method, headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await response.text();
      expect(text).not.toContain(openaiKey); expect(text).not.toContain(anthropicKey);
      return { status: response.status, body: JSON.parse(text) };
    };
    for (const protocol of ["openai", "anthropic"] as const) {
      const model = `fixture-${protocol}`;
      const url = `${base}/${protocol}/v1`;
      const saved = await call("POST", "/api/instances/api-endpoints", { protocol, displayName: `Fixture ${protocol}`, url,
        key: protocol === "openai" ? openaiKey : anthropicKey, models: [model] });
      expect(saved.status, JSON.stringify(saved.body)).toBe(201);
      const id = saved.body.instanceId;
      const listed = saved.body.instances.find((instance: { instanceId: string }) => instance.instanceId === id);
      expect(listed).toMatchObject({ apiProtocol: protocol, url: protocol === "openai" ? url : `${base}/anthropic`, models: { default: model } });
      const created = await call("POST", "/api/bots", { name: `API ${protocol}`, modelSelection: { instanceId: id, model }, requireAvailableModel: true });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      await runControlOmb(["run", "--bot", created.body.bot.id, "--text", "Reply briefly.", "--timeout", "30", "--url", fixture.info.url]);
      const path = protocol === "openai" ? "/openai/v1/chat/completions" : "/anthropic/v1/messages";
      await expect.poll(() => traffic.some(request => request.path === path), { timeout: 5_000 }).toBe(true);
      expect(traffic.filter(request => request.path === path)).toEqual(expect.arrayContaining([
        expect.objectContaining({ otherKeyAbsent: true, [protocol === "openai" ? "openaiKey" : "anthropicKey"]: true }),
      ]));
      const refreshed = await call("POST", `/api/instances/${id}/refresh-models`, {});
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.instances.find((instance: { instanceId: string }) => instance.instanceId === id).models.options).toEqual(expect.arrayContaining([expect.objectContaining({ id: model })]));
      expect((await call("DELETE", `/api/instances/${id}`)).status).toBe(409);
      (manifest.protocols as unknown[]).push({ protocol, catalog: "retained", turn: "routed", credentials: "isolated", usedConnectionRemoval: "refused" });
    }
    for (const invalid of [
      { protocol: "unknown", url: base, models: ["model"] },
      { protocol: "anthropic", url: `${base}?key=invalid`, models: ["model"] },
      { protocol: "anthropic", url: base, models: ["bad model"] },
    ]) expect((await call("POST", "/api/instances/api-endpoints", { displayName: "Invalid", key: "fixture-invalid-key", ...invalid })).status).toBe(400);
    manifest.invalidConnections = "refused";
  } finally {
    await fixture.close();
    endpoint.closeAllConnections();
    await new Promise<void>(resolve => endpoint.close(() => resolve()));
    writeFileSync(`${fixture.info.logPath}.api-endpoints.json`, JSON.stringify(manifest, null, 2));
  }
}, 90_000);
