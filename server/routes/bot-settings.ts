import { approvalModeFor, type ApprovalMode } from "../../shared/approval-mode.ts";
import type { WireBot } from "../../shared/wire.ts";
import { parseBotProfilePatch } from "../bots/bot-profile.ts";
import type { AppConfig } from "../config/config.ts";
import type { ModelSelection } from "../harness/contracts.ts";
import type { createApprovalModeSupport } from "../agent/harness-capabilities.ts";
import type { hostedModelPolicy } from "../deployment/hosted-models.ts";
import type { RequestAuth } from "../auth/request-auth.ts";
import type { BotRecord, Store } from "../storage/store.ts";
import type { ModelSelectionCheck } from "./bots-create.ts";
import { PASS, type RouteHandler } from "./table.ts";
import { pinnedClientThreadGuard } from "./pinned-client-thread.ts";

export interface BotSettingsRouteDeps {
  store: Store;
  cfg: AppConfig;
  cloudHome: boolean;
  cloudOwnerProfileFields: readonly ("name" | "title" | "description" | "notifications")[];
  hostedModels: ReturnType<typeof hostedModelPolicy>;
  supportsApprovalMode: ReturnType<typeof createApprovalModeSupport>;
  directTurnBots: { get(threadId: string): BotRecord | undefined };
  broadcast(payload: Record<string, unknown>): void;
  wireBot(bot: BotRecord): WireBot;
  cloudOwnerSession(auth: RequestAuth): boolean;
  storedAvatarExists(avatarUrl: string): boolean;
  requestedTaskBot(botId: string, rawThreadId: unknown): BotRecord;
  threadBusy(botId: string, threadId: string): boolean;
  checkedModelSelection(raw: unknown, current?: { selection: ModelSelection; busy: boolean }, requireAvailableModel?: boolean): ModelSelectionCheck;
  engineSwitchNeedsAsk(mode: ApprovalMode, from: ModelSelection, to: ModelSelection): boolean;
  readCursor(threadId: string): { lastReadMessageId?: string };
  cardAnswerRefusal(auth: RequestAuth, threadId: string, requestId: string, behavior: string): string | null;
}

