import { OrganizationIdentity } from "./OrganizationIdentity";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch } from "react";
import { createPortal } from "react-dom";
import { Activity, Archive, BellDot, Bot as BotIcon, Check, ChevronRight, ClipboardCopy, Copy, Crown, FolderMinus, FolderPlus, Library, Loader2, Pencil, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Plus, Trash2, Users } from "lucide-react";
import { api, useStore, formatTime, visibleMessages, botOpensTo, openBot, type Action, type AppState, type Bot, type InstanceInfo, type Message } from "@/state/store";
import { llmThreadTitlesEnabled } from "@/lib/feature-flags";

import { BotAvatar } from "./Avatar";

import { cn } from "@/lib/cn";
import { useHeldMenuMotion, useMenuMotion } from "./MenuMotion";
import { lastNonReceipt } from "@/lib/receipts";
import { activeLocale, t } from "@/lib/i18n";
import { copyText } from "@/lib/copy-text";
import type { LocaleKey } from "@/locales";
import { ConfirmDialog } from "./ConfirmDialog";
import { WorkingDots } from "./WorkingIndicator";
import { useDesktopCapabilities } from "./DesktopCapabilities";
import { TeamLibraryPanel } from "./TeamLibraryPanel";
import { TeamDialog } from "./TeamDialog";
import { RenameTitle } from "./RenameTitle";
import { navigateThreadMenu } from "./BotProjects";
import { FOLDER_DRAG_TYPE } from "@/lib/folder-order";
import { useRelativeNow } from "./SidebarThreadRow";
import { loadCollapsedSections, loadSectionOrder, loadSidebarAttentionPinned, saveCollapsedSections, saveSectionOrder, saveSidebarAttentionPinned, setSidebarDensity, toggleCollapsedSection, useSidebarDensity, usePinnedCircles, useUniversalPins, type SidebarDensity } from "@/lib/sidebar-preferences";
import { ATTENTION_SECTION_ID, BOTS_SECTION_ID, PINNED_SECTION_ID, PINNED_THREADS_SECTION_ID, mergeSectionOrder, moveSection, orderedSidebarSections, partitionSidebarBots, placeSection, pinnedCircleThreadListVisible, sameSectionOrder, sidebarLayoutInteractive, sidebarSectionCollapsed, sidebarSectionLabel, userSectionId, userSectionName, type SectionDropPlace } from "@/lib/sidebar-layout";
import { sidebarSectionAttention } from "@/lib/sidebar-attention";
import { botListItemPointerIntent } from "@/lib/sidebar-selection";
import { SidebarAppsButton } from "./SidebarFooterNav";
import { GlassBar, GlassScrollFrame, GlassScroller } from "./GlassScrollFrame";
import { DesktopWorkspaceSwitcher } from "./DesktopWorkspaceSwitcher";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { SidebarResizeHandle, useSidebarWidth } from "./SidebarResizeHandle";
import { useShowThreads } from "@/lib/thread-preferences";
import { botShowsUnread } from "@/lib/bot-unread";
import { attentionHasRunningWork, attentionJumpAction, attentionTriggerLabel, attentionUnpinAction, AttentionThreadRows, crossBotAttentionThreads, crossBotPinnedThreads, SidebarBotActivity, sidebarBotActivityTasks } from "./SidebarBotActivity";
import { SidebarAttentionPanel } from "./SidebarAttentionPanel";
import { SidebarPinnedThreadsPanel } from "./SidebarPinnedThreadsPanel";
import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { PinnedBotRoster, PinnedCircleThreadSection } from "./PinnedCircleThreads";
import { archiveBotWithNotice, onArchiveNotice } from "./bot-archive";
import { ArchivedBotsPanel, botConfirmCopy, type BotConfirmKind } from "./ArchivedBotsPanel";

export { PinnedBotCircle, PinnedCircleThreadSection } from "./PinnedCircleThreads";
export { ArchivedBotRow, ArchivedBotsPanel, archivedDeleteAllCopy, botConfirmCopy, type BotConfirmKind } from "./ArchivedBotsPanel";

const SECTION_LABEL_KEYS: Record<string, LocaleKey> = {
  [PINNED_SECTION_ID]: "sidebar.section.pinned",
  [BOTS_SECTION_ID]: "sidebar.section.bots",
};

function sectionLabel(id: string): string {
  const key = SECTION_LABEL_KEYS[id];
  return key ? t(key) : sidebarSectionLabel(id);
}

interface MenuState {
  botId: string;
  x: number;
  y: number;
}

function openBotContextMenu(onMenu: (menu: MenuState) => void, botId: string, event: React.MouseEvent) {
  event.preventDefault();
  onMenu({ botId, x: event.clientX, y: event.clientY });
}

function SectionPicker({
  current,
  anchor,
  onClose,
  onAssign,
}: {
  current: string | undefined;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onAssign: (section: string) => void;
}) {
  const { state } = useStore();
  const [name, setName] = useState("");
  const motion = useHeldMenuMotion(anchor);
  const shown = motion.value;
  const heldCurrent = useRef(current);
  if (anchor) heldCurrent.current = current;
  const trimmed = name.trim();

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-section-picker]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [anchor, onClose]);

  const sections = [
    ...new Set([
      ...(state.sections ?? []),
      ...state.bots.filter((b) => !b.hidden && b.section).map((b) => b.section!),
    ]),
  ];

  const assign = (section: string) => {
    onAssign(section);
    onClose();
  };

  if (!motion.shown || !shown) return null;
  const sectionCurrent = heldCurrent.current;
  const top = Math.max(8, Math.min(shown.y, window.innerHeight - 300));
  const left = Math.min(shown.x, window.innerWidth - 260);

  return (
    <div
      data-section-picker
      style={{ top, left }}
      className={cn("fixed z-40 w-[236px] overflow-hidden rounded-xl border border-hairline/50 bg-menu py-2 shadow-2xl shadow-black/60", motion.className)} {...motion.exitProps}
    >
      <div className="px-3.5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-secondary">
        {t("sidebar.section.moveToContext")}
      </div>
      {sections.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1.5 py-1">
          {sections.map((section) => (
            <button
              key={section}
              onClick={() => assign(section)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]",
                section === sectionCurrent ? "bg-raised text-ink" : "text-ink hover:bg-raised/70",
              )}
            >
              <span className="truncate">{section}</span>
              {section === sectionCurrent && <Check size={14} className="shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-1.5 px-2.5 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed || trimmed.length > 60) return;
          assign(trimmed);
        }}
      >
        <input
          autoFocus
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("sidebar.section.newContext")}
          aria-label={t("sidebar.section.newContextAria")}
          className="w-full rounded-lg bg-raised/70 px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
        />
        <button
          type="submit"
          disabled={!trimmed || trimmed.length > 60}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium",
            trimmed ? "bg-accent text-panel" : "bg-raised/70 text-ink-secondary",
          )}
        >
          {t("common.add")}
        </button>
      </form>
      {sectionCurrent && (
        <>
          <div className="mx-2 my-1 border-t border-hairline/40" />
          <button
            onClick={() => assign("")}
            className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-[13px] text-danger hover:bg-raised/70"
          >
            <FolderMinus size={15} />
            {t("sidebar.section.removeFromContext")}
          </button>
        </>
      )}
    </div>
  );
}

