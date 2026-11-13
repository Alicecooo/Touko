import type { NotificationTarget } from "@/lib/notify";
import type { Action, AppState } from "./store";
import type { PrivateChatRef } from "../../shared/private-chats";

interface NotificationThreadOwner {
  id: string;
  threadId: string;
  mainThreadId?: string;
  tasks?: Array<{ threadId: string; privateChatRef?: PrivateChatRef }>;
}

interface NotificationRoutingState {
  bots: NotificationThreadOwner[];
}

export function visibleNotificationThread(
  state: NotificationRoutingState & Pick<AppState, "activeView" | "selectedId" | "privateChatsOpen">,
): string | null {
  if (state.activeView !== "chat" || state.privateChatsOpen) return null;
  return (
    state.bots.find((candidate) => candidate.id === state.selectedId)?.threadId ??
    null
  );
}

export function openNotificationTarget(
  dispatch: (action: Action) => void,
  target: NotificationTarget,
  state: NotificationRoutingState,
  threadsShown: boolean,
) {
  const bot = state.bots.find((candidate) =>
    candidate.threadId === target.threadId || candidate.tasks?.some((task) => task.threadId === target.threadId)
  ) ?? state.bots.find((candidate) => candidate.id === target.botId);
  if (!bot) {
    dispatch({ type: "select", id: target.botId });
    return;
  }
  const known =
    bot.threadId === target.threadId ||
    (bot.tasks ?? []).some((task) => task.threadId === target.threadId);
  if (known) openBotThread(dispatch, bot, target.threadId, threadsShown);
  else openBot(dispatch, bot, threadsShown);
}

export function botOpensTo(bot: Pick<NotificationThreadOwner, "threadId" | "mainThreadId" | "tasks">, _threadsShown: boolean): string {
  return bot.mainThreadId && bot.tasks?.some((task) => task.threadId === bot.mainThreadId)
    ? bot.mainThreadId : bot.threadId;
}

export function awayFromMainThread(bot: Pick<NotificationThreadOwner, "threadId" | "mainThreadId" | "tasks">, _threadsShown: boolean): boolean {
  return botOpensTo(bot, false) !== bot.threadId;
}

export function openBot(
  dispatch: (action: Action) => void,
  bot: Pick<NotificationThreadOwner, "id" | "threadId" | "mainThreadId" | "tasks">,
  threadsShown: boolean,
) {
  const opened = botOpensTo(bot, threadsShown);
  if (opened === bot.threadId) dispatch({ type: "select", id: bot.id });
  else openBotThread(dispatch, bot, opened, threadsShown);
}

/** With threads hidden the switch alone selects the bot, so the thread left behind keeps its unread mark. */
export function openBotThread(
  dispatch: (action: Action) => void,
  bot: Pick<NotificationThreadOwner, "id" | "threadId" | "tasks">,
  threadId: string,
  threadsShown: boolean,
) {
  const chat = bot.tasks?.find(task => task.threadId === threadId)?.privateChatRef;
  if (chat) {
    dispatch({ type: "openPrivateChats", botId: bot.id, chatId: chat.id });
    return;
  }
  if (threadsShown || threadId === bot.threadId) dispatch({ type: "select", id: bot.id });
  dispatch({ type: "switchTask", botId: bot.id, threadId });
}

export interface ThreadTarget {
  botId: string;
  threadId: string;
}

interface ThreadOpeningState extends NotificationRoutingState {
  bots: Array<NotificationThreadOwner & { name: string }>;
}

export function openThread(
  dispatch: (action: Action) => void,
  target: ThreadTarget,
  state: ThreadOpeningState,
  threadsShown: boolean,
): boolean {
  const owns = (owner: NotificationThreadOwner) =>
    owner.threadId === target.threadId || (owner.tasks ?? []).some((task) => task.threadId === target.threadId);
  if (state.bots.some(owns)) {
    openNotificationTarget(dispatch, target, state, threadsShown);
    dispatch({ type: "revealThread", threadId: target.threadId });
    return true;
  }
  const bot = state.bots.find((candidate) => candidate.id === target.botId);
  if (bot) openBot(dispatch, bot, threadsShown);
  dispatch({ type: "notice", notice: { kind: "thread-gone", botName: bot?.name ?? null } });
  return false;
}
