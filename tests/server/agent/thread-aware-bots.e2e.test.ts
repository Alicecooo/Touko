// Turns are held open by a gated fake CLI so the slot arithmetic is observable rather than raced.
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { removeTempDir, waitForExit } from "../../support/environment/process-cleanup.ts";
import { readHandoffs } from "../../support/teams/read-handoff-records.ts";
import { freePortBlock } from "../../support/http/free-ports.ts";
import { openSse } from "../../support/http/sse-client.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "../../..");
const FAKE_CLAUDE = join(SERVER_DIR, "../../support/drivers/fake-claude-cli.ts");
const FAKE_ACP = join(SERVER_DIR, "../../support/drivers/fake-acp-cli.ts");
const TEST_CAPABILITY_KEY = "thread-aware-bots-fixture-capability";

let child: ChildProcess;
let home = "";
let gates = "";
let base = "";
let stderr = "";

const api = async (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
};

/** A gate written before the turn starts lets it finish at once. Depth-1 turns (no thread id in their MCP config) share the "peer" gate. */
const release = (threadId: string) => writeFileSync(join(gates, `${threadId}.gate`), "finish");
const dumpOf = (threadId: string): { systemPrompt?: string; mcpConfig?: any } | undefined => {
  try {
    return JSON.parse(readFileSync(join(gates, `${threadId}.json`), "utf8"));
  } catch {
    return undefined;
  }
};
const promptsOf = (threadId: string): any[] => {
  try {
    return readFileSync(join(gates, `${threadId}.prompts.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
};
const liveToken = async (threadId: string): Promise<Record<string, string>> => {
  await expect.poll(() => dumpOf(threadId)?.mcpConfig?.mcpServers?.agents?.env?.OMB_COMMS_TOKEN, { timeout: 15_000 }).toBeTruthy();
  return { authorization: `Bearer ${dumpOf(threadId)!.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN}` };
};
/** A wake on that thread cannot start while this turn runs, so the token stays valid while the test holds the gate. */
const heldTurn = async (bot: { id: string; threadId: string }, text: string): Promise<Record<string, string>> => {
  // idle first: an earlier turn still finishing must find its gate
  await expect.poll(async () => Boolean((await botState(bot.id))?.busy), { timeout: 15_000 }).toBe(false);
  rmSync(join(gates, `${bot.threadId}.gate`), { force: true });
  rmSync(join(gates, `${bot.threadId}.json`), { force: true });
  const sent = await api("POST", `/api/bots/${bot.id}/messages`, { text, threadId: bot.threadId });
  expect(sent.status).toBe(202);
  expect(sent.body.queued).toBeUndefined();
  return liveToken(bot.threadId);
};
const proxyCall = async (threadId: string, name: string, args: Record<string, unknown>) => {
  await liveToken(threadId);
  const server = dumpOf(threadId)!.mcpConfig.mcpServers.agents;
  const proxy = spawn(server.command, server.args, { cwd: ROOT, env: { ...process.env, ...server.env }, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: proxy.stdout });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<any>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Mounted proxy ${name} timed out`)), 15_000);
      lines.on("line", line => {
        try {
          const response = JSON.parse(line);
          if (response.error) { reject(new Error(JSON.stringify(response.error))); return; }
          if (response.id === 1) {
            proxy.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
            proxy.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }) + "\n");
          }
          if (response.id === 2) resolve(response.result);
        } catch { reject(new Error("Mounted proxy returned malformed JSON")); }
      });
      proxy.once("error", reject);
      proxy.once("exit", (code, signal) => reject(new Error(`Mounted proxy exited before replying: ${signal ?? code}`)));
      proxy.stdin.on("error", reject);
      proxy.stderr.resume();
      proxy.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "thread-fixture", version: "1" } } }) + "\n");
    });
  } finally {
    clearTimeout(timer);
    lines.close();
    proxy.stdin.destroy();
    await waitForExit(proxy, { signal: "SIGTERM" });
  }
};
const mintedToken = async (botId: string, threadId: string, depth = 0): Promise<Record<string, string>> => {
  const minted = await api(
    "POST",
    "/api/testing/internal-capability",
    { botId, threadId, kind: "agents", depth },
    { "x-openmausbot-test-capability": TEST_CAPABILITY_KEY },
  );
  expect(minted.status).toBe(201);
  return { authorization: `Bearer ${minted.body.token}` };
};