export function createBotSettingsRoutes(deps: BotSettingsRouteDeps): RouteHandler {
  const {
    store,
    cloudHome: CLOUD_HOME, cloudOwnerProfileFields: CLOUD_OWNER_PROFILE_FIELDS,
    hostedModels, supportsApprovalMode, directTurnBots, broadcast, wireBot, cloudOwnerSession, storedAvatarExists,
    requestedTaskBot, threadBusy, checkedModelSelection, engineSwitchNeedsAsk, readCursor,
    cardAnswerRefusal,
  } = deps;
  const pinnedClientThread = pinnedClientThreadGuard(store);
  return async ({ req, res, path, method, auth, json, readBody }) => {
    let m: RegExpMatchArray | null = null;
    const requirePinnedClientThread = pinnedClientThread(auth, req);
    m = path.match(/^\/api\/bots\/([\w-]+)\/profile$/);
    if (m && method === "PATCH") {
      const parsed = parseBotProfilePatch(await readBody(req), true);
      if (!parsed.ok) return json(res, 400, { error: parsed.error });
      if (parsed.patch.avatarUrl && !storedAvatarExists(parsed.patch.avatarUrl)) {
        return json(res, 400, { error: "avatarUrl must reference an existing stored image" });
      }
      const existingBot = store.bot(m[1]);
      // On a Cloud home these fields ride every owner turn: only the owner's own devices change them.
      if (CLOUD_HOME && existingBot && !cloudOwnerSession(auth)) {
        const changed = CLOUD_OWNER_PROFILE_FIELDS.find((field) => parsed.patch[field] !== undefined && (field === "notifications"
          ? (parsed.patch.notifications !== false) !== (existingBot.notifications !== false)
          : parsed.patch[field] !== (existingBot[field] ?? "")));
        if (changed) return json(res, 403, { error: "On this Cloud only its owner can change a bot's name, title, description or notifications." });
      }
      const bot = store.patchBotProfile(m[1], parsed.patch);
      if (!bot) return json(res, 404, { error: "no such bot" });
      const visible = wireBot(bot);
      broadcast({ kind: "bot", bot: visible });
      return json(res, 200, { bot: visible });
    }
    m = path.match(/^\/api\/bots\/([\w-]+)\/model$/);
    if (m && method === "PATCH") {
      const body = await readBody(req);
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const unsupported = Object.keys(body).find(
          (key) => key !== "instanceId" && key !== "model" && key !== "effort" && key !== "variant",
        );
        if (unsupported) return json(res, 400, { error: `unsupported model field: ${unsupported}` });
      }
      const existing = store.bot(m[1]);
      if (!existing) return json(res, 404, { error: "no such bot" });
      requirePinnedClientThread(existing.id, undefined);
      const selected = requestedTaskBot(existing.id, undefined);
      if (existing.approvalGrant) {
        return json(res, 409, { error: "wait for the approval-level change to finish before changing models" });
      }
      const checked = checkedModelSelection(
        body,
        { selection: selected.modelSelection, busy: threadBusy(selected.id, selected.threadId) },
        true,
      );
      if (!checked.ok) return json(res, checked.status, { error: checked.error });
      if ([existing, selected].some((owner) => {
        const mode = approvalModeFor(owner);
        return mode === "custom" &&
          (!supportsApprovalMode(checked.selection, mode) || engineSwitchNeedsAsk(mode, owner.modelSelection, checked.selection));
      })) {
        return json(res, 400, {
          error: "Changing providers with elevated permissions requires choosing Ask first",
        });
      }
      const bot = store.patchBot(existing.id, { modelSelection: checked.selection });
      if (!bot) return json(res, 404, { error: "no such bot" });
      store.patchTask(bot.id, selected.threadId, { modelSelection: undefined,
        ...hostedModels?.resetTask(selected.modelSelection, checked.selection) });
      return json(res, 200, { bot: wireBot(bot) });
    }
    m = path.match(/^\/api\/bots\/([\w-]+)\/read$/);
    if (m && method === "POST") {
      const body = await readBody(req);
      requirePinnedClientThread(m[1], body?.threadId);
      const current = requestedTaskBot(m[1], body?.threadId);
      store.patchTask(current.id, current.threadId, { unread: false, ...readCursor(current.threadId) });
      const bot = store.bot(current.id)!;
      const visible = wireBot(bot);
      broadcast({ kind: "bot", bot: visible });
      return json(res, 200, { bot: visible });
    }
    m = path.match(/^\/api\/bots\/([\w-]+)\/always-allow$/);
    if (m && method === "POST") {
      const body = await readBody(req);
      requirePinnedClientThread(m[1], body?.threadId);
      const allowKey = typeof body.allowKey === "string" ? body.allowKey : "";
      const bot = requestedTaskBot(m[1], body.threadId);
      if (!allowKey) return json(res, 400, { error: "allowKey required" });
      const pending = store.messagesFor(bot.threadId).find((message) =>
        message.card?.requestId &&
        !message.card.answered &&
        message.card.dismissed !== true &&
        message.card.allowKey === allowKey
      );
      if (!pending) {
        return json(res, 409, { error: "that grant is not on a pending approval for this bot" });
      }
      // A standing grant is an approval: only those who may approve the card may remember it.
      const refusal = cardAnswerRefusal(auth, bot.threadId, pending.card!.requestId!, "allow");
      if (refusal) return json(res, 403, { error: refusal });
      const savedBot = store.bot(bot.id)!;
      store.patchBot(bot.id, {
        alwaysAllow: [...new Set([...(savedBot.alwaysAllow ?? []), allowKey])].slice(0, 200),
      });
      store.patchTask(bot.id, bot.threadId, {
        alwaysAllow: [...new Set([...(bot.alwaysAllow ?? []), allowKey])].slice(0, 200),
      });
      const live = directTurnBots.get(bot.threadId);
      if (live) live.alwaysAllow = [...new Set([...(live.alwaysAllow ?? []), allowKey])].slice(0, 200);
      const updated = store.bot(bot.id)!;
      const visible = wireBot(updated);
      broadcast({ kind: "bot", bot: visible });
      return json(res, 200, { bot: visible });
    }
    return PASS;
  };
}
