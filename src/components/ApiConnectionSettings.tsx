import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { api, useStore } from "@/state/store";
import { t } from "@/lib/i18n";
import { modelIds } from "./OpenAiCompatServers";
import { Select } from "./Select";

type Protocol = "openai" | "anthropic";
const OFFICIAL_URLS: Record<Protocol, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};
const INPUT = "w-full min-w-0 rounded-lg border border-hairline/60 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-1 focus:ring-focus disabled:opacity-50";

export function ApiConnectionSettings() {
  const { state, dispatch, refreshInstances } = useStore();
  const [protocol, setProtocol] = useState<Protocol>("openai");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [models, setModels] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const connections = state.instances.filter(instance => instance.apiProtocol
    || (instance.driverKind === "openai-compat" && instance.instanceId.startsWith("openai-compat-"))
    || (instance.driverKind === "claudeAgent" && instance.instanceId.startsWith("anthropic-compat-")));

  const run = async (action: string, request: () => Promise<{ instances?: unknown }>, saved?: () => void) => {
    if (busy) return;
    setBusy(action); setError(null); setNotice(null);
    try {
      const result = await request();
      if (Array.isArray(result.instances)) dispatch({ type: "instances", instances: result.instances });
      else await refreshInstances({ reportErrors: true });
      saved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !url.trim() || !key.trim() || busy) return;
    void run("add", () => api("/api/instances/api-endpoints", {
      method: "POST",
      body: JSON.stringify({ protocol, displayName: name.trim(), url: url.trim(), key: key.trim(),
        ...(modelIds(models).length ? { models: modelIds(models) } : {}) }),
    }), () => { setName(""); setUrl(""); setKey(""); setModels(""); setNotice(t("apiConnection.saved")); });
  };
  const field = (label: string, control: ReactNode) => <label className="flex min-w-0 flex-col gap-1.5 text-[12px] text-ink-secondary">{label}{control}</label>;

  return <div className="flex flex-col gap-4">
    {connections.length > 0 && <div className="flex flex-col gap-2" aria-label={t("apiConnection.savedConnections")}>
      {connections.map(connection => <div key={connection.instanceId} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-hairline/50 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-40">
          <div className="text-[13px] font-medium text-ink">{connection.displayName}</div>
          <div className="mt-0.5 text-[11px] text-ink-secondary">{connection.apiProtocol === "anthropic" || connection.driverKind === "claudeAgent" ? "Anthropic" : "OpenAI"} · {connection.models.options.length} {t("apiConnection.modelsCount")}</div>
          {connection.url && <div className="mt-1 truncate font-mono text-[11px] text-ink-secondary" title={connection.url}>{connection.url}</div>}
          {connection.snapshot.state === "unavailable" && connection.snapshot.reason && <p className="mt-1 text-[11px] text-warning">{connection.snapshot.reason}</p>}
        </div>
        <button type="button" className="ui-icon-button shrink-0" disabled={busy !== null}
          aria-label={t("apiInstances.refreshModels", { name: connection.displayName })}
          title={t("apiInstances.refreshModels", { name: connection.displayName })}
          onClick={() => void run(connection.instanceId, () => api(`/api/instances/${encodeURIComponent(connection.instanceId)}/refresh-models`, { method: "POST" }))}>
          {busy === connection.instanceId ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
        </button>
        <button type="button" className="ui-icon-button shrink-0 hover:text-danger" disabled={busy !== null}
          aria-label={t("apiInstances.remove", { name: connection.displayName })}
          title={t("apiInstances.remove", { name: connection.displayName })}
          onClick={() => { if (window.confirm(t("apiConnection.removeConfirm", { name: connection.displayName }))) void run(connection.instanceId, () => api(`/api/instances/${encodeURIComponent(connection.instanceId)}`, { method: "DELETE" })); }}>
          <Trash2 size={14} />
        </button>
      </div>)}
    </div>}
    <form onSubmit={add} className="flex flex-col gap-3" aria-label={t("apiConnection.addTitle")}>
      <div className="text-[14px] font-medium text-ink">{t("apiConnection.addTitle")}</div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {field(t("apiConnection.protocol"), <Select aria-label={t("apiConnection.protocol")} value={protocol} disabled={busy !== null} onChange={event => {
          const next = event.target.value as Protocol;
          setProtocol(next); setKey(""); setModels("");
          if (name === "OpenAI" || name === "Anthropic") setName(next === "openai" ? "OpenAI" : "Anthropic");
          if (Object.values(OFFICIAL_URLS).includes(url)) setUrl(OFFICIAL_URLS[next]);
        }}><option value="openai">OpenAI · Chat Completions</option><option value="anthropic">Anthropic · Messages</option></Select>)}
        {field(t("apiInstances.name"), <input aria-label={t("apiInstances.name")} value={name} onChange={event => setName(event.target.value)} required maxLength={80} disabled={busy !== null} placeholder={t("apiConnection.namePlaceholder")} className={INPUT} />)}
      </div>
      {field(t("apiConnection.baseUrl"), <input aria-label={t("apiConnection.baseUrl")} type="url" value={url} onChange={event => { setUrl(event.target.value); setKey(""); }} required maxLength={512} disabled={busy !== null} placeholder={protocol === "openai" ? "https://api.example.com/v1" : "https://api.example.com"} spellCheck={false} className={`${INPUT} font-mono`} />)}
      <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-secondary">
        <span>{t("apiConnection.urlHint")}</span>
        <button type="button" className="rounded text-accent-text underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" disabled={busy !== null} onClick={() => { setUrl(OFFICIAL_URLS[protocol]); setKey(""); if (!name) setName(protocol === "openai" ? "OpenAI" : "Anthropic"); }}>
          {t("apiConnection.useOfficial")}
        </button>
      </div>
      {field("API Key", <input aria-label="API Key" type="password" value={key} onChange={event => setKey(event.target.value)} required autoComplete="off" spellCheck={false} disabled={busy !== null} placeholder={t("apiConnection.keyPlaceholder")} className={INPUT} />)}
      {field(t("apiConnection.models"), <textarea aria-label={t("apiConnection.models")} value={models} onChange={event => setModels(event.target.value)} disabled={busy !== null} placeholder={t(protocol === "openai" ? "apiConnection.openaiModels" : "apiConnection.anthropicModels")} spellCheck={false} rows={2} className={`${INPUT} resize-y font-mono`} />)}
      <p className="text-[11px] leading-relaxed text-ink-secondary">{t(protocol === "openai" ? "apiConnection.modelHint" : "apiConnection.anthropicModelHint")}</p>
      <button type="submit" disabled={busy !== null || !name.trim() || !url.trim() || !key.trim()} className="ui-button ui-button-primary self-start disabled:opacity-50">
        {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{t("apiConnection.save")}
      </button>
    </form>
    {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    {notice && <p role="status" className="text-[12px] text-success">{notice}</p>}
  </div>;
}
