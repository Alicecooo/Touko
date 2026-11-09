import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { useStore } from "@/state/store";
import { AnthropicEveryClaudeBot, ApiKeyRow, OpenAiCompatUrl, OpenCodeProviderKeys } from "./ApiKeys";
import { ApiConnectionSettings } from "./ApiConnectionSettings";
import { Card } from "./SettingsPrimitives";

const PROVIDERS = [
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["xai", "xAI"],
  ["openrouter", "OpenRouter"],
  ["mistral", "Mistral"],
  ["cerebras", "Cerebras"],
  ["groq", "Groq"],
  ["meta", "Meta"],
  ["openaiCompat", "OpenAI compatible"],
] as const;

function ConnectionCard({ title, description, children }: {
  title: LocaleKey;
  description: LocaleKey;
  children: ReactNode;
}) {
  return <section aria-label={t(title)}>
    <Card title={t(title)} subtitle={t(description)}>{children}</Card>
  </section>;
}

export function ModelApiSettings() {
  const { state, dispatch } = useStore();
  return <>
    <div className="flex flex-col items-start gap-2 rounded-xl border border-hairline/50 px-4 py-3 text-[12px] leading-relaxed text-ink-secondary sm:flex-row sm:items-center sm:gap-4">
      <p className="flex-1">{t("settings.api.accountsHint")}</p>
      <button type="button" className="ui-button shrink-0" onClick={() => dispatch({ type: "toggleAppSettings", open: true, section: "engines" })}>
        {t("settings.api.manageAccounts")}
      </button>
    </div>
    <ConnectionCard title="settings.api.modelsTitle" description="settings.api.modelsDescription">
      <ApiConnectionSettings />
    </ConnectionCard>
    {PROVIDERS.some(([provider]) => state.config?.[provider]?.configured) && <details className="rounded-xl border border-hairline/50 px-4 py-3">
      <summary className="cursor-pointer text-[13px] text-ink-secondary">{t("apiConnection.previous")}</summary>
      <div className="mt-4 flex flex-col gap-4">
        {PROVIDERS.filter(([provider]) => state.config?.[provider]?.configured).map(([provider]) => <div key={provider}>
          <ApiKeyRow section={provider} testProvider={provider} />
          {provider === "openaiCompat" && <OpenAiCompatUrl />}
          {provider === "anthropic" && <AnthropicEveryClaudeBot />}
        </div>)}
      </div>
    </details>}
  </>;
}

export function OpenCodeConnectionSettings() {
  const { state } = useStore();
  return (
    <ConnectionCard title="settings.api.opencodeTitle" description="settings.api.opencodeDescription">
      <div className="flex flex-col gap-3">
        <ApiKeyRow section="opencodeGo" />
        {state.config?.cloudHome !== true && <p className="text-[12px] leading-relaxed text-ink-secondary">
          {t("keys.opencode.providersHint").split("{command}").flatMap((part, index) =>
            index === 0 ? [part] : [<code key={index} className="font-mono">opencode auth login</code>, part])}
        </p>}
        <OpenCodeProviderKeys />
      </div>
    </ConnectionCard>
  );
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
    <ConnectionCard title="settings.api.appsTitle" description="settings.api.appsDescription">
      <div className="flex flex-col gap-4">
        <div role="status" className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${configured ? "border-success/25 bg-success/10 text-success" : "border-hairline/60 bg-inset text-ink-secondary"}`}>
          {t(managed ? "settings.api.appsManaged" : configured ? "settings.api.appsReady" : "settings.api.appsMissing")}
        </div>
        <ApiKeyRow section="composio" />
        <p className="text-[12px] leading-relaxed text-ink-secondary">{t("settings.api.appSaveHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <a href="https://dashboard.composio.dev" target="_blank" rel="noopener noreferrer" className="ui-button">
            {t("keys.composio.link")}<ExternalLink size={12} aria-hidden="true" />
          </a>
          <button type="button" className="ui-button" onClick={() => openApps("apps")}>{t("settings.api.manageApps")}</button>
        </div>
      </div>
    </ConnectionCard>
    <ConnectionCard title="settings.api.mcpTitle" description="settings.api.mcpDescription">
      <p className="mb-3 text-[12px] leading-relaxed text-ink-secondary">{t("settings.api.mcpHint")}</p>
      <button type="button" className="ui-button" onClick={() => openApps("mcp")}>{t("settings.api.manageMcp")}</button>
    </ConnectionCard>
  </>;
}
