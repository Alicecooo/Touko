import { useEffect, useRef } from "react";

import { useStore, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { useCaptionChrome } from "./DesktopCapabilities";
import { useBotSettingsDerived } from "./bot-settings/useBotSettingsDerived";
import { useSlackManagementUrl } from "./bot-settings/useSlackManagement";
import { BotPanel } from "./bot-panel/PanelShell";

export function BotSettingsDialog({ bot, overlay = false }: {
  bot: Bot;
  overlay?: boolean;
}) {
  const { state, dispatch } = useStore();
  const derived = useBotSettingsDerived(bot);
  const dialogRef = useRef<HTMLElement | null>(null);
  const { padClass } = useCaptionChrome();
  const linkedSection = state.botSettingsExpandAccordion && !state.botSettingsExpandRemembered
    ? state.botSettingsSection : null;
  const slackUrl = useSlackManagementUrl(bot.id);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (event: KeyboardEvent) => {
      const nested = dialog?.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if (nested && nested.getClientRects().length > 0) return;
      // BotInstructionsDialog portals to document.body: a key pressed with focus outside this dialog is not ours.
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) return;
      // A popover or field inside that already handled this Escape keeps the panel open.
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        dispatch({ type: "toggleSettings", open: false });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [dispatch]);


  return (
    <aside
      ref={dialogRef}
      role="dialog"
      aria-labelledby="bot-settings-title"
      tabIndex={-1}
      className={cn(
        "animate-panel-in absolute inset-0 z-40 flex h-full min-w-0 flex-col border-l border-hairline/40 bg-panel outline-none focus-visible:outline-none",
        overlay
          ? "md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[min(420px,42vw)] md:shadow-2xl"
          : "md:static md:z-auto md:w-[min(420px,42vw)] md:shrink-0",
      )}
    >
      <BotPanel
        bot={bot}
        derived={derived}
        headerClassName={padClass}
        slackUrl={slackUrl}
        linkedSection={linkedSection}
        onClose={() => dispatch({ type: "toggleSettings", open: false })}
      />
    </aside>
  );
}