const bots = async () => (await api("GET", "/api/bots?messages=0")).body.bots as any[];
const botState = async (botId: string) => (await bots()).find((bot) => bot.id === botId);
const taskOf = async (botId: string, threadId: string) => (await botState(botId))?.tasks.find((task: any) => task.threadId === threadId);
const messages = async (threadId: string) => (await api("GET", `/api/threads/${threadId}/messages?limit=100`)).body.messages as any[];
const handoffs = (): any[] => readHandoffs(join(home, ".touko"));
const coordinated = async (
  headers: Record<string, string>,
  botId: string,
  message: string,
  options: Record<string, unknown> = {},
) => {
  const response = await api("POST", "/api/internal/coordinate-bots", { botIds: [botId], message, ...options }, headers);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.receipts).toHaveLength(1);
  return handoffs().find(node => node.id === response.body.receipts[0].requestId);
};

const createBot = async (name: string, instanceId: string, model = "claude-sonnet-5") => {
  const created = (await api("POST", "/api/bots", {})).body.bot;
  const patched = await api("PATCH", `/api/bots/${created.id}`, { name, notifications: true, modelSelection: { instanceId, model } });
  expect(patched.status).toBe(200);
  return patched.body.bot;
};

const cleanup = async (botIds: string[]) => {
  for (const botId of botIds) await api("POST", `/api/bots/${botId}/interrupt`, {}).catch(() => undefined);
  for (const botId of botIds) await api("DELETE", `/api/bots/${botId}`).catch(() => undefined);
};

beforeAll(async () => {
  chmodSync(FAKE_CLAUDE, 0o755);
  chmodSync(FAKE_ACP, 0o755);
  home = mkdtempSync(join(tmpdir(), "omb-thread-aware-"));
  gates = join(home, "gates");
  const data = join(home, ".touko");
  mkdirSync(data, { recursive: true });
  mkdirSync(gates, { recursive: true });
  // Every turn holds until its gate exists and dumps argv/env/prompt under its key: a [[gate:NAME]] marker, else the agents thread id (depth 0), else "peer".
  const gated = join(home, "gated-claude.mjs");
  writeFileSync(gated, [
    "#!/usr/bin/env node",
    'import { readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'import { PassThrough } from "node:stream";',
    'const at = process.argv.indexOf("--mcp-config");',
    "let thread = null;",
    "if (at >= 0) {",
    "  try {",
    '    const servers = JSON.parse(readFileSync(process.argv[at + 1], "utf8")).mcpServers ?? {};',
    "    for (const server of Object.values(servers)) thread ??= server?.env?.OMB_THREAD_ID ?? null;",
    "  } catch {}",
    "}",
    "const relay = new PassThrough();",
    "const real = process.stdin;",
    'Object.defineProperty(process, "stdin", { value: relay, configurable: true });',
    "let decided = false;",
    'let held = "";',
    'real.on("data", (chunk) => {',
    "  if (decided) { relay.write(chunk); return; }",
    "  held += chunk;",
    '  const nl = held.indexOf("\\n");',
    "  if (nl === -1) return;",
    "  const marker = /\\[\\[gate:([\\w-]+)\\]\\]/.exec(held.slice(0, nl));",
    '  const key = marker?.[1] ?? thread ?? "peer";',
    `  process.env.FAKE_CLAUDE_SLOW_FINISH_GATE = join(${JSON.stringify(gates)}, key + ".gate");`,
    `  process.env.FAKE_CLAUDE_DUMP = join(${JSON.stringify(gates)}, key + ".json");`,
    `  process.env.FAKE_CLAUDE_PROMPTS = join(${JSON.stringify(gates)}, key + ".prompts.jsonl");`,
    "  decided = true;",
    "  relay.write(held);",
    '  held = "";',
    "});",
    'real.on("end", () => relay.end());',
    'process.env.FAKE_CLAUDE_MODE = "slow";',
    `await import(${JSON.stringify(pathToFileURL(FAKE_CLAUDE).href)});`,
  ].join("\n"), { mode: 0o700 });
  writeFileSync(join(data, "config.json"), JSON.stringify({
    threads: { maxConcurrentPerBot: 2 },
    instances: {
      gated: {
        driver: "claudeAgent",
        displayName: "Gated fixture",
        config: { cli: gated },
      },
      curious: {
        driver: "grokAgent",
        displayName: "Curious fixture",
        environment: { FAKE_ACP_MODE: "question" },
        config: { cli: FAKE_ACP, fullAuto: true },
      },
    },
  }));
  const port = await freePortBlock([0, 1]);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(SERVER_DIR, "../../../server/index.ts")], {
    cwd: ROOT,
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: home,
      USERPROFILE: home,
      OMB_PORT: String(port),
      OMB_TEST_INTERNAL_CAPABILITY_KEY: TEST_CAPABILITY_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr!.on("data", (chunk) => (stderr += chunk));

  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}: ${stderr}`);
    try {
      if ((await fetch(`${base}/api/health`)).status === 200) break;
    } catch {
    }
    if (Date.now() >= deadline) throw new Error(`server never became healthy: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}, 45_000);

