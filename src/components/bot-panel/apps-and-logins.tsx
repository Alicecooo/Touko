import { Plus } from "lucide-react";

import { withBotApp } from "@/lib/bot-app-access";
import { t } from "@/lib/i18n";

import { useStore, type Bot } from "@/state/store";
import { ServiceIcon } from "../PluginsPanel";

import type { BotApp, BotApps } from "../bot-settings/useBotApps";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { BotSwitch, Card, LinkRow, SwitchRow, rowCls } from "./rows";

type AppsDerived = Pick<
  ReturnType<typeof useBotSettingsDerived>,
  "patch" | "canUseConnectedApps" | "connectedAppsConfigured" | "connectedAppsEnabled"
>;

export function AppsCard({ bot, derived, apps, onOpenAccess }: {
  bot: Bot;
  derived: AppsDerived;
  apps: BotApps;
  onOpenAccess: () => void;
}) {
  const { dispatch } = useStore();
  const { patch, canUseConnectedApps, connectedAppsConfigured, connectedAppsEnabled } = derived;

  const toggleApp = (app: BotApp) => {
    const connectorScopes = withBotApp(bot.connectorScopes, apps.connectedSlugs, app.slug, app.scope === null);
    if (connectorScopes) patch({ connectorScopes });
  };
  const appsNote = !canUseConnectedApps
    ? t("botSettings.simple.appsCannot", { name: bot.name })
    : apps.phase === "loading"
      ? t("common.checking")
      : apps.phase === "unknown"
        ? t("botSettings.simple.appsUnknown")
        : apps.apps.length === 0
          ? t("botSettings.simple.appsNone")
          : undefined;

  return (
    <Card label={t("botSettings.simple.apps")} anchor="apps">
      <SwitchRow
        data-panel-row="apps"
        title={t("botSettings.simple.appsAllow", { name: bot.name })}
        hint={appsNote}
        color={bot.color}
        checked={connectedAppsEnabled}
        disabled={!connectedAppsEnabled && (!connectedAppsConfigured || !canUseConnectedApps)}
        onChange={() => patch({ composio: !connectedAppsEnabled })}
      />
      {apps.apps.map((app) => (
        <div key={app.slug} data-simple-app={app.slug} className={rowCls}>
          <ServiceIcon key={`${app.card.logo}:${app.card.domain}`} card={app.card} className="size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-ink">{app.label}</div>
            {(app.scope === "read" || app.blurb) && (
              <div className="truncate text-[12.5px] text-ink-secondary">
                {app.scope === "read" ? t("botSettings.simple.appReadOnly") : app.blurb}
              </div>
            )}
          </div>
          <BotSwitch
            color={bot.color}
            checked={app.scope !== null}
            aria-label={t("botSettings.simple.appToggle", { name: bot.name, app: app.label })}
            disabled={!connectedAppsEnabled}
            onClick={() => toggleApp(app)}
            className="disabled:cursor-not-allowed"
          />
        </div>
      ))}
      <LinkRow data-panel-link="apps" onClick={onOpenAccess}>{t("botPanel.appAccess")}</LinkRow>
      <LinkRow
        data-panel-link="add-app"
        icon={Plus}
        onClick={() => {
          dispatch({ type: "toggleSettings", open: false });
          dispatch({ type: "togglePlugins", open: true, surface: "apps" });
        }}
      >
        {t("botSettings.simple.addApp")}
      </LinkRow>
    </Card>
  );
}
