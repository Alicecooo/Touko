import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ChevronRight, LockKeyhole, MessagesSquare, RefreshCw } from "lucide-react";
import type { PrivateChatSummary } from "../../shared/private-chats";
import type { WireMessage } from "../../shared/wire";
import { useStore } from "@/state/store";
import { activeLocale, t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { BotAvatar } from "./Avatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { useCaptionChrome } from "./DesktopCapabilities";

const PAGE_SIZE = 100;
const REFRESH_MS = 4_000;

interface PrivateChatPage {
  chat: PrivateChatSummary;
  messages: WireMessage[];
  hasMore: boolean;
}

async function readPrivateChats<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(String(response.status));
  // SAFETY: the same-version server's read-only private-chat endpoints own this transport shape.
  return await response.json() as T;
}

function mergeMessages(held: WireMessage[], incoming: WireMessage[]): WireMessage[] {
  const rows = new Map(held.map((message) => [message.id, message]));
  for (const message of incoming) rows.set(message.id, message);
  return [...rows.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
}

export function PrivateChatsPanel({ botId, chatId }: { botId: string; chatId: string | null }) {
  const { state, dispatch } = useStore();
  const { padClass, dragProps, noDragStyle } = useCaptionChrome();
  const owner = state.bots.find((bot) => bot.id === botId);
  const [refresh, setRefresh] = useState(0);
  const [activeChat, setActiveChat] = useState<PrivateChatSummary | null>(null);
  const shownChat = activeChat?.id === chatId ? activeChat : null;
  const title = shownChat
    ? shownChat.botIds.map((id) => state.bots.find((bot) => bot.id === id)?.name ?? t("privateChats.unknownBot")).join(" ↔ ")
    : owner?.name ?? t("privateChats.title");
  const returnLabel = t(chatId ? "privateChats.back" : "privateChats.returnMain");
  const goBack = () => dispatch(chatId ? { type: "openPrivateChats", botId } : { type: "closePrivateChats" });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dispatch(chatId ? { type: "openPrivateChats", botId } : { type: "closePrivateChats" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [botId, chatId, dispatch]);
  return (
    <main aria-label={t("privateChats.title")} data-private-chat-view className="relative flex h-full min-w-0 flex-1 flex-col bg-app">
      <header {...dragProps} className={cn("flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline/40 py-3 pl-11 pr-4 md:pl-5", padClass)}>
        <div className="flex min-w-0 items-center gap-3" style={noDragStyle}>
          {owner && <BotAvatar bot={owner} size={32} />}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-ink">{title}</div>
            <div className="flex items-center gap-1 text-[11px] text-ink-secondary"><LockKeyhole size={11} />{t("privateChats.title")}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2" style={noDragStyle}>
          {shownChat?.busy && <span role="status" data-private-chat-status className="flex items-center gap-1.5 rounded-full border border-hairline/40 px-2.5 py-1 text-[11px] text-ink-secondary"><Activity size={12} className="text-accent" />{t("privateChats.working")}</span>}
          <button type="button" onClick={() => setRefresh((value) => value + 1)} title={t("privateChats.refresh")} aria-label={t("privateChats.refresh")} className="rounded-full p-2 text-ink-secondary hover:bg-raised hover:text-ink"><RefreshCw size={15} /></button>
          <button type="button" onClick={goBack} title={returnLabel} aria-label={returnLabel} className="rounded-full p-2 text-ink-secondary hover:bg-raised hover:text-ink"><ArrowLeft size={17} /></button>
        </div>
      </header>
      {chatId
        ? <PrivateChatTranscript key={chatId} chatId={chatId} refresh={refresh} onChatChange={setActiveChat} />
        : <PrivateChatList key={botId} botId={botId} refresh={refresh} />}
      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-hairline/30 px-5 py-3 text-[12px] text-ink-secondary">
        <LockKeyhole size={13} className="shrink-0" /><span>{t("privateChats.readOnly")}</span>
      </footer>
    </main>
  );
}

function PrivateChatList({ botId, refresh }: { botId: string; refresh: number }) {
  const { state, dispatch } = useStore();
  const [chats, setChats] = useState<PrivateChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await readPrivateChats<{ chats: PrivateChatSummary[] }>(`/api/private-chats?botId=${encodeURIComponent(botId)}`, request.signal);
      if (request.signal.aborted) return;
      setChats(result.chats);
      setError(null);
    } catch (cause) {
      if (!request.signal.aborted) {
        setChats(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (controller.current === request) controller.current = null;
    }
  }, [botId, dispatch]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
      controller.current = null;
    };
  }, [load, refresh]);
  const owner = state.bots.find((bot) => bot.id === botId);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-[18px] font-semibold text-ink">{owner ? t("privateChats.forBot", { name: owner.name }) : t("privateChats.title")}</h1>
      {error && <div role="status" className="mb-4 text-[13px] text-danger">{t("privateChats.error", { message: error })}</div>}
      {!chats && !error && <p className="py-6 text-[13px] text-ink-secondary">{t("privateChats.loading")}</p>}
      {chats?.length === 0 && <div className="flex flex-col items-center gap-4 rounded-2xl border border-hairline/30 py-16 text-center text-[13px] text-ink-secondary"><MessagesSquare size={28} className="text-ink-tertiary" /><p className="max-w-sm px-4">{t("privateChats.empty")}</p></div>}
      {chats?.map((chat) => {
        const peerId = chat.botIds.find((id) => id !== botId);
        const peer = state.bots.find((bot) => bot.id === peerId);
        const name = peer?.name ?? t("privateChats.unknownBot");
        return <button key={chat.id} type="button" onClick={() => dispatch({ type: "openPrivateChats", botId, chatId: chat.id })} className="mb-2 flex w-full items-center gap-4 rounded-2xl border border-hairline/30 bg-panel px-4 py-4 text-left transition-colors hover:border-hairline/60 hover:bg-raised/60">
          <BotAvatar bot={peer ?? { name, color: "blue" }} size={44} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-[14px] font-medium text-ink"><span className="truncate">{name}</span><span className="shrink-0 text-[11px] font-normal text-ink-tertiary">{new Date(chat.updatedAt).toLocaleDateString(activeLocale())}</span></span>
            <span className="mt-1.5 block truncate text-[13px] text-ink-secondary">{chat.preview || t("privateChats.noMessages")}</span>
            {chat.busy && <span className="mt-1 block text-[11px] text-accent">{t("privateChats.working")}</span>}
          </span>
          <ChevronRight size={14} className="mt-1 shrink-0 text-ink-tertiary" />
        </button>;
      })}
      </div>
    </div>
  );
}

