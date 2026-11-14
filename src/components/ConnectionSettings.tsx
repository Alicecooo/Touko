import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { useStore } from "@/state/store";
import { ApiKeyRow } from "./ApiKeys";
import { Card } from "./SettingsPrimitives";

function ConnectionCard({ title, children }: {
  title: LocaleKey;
  children: ReactNode;
}) {
  return <section aria-label={t(title)}>
    <Card title={t(title)}>{children}</Card>
  </section>;
}

export function AppConnectionSettings() {
  const { state, dispatch } = useStore();
  const configured = state.config?.composio?.configured === true;
  const managed = state.config?.composio?.mode === "managed";
  const openApps = (surface: "apps" | "mcp") => {
    dispatch({ type: "toggleAppSettings", open: false });
    dispatch({ type: "togglePlugins", open: true, surface });
  };
  return <>
    <ConnectionCard title="settings.api.appsTitle">
      <div className="flex flex-col gap-4">
        <div role="status" className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${configured ? "border-success/25 bg-success/10 text-success" : "border-hairline/60 bg-inset text-ink-secondary"}`}>
          {t(managed ? "settings.api.appsManaged" : configured ? "settings.api.appsReady" : "settings.api.appsMissing")}
        </div>
        <ApiKeyRow section="composio" />
        <div className="flex flex-wrap items-center gap-2">
          <a href="https://dashboard.composio.dev" target="_blank" rel="noopener noreferrer" className="ui-button">
            {t("keys.composio.link")}<ExternalLink size={12} aria-hidden="true" />
          </a>
          <button type="button" className="ui-button" onClick={() => openApps("apps")}>{t("settings.api.manageApps")}</button>
        </div>
      </div>
    </ConnectionCard>
    <ConnectionCard title="settings.api.mcpTitle">
      <button type="button" className="ui-button" onClick={() => openApps("mcp")}>{t("settings.api.manageMcp")}</button>
    </ConnectionCard>
  </>;
}
