import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Settings, X } from "lucide-react";
import { currentTaskBot, useStore, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

import { computerPanelTabs, readComputerPanelView, resolveComputerPanelView, writeComputerPanelView, type ComputerPanelView } from "@/lib/computer-panel-view";
import { useCaptionChrome } from "./DesktopCapabilities";

import { ComputerFilesPane } from "./ComputerFilesPane";
import { RoutinesSection } from "./bot-settings/RoutinesSection";

import { moveBetweenTabs, PANEL_TABS, panelTabProps, TAB_PANEL_FOCUS, tabPanelProps } from "./computer-panel-tabs";

const DataPanel = lazy(() => import("./data/DataPanel").then((module) => ({ default: module.DataPanel })));

const PANEL_WIDTH_KEY = "omb-computer-panel-width";
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 960;
const PANEL_DEFAULT_WIDTH = 400;
const PANEL_RESIZE_STEP = 40;

function readPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH && stored <= PANEL_MAX_WIDTH) return stored;
  } catch {
  }
  return PANEL_DEFAULT_WIDTH;
}

export function ComputerPanel({
  bot: profileBot,
}: {
  bot: Bot;
}) {
  const { padClass, dragProps } = useCaptionChrome();
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const resizeFrom = useRef<{ x: number; width: number } | null>(null);
  const persistPanelWidth = (width: number) => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
    }
  };
  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeFrom.current = { x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeFrom.current) return;
    const next = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, resizeFrom.current.width + (resizeFrom.current.x - event.clientX)));
    setPanelWidth(next);
  };
  const onResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeFrom.current) return;
    resizeFrom.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    persistPanelWidth(panelWidth);
  };
  const onResizeBy = (delta: number) => {
    setPanelWidth((current) => {
      const next = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, current + delta));
      persistPanelWidth(next);
      return next;
    });
  };
  const separatorRef = useRef<HTMLDivElement>(null);
  const [separatorWidth, setSeparatorWidth] = useState<number | null>(null);
  useEffect(() => {
    const panel = separatorRef.current?.closest("aside");
    if (!panel) return;
    const read = () => setSeparatorWidth(panel.offsetWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const onSeparatorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const widen = event.key === "ArrowLeft" ? PANEL_RESIZE_STEP : event.key === "ArrowRight" ? -PANEL_RESIZE_STEP : null;
    if (widen === null || separatorWidth === null) return;
    event.preventDefault();
    onResizeBy(widen);
  };
  const { state, dispatch } = useStore();
  const bot = currentTaskBot(profileBot);
  const [storedPanelView, setPanelView] = useState<ComputerPanelView>(() => readComputerPanelView(bot.id));
  const panelTabs = computerPanelTabs();
  const panelView = resolveComputerPanelView(storedPanelView);
  const requestedDataResult = state.dataResultFocus?.botId === bot.id ? state.dataResultFocus : undefined;
  const [dataRequest, setDataRequest] = useState<{ id: string; requestId: number }>();

  const chooseTab = (view: ComputerPanelView) => {

    setPanelView(view);
    writeComputerPanelView(bot.id, view);
  };

  const previousThread = useRef(bot.threadId);
  useEffect(() => {
    if (previousThread.current === bot.threadId) return;
    previousThread.current = bot.threadId;
    setPanelView("files");
    setDataRequest(undefined);

  }, [bot.threadId]);
  useEffect(() => {
    if (!requestedDataResult || requestedDataResult.consumed) return;
    setDataRequest(requestedDataResult);
    setPanelView("data");
    writeComputerPanelView(bot.id, "data");
    dispatch({ type: "dataResultFocusConsumed", requestId: requestedDataResult.requestId });
  }, [bot.id, dispatch, requestedDataResult]);

  return (
    <aside
      className="animate-panel-in relative flex h-full shrink-0 flex-col border-l border-hairline/40 bg-panel max-md:absolute max-md:inset-0 max-md:z-40 max-md:w-full!"
      style={{ width: panelWidth }}
    >
      <div
        ref={separatorRef}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("computer.resizeAria")}
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        aria-valuenow={separatorWidth ?? undefined}
        tabIndex={0}
        onKeyDown={onSeparatorKeyDown}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/40 focus-visible:bg-accent/60 max-md:hidden"
      />
      <div {...dragProps} className={cn("@container/paneltabs ml-1.5 py-3 pl-2.5 pr-4", padClass)}>
        <div className="relative flex min-h-7 items-center justify-center">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "toggleComputer", open: false });
              dispatch({ type: "toggleSettings", open: true, section: "access" });
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-secondary hover:bg-control hover:text-ink"
            title={t("computer.botSettings")}
          >
            <Settings size={18} />
          </button>
          <div
            className="mx-9 flex min-w-0 gap-0.5 overflow-x-auto rounded-full bg-inset p-1 [scrollbar-width:none]"
            data-testid="computer-tabs" role="tablist" aria-label={t("computer.tabsAria")}
            onKeyDown={(event) => moveBetweenTabs(event, panelTabs, chooseTab)}
          >
            {panelTabs.map((view) => {
              const { Icon, label, tour } = PANEL_TABS[view];
              return (
                <button
                  key={view} type="button" data-tour={tour} {...panelTabProps(view, view === panelView)}
                  title={t(label)} onClick={() => chooseTab(view)}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] @max-[28rem]/paneltabs:[&>svg]:hidden @max-[22rem]/paneltabs:px-2", view === panelView ? "bg-raised text-ink shadow-sm" : "text-ink-secondary hover:text-ink")}
                >
                  <Icon size={13} /> {t(label)}
                </button>
              );
            })}
          </div>
          <button
            type="button" onClick={() => dispatch({ type: "toggleComputer", open: false })}
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-secondary hover:bg-control hover:text-ink"
            aria-label={t("computer.close")} title={t("computer.close")}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {panelView === "routines" ? (
        <div {...tabPanelProps("routines")} className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", TAB_PANEL_FOCUS)}>
          <RoutinesSection key={bot.id} bot={bot} routines={state.routines.filter((routine) => routine.botId === bot.id)} runs={state.routineRuns} />
        </div>
      ) : panelView === "data" ? (
        <div {...tabPanelProps("data")} className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", TAB_PANEL_FOCUS)}>
          <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[13px] text-ink-secondary" role="status">{t("data.loading")}</div>}>
            <DataPanel key={bot.id} bot={bot} requestedCard={dataRequest} />
          </Suspense>
        </div>
      ) : (
        <div {...tabPanelProps("files")} className={cn("flex min-h-0 flex-1 flex-col", TAB_PANEL_FOCUS)}>
          <ComputerFilesPane bot={bot} />
        </div>
      )}
    </aside>
  );
}
