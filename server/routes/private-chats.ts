import { privateChatMessages, privateChats, privateChatSummary } from "../teams/private-chats.ts";
import type { Store } from "../storage/store.ts";
import type { RequestAuth } from "../auth/request-auth.ts";
import { PASS, type RouteHandler } from "./table.ts";

export function createPrivateChatRoutes(deps: {
  store: Pick<Store, "bots" | "bot" | "tasks" | "botByThread" | "taskByThread" | "activePath">;
  visible(auth: RequestAuth, botId: string): boolean;
  busy(threadId: string): boolean;
}): RouteHandler {
  return async ({ res, url, path, method, auth, json }) => {
    const match = path.match(/^\/api\/private-chats(?:\/([\w-]+))?$/);
    if (!match) return PASS;
    if (method !== "GET") return json(res, 403, { error: "Bot private chats are read-only for people." });
    const botId = url.searchParams.get("botId");
    if (botId && (!deps.store.bot(botId) || !deps.visible(auth, botId))) return json(res, 404, { error: "no such bot" });
    const chats = privateChats(deps.store).filter(chat => chat.botIds.every(id => deps.visible(auth, id)) &&
      (!botId || chat.botIds.includes(botId)));
    if (!match[1]) {
      return json(res, 200, { chats: chats.map(chat => privateChatSummary(deps.store, chat, deps.busy))
        .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)) });
    }
    const chat = chats.find(candidate => candidate.id === match[1]);
    if (!chat) return json(res, 404, { error: "no such private chat" });
    const rawLimit = url.searchParams.get("limit") ?? "100";
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 200) {
      return json(res, 400, { error: "limit must be a whole number between 1 and 200" });
    }
    const messages = privateChatMessages(deps.store, chat);
    const before = url.searchParams.get("before");
    const end = before ? messages.findIndex(message => message.id === before) : messages.length;
    if (end < 0) return json(res, 404, { error: "no such message" });
    const start = Math.max(0, end - Number(rawLimit));
    return json(res, 200, {
      chat: privateChatSummary(deps.store, chat, deps.busy),
      messages: messages.slice(start, end), hasMore: start > 0,
    });
  };
}