function PrivateChatTranscript({ chatId, refresh, onChatChange }: { chatId: string; refresh: number; onChatChange: (chat: PrivateChatSummary | null) => void }) {
  const { state, dispatch } = useStore();
  const [chat, setChat] = useState<PrivateChatSummary | null>(null);
  const [messages, setMessages] = useState<WireMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const heldMessages = useRef<WireMessage[]>([]);
  const earlierAvailable = useRef(false);
  const currentRequest = useRef<AbortController | null>(null);
  const olderRequest = useRef<AbortController | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (chat && state.hydrated && chat.botIds.some((botId) => !state.bots.some((bot) => bot.id === botId && !bot.hidden))) {
      dispatch({ type: "closePrivateChats" });
    }
  }, [chat, state.bots, state.hydrated, dispatch]);
  const load = useCallback(async () => {
    if (currentRequest.current || olderRequest.current) return;
    const request = new AbortController();
    currentRequest.current = request;
    setLoadingRecent(true);
    try {
      let page = await readPrivateChats<PrivateChatPage>(`/api/private-chats/${encodeURIComponent(chatId)}?limit=${PAGE_SIZE}`, request.signal);
      if (request.signal.aborted) return;
      const recentChat = page.chat;
      const held = heldMessages.current;
      const heldIds = new Set(held.map((message) => message.id));
      let incoming = page.messages;
      // Reconnects can span more than a page. Walk back to the held transcript
      // before merging so a quiet tab never leaves a permanent gap in history.
      while (held.length > 0 && page.hasMore && page.messages.length > 0 && !incoming.some((message) => heldIds.has(message.id))) {
        const before = page.messages[0]!.id;
        page = await readPrivateChats<PrivateChatPage>(`/api/private-chats/${encodeURIComponent(chatId)}?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`, request.signal);
        if (request.signal.aborted) return;
        incoming = mergeMessages(incoming, page.messages);
      }
      const overlaps = incoming.some((message) => heldIds.has(message.id));
      const oldestHeldIndex = incoming.findIndex((message) => message.id === held[0]?.id);
      const continuousIncoming = overlaps && oldestHeldIndex >= 0 ? incoming.slice(oldestHeldIndex) : incoming;
      const next = overlaps ? mergeMessages(held, continuousIncoming) : incoming;
      const more = overlaps ? earlierAvailable.current : page.hasMore;
      heldMessages.current = next;
      earlierAvailable.current = more;
      setChat(recentChat);
      onChatChange(recentChat);
      setMessages(next);
      setHasMore(more);
      setError(null);
    } catch (cause) {
      if (!request.signal.aborted) {
        if (cause instanceof Error && (cause.message === "403" || cause.message === "404")) {
          setChat(null);
          onChatChange(null);
          setMessages([]);
          setHasMore(false);
          heldMessages.current = [];
          earlierAvailable.current = false;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (currentRequest.current === request) {
        currentRequest.current = null;
        setLoadingRecent(false);
      }
    }
  }, [chatId, dispatch, onChatChange]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
      currentRequest.current?.abort();
      currentRequest.current = null;
    };
  }, [load, refresh]);
  useEffect(() => () => olderRequest.current?.abort(), []);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (restoreScroll.current) {
      const previous = restoreScroll.current;
      node.scrollTop = previous.top + node.scrollHeight - previous.height;
      restoreScroll.current = null;
    } else if (nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);
  const loadOlder = async () => {
    const before = messages[0]?.id;
    if (!before || olderRequest.current || currentRequest.current) return;
    const request = new AbortController();
    olderRequest.current = request;
    setLoadingOlder(true);
    try {
      const result = await readPrivateChats<PrivateChatPage>(`/api/private-chats/${encodeURIComponent(chatId)}?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`, request.signal);
      if (request.signal.aborted) return;
      if (viewport.current) restoreScroll.current = { height: viewport.current.scrollHeight, top: viewport.current.scrollTop };
      const next = mergeMessages(heldMessages.current, result.messages);
      heldMessages.current = next;
      earlierAvailable.current = result.hasMore;
      setMessages(next);
      setHasMore(result.hasMore);
      setError(null);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (olderRequest.current === request) {
        olderRequest.current = null;
        setLoadingOlder(false);
      }
    }
  };
  return <>
    <div ref={viewport} onScroll={(event) => {
      const node = event.currentTarget;
      nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    }} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto max-w-4xl">
      {error && <p role="status" className="pb-3 text-[13px] text-danger">{t("privateChats.error", { message: error })}</p>}
      {!chat && !error && <p className="py-3 text-[13px] text-ink-secondary">{t("privateChats.loading")}</p>}
      {hasMore && <button type="button" disabled={loadingOlder || loadingRecent} onClick={() => void loadOlder()} className="mb-4 w-full rounded-md bg-raised px-3 py-2 text-[12px] text-ink-secondary hover:bg-raised-hover disabled:opacity-50">{loadingOlder ? t("privateChats.loading") : t("privateChats.loadOlder")}</button>}
      {chat && messages.length === 0 && <p className="py-3 text-[13px] text-ink-secondary">{t("privateChats.noMessages")}</p>}
      <div className="space-y-5">{messages.map((message, index) => {
        const author = state.bots.find((bot) => bot.id === message.from?.botId);
        const name = message.from?.name ?? author?.name ?? t("privateChats.system");
        const date = new Date(message.at);
        const previous = messages[index - 1];
        const newDay = !previous || new Date(previous.at).toDateString() !== date.toDateString();
        const right = Boolean(message.from?.botId && message.from.botId === chat?.botIds[1]);
        return <div key={message.id} data-private-message={message.id}>
          {newDay && <div className="mb-6 flex justify-center"><span className="rounded-full bg-raised/60 px-3 py-1 text-[11px] text-ink-tertiary">{date.toLocaleDateString(activeLocale(), { year: "numeric", month: "short", day: "numeric" })}</span></div>}
          {message.kind === "text" ? <article data-private-chat-text className={cn("flex items-start gap-3", right && "flex-row-reverse")}>
            <div className="mt-0.5 shrink-0"><BotAvatar bot={author ?? { name, color: "blue" }} size={34} /></div>
            <div className={cn("flex min-w-0 max-w-[85%] flex-col items-start", right && "items-end")}>
              <div className={cn("mb-1.5 flex max-w-full items-center gap-2 px-1", right && "flex-row-reverse")}>
                <span className="min-w-0 truncate text-[12px] font-medium text-ink-secondary">{name}</span>
                <time dateTime={date.toISOString()} title={date.toLocaleString(activeLocale())} className="shrink-0 text-[10px] text-ink-tertiary">{date.toLocaleTimeString(activeLocale(), { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <div className={cn("max-w-full rounded-2xl px-4 py-3 text-[14px] leading-relaxed text-ink", right ? "rounded-tr-md bg-accent/10" : "rounded-tl-md bg-raised/70")}>
                <ChatMarkdown text={message.text ?? ""} />
              </div>
            </div>
          </article> : <PrivateChatEvent message={message} />}
          </div>;
      })}</div>
      </div>
    </div>
  </>;
}

function PrivateChatEvent({ message }: { message: WireMessage }) {
  const date = new Date(message.at);
  const detail = message.tool?.summary ?? message.text ?? message.tool?.output ?? message.tool?.name;
  return <aside data-private-chat-event className="mx-auto max-w-2xl border-y border-dashed border-hairline/40 px-3 py-2.5 text-[12px] text-ink-tertiary">
    <div className="flex items-center gap-2">
      <Activity size={13} className="shrink-0" />
      <span className="font-medium">{t("privateChats.recordedEvent")}</span>
      <time dateTime={date.toISOString()} className="ml-auto text-[10px]">{date.toLocaleTimeString(activeLocale(), { hour: "2-digit", minute: "2-digit" })}</time>
    </div>
    {detail && <p className="mt-1.5 whitespace-pre-wrap break-words pl-5 leading-relaxed">{detail}</p>}
  </aside>;
}
