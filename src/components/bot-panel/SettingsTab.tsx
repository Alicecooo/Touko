import { type ReactNode } from "react";
import { Check, FileCode2, FolderOpen, Puzzle, SlidersHorizontal, Slack } from "lucide-react";

import { t } from "@/lib/i18n";
import { requestNotificationPermission } from "@/lib/notify";
import type { Bot } from "@/state/store";
import { UsageSection } from "../bot-settings/UsageSection";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { PAGES, type PageId } from "./page-registry";
import { Card, ColRow, NavRow, SwitchRow } from "./rows";

type Derived = ReturnType<typeof useBotSettingsDerived>;

export function SettingsTab({ bot, derived, slackUrl, onOpen }: {
  bot: Bot;
  derived: Derived;
  slackUrl: string | null;
  onOpen: (page: PageId) => void;
}) {
  const { patch } = derived;
  const alwaysAllowed = bot.alwaysAllow?.length ?? 0;
  const none = t("botPanel.none");
  const name = bot.name;

  const page = (key: PageId, icon: Parameters<typeof NavRow>[0]["icon"], value?: ReactNode): ReactNode => {
    const title = t(PAGES[key].title, { name });
    return <NavRow key={key} data-panel-page={key} icon={icon} title={title} value={value} onClick={() => onOpen(key)} />;
  };

  const cards: Array<{ label: string | null; anchor: string; rows: ReactNode[] }> = [
    { label: t("botPanel.card.profile"), anchor: "profile", rows: [
      page("folder", FolderOpen),
      <SwitchRow
        key="notify"
        data-panel-row="notify"
        title={t("notifications.title")}
        color={bot.color}
        checked={bot.notifications}
        onChange={() => {
          const enabled = !bot.notifications;
          if (enabled) void requestNotificationPermission();
          patch({ notifications: enabled });
        }}
      />,
    ] },
    { label: t("botPanel.card.tools"), anchor: "tools", rows: [
      page("mcp", Puzzle, bot.mcpServers == null ? t("botPanel.all") : bot.mcpServers.length),
      page("tools", SlidersHorizontal),
      page("always", Check, alwaysAllowed || none),
    ] },
    ...(slackUrl ? [{ label: t("botPanel.card.sharing"), anchor: "sharing", rows: [
      page("slack", Slack),
    ] }] : []),
    { label: t("botPanel.card.activity"), anchor: "activity", rows: [
      <ColRow key="usage" data-panel-row="usage"><UsageSection bot={bot} bare /></ColRow>,
      page("prompt", FileCode2),
    ] },
  ];

  return (
    <div data-panel-tabpanel="settings">
      {cards.map((card) => (
        <Card key={card.anchor} label={card.label ?? undefined} anchor={card.anchor}>{card.rows}</Card>
      ))}
    </div>
  );
}
