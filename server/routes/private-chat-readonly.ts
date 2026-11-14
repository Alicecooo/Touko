import type { Store } from "../storage/store.ts";
import { privateChatRefForThread } from "../teams/private-chats.ts";
import { PASS, type RouteHandler } from "./table.ts";

type PrivateChatStore = Pick<Store, "bots" | "bot" | "tasks" | "botByThread" | "taskByThread" | "messagesFor">;

interface MutationTarget {
  botId?: string;
  threadId?: string;
  messageId?: string;
  requestId?: string;
  body?: boolean;
  allThreads?: boolean;
  botPatch?: boolean;
}

/** Match only handlers that can write a transcript or change its execution. Attachment POSTs are reads. */
function mutationTarget(path: string, method: string): MutationTarget | undefined {
  if (path.startsWith("/api/internal/")) return;
  const connectorStatus = path.match(/^\/api\/bots\/([\w-]+)\/connector-cards\/([\w-]+)\/status$/);
  // This GET updates the card and may resume a turn after an external connection completes.
  if (connectorStatus && method === "GET") return { botId: connectorStatus[1], messageId: connectorStatus[2] };
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return;

  const thread = path.match(/^\/api\/threads\/([\w-]+)(?:\/.*)?$/);
  if (thread) {
    if (method === "POST" && /^\/api\/threads\/[\w-]+\/messages\/[\w-]+\/file$/.test(path)) return;
    return { threadId: thread[1] };
  }

  const task = path.match(/^\/api\/bots\/([\w-]+)\/tasks\/([\w-]+)(\/title)?$/);
  if (task && task[2] !== "delete" &&
      ((!task[3] && ["POST", "PATCH", "DELETE"].includes(method)) || (task[3] && method === "POST"))) {
    return { botId: task[1], threadId: task[2] };
  }
  const bulk = path.match(/^\/api\/bots\/([\w-]+)\/(tasks\/delete|threads\/follow-model)$/);
  if (bulk && method === "POST") return { botId: bulk[1], body: true, allThreads: bulk[2] === "threads/follow-model" };

  const bot = path.match(/^\/api\/bots\/([\w-]+)$/);
  if (bot && method === "PATCH") return { botId: bot[1], body: true, botPatch: true };

  const action = path.match(/^\/api\/bots\/([\w-]+)\/(messages(?:\/guarded)?|active-branch|respond|compact|interrupt|always-allow|model)$/);
  if (action && ((action[2] === "model" && method === "PATCH") || (action[2] !== "model" && method === "POST"))) {
    return { botId: action[1], body: true };
  }
  const edit = path.match(/^\/api\/bots\/([\w-]+)\/messages\/([\w-]+)\/edit$/);
  if (edit && method === "POST") return { botId: edit[1], messageId: edit[2], body: true };
  const queue = path.match(/^\/api\/bots\/([\w-]+)\/queue\/[\w-]+(\/steer)?$/);
  if (queue && ((!queue[2] && method === "DELETE") || (queue[2] && method === "POST"))) return { botId: queue[1], body: true };
  const card = path.match(/^\/api\/bots\/([\w-]+)\/cards\/([\w-]+)$/);
  if (card && method === "PATCH") return { botId: card[1], messageId: card[2], body: true };
  const continuation = path.match(/^\/api\/bots\/([\w-]+)\/connector-cards\/([\w-]+)\/(provided|authorize|resume|dismiss)$/);
  if (continuation && method === "POST") return { botId: continuation[1], messageId: continuation[2], body: true };
  const signIn = path.match(/^\/api\/bots\/([\w-]+)\/sign-in-cards\/([\w-]+)\/(done|cancel|save-login)$/);
  if (signIn && method === "POST") return { botId: signIn[1], messageId: signIn[2], body: true };
  const request = path.match(/^\/api\/bots\/([\w-]+)\/requests\/([A-Za-z0-9_-]{16,80})\/interrupt$/);
  if (request && method === "POST") return { botId: request[1], requestId: request[2], body: true };
}

export function createPrivateChatReadOnlyRoutes({ store }: { store: PrivateChatStore }): RouteHandler {
  const privateThread = (threadId: unknown): string | undefined =>
    typeof threadId === "string" && privateChatRefForThread(store, threadId) ? threadId : undefined;

  return async ({ req, res, path, method, url, json, readBody }) => {
    const refuse = (threadId: string) => json(res, 403, {
      error: "Bot private chats are read-only. Send instructions in the bot's main conversation.",
      code: "private_chat_read_only",
      threadId,
    });
    const target = mutationTarget(path, method);
    if (!target) return PASS;
    const direct = privateThread(target.threadId);
    if (direct) return refuse(direct);

    const raw: unknown = target.body ? await readBody(req) : undefined;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const threadIds = new Set<unknown>([body.threadId, url.searchParams.get("threadId")]);
    if (Array.isArray(body.threadIds)) body.threadIds.forEach((id) => threadIds.add(id));

    const owner = target.botId ? store.bot(target.botId) : null;
    const tasks = owner ? store.tasks(owner.id) : [];
    const allThreads = (target.allThreads && body.threadIds === undefined) ||
      (target.botPatch && (body.applyToAllThreads === true || body.computer !== undefined));
    if (allThreads) tasks.forEach((task) => threadIds.add(task.threadId));
    if (owner && !target.threadId && body.threadId === undefined &&
        (!target.botPatch || body.modelSelection !== undefined)) threadIds.add(owner.threadId);
    for (const candidate of threadIds) {
      const threadId = privateThread(candidate);
      if (threadId) return refuse(threadId);
    }

    // Older clients can omit threadId on bot-scoped message/card actions. Resolve their actual transcript too.
    const messageIds = new Set([target.messageId, body.messageId, body.replyToId]);
    const requestIds = new Set([target.requestId, body.requestId]);
    const widget = body.widgetAction;
    if (widget && typeof widget === "object" && !Array.isArray(widget)) messageIds.add((widget as Record<string, unknown>).messageId);
    messageIds.delete(undefined);
    requestIds.delete(undefined);
    if (messageIds.size || requestIds.size) {
      for (const task of tasks) {
        if (!privateThread(task.threadId)) continue;
        if (store.messagesFor(task.threadId).some((message) => messageIds.has(message.id) ||
            (message.card?.requestId !== undefined && requestIds.has(message.card.requestId)))) return refuse(task.threadId);
      }
    }
    return PASS;
  };
}