afterAll(async () => {
  if (child) await waitForExit(child, { signal: "SIGTERM" });
  if (home) await removeTempDir(home);
});

describe("coordinate_bots on a teammate", () => {
  it.each([1, 2])("runs three requests in the teammate's one thread, one at a time within capacity %i, returns all results, and leaves the person's selected thread untouched", async (capacity) => {
    expect((await api("PUT", "/api/config", { threads: { maxConcurrentPerBot: capacity } })).status).toBe(200);
    const pm = await createBot("Pam", "gated");
    const qa = await createBot("Quinn", "gated");
    const stream = await openSse(`${base}/api/events`);
    try {
      const originalConversation = await messages(qa.threadId);
      const token = await heldTurn(pm, "Hand the pull requests to QA.");
      // Each request carries its own gate, so each turn in the shared thread is held on its own.
      const gate = (index: number) => `pr-${capacity}-${index}`;
      const opened: any[] = [];
      for (let index = 1; index <= 3; index++) {
        opened.push(await coordinated(token, qa.id, `Test pull request ${index}. [[gate:${gate(index)}]]`));
      }
      const before = await botState(qa.id);
      expect(before.threadId).toBe(qa.threadId);
      const thread = opened[0].threadId;
      expect(opened.map((node) => node.threadId)).toEqual([thread, thread, thread]);
      expect(before.tasks.filter((task: any) => task.openedBy?.botId === pm.id).map((task: any) => [task.threadId, task.openedBy.threadId]))
        .toEqual([[thread, pm.threadId]]);
      expect(dumpOf(gate(2))).toBeUndefined();
      expect(dumpOf(gate(3))).toBeUndefined();
      const chips = (await messages(pm.threadId)).filter((message) => message.threadRef);
      expect(chips.map((chip) => [chip.tool.name, chip.threadRef.botId, chip.threadRef.threadId])).toEqual(
        opened.map(() => ["Sent to Quinn", qa.id, thread]),
      );
      release(pm.threadId);
      for (let index = 0; index < opened.length; index++) {
        const node = opened[index];
        const live = await liveToken(gate(index + 1));
        await expect.poll(() => handoffs().filter(n => n.botId === qa.id && n.status === "running").map(n => n.id), { timeout: 15_000 }).toEqual([node.id]);
        expect(handoffs().filter(n => n.botId === qa.id && n.status === "queued")).toHaveLength(opened.length - index - 1);
        const request = (await messages(thread)).find((message) => message.peerRequest?.id === node.id && message.peerRequest.phase === "request");
        expect(request).toMatchObject({ from: { botId: pm.id } });
        expect(request.text).toContain(`Test pull request ${index + 1}.`);
        expect(dumpOf(gate(index + 1))?.systemPrompt).toContain("coordinate_bots");
        expect((await api("GET", "/api/internal/assignment-status", undefined, live)).status).toBe(200);
        release(gate(index + 1));
        await expect.poll(() => handoffs().find(n => n.id === node.id)?.status, { timeout: 15_000 }).toBe("completed");
      }
      await expect.poll(async () => (await messages(pm.threadId)).filter(
        (message) => message.from?.botId === qa.id && message.peerRequest?.phase === "result",
      ).length, { timeout: 20_000 }).toBe(3);
      await expect.poll(async () => {
        const state = await botState(pm.id);
        return state?.busy === false && state.waitingForTeammates !== true;
      }, { timeout: 15_000 }).toBe(true);
      // The review turn quotes the requests, gate markers included, so the engine files its prompt under the first request's gate.
      expect(promptsOf(gate(1)).at(-1)?.message.content).toContain("Your downstream teammate requests have settled");
      expect(stream.frames.filter((frame) => frame.kind === "notify" && frame.notification?.botId === qa.id)).toEqual([]);
      expect((await botState(qa.id)).tasks.filter((task: any) => task.unread)).toEqual([]);
      expect((await botState(qa.id)).threadId).toBe(qa.threadId);
      expect(await messages(qa.threadId)).toEqual(originalConversation);
    } finally {
      stream.close();
      await cleanup([pm.id, qa.id]);
      expect((await api("PUT", "/api/config", { threads: { maxConcurrentPerBot: 2 } })).status).toBe(200);
    }
  }, 90_000);

  it("coordinates allowed peers, refuses inaccessible peers and oversized batches, and does not duplicate a retried request", async () => {
    const pm = await createBot("Pam", "gated");
    const near = await createBot("Near", "gated");
    const far = await createBot("Far", "gated");
    const other = await createBot("Other", "gated");
    try {
      expect((await api("PATCH", `/api/bots/${other.id}`, { section: "Elsewhere" })).status).toBe(200);
      expect((await api("PATCH", `/api/bots/${pm.id}`, { peers: [near.id] })).status).toBe(200);
      const token = await heldTurn(pm, "Coordinate only with my allowed teammate.");
      const jobNode = await coordinated(token, near.id, "go", { thread: "new" });
      expect(jobNode).toMatchObject({ botId: near.id, mode: "work", reply: "resume", text: "go" });
      const job = jobNode.threadId as string;
      expect(job).not.toBe(near.threadId);
      expect((await botState(near.id)).tasks.find((task: any) => task.threadId === job)).toMatchObject({ openedBy: { botId: pm.id } });
      const send = (botIds: string[]) => api("POST", "/api/internal/coordinate-bots", { botIds, message: "Check it." }, token);
      const outside = await send([other.id]);
      expect(outside.status).toBe(403);
      expect(outside.body.error).toContain("not an allowed peer");
      const unlisted = await send([far.id]);
      expect(unlisted.status).toBe(403);
      expect(unlisted.body.error).toContain("allowed peer");
      expect((await send([near.id, far.id])).status).toBe(403);
      expect((await send([near.id, far.id, other.id, pm.id, "fifth"])).status).toBe(400);
      for (const bot of [other, far]) expect((await botState(bot.id)).tasks).toHaveLength(1);
      expect((await botState(near.id)).tasks).toHaveLength(2);
      const first = await coordinated(token, near.id, "Check it.");
      const retry = await send([near.id]);
      expect(retry.body.receipts).toEqual([expect.objectContaining({ requestId: first.id, detail: expect.stringContaining("already sent") })]);
      expect((await botState(near.id)).tasks).toHaveLength(3);
      expect((await api("PATCH", `/api/bots/${near.id}/tasks/${first.threadId}`, { archivedAt: Date.now() })).status).toBe(200);
      const afterArchive = await send([near.id]);
      expect(afterArchive.body.receipts).toEqual([expect.objectContaining({ outcome: "queued", detail: expect.stringContaining("sent to") })]);
      expect(afterArchive.body.receipts[0].requestId).not.toBe(first.id);
      expect(afterArchive.body.receipts[0].threadId).not.toBe(first.threadId);
      expect((await botState(near.id)).tasks).toHaveLength(4);
      expect((await messages(pm.threadId)).filter(message => message.threadRef?.threadId === first.threadId)).toHaveLength(1);
      release(job);
      await expect.poll(() => handoffs().find(node => node.threadId === job)?.status, { timeout: 15_000 }).toBe("completed");
    } finally {
      await cleanup([pm.id, near.id, far.id, other.id]);
    }
  }, 60_000);

  it("waits for the person's approval card and creates no recipient work when denied", async () => {
    const pm = await createBot("Pam", "gated");
    const qa = await createBot("Quinn", "gated");
    try {
      const originalConversation = await messages(qa.threadId);
      expect((await api("PATCH", `/api/bots/${pm.id}`, { approvePeerComms: true, approvalMode: "ask" })).status).toBe(200);
      const token = await heldTurn(pm, "Hand it to QA.");
      const pending = api("POST", "/api/internal/coordinate-bots", { botIds: [qa.id], message: "Test it." }, token);
      await expect.poll(async () => (await messages(pm.threadId)).some((message) => message.card?.tool === "delegate_bot"), { timeout: 15_000 }).toBe(true);
      const card = (await messages(pm.threadId)).find((message) => message.card?.tool === "delegate_bot");
      expect((await botState(qa.id)).tasks).toHaveLength(1);
      expect(await messages(qa.threadId)).toEqual(originalConversation);
      expect((await api("POST", `/api/bots/${pm.id}/respond`, { threadId: pm.threadId, requestId: card.card.requestId, behavior: "deny" })).status).toBe(200);
      expect(await pending).toMatchObject({ status: 403, body: { error: "Denied by user; no work sent." } });
      expect((await botState(qa.id)).tasks).toHaveLength(1);
      expect(await messages(qa.threadId)).toEqual(originalConversation);
      release(pm.threadId);
      await expect.poll(async () => (await botState(pm.id)).busy, { timeout: 15_000 }).toBe(false);
    } finally {
      await cleanup([pm.id, qa.id]);
    }
  }, 60_000);

  it("reports a deleted queued destination without injecting it into the recipient's conversation", async () => {
    const pm = await createBot("Pam", "gated");
    const qa = await createBot("Quinn", "gated");
    try {
      // An accepted handoff dispatches at once: hold Quinn's only slot so the destination is still queued when it is deleted.
      expect((await api("PUT", "/api/config", { threads: { maxConcurrentPerBot: 1 } })).status).toBe(200);
      rmSync(join(gates, `${qa.threadId}.gate`), { force: true });
      rmSync(join(gates, `${qa.threadId}.json`), { force: true });
      expect((await api("POST", `/api/bots/${qa.id}/messages`, { text: "Hold the slot.", threadId: qa.threadId })).status).toBe(202);
      await expect.poll(async () => (await taskOf(qa.id, qa.threadId))?.busy, { timeout: 15_000 }).toBe(true);
      const token = await heldTurn(pm, "Hand it to QA.");
      const opened = await coordinated(token, qa.id, "Test it.");
      expect((await api("DELETE", `/api/bots/${qa.id}/tasks/${opened.threadId}`)).status).toBe(200);
      release(pm.threadId);
      await expect.poll(() => handoffs().find(node => node.id === opened.id)?.status, { timeout: 15_000 }).toBe("cancelled");
      // The cancelled report resumes Pam; wait for that review turn too.
      await expect.poll(async () => {
        const state = await botState(pm.id);
        return state?.busy === false && state.waitingForTeammates !== true;
      }, { timeout: 15_000 }).toBe(true);
      expect((await messages(pm.threadId)).some(message => message.peerRequest?.id === opened.id && message.peerRequest.phase === "result" && message.tool?.ok === false)).toBe(true);
      release(qa.threadId);
      await expect.poll(async () => (await taskOf(qa.id, qa.threadId))?.busy, { timeout: 15_000 }).toBe(false);
      expect((await messages(qa.threadId)).some(message => message.text === "Test it.")).toBe(false);
    } finally {
      await cleanup([pm.id, qa.id]);
      expect((await api("PUT", "/api/config", { threads: { maxConcurrentPerBot: 2 } })).status).toBe(200);
    }
  }, 60_000);

  it("still buzzes when a coordinated thread asks the person a question, deep-linked to that thread", async () => {
    const pm = await createBot("Pam", "gated");
    const sage = await createBot("Sage", "curious", "fake-model");
    const stream = await openSse(`${base}/api/events`);
    try {
      const token = await heldTurn(pm, "Ask Sage.");
      const opened = await coordinated(token, sage.id, "Which colour?");
      release(pm.threadId);
      const frame = await stream.until(
        (candidate) => candidate.kind === "notify" && candidate.notification?.botId === sage.id,
        20_000,
      );
      expect(frame.notification).toMatchObject({ kind: "question", botId: sage.id, threadId: opened.threadId });
      expect(frame.notification.threadId).not.toBe(sage.threadId);
      const card = (await messages(opened.threadId)).findLast((message) => message.kind === "options" && Boolean(message.card));
      expect(card?.card).toMatchObject({ title: "Your bot has a question" });
    } finally {
      stream.close();
      await cleanup([pm.id, sage.id]);
    }
  }, 60_000);
});