export function BotContextMenu({
  menu,
  onClose,
  onArchive,
  onDelete,
  onMoveToSection,
}: {
  menu: MenuState | null;
  onClose: () => void;
  onArchive: (bot: Bot) => void;
  onDelete: (bot: Bot) => void;
  onMoveToSection: (botId: string) => void;
}) {
  const motion = useHeldMenuMotion(menu);
  const shown = motion.value;
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const remoteClient = window.ogb?.remoteClient?.active === true;
  const bot = shown ? state.bots.find((b) => b.id === shown.botId) : undefined;
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element || !shown) return;
    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      element.style.top = `${Math.max(8, Math.min(shown.y, window.innerHeight - height - 8))}px`;
      element.style.left = `${Math.max(8, Math.min(shown.x, window.innerWidth - width - 8))}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });
  // Kept apart from the listeners: onClose is fresh every render, and re-running this would pull focus back to the
  // first item.
  useEffect(() => {
    if (!menu) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-bot-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [menu, onClose]);

  if (!motion.shown || !bot || !shown) return null;
  const deleting = state.deletingBots[bot.id] === true;
  const engine = state.instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId);
  const canCoordinate = engine?.capabilities?.agentsMcp === true;
  const visibleBotCount = state.bots.filter((candidate) => !candidate.hidden).length;
  const archiveBlocked = Boolean(bot.chiefOfStaff) || visibleBotCount <= 1;
  const archiveHint = bot.chiefOfStaff
    ? t("sidebar.bot.archiveBlockedChief")
    : visibleBotCount <= 1
      ? t("sidebar.bot.archiveBlockedLast")
      : undefined;
  const openForSettings = () => {
    if (state.selectedId === bot.id) dispatch({ type: "select", id: bot.id });
    else openBot(dispatch, bot, showThreads);
  };
  const item = (
    icon: React.ReactNode,
    label: string,
    onClick?: () => void,
    opts?: { danger?: boolean; disabled?: boolean; hint?: string; keepOpen?: boolean },
  ) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      disabled={opts?.disabled}
      onClick={() => {
        onClick?.();
        if (!opts?.keepOpen) onClose();
      }}
      title={opts?.hint}
      className={cn(
        "flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px]",
        opts?.danger ? "text-danger" : "text-ink",
        opts?.disabled ? "cursor-default opacity-40" : "hover:bg-raised/70",
      )}
    >
      {icon}
      {label}
    </button>
  );
  const divider = (key: string) => <div key={key} className="mx-2 my-1 border-t border-hairline/40" />;

  return createPortal(
    <div
      ref={menuRef}
      data-bot-menu
      data-sidebar
      role="menu"
      aria-label={t("sidebar.bot.actions", { name: bot.name })}
      onKeyDown={navigateThreadMenu}
      style={{ top: shown.y, left: shown.x }}
      className={cn("fixed z-40 max-h-[calc(100dvh-16px)] w-[228px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-xl border border-hairline/50 bg-menu py-1.5 shadow-2xl shadow-black/60", motion.className)} {...motion.exitProps}
    >
      {remoteClient ? [
        item(<FolderPlus size={16} className="text-ink-secondary" />, t("sidebar.bot.moveToSection"), () => {
          onClose();
          onMoveToSection(bot.id);
        }),
        item(<Pencil size={16} className="text-ink-secondary" />, t("sidebar.bot.editProfile"), () => {
          openForSettings();
          if (!state.settingsOpen) dispatch({ type: "toggleSettings", open: true });
        }),
        item(<ClipboardCopy size={16} className="text-ink-secondary" />, t("sidebar.copyConversationId"), () => {
          void copyText(bot.threadId);
        }),
      ] : [
        item(
          bot.pinned ? <PinOff size={16} className="text-ink-secondary" /> : <Pin size={16} className="text-ink-secondary" />,
          bot.pinned ? t("sidebar.bot.unpin") : t("sidebar.bot.pin"),
          () => dispatch({ type: "updateBot", botId: bot.id, patch: { pinned: !bot.pinned } }),
        ),
        item(
          <Crown size={16} className={bot.chiefOfStaff ? "text-accent" : "text-ink-secondary"} />,
          bot.chiefOfStaff ? t("sidebar.bot.removeChief") : t("sidebar.bot.makeChief"),
          () => dispatch({ type: "updateBot", botId: bot.id, patch: { chiefOfStaff: !bot.chiefOfStaff } }),
          {
            disabled: !bot.chiefOfStaff && !canCoordinate,
            hint: !bot.chiefOfStaff && !canCoordinate ? t("sidebar.bot.chiefNeedsEngine") : undefined,
          },
        ),
        item(<FolderPlus size={16} className="text-ink-secondary" />, t("sidebar.bot.moveToSection"), () => {
          onClose();
          onMoveToSection(bot.id);
        }),
        item(<BellDot size={16} className="text-ink-secondary" />, t("sidebar.bot.markUnread"), () =>
          dispatch({ type: "markUnread", botId: bot.id }),
        ),
        divider("d1"),
        item(<Pencil size={16} className="text-ink-secondary" />, t("sidebar.bot.editProfile"), () => {
          openForSettings();
          if (!state.settingsOpen) dispatch({ type: "toggleSettings", open: true });
        }),
        item(<Copy size={16} className="text-ink-secondary" />, t("sidebar.bot.duplicate"), () =>
          dispatch({ type: "duplicateBot", botId: bot.id }),
        ),
        divider("d2"),
        item(<ClipboardCopy size={16} className="text-ink-secondary" />, t("sidebar.copyConversationId"), () => {
          void copyText(bot.threadId);
        }),
        divider("d3"),
        item(
          <Archive size={16} className="text-ink-secondary" />,
          t("sidebar.bot.archive"),
          () => onArchive(bot),
          {
            disabled: archiveBlocked,
            hint: archiveHint,
          },
        ),
        <BotDeleteMenuItem
          key="delete"
          deleting={deleting}
          onClick={() => {
            onClose();
            onDelete(bot);
          }}
        />,
      ]}
    </div>,
    document.body,
  );
}

/** A confirmation may span live fleet updates; never authorize from its snapshot. */
export function currentArchivableBot(bots: readonly Bot[], id: string): Bot | undefined {
  const active = bots.filter((candidate) => !candidate.hidden);
  if (active.length <= 1) return undefined;
  return active.find((candidate) => candidate.id === id && !candidate.chiefOfStaff);
}

export function BotDeleteMenuItem({ deleting, onClick }: { deleting: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={deleting}
      aria-busy={deleting || undefined}
      onClick={onClick}
      title={deleting ? t("sidebar.bot.deleteCheckingTitle") : undefined}
      className={cn(
        "flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] text-danger",
        deleting ? "cursor-default opacity-40" : "hover:bg-raised/70",
      )}
    >
      {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      {deleting ? t("sidebar.bot.deleteChecking") : t("common.delete")}
    </button>
  );
}

export interface BotRowProps {
  bot: Bot;
  selected: boolean;
  deleting: boolean;
  reveal: AppState["revealThread"];
  pendingQueued: AppState["pendingQueued"];
  instances: InstanceInfo[];
  locale: string;
  generatedTitles: boolean;
  density: SidebarDensity;
  quiet: boolean;
  query: string;
  dispatch: Dispatch<Action>;
  onMenu: (menu: MenuState) => void;
}

export function botRowProps(
  state: AppState,
  dispatch: Dispatch<Action>,
  bot: Bot,
  layout: Pick<BotRowProps, "density" | "quiet" | "query" | "onMenu">,
): BotRowProps {
  const selected = state.activeView === "chat" && state.selectedId === bot.id;
  const reveal = state.revealThread;
  return {
    ...layout,
    bot,
    selected,
    deleting: state.deletingBots[bot.id] === true,
    reveal: reveal && (bot.threadId === reveal.threadId || bot.tasks?.some((task) => task.threadId === reveal.threadId)) ? reveal : null,
    pendingQueued: state.pendingQueued,
    instances: state.instances,
    locale: activeLocale(),
    generatedTitles: llmThreadTitlesEnabled(state.config),
    dispatch};
}

function useVisibleMessages(bot: Bot): Message[] {
  const { messages, activeLeafId } = bot;
  return useMemo(() => visibleMessages({ messages, activeLeafId }), [messages, activeLeafId]);
}

export const BotListItem = memo(function BotListItem(props: BotRowProps) {
  const { bot, selected, deleting, pendingQueued, density, quiet, dispatch, onMenu } = props;
  const showThreads = useShowThreads();
  const remoteClient = typeof window !== "undefined" && window.ogb?.remoteClient?.active === true;
  const [renaming, setRenaming] = useState(false);
  const iconOnly = density === "icons";
  useEffect(() => {
    if (iconOnly) setRenaming(false);
  }, [iconOnly]);
  const avatarSize = iconOnly ? 44 : density === "compact" ? 36 : 44;
  const visible = useVisibleMessages(bot);
  const last = lastNonReceipt(visible);
  const title = bot.title.trim();
  const details = [title, bot.chiefOfStaff ? t("sidebar.bot.chiefOfStaff") : ""].filter(Boolean);
  const rowClass = cn(
    "flex w-full items-center rounded-xl text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-accent/60",
    iconOnly
      ? "justify-center px-1 py-1.5"
      : density === "compact"
        ? "gap-2.5 py-1.5 pl-2 pr-3"
        : "gap-3 py-2 pl-2.5 pr-3",
    selected ? "bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.10)]" : "hover:bg-raised/50",
  );
  const activityTasks = sidebarBotActivityTasks(bot, pendingQueued);
  const waiting = bot.activity === "waiting-on-you" || activityTasks.some((task) => task.activity === "waiting-on-you");
  const working = !waiting && (Boolean(bot.busy) || activityTasks.some((task) => task.busy || task.activity === "working"));
  const teammateWait = !waiting && !working && (Boolean(bot.waitingForTeammates) || activityTasks.some((task) => Boolean(task.waitingForTeammates)));
  const queued = activityTasks.some((task) => task.queued);
  const unread = botShowsUnread(bot);
  const statusLine = deleting || working || waiting || teammateWait || queued;
  const body = 
    <>
      <span className="relative flex shrink-0" title={iconOnly ? undefined : [bot.name, ...details].join(" · ")}>
        <BotAvatar
          bot={bot}
          size={avatarSize}
        />
        {working && (
          <span
            data-testid="working-dot"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-panel bg-success",
              iconOnly ? "size-3" : "size-2.5",
            )}
          />
        )}
        {waiting && <span data-testid="waiting-dot" role="status" aria-label={t("sidebar.preview.waiting")} title={t("sidebar.preview.waiting")}
          className={cn("absolute -right-0.5 -bottom-0.5 flex items-center justify-center overflow-hidden rounded-full border-2 border-panel bg-warning font-black text-panel", iconOnly ? "size-5 text-[14px]" : "size-4 text-[12px]")}><span aria-hidden="true">!</span></span>}
        {teammateWait && <span data-testid="teammate-wait-dot" role="status" aria-label={t("sidebar.preview.waitingOnTeammate")} title={t("sidebar.preview.waitingOnTeammate")}
          className={cn("absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-panel bg-accent", iconOnly ? "size-3" : "size-2.5")} />}
        {!teammateWait && !waiting && !working && queued && <span data-testid="queued-dot" role="status" aria-label={t("task.queued")} title={t("task.queued")}
          className={cn("absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-panel bg-ink-secondary", iconOnly ? "size-3" : "size-2.5")} />}
        {bot.chiefOfStaff && iconOnly && (
          <span className="absolute -left-1 -top-1 flex rounded-full bg-raised p-[3px]">
            <Crown size={11} strokeWidth={2.25} className="shrink-0 text-accent" role="img" aria-label={t("sidebar.bot.chiefOfStaff")} data-testid="chief-crown">
              <title>{t("sidebar.bot.chiefOfStaff")}</title>
            </Crown>
          </span>
        )}
        
      </span>
      <div className={cn("min-w-0 flex-1", iconOnly && "hidden")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("flex min-w-0 grow items-center gap-1.5 truncate text-ink", ("text-[15px] font-semibold leading-5"))}>
            {bot.pinned && <Pin size={12} className="shrink-0 text-ink-secondary" />}
            <RenameTitle
              key={iconOnly ? "icons" : "expanded"}
              value={bot.name}
              onCommit={(name) => {
                if (remoteClient) {
                  void api(`/api/bots/${bot.id}/profile`, { method: "PATCH", body: JSON.stringify({ name }) })
                    .then(({ bot: updated }) => dispatch({ type: "botPatched", bot: updated }))
                    .catch((cause) => dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }));
                } else {
                  dispatch({ type: "updateBot", botId: bot.id, patch: { name } });
                }
              }}
              onEditingChange={setRenaming}
              className="truncate"
              inputClassName={cn("w-full rounded bg-inset px-1 py-0.5", ("text-[15px] font-semibold"))}
            />
            {bot.chiefOfStaff && !renaming && (
              <Crown size={13} strokeWidth={2.25} className="shrink-0 text-accent" role="img" aria-label={t("sidebar.bot.chiefOfStaff")} data-testid="chief-crown">
                <title>{t("sidebar.bot.chiefOfStaff")}</title>
              </Crown>
            )}
            {title && !renaming && <span className="sr-only">{`, ${title}`}</span>}
            
          </span>
          {selected && last && !renaming && (
            <span className="shrink-0 text-[12px] tabular-nums text-ink-secondary">
              {formatTime(last.at)}
            </span>
          )}
          {quiet && !statusLine && unread && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label={t("task.unreadMany")} />}
        </div>
        {statusLine && <div className="flex items-center justify-between gap-2">
          {deleting ? (
            <span role="status" className="flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-[18px] text-ink-secondary">
              <Loader2 size={12} className="shrink-0 animate-spin" />
              {t("sidebar.bot.deletingRow")}
            </span>
          ) : (
            <span className={cn("flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-[18px]", waiting ? "font-semibold text-warning" : "text-ink-secondary")}>
              {working ? (
                <span className="flex h-[1.5em] items-center" role="status">
                  <WorkingDots size={3.5} />
                  <span className="sr-only">{t("sidebar.preview.working")}</span>
                </span>
              ) : (
                <span dir="auto" className="truncate">{waiting ? t("sidebar.preview.waiting") : teammateWait ? t("sidebar.preview.waitingOnTeammate") : queued ? t("task.queued") : null}</span>
              )}
            </span>
          )}
          {unread && (
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t("task.unreadMany")} />
          )}
        </div>}
      </div>
    </>
  ;
  const onContextMenu = (event: React.MouseEvent) => {
    openBotContextMenu(onMenu, bot.id, event);
  };
  const onSelect = (event: React.MouseEvent) => {
    if (renaming) return;
    const insideRenameInput = event.target instanceof HTMLInputElement;
    if (botListItemPointerIntent(event.type, insideRenameInput) === "select") {
      openBot(dispatch, bot, showThreads);
    }
  };

  return (
    <>
    <div className={cn("group relative", false)} title={iconOnly ? [bot.name, bot.title?.trim()].filter(Boolean).join(" · ") : undefined}>
      {/* Keep this wrapper mounted: replacing it remounts RenameTitle and leaves the row stuck in rename mode. */}
      <div
        role={renaming ? undefined : "button"}
        tabIndex={renaming ? undefined : 0}
        aria-label={
          !renaming && iconOnly
            ? deleting
              ? t("sidebar.bot.deletingAria", { name: bot.name })
              : `${bot.name}${bot.title?.trim() ? ` · ${bot.title.trim()}` : ""}${bot.chiefOfStaff ? ` · ${t("sidebar.bot.chiefOfStaff")}` : ""}${waiting ? ` · ${t("sidebar.preview.waiting")}` : working ? ` · ${t("chat.activity.working")}` : teammateWait ? ` · ${t("sidebar.preview.waitingOnTeammate")}` : queued ? ` · ${t("task.queued")}` : ""}${unread ? ` · ${t("task.unread")}` : ""}`
            : undefined
        }
        aria-busy={deleting || undefined}
        aria-current={selected && !renaming ? "page" : undefined}
        data-sidebar-bot-row={bot.id}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu({ botId: bot.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openBot(dispatch, bot, showThreads);
          }
        }}
        onContextMenu={onContextMenu}
        className={rowClass}
      >
        {body}
      </div>
      {!renaming && iconOnly && unread && (
        <span className={cn("pointer-events-none absolute size-2 rounded-full border border-panel bg-accent", ("bottom-1.5 right-1.5"))} />
      )}
      {deleting && iconOnly && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-card p-1 text-ink-secondary">
          <Loader2 size={12} className="animate-spin" />
        </span>
      )}
    </div>
    <SidebarBotActivity bot={bot} rowThreadId={selected ? bot.threadId : botOpensTo(bot, showThreads)} density={density} pendingQueued={pendingQueued} dispatch={dispatch} />
    </>
  );
});

export function TeamMenuItems({ onRename, onDelete }: {
  onRename: () => void;
  onDelete: () => void;
}) {
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-raised";
  return (
    <>
      <button type="button" role="menuitem" autoFocus className={item} onClick={onRename}><Pencil size={14} />{t("team.rename")}</button>
      <button type="button" role="menuitem" className={cn(item, "text-danger")} onClick={onDelete}><Trash2 size={14} />{t("team.delete")}</button>
    </>
  );
}

export function Sidebar({ open, onClose, collapseToIcons = false }: {
  open: boolean;
  onClose: () => void;
  collapseToIcons?: boolean;
}) {
  const { state, dispatch } = useStore();
  const now = useRelativeNow();
  
  const showThreads = useShowThreads();
  const remoteClient = window.ogb?.remoteClient?.active === true;
  const { capabilities } = useDesktopCapabilities();
  const importReturnRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [confirm, setConfirm] = useState<{ kind: BotConfirmKind; bot: Bot } | null>(null);
  const cancelConfirm = useCallback(() => setConfirm(null), []);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sectionPicker, setSectionPicker] = useState<MenuState | null>(null);
  const [newTeam, setNewTeam] = useState(false);
  const [teamMenu, setTeamMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const teamMotion = useHeldMenuMotion(teamMenu);
  const teamMenuReturn = useRef<HTMLElement | null>(null);
  const closeTeamMenu = () => {
    (teamMenuReturn.current?.isConnected ? teamMenuReturn.current : sidebarRef.current)?.focus();
    setTeamMenu(null);
  };
  const openTeamMenu = (name: string, x: number, y: number, returnTo: HTMLElement) => {
    teamMenuReturn.current = returnTo;
    setTeamMenu({ name, x: Math.max(8, Math.min(x, window.innerWidth - 266)), y: Math.max(8, Math.min(y, window.innerHeight - 190)) });
  };
  const renamedTeam = (oldName: string, newName: string) => {
    const replace = (ids: string[]) => [...new Set(ids.map(id => id === userSectionId(oldName) ? userSectionId(newName) : id))];
    setCollapsedSections(current => { const next = replace(current); saveCollapsedSections(next); return next; });
    setSectionOrder(current => { const next = replace(current); saveSectionOrder(next); return next; });
    requestAnimationFrame(() => {
      const header = [...(sidebarRef.current?.querySelectorAll<HTMLElement>("[data-section]") ?? [])]
        .find(element => element.dataset.section === newName);
      (header?.querySelector<HTMLElement>("button") ?? header ?? sidebarRef.current)?.focus();
    });
  };
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null);
  const [teamDeletePending, setTeamDeletePending] = useState(false);
  const teamDeleteRunning = useRef(false);
  const [moveToTeam, setMoveToTeam] = useState<string | null>(null);
  const [renameTeam, setRenameTeam] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const plusMotion = useMenuMotion(plusOpen);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const attentionMotion = useMenuMotion(attentionOpen);
  const [attentionPinned, setAttentionPinnedState] = useState(() => loadSidebarAttentionPinned());
  const setAttentionPinned = (pinned: boolean) => {
    setAttentionPinnedState(pinned);
    saveSidebarAttentionPinned(pinned);
  };
  const [teamLibraryOpen, setTeamLibraryOpen] = useState(false);
  const [archivedBotsOpen, setArchivedBotsOpen] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<{
    error: boolean;
    text: string;
    restoreBot?: { id: string; name: string };
  } | null>(null);
  const storedDensity = useSidebarDensity();
  const density = collapseToIcons ? "icons" : storedDensity;
  const sidePanelOpen = state.inspectorOpen;
  const sizing = useSidebarWidth({ density, sidePanelOpen, sidebarRef });
  const [lastExpandedDensity, setLastExpandedDensity] = useState<Exclude<SidebarDensity, "icons">>(
    () => density === "icons" ? "comfortable" : density,
  );
  const pinnedCircles = usePinnedCircles();
  const universalPins = useUniversalPins();
  const [pinnedCircleThreadsCollapsed, setPinnedCircleThreadsCollapsed] = useState(true);
  const quietRows = density === "compact";
  const [collapsedSections, setCollapsedSections] = useState<string[]>(() => loadCollapsedSections());
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => loadSectionOrder());
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; place: SectionDropPlace } | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const sectionDragRef = useRef<{
    from: string | null;
    over: { id: string; place: SectionDropPlace } | null;
  }>({ from: null, over: null });

  useEffect(() => {
    if (density !== "icons") setLastExpandedDensity(density);
  }, [density]);

  const toggleCollapsed = () => {
    setSidebarDensity(density === "icons" ? lastExpandedDensity : "icons");
  };

  useEffect(() => {
    if (!open || confirm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose, confirm]);

  const attentionMenuRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(attentionOpen, attentionMenuRef, () => setAttentionOpen(false));
  usePopoverDismiss(plusOpen, plusMenuRef, () => setPlusOpen(false));

  useEffect(() => {
    if (!teamFeedback) return;
    const timer = window.setTimeout(() => setTeamFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [teamFeedback]);

  const requestArchive = (bot: Bot) => {
    const current = currentArchivableBot(state.bots, bot.id);
    if (current) setConfirm({ kind: "archive", bot: current });
  };

  const archiveBot = async ({ id }: Pick<Bot, "id">) => {
    const bot = currentArchivableBot(state.bots, id);
    if (bot) await archiveBotWithNotice(bot, { bots: state.bots, selectedId: state.selectedId, dispatch, showThreads, notify: setTeamFeedback });
  };
  // Archives from the bot panel report here too, with the same Undo.
  useEffect(() => onArchiveNotice(setTeamFeedback), []);

  const undoBotArchive = async (bot: { id: string; name: string }) => {
    setTeamFeedback(null);
    try {
      const response = await api(`/api/bots/${bot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hidden: false }),
      });
      dispatch({ type: "botPatched", bot: response.bot });
      openBot(dispatch, response.bot, showThreads);
      setTeamFeedback({ error: false, text: t("sidebar.archived.restored", { name: bot.name }) });
    } catch (cause) {
      setTeamFeedback({ error: true, text: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const draggableChrome = capabilities.windowChrome === "win-caption";
  // SAFETY: Electron's -webkit-app-region is not in React's CSSProperties type; the renderer accepts it as an inline
  // style.
  const windowDragStyle = draggableChrome
    ? ({ WebkitAppRegion: "drag" } as React.CSSProperties)
    : undefined;
  // SAFETY: interactive buttons must opt out of the draggable title-bar region.
  const windowNoDragStyle = draggableChrome
    ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
    : undefined;

  const q = "";

  const matchingBots = state.bots.filter((bot) => !bot.hidden);
  const {
    unsectionedChief,
    pinnedBots,
    sectionChiefs,
    sectionedBots,
    unsectionedBots,
  } = partitionSidebarBots(matchingBots, { universalPins });
  const sectionNames: string[] = [...(state.sections ?? [])];
  for (const bot of sectionedBots) {
    if (!sectionNames.includes(bot.section!)) sectionNames.push(bot.section!);
  }
  for (const bot of sectionChiefs) {
    if (!sectionNames.includes(bot.section!)) sectionNames.push(bot.section!);
  }
  const naturalSectionIds = [
    ...(pinnedBots.length > 0 && !universalPins ? [PINNED_SECTION_ID] : []),
    ...(unsectionedBots.length > 0 ? [BOTS_SECTION_ID] : []),
    ...sectionNames.map(userSectionId),
  ];
  const orderedIds = orderedSidebarSections(naturalSectionIds, sectionOrder);
  const sectionIds = orderedIds;
  const reorderableIds = sectionIds;
  const showPinnedCircleThreads = pinnedCircleThreadListVisible(pinnedCircles, density, pinnedBots.length);
  const layoutInteractive = sidebarLayoutInteractive(density, q);
  const sectionCollapsed = (id: string) =>
    sidebarSectionCollapsed(id, collapsedSections, density, q);

  const toggleSection = (id: string) => {
    if (!layoutInteractive) return;
    const next = toggleCollapsedSection(collapsedSections, id);
    setCollapsedSections(next);
    saveCollapsedSections(next);
  };

  const commitSectionOrder = (visibleOrder: string[]) => {
    if (!layoutInteractive) return;
    const next = mergeSectionOrder(sectionOrder, visibleOrder);
    if (sameSectionOrder(next, sectionOrder)) return;
    setSectionOrder(next);
    saveSectionOrder(next);
  };

  const announceSectionPosition = (id: string, visibleOrder: string[]) => {
    const position = visibleOrder.indexOf(id);
    if (position < 0) return;
    setReorderAnnouncement(
      t("sidebar.section.moved", {
        name: sectionLabel(id),
        position: position + 1,
        count: visibleOrder.length,
      }),
    );
  };

  const reorderSections = (id: string, moved: string[]) => {
    const next = moved;
    if (sameSectionOrder(next, sectionIds)) return;
    commitSectionOrder((next));
    announceSectionPosition(id, next);
  };
  const moveSidebarSection = (id: string, direction: -1 | 1) => reorderSections(id, moveSection(sectionIds, id, direction));

  const resetSectionDrag = () => {
    sectionDragRef.current = { from: null, over: null };
    setDraggingSectionId(null);
    setDropTarget(null);
  };

  const updateSectionDropTarget = (event: React.DragEvent<HTMLDivElement>, id: string) => {
    if (!layoutInteractive || !sectionDragRef.current.from) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const place: SectionDropPlace = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const next = { id, place };
    sectionDragRef.current.over = next;
    setDropTarget(next);
  };

  const dropSection = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return;
    event.preventDefault();
    const from =
      event.dataTransfer.getData("application/x-openmausbot-sidebar-section") ||
      event.dataTransfer.getData("text/plain") ||
      sectionDragRef.current.from;
    const over = sectionDragRef.current.over;
    if (from && over) reorderSections(from, placeSection(sectionIds, from, over.id, over.place));
    resetSectionDrag();
  };
  const archivedBots = state.bots.filter((bot) => bot.hidden);
  const attention = crossBotAttentionThreads(state.bots, state.pendingQueued);
  const pinnedThreads = crossBotPinnedThreads(state.bots, state.pendingQueued);
  const pendingBotUndo = teamFeedback?.restoreBot;
  const botRow = (bot: Bot) => botRowProps(state, dispatch, bot, { density, quiet: quietRows, query: q, onMenu: setMenu });
  const plusControl = 
    <div ref={plusMenuRef} className="contents">
    <button
      ref={importReturnRef}
      onClick={() => { setTeamPickerOpen(false); setPlusOpen(!plusOpen); }}
      aria-label={remoteClient ? t("sidebar.new") : t("sidebar.newOrShare")}
      className={cn(
        "flex items-center justify-center text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        density === "icons" ? "size-[46px] shrink-0 rounded-xl" : "size-8 rounded-md",
      )}
      title={remoteClient ? t("sidebar.new") : t("sidebar.newOrShare")}
    >
      <Plus size={density === "icons" ? 20 : (17)} strokeWidth={2} />
    </button>
    {plusMotion.shown && (
      <>
        <div className={cn(
          "absolute z-40 w-52 overflow-hidden rounded-xl border border-hairline/50 bg-menu py-1.5 shadow-2xl shadow-black/60",
          (cn("top-full mt-1", density === "icons" ? "left-0" : "right-0")),
          plusMotion.className,
        )} {...plusMotion.exitProps}>
          {!remoteClient && <button
            onClick={() => { setPlusOpen(false); setNewTeam(true); }}
            className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] text-ink hover:bg-raised/70"
          >
            <FolderPlus size={16} className="text-ink-secondary" /> {t("team.create")}
          </button>}
          {!remoteClient && sectionNames.length > 0 && <>
            <button type="button" aria-expanded={teamPickerOpen} onClick={() => setTeamPickerOpen(!teamPickerOpen)}
              className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] text-ink hover:bg-raised/70">
              <Users size={16} className="shrink-0 text-ink-secondary" />
              <span className="flex-1">{t("team.manageBots")}</span>
              <ChevronRight size={13} aria-hidden="true" className={cn("shrink-0 text-ink-secondary", teamPickerOpen && "rotate-90")} />
            </button>
            {teamPickerOpen && <div className="max-h-[min(12rem,35vh)] overflow-y-auto">
              {sectionNames.map((name) => <button key={name} type="button" aria-label={t("team.manageBotsIn", { name })}
                onClick={() => { importReturnRef.current?.focus(); setPlusOpen(false); setMoveToTeam(name); }}
                className="block w-full truncate py-2 pl-10 pr-3.5 text-left text-[13px] text-ink hover:bg-raised/70" title={name}>
                {name}
              </button>)}
            </div>}
          </>}
          {!remoteClient && <>
          <button
            onClick={() => {
              setPlusOpen(false);
              setTeamLibraryOpen(true);
            }}
            className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] text-ink hover:bg-raised/70"
          >
            <Library size={16} className="text-ink-secondary" />
            {t("sidebar.teamLibrary")}
          </button>
          {archivedBots.length > 0 && (
            <button
              onClick={() => {
                setPlusOpen(false);
                setArchivedBotsOpen(true);
              }}
              className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] text-ink hover:bg-raised/70"
            >
              <Archive size={16} className="text-ink-secondary" />
              <span className="flex-1">{t("sidebar.archived.title")}</span>
              <span className="text-[11.5px] text-ink-secondary">{archivedBots.length}</span>
            </button>
          )}
          </>}
        </div>
      </>
    )}
    </div>
  ;

  return (
    <aside
      ref={sidebarRef}
      tabIndex={-1}
      aria-label={t("sidebar.aria")}
      data-native-view-overlay
      data-sidebar
      style={{ "--sidebar-width": `${sizing.width}px` } as CSSProperties}
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-hairline/40 bg-panel",
        sizing.resizing ? "transition-none" : "transition-[width] duration-200",
        density === "icons" ? ("w-[80px]") : density === "compact" ? "w-[272px] md:w-[var(--sidebar-width)]" : ("w-[320px] md:w-[var(--sidebar-width)]"),
        sidePanelOpen ? density === "compact" ? "md:max-w-[272px]" : ("md:max-w-[320px]") : "md:max-w-[calc(100vw-320px)]",
        // max-md: rather than an md: cancel: Tailwind v4 emits the native `translate`, and any value but `none` makes
        // this a containing block for its `fixed` descendants.
        "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40",
        "max-md:transition-transform max-md:duration-200",
        open ? "max-md:translate-x-0" : "max-md:-translate-x-full",
      )}
    >
      <GlassScrollFrame className="flex-1">
      <GlassBar edge="top">
      <div
        data-sidebar-top-row
        className={cn(
          "flex items-center",
          density === "icons" ? "flex-col gap-1 px-2 pt-3.5 pb-1" : "relative pl-4 pr-2",
          density !== "icons" && "h-12",
        )}
        style={windowDragStyle}
      >
        
        {density !== "icons" && (
          <div data-sidebar-top-slot className="@container/sidebar-top flex min-w-0 flex-1 items-center justify-start">
            <div data-sidebar-top-switcher className={"flex min-w-0 max-w-[140px] items-center"}>
              <DesktopWorkspaceSwitcher inline pill={false} />
            </div>
          </div>
        )}
        {<div
          data-sidebar-top-buttons
          className={cn("relative flex shrink-0 items-center", density === "icons" ? "flex-col gap-1" : ("ml-0.5 gap-0.5"))}
          style={windowNoDragStyle}
        >
          {!collapseToIcons && (true) && <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={density === "icons" ? t("sidebar.density.expand") : t("sidebar.density.collapseAria")}
            className={cn(
              "flex items-center justify-center text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              density === "icons" ? "size-[46px] shrink-0 rounded-xl" : "size-8 rounded-md",
            )}
            title={density === "icons" ? t("sidebar.density.expand") : t("sidebar.density.collapse")}
          >
            {density === "icons" ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={17} />}
          </button>}
          {<div ref={attentionMenuRef} className={density === "icons" ? "relative" : "contents"}>
            <button
              type="button"
              onClick={() => setAttentionOpen((o) => !o)}
              aria-label={attentionTriggerLabel(attention.length)}
              title={attentionTriggerLabel(attention.length)}
              className={cn(
                "relative flex items-center justify-center text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                density === "icons" ? "size-[46px] shrink-0 rounded-xl" : "size-8 rounded-md",
              )}
            >
              <Activity size={density === "icons" ? 20 : 17} strokeWidth={2} />
              {attention.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-0.5 text-[9.5px] font-semibold leading-4 text-ink">{attention.length > 9 ? "9+" : attention.length}</span>
              )}
              {attentionHasRunningWork(attention) && (
                <span data-header-activity="" className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full bg-success" aria-hidden="true" />
              )}
            </button>
            {attentionMotion.shown && (
              <>
                <div className={cn(
                  "absolute top-full z-40 mt-1 overflow-hidden rounded-xl border border-hairline/50 bg-menu py-1.5 shadow-2xl shadow-black/60",
                  density === "icons" ? "left-0" : "right-0",
                  density === "icons" ? "w-72" : density === "compact" ? "w-60 md:w-[min(240px,calc(var(--sidebar-width)_-_32px))]" : "w-72 md:w-[min(288px,calc(var(--sidebar-width)_-_32px))]",
                  attentionMotion.className,
                )} {...attentionMotion.exitProps}>
                  <div className="flex items-center gap-1 pb-1 pl-3.5 pr-2 pt-1.5">
                    <span className="flex-1 text-[13px] font-medium text-ink">{t("attention.title")}</span>
                    <button
                      type="button"
                      onClick={() => setAttentionPinned(!attentionPinned)}
                      aria-label={t(attentionPinned ? "attention.unpin" : "attention.pin")}
                      title={t(attentionPinned ? "attention.unpin" : "attention.pin")}
                      className="flex size-6 items-center justify-center rounded text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {attentionPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                  </div>
                  {attention.length === 0 ? (
                    <div className="px-3.5 py-2.5 text-[13px] text-ink-secondary">{t("attention.empty")}</div>
                  ) : (
                    <AttentionThreadRows entries={attention} onJump={(entry) => { setAttentionOpen(false); dispatch(attentionJumpAction(entry)); }} />
                  )}
                </div>
              </>
            )}
          </div>}
          {plusControl}
        </div>}
      </div>

      <OrganizationIdentity compact={density === "icons"} />

      {universalPins && pinnedBots.length > 0 && (
        <div
          data-sidebar-universal-pins=""
          // vh, not %: a percentage has no height to resolve against inside the glass head.
          className="max-h-[min(40vh,280px)] shrink-0 overflow-y-auto border-b border-hairline/40 px-2 pb-2"
        >
          {density !== "icons" && !pinnedCircles && (
            <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-secondary">
              {t("sidebar.section.pinned")}
            </div>
          )}
          <PinnedBotRoster
            bots={pinnedBots}
            density={density}
            circles={pinnedCircles}
            row={botRow}
            listItem={BotListItem}
          />
        </div>
      )}

      {attentionPinned && density !== "icons" && (
        <SidebarAttentionPanel
          entries={attention}
          density={density}
          onUnpin={() => setAttentionPinned(false)}
          onJump={(entry) => dispatch(attentionJumpAction(entry))}
          collapsed={sectionCollapsed(ATTENTION_SECTION_ID)}
          onToggle={layoutInteractive ? () => toggleSection(ATTENTION_SECTION_ID) : undefined}
        />
      )}

      {density !== "icons" && (
        <SidebarPinnedThreadsPanel
          entries={pinnedThreads}
          density={density}
          now={now}
          onJump={(entry) => dispatch(attentionJumpAction(entry))}
          onUnpin={(entry) => dispatch(attentionUnpinAction(entry))}
          collapsed={sectionCollapsed(PINNED_THREADS_SECTION_ID)}
          onToggle={layoutInteractive ? () => toggleSection(PINNED_THREADS_SECTION_ID) : undefined}
        />
      )}
      </GlassBar>

      {density !== "icons" && <SidebarResizeHandle sizing={sizing} sidebarRef={sidebarRef} style={windowNoDragStyle} />}
      

      <GlassScroller className={"px-2"}>
        <div className={cn("flex flex-col", ("gap-0.5"))}>
          {unsectionedChief && (
            <div className="mb-1.5">
              <BotListItem {...botRow(unsectionedChief)} />
            </div>
          )}
          {sectionIds.map((id, index) => {
            const sectionName = userSectionName(id);
            const sectionChiefItems = sectionName
              ? sectionChiefs.filter((bot) => bot.section === sectionName)
              : [];
            const sectionBotItems =
              id === PINNED_SECTION_ID
                ? pinnedBots
                : id === BOTS_SECTION_ID
                  ? unsectionedBots
                  : sectionName
                    ? sectionedBots.filter((bot) => bot.section === sectionName)
                    : [];
            const headless = id === BOTS_SECTION_ID;
            const collapsed = !headless && sectionCollapsed(id);
            const queued = collapsed ? [...sectionChiefItems, ...sectionBotItems].flatMap((bot) =>
              sidebarBotActivityTasks(bot, state.pendingQueued).filter((task) => task.queued).map((task) => `${bot.name}: ${task.title}`)) : [];
            const attention = collapsed
              ? sidebarSectionAttention(
                  [...sectionChiefItems, ...sectionBotItems],
                )
              : undefined;
            return (
              <div
                key={id}
                data-sidebar-section-id={id}
                onDragOver={(event) => updateSectionDropTarget(event, id)}
                onDrop={dropSection}
                className={cn(
                  "flex flex-col",
                  ("gap-0.5"),
                  density !== "icons" && index > 0 && true && "pt-3",
                )}
              >
                
                {dropTarget?.id === id && dropTarget.place === "before" && draggingSectionId !== id && (
                  <div className="mx-2 h-0.5 rounded-full bg-accent" />
                )}
                {density !== "icons" && !headless && (
                  <SidebarSectionHeader
                    name={sectionLabel(id)}
                    line={false}
                    onMenu={undefined}
                    menuOpen={teamMenu !== null && teamMenu.name === sectionName}
                    onContextMenu={!remoteClient && layoutInteractive && sectionName ? (event) => {
                      event.preventDefault();
                      openTeamMenu(sectionName, event.clientX, event.clientY, event.currentTarget.querySelector<HTMLElement>("button") ?? event.currentTarget);
                    } : undefined}
                    collapsed={collapsed}
                    attention={attention}
                    onToggle={layoutInteractive ? () => toggleSection(id) : undefined}
                    reorderable={layoutInteractive && reorderableIds.length > 1 && reorderableIds.includes(id)}
                    dragging={draggingSectionId === id}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-openmausbot-sidebar-section", id);
                      event.dataTransfer.setData("text/plain", id);
                      sectionDragRef.current = { from: id, over: null };
                      setDraggingSectionId(id);
                    }}
                    onDragEnd={resetSectionDrag}
                    onMove={(direction) => moveSidebarSection(id, direction)}
                  />
                )}
                {collapsed && queued.length > 0 && <button type="button" onClick={() => toggleSection(id)}
                  title={`${t("task.queued")} · ${queued.join(", ")}`} aria-label={`${t("sidebar.section.expand", { name: sectionLabel(id) })} · ${t("task.queued")} · ${queued.join(", ")}`}
                  className="mx-3 mb-1 inline-flex h-7 items-center self-start rounded-full bg-raised/50 px-3 text-[13px] font-medium leading-4 text-ink-secondary hover:text-ink">{t("task.queued")} · {queued.length}</button>}
                {!collapsed && (
                  <>
                    {sectionChiefItems.map((bot) => <BotListItem key={bot.id} {...botRow(bot)} />)}
                    {id === PINNED_SECTION_ID ? (
                      <PinnedBotRoster
                        bots={sectionBotItems}
                        density={density}
                        circles={pinnedCircles}
                        row={botRow}
                        listItem={BotListItem}
                      />
                    ) : sectionBotItems.map((bot) => <BotListItem key={bot.id} {...botRow(bot)} />)}
                  </>
                )}
                {dropTarget?.id === id && dropTarget.place === "after" && draggingSectionId !== id && (
                  <div className="mx-2 h-0.5 rounded-full bg-accent" />
                )}
              </div>
            );
          })}
          {showPinnedCircleThreads && (
            <PinnedCircleThreadSection
              bots={pinnedBots}
              collapsed={pinnedCircleThreadsCollapsed}
              onToggle={() => setPinnedCircleThreadsCollapsed((collapsed) => !collapsed)}
              row={botRow}
            />
          )}
        </div>
      </GlassScroller>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {reorderAnnouncement}
      </p>

      <GlassBar edge="bottom">
      

      {<div className={cn("pb-3 pt-2", density === "icons" ? "flex flex-col items-center gap-1 px-2" : "px-3")}>
        {density === "icons" ? (
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => dispatch({ type: "toggleNewBot", open: true })}
              aria-label={t("sidebar.newBot")}
              title={t("sidebar.newBot")}
              className="flex size-[46px] shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-raised hover:text-ink"
            >
              <BotIcon size={20} />
            </button>
            <SidebarAppsButton />
            <SidebarProfileMenu iconOnly />
          </div>
        ) : (
          <div className="flex items-center gap-1 not-first:mt-3">
            <div className="min-w-0 flex-1">
              <SidebarProfileMenu />
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "toggleNewBot", open: true })}
              title={t("sidebar.newBot")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-secondary hover:bg-raised hover:text-ink"
            >
              <BotIcon size={16} />
              <span>{t("sidebar.newBot")}</span>
            </button>
            <SidebarAppsButton />
          </div>
        )}
      </div>}
      </GlassBar>
      </GlassScrollFrame>

      <BotContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onArchive={requestArchive}
          onDelete={(bot) => setConfirm({ kind: "delete", bot })}
          onMoveToSection={(botId) => {
            if (!menu) return;
            setSectionPicker({ botId, x: menu.x, y: menu.y });
          }}
        />
      <ConfirmDialog
        open={confirm !== null}
        {...(confirm ? botConfirmCopy(confirm.kind, confirm.bot.name) : botConfirmCopy("archive", ""))}
        icon={confirm?.kind === "delete" ? <Trash2 size={18} /> : <Archive size={18} />}
        onCancel={cancelConfirm}
        returnFocusRef={sidebarRef}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, bot } = confirm;
          setConfirm(null);
          if (kind === "archive") void archiveBot(bot);
          else dispatch({ type: "deleteBot", botId: bot.id });
        }}
      />
      {newTeam && <TeamDialog onClose={() => setNewTeam(false)} />}
      {renameTeam && <TeamDialog section={renameTeam} rename onRenamed={renamedTeam} onClose={() => setRenameTeam(null)} />}
      {teamMotion.shown && teamMotion.value && createPortal(<div className={cn("fixed inset-0 z-40", teamMotion.closing && "pointer-events-none")} onMouseDown={closeTeamMenu}>
        <div role="menu" aria-label={teamMotion.value.name} style={{ left: teamMotion.value.x, top: teamMotion.value.y }}
          className={cn("absolute w-[256px] rounded-xl border border-hairline/50 bg-menu p-1.5 text-ink shadow-xl", teamMotion.className)} {...teamMotion.exitProps}
          onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
            if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closeTeamMenu(); return; }
            navigateThreadMenu(event);
          }}>
          <TeamMenuItems
            onRename={() => { closeTeamMenu(); setRenameTeam(teamMotion.value!.name); }}
            onDelete={() => { closeTeamMenu(); setDeletingTeam(teamMotion.value!.name); }}
          />
        </div>
      </div>, document.body)}
      <ConfirmDialog open={deletingTeam !== null} title={t("team.deleteTitle", { name: deletingTeam ?? "" })}
        body={t("team.deleteKeepBotsDescription")} confirmLabel={t("team.delete")} returnFocusRef={sidebarRef}
        pending={teamDeletePending}
        onCancel={() => { if (!teamDeleteRunning.current) setDeletingTeam(null); }} onConfirm={() => {
          const name = deletingTeam;
          if (!name || teamDeleteRunning.current) return;
          teamDeleteRunning.current = true;
          setTeamDeletePending(true);
          void api(`/api/sidebar-sections?section=${encodeURIComponent(name)}`, { method: "DELETE" })
            .then(({ sections }) => { dispatch({ type: "sectionDeleted", section: name, sections }); setDeletingTeam(null); })
            .catch(cause => setTeamFeedback({ error: true, text: cause instanceof Error ? cause.message : String(cause) }))
            .finally(() => { teamDeleteRunning.current = false; setTeamDeletePending(false); });
        }} />
      {moveToTeam && <TeamDialog section={moveToTeam} onClose={() => setMoveToTeam(null)} />}
      <SectionPicker
          current={sectionPicker ? state.bots.find((b) => b.id === sectionPicker.botId)?.section : undefined}
          anchor={sectionPicker}
          onClose={() => setSectionPicker(null)}
          onAssign={(section) => {
            if (!sectionPicker) return;
            if (!remoteClient) {
              dispatch({ type: "updateBot", botId: sectionPicker.botId, patch: { section } });
              return;
            }
            void api("/api/sidebar-sections", {
              method: "POST",
              body: JSON.stringify({ name: section, botIds: [sectionPicker.botId] }),
            })
              .then(({ bots }) => bots.forEach((bot: Bot) => dispatch({ type: "botPatched", bot })))
              .catch((cause) => dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }));
          }}
        />
      {!remoteClient && archivedBotsOpen && (
        <ArchivedBotsPanel
          bots={archivedBots}
          onClose={() => setArchivedBotsOpen(false)}
          onRestored={(message) => setTeamFeedback({ error: false, text: message })}
        />
      )}
      {!remoteClient && teamLibraryOpen && (
        <TeamLibraryPanel
          returnFocusRef={importReturnRef}
          onClose={() => {
            setTeamLibraryOpen(false);
          }}
          onImported={(result) => {
            setTeamLibraryOpen(false);
            setTeamFeedback({
              error: false,
              text:
                (result.members === 0 && result.presets
                  ? t("sidebar.presetsImported", { count: result.presets })
                  : result.members === 1
                  ? t("sidebar.teamImportedOne")
                  : t("sidebar.teamImportedMany", { count: result.members })) +
                (result.connections ? ` · ${t("sidebar.connectionsToFinish", { count: result.connections })}` : ""),
            });
          }}
        />
      )}
      {teamFeedback &&
        createPortal(
          <div
            role="status"
            className={cn(
              "fixed bottom-4 left-4 z-[60] max-w-[300px] rounded-xl border px-3.5 py-2.5 text-[13px] shadow-xl",
              teamFeedback.error
                ? "border-danger/30 bg-card text-danger"
                : "border-hairline/50 bg-card text-ink",
            )}
          >
            <div className="flex items-center gap-3">
              <span>{teamFeedback.text}</span>
              {pendingBotUndo && (
                <button
                  onClick={() => void undoBotArchive(pendingBotUndo)}
                  className="rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-raised"
                >
                  {t("common.undo")}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}
