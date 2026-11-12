import { t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Bot as BotIcon, Search } from "lucide-react";
import { openBot, useStore, type Bot } from "@/state/store";
import { rankByName } from "@/lib/palette-rank";
import { useShowThreads } from "@/lib/thread-preferences";
import { cn } from "@/lib/cn";

type PaletteEntry =
  { kind: "bot"; bot: Bot };

const OPEN_EVENT = "omb:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  const q = query.trim().toLowerCase();

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const bots = rankByName(state.bots.filter((b) => !b.hidden), q);
  const entries: PaletteEntry[] = bots.map((bot): PaletteEntry => ({ kind: "bot", bot }));
  const selected = entries.length ? Math.min(cursor, entries.length - 1) : 0;

  const activate = async (entry: PaletteEntry) => {
    openBot(dispatch, entry.bot, showThreads);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(entries.length ? (selected + 1) % entries.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(entries.length ? (selected - 1 + entries.length) % entries.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[selected];
      if (entry) void activate(entry);
    }
  };

  const row = (key: string, index: number, onPick: () => void, children: React.ReactNode, twoLine = false) => (
    <button
      key={key}
      ref={index === selected ? selectedRef : undefined}
      onClick={onPick}
      // mousemove, not mouseenter: rows shifting under a resting pointer must not steal the keyboard selection.
      onMouseMove={() => setCursor(index)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
        twoLine && "flex-col items-stretch gap-0.5",
        index === selected ? "bg-raised" : "hover:bg-raised/50",
      )}
    >
      {children}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("ui.label.commandPalette")}
        className="flex max-h-[min(480px,70vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-hairline/50 bg-card shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-3 border-b border-hairline/40 px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-secondary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("routines.sidebar.searchBots")}
            className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-secondary focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-hairline/40 px-1.5 py-0.5 text-[11px] text-ink-secondary">
            esc
          </kbd>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {entries.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-ink-secondary">
              {q ? t("commandPalette.noMatches", { query }) : t("ui.label.nothingToSwitchToYet")}
            </div>
          )}
          {bots.length > 0 && (
            <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-secondary">
              {t("teamShare.part.bots")}</div>
          )}
          {bots.map((bot, i) =>
            row(
              `bot:${bot.id}`,
              i,
              () => void activate({ kind: "bot", bot }),
              <>
                <BotIcon size={16} className="shrink-0 text-ink-secondary" />
                <span className="truncate text-[14px] text-ink">{bot.name}</span>
                {bot.title && (
                  <span className="min-w-0 truncate text-[12.5px] text-ink-secondary">{bot.title}</span>
                )}
              </>,
            ),
          )}
        </div>
      </div>
    </div>
  );
}