describe("list_threads", () => {
  it("lists your own threads and the ones you opened on a teammate, never a teammate's other threads", async () => {
    const pm = await createBot("Parker", "gated");
    const qa = await createBot("Quinn", "gated");
    try {
      const token = await heldTurn(pm, "Find the tasks I opened for QA.");
      const opened = await coordinated(token, qa.id, "QA: PR #77");
      const mine = await api("GET", "/api/internal/threads", undefined, token);
      expect(mine.status).toBe(200);
      const titles = mine.body.threads.map((row: { title: string; botName: string; own: boolean }) => `${row.own ? "own" : row.botName}:${row.title}`);
      expect(titles).toContain("Quinn:@Parker · work");
      expect(mine.body.threads.map((row: { threadId: string }) => row.threadId)).toContain(opened.threadId);
      const qaToken = await mintedToken(qa.id, qa.threadId);
      const theirsSeen = await api("GET", "/api/internal/threads", undefined, qaToken);
      expect(theirsSeen.body.threads.every((row: { own: boolean }) => row.own)).toBe(true);
      expect(theirsSeen.body.threads.map((row: { threadId: string }) => row.threadId)).toContain(qa.threadId);
      expect(theirsSeen.body.threads.map((row: { threadId: string }) => row.threadId)).toContain(opened.threadId);
    } finally {
      await cleanup([pm.id, qa.id]);
    }
  });
});

