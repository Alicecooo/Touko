import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { flag, oneOf, parseDuration, usageError, type Flags } from "./args.ts";
import type { HeadlessClient } from "./client.ts";
import type { HeadlessIo, Output } from "./output.ts";

export interface VerbContext {
  verb: string;
  flags: Flags;
  positionals: string[];
  env: NodeJS.ProcessEnv;
  io: HeadlessIo;
  output: Output;
  client(): Promise<HeadlessClient>;
  signal: AbortSignal;
  defaultWaitMs: number;
}

export interface VerbOutcome {
  result: unknown;
  exitCode: number;
  human: string[];
  printed?: true;
}

export interface Target {
  type: "bot";
  id: string;
  name?: string;
  taskId?: string;
}

type Fleet = { bots?: Array<Record<string, any>> };

const owns = (record: Record<string, any>, threadId: string) =>
  record.threadId === threadId || (Array.isArray(record.tasks) && record.tasks.some((task: { threadId?: string }) => task.threadId === threadId));

export async function resolveTarget(ctx: VerbContext, positional: string | undefined): Promise<Target> {
  const bot = flag(ctx.flags, "bot")?.trim();
  const thread = flag(ctx.flags, "thread")?.trim();
  const named = [bot, thread, positional?.trim()].filter(Boolean);
  if (named.length !== 1) {
    throw usageError(named.length ? "name exactly one bot" : "a bot is required",
      `openmausbot ${ctx.verb} BOT, or --bot ID or --thread ID`);
  }
  const task = flag(ctx.flags, "task")?.trim();
  const withTask = (target: Target): Target => {
    return task && !target.taskId ? { ...target, taskId: task } : target;
  };
  if (bot) return withTask({ type: "bot", id: bot });
  const fleet = await (await ctx.client()).json<Fleet>("/api/bots?messages=0");
  const bots = fleet.bots ?? [];
  if (thread) {
    const owner = bots.find((candidate) => owns(candidate, thread));
    if (!owner) throw usageError(`no bot conversation with id ${thread}`, "run openmausbot bots");
    return withTask({ type: "bot", id: owner.id, name: owner.name, taskId: thread });
  }
  const wanted = positional!.trim();
  const byId = bots.find((candidate) => candidate.id === wanted);
  if (byId) return withTask({ type: "bot", id: byId.id, name: byId.name });
  const key = wanted.toLowerCase();
  const matches = bots.filter((candidate) => String(candidate.name).trim().toLowerCase() === key).map((record) => ({ record }));
  if (matches.length === 0) {
    throw usageError(`no bot named "${wanted}"`, "run openmausbot bots for the names");
  }
  if (matches.length > 1) {
    throw usageError(`"${wanted}" names ${matches.length} bots: ${matches.map(({ record }) => `${record.name} (id ${record.id})`).join("; ")}`, "use --bot ID");
  }
  const [{ record }] = matches as [typeof matches[number]];
  return withTask({ type: "bot", id: record.id, name: record.name });
}

export async function readMessage(ctx: VerbContext, positional: string | undefined): Promise<string> {
  const text = flag(ctx.flags, "text");
  const file = flag(ctx.flags, "message-file");
  const sources = [positional !== undefined, text !== undefined, file !== undefined].filter(Boolean).length;
  if (sources !== 1) {
    throw usageError(sources ? "give the message one way: TEXT, --text TEXT, --message-file FILE or -" : "a message is required",
      `openmausbot ${ctx.verb} TARGET "what to do", or --message-file FILE, or - to read it from stdin`);
  }
  let message: string;
  if (file !== undefined) {
    try {
      message = readFileSync(file, "utf8");
    } catch (error) {
      throw usageError(`--message-file ${file} could not be read (${(error as NodeJS.ErrnoException).code ?? "error"})`);
    }
  } else if (positional === "-") {
    message = await ctx.io.readStdin();
  } else {
    message = (text ?? positional)!;
  }
  if (!message.trim()) throw usageError("the message is empty");
  return message.trim();
}

/** A send id this command makes up, so a retried send is never a second message. */
export const newSendId = () => `cli-${randomBytes(12).toString("base64url")}`;

export const waitPolicy = (ctx: VerbContext) => ({
  onInput: oneOf(flag(ctx.flags, "on-input"), "--on-input", ["exit", "wait", "stop"] as const, "exit"),
  onTimeout: oneOf(flag(ctx.flags, "on-timeout"), "--on-timeout", ["leave", "stop"] as const, "leave"),
  strict: ctx.flags.strict === true,
  timeoutMs: flag(ctx.flags, "timeout") ? parseDuration(flag(ctx.flags, "timeout")!, "--timeout") : ctx.defaultWaitMs,
});