describe("a Chief of Staff tidying its team (MOCA-202)", () => {
  it("lists and closes threads one teammate opened on another, never a person's thread or for a non-Chief", async () => {
    const chief = await createBot("Charlie", "gated");
    const pm = await createBot("Parker", "gated");
    const qa = await createBot("Quinn", "gated");
    const rio = await createBot("Rio", "gated");
    try {
      expect((await api("PATCH", `/api/bots/${chief.id}`, { chiefOfStaff: true })).status).toBe(200);
      const theirs = qa.threadId;
      // Parker hands Quinn work, and Quinn's turn is stopped: the handoff
      // never completes, so nothing auto-closes the thread Parker opened.
      const child = await coordinated(await heldTurn(pm, "Ask QA to check PR #90."), qa.id, "QA: PR #90");
      const close = (threadId: string, headers: Record<string, string>) =>
        api("POST", `/api/internal/threads/${threadId}/close`, {}, headers);
      const beforeDispatch = await mintedToken(chief.id, chief.threadId);
      // The runtime dispatches on its next tick once Quinn is free, so the handoff is queued or already running here.
      expect(handoffs().find(node => node.id === child.id)?.status).toMatch(/^(queued|running)$/);
      expect((await api("GET", "/api/internal/threads", undefined, beforeDispatch)).body.threads
        .find((row: any) => row.threadId === child.threadId)?.state).toMatch(/^(queued|running)$/);
      expect((await close(child.threadId, beforeDispatch)).status).toBe(409);
      release(pm.threadId);
      await expect.poll(async () => (await taskOf(qa.id, child.threadId))?.busy, { timeout: 15_000 }).toBe(true);
      expect((await api("POST", `/api/bots/${qa.id}/interrupt`, { threadId: child.threadId })).status).toBe(200);
      await expect.poll(() => handoffs().find(node => node.id === child.id)?.status, { timeout: 15_000 })
        .not.toMatch(/^(queued|running)$/);
      await expect.poll(async () => (await taskOf(qa.id, child.threadId))?.busy, { timeout: 15_000 }).toBe(false);
      expect((await taskOf(qa.id, child.threadId)).closedBy).toBeUndefined();

      // An ordinary teammate still sees and closes only its own work.
      const asRio = await mintedToken(rio.id, rio.threadId);
      const rioRows = (await api("GET", "/api/internal/threads", undefined, asRio)).body.threads as any[];
      expect(rioRows.map((row) => row.threadId)).not.toContain(child.threadId);
      expect((await close(child.threadId, asRio)).status).toBe(403);

      const asChief = await heldTurn(chief, "Tidy the team's finished threads.");
      const rows = (await api("GET", "/api/internal/threads", undefined, asChief)).body.threads as any[];
      expect(rows.find((row) => row.threadId === child.threadId))
        .toMatchObject({ botName: "Quinn", openedBy: "Parker", own: false, state: "idle" });
      expect(rows.map((row) => row.threadId)).not.toContain(theirs);
      expect((await proxyCall(chief.threadId, "list_threads", {})).content[0].text)
        .toContain("on @Quinn, opened by @Parker, idle");

      expect((await close(theirs, asChief)).status).toBe(403);
      const closed = await close(child.threadId, asChief);
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      expect((await taskOf(qa.id, child.threadId)).closedBy).toMatchObject({ botId: chief.id, name: "Charlie" });
      expect((await taskOf(qa.id, theirs)).closedBy).toBeUndefined();
    } finally {
      release(chief.threadId);
      release(pm.threadId);
      await cleanup([chief.id, pm.id, qa.id, rio.id]);
    }
  }, 60_000);

  it("withholds a reachable recipient's thread when its opener is outside the Chief's peer scope", async () => {
    const chief = await createBot("Charlie", "gated");
    const pm = await createBot("Parker", "gated");
    const qa = await createBot("Quinn", "gated");
    try {
      expect((await api("PATCH", `/api/bots/${chief.id}`, { chiefOfStaff: true, peers: [qa.id] })).status).toBe(200);
      const child = await coordinated(await heldTurn(pm, "Ask QA to check private work."), qa.id, "Private audit");
      release(pm.threadId);
      await expect.poll(async () => (await taskOf(qa.id, child.threadId))?.busy, { timeout: 15_000 }).toBe(true);
      expect((await api("POST", `/api/bots/${qa.id}/interrupt`, { threadId: child.threadId })).status).toBe(200);
      await expect.poll(() => handoffs().find(node => node.id === child.id)?.status, { timeout: 15_000 })
        .not.toMatch(/^(queued|running)$/);
      await expect.poll(async () => (await taskOf(qa.id, child.threadId))?.busy, { timeout: 15_000 }).toBe(false);
      const asChief = await heldTurn(chief, "Tidy only my reachable team's work.");
      const rows = (await api("GET", "/api/internal/threads", undefined, asChief)).body.threads as any[];
      expect(rows.map(row => row.threadId)).not.toContain(child.threadId);
      expect((await api("POST", `/api/internal/threads/${child.threadId}/close`, {}, asChief)).status).toBe(403);
      expect((await taskOf(qa.id, child.threadId)).closedBy).toBeUndefined();
    } finally {
      release(chief.threadId);
      release(pm.threadId);
      await cleanup([chief.id, pm.id, qa.id]);
    }
  }, 60_000);
});

describe("close_thread", () => {
it("auto-closes completed peer work and refuses other or running threads", async () => {
    const pm = await createBot("Parker", "gated");
    const qa = await createBot("Quinn", "gated");
    try {
      let token = await heldTurn(pm, "Ask QA to check this, then close its completed task.");
      const close = (threadId: string, headers = token) => api("POST", `/api/internal/threads/${threadId}/close`, {}, headers);
      const theirs = qa.threadId;
      expect((await close(theirs)).status).toBe(403);
      const child = await coordinated(token, qa.id, "QA: PR #78");
      const opened = { body: child };
      expect((await close(child.threadId)).status).toBe(409);
      const asQuinn = await mintedToken(qa.id, qa.threadId);
      expect((await close(child.threadId, asQuinn)).status).toBe(409);
      release(child.threadId);
      release(pm.threadId);
      await expect.poll(() => handoffs().find(node => node.id === child.id)?.status, { timeout: 15_000 }).toBe("completed");
      await expect.poll(async () => (await taskOf(qa.id, child.threadId)).closedBy, { timeout: 15_000 })
        .toMatchObject({ botId: pm.id, name: "Parker" });
      token = await heldTurn(pm, "Close the completed QA task.");
      const closed = await close(opened.body.threadId);
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({ closed: true, alreadyClosed: true, title: "@Parker · work", botName: "Quinn" });
      expect((await taskOf(qa.id, opened.body.threadId)).closedBy).toMatchObject({ botId: pm.id, name: "Parker" });
      const listed = (await api("GET", "/api/internal/threads", undefined, token)).body.threads as any[];
      expect(listed.find((row) => row.threadId === opened.body.threadId)).toMatchObject({ state: "closed" });
      expect((await close(opened.body.threadId)).body).toMatchObject({ closed: true, alreadyClosed: true });
      expect((await messages(opened.body.threadId)).filter((message) => message.tool?.name === "Closed by @Parker")).toHaveLength(0);
      expect((await close(pm.threadId)).status).toBe(400);
      expect((await close(qa.threadId, asQuinn)).status).toBe(400);
    } finally {
      await cleanup([pm.id, qa.id]);
    }
  });
});
