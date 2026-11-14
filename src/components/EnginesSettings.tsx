import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, useStore, type InstanceInfo } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { agentCliInstances, agentCliName, type CliProbe } from "@/lib/agent-cli";
import { InstanceProviderMark } from "./ProviderIcons";

function CliRow({ instance, probe, checking, error, onDetect }: {
  instance: InstanceInfo;
  probe?: CliProbe;
  checking: boolean;
  error?: string;
  onDetect: () => void;
}) {
  const name = agentCliName(instance);
  const detected = probe?.ok === true;
  return <article data-agent-cli={instance.instanceId} className="min-w-0 rounded-xl border border-hairline/50 bg-card px-4 py-3">
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel">
        <InstanceProviderMark instance={instance} size={23} />
      </span>
      <h2 className="min-w-0 flex-1 text-[14px] font-medium text-ink">{name}</h2>
      {detected && <span className="text-[12px] text-ink-secondary">{probe.version}</span>}
      <span role="status" className={cn("shrink-0 text-[12px]", detected ? "text-success" : probe?.error ? "text-warning" : "text-ink-secondary")}>
        {checking ? t("common.checking") : t(detected ? "agentCli.detected" : probe?.error ? "agentCli.detectionFailed" : probe ? "agentCli.missing" : "agentCli.notChecked")}
      </span>
      <button type="button" onClick={onDetect} disabled={checking} className="ui-icon-button shrink-0" aria-label={t("agentCli.detectName", { name })} title={t("agentCli.detectName", { name })}>
        <RefreshCw size={14} className={cn(checking && "animate-spin")} />
      </button>
    </div>
    {detected && !checking && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline/40 pt-3">
      {instance.models.options.length ? instance.models.options.map(model => <span key={model.id} className="max-w-full break-all rounded-md bg-control px-2 py-1 text-[12px] text-ink-secondary" title={model.id}>{model.label || model.id}</span>) : <span className="text-[12px] text-ink-secondary">{t("model.simple.noModels")}</span>}
    </div>}
    {error && <p role="alert" className="mt-2 break-words text-[12px] text-danger">{error}</p>}
  </article>;
}

export function EnginesSettings() {
  const { state, refreshInstances } = useStore();
  const [probes, setProbes] = useState<Record<string, CliProbe>>({});
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const instances = agentCliInstances(state.instances);
  const signature = instances.map(instance => `${instance.instanceId}:${instance.cli || instance.cliDefault}`).join("|");
  const generation = useRef<Record<string, number>>({});
  const mounted = useRef(true);
  const instancesRef = useRef(instances);
  instancesRef.current = instances;

  const detect = async (targets: InstanceInfo[]) => {
    const pending = new Map(targets.map(instance => {
      const next = (generation.current[instance.instanceId] ?? 0) + 1;
      generation.current[instance.instanceId] = next;
      return [instance.instanceId, next];
    }));
    setChecking(previous => new Set([...previous, ...pending.keys()]));
    setError(null);
    await Promise.all(targets.map(async instance => {
      const id = instance.instanceId;
      const current = () => mounted.current && generation.current[id] === pending.get(id);
      let probe: CliProbe;
      let modelError = "";
      try {
        probe = await api("/api/cli-test", { method: "POST", body: JSON.stringify({ cli: instance.cli || instance.cliDefault, driver: instance.driverKind }) });
        if (probe.ok && current()) {
          try { await api(`/api/instances/${encodeURIComponent(id)}/refresh-models`, { method: "POST" }); }
          catch (cause) { modelError = cause instanceof Error ? cause.message : String(cause); }
        }
      } catch (cause) {
        probe = { ok: false, error: true, message: cause instanceof Error ? cause.message : String(cause) };
      }
      if (!current()) return;
      setProbes(previous => ({ ...previous, [id]: probe }));
      setErrors(previous => ({ ...previous, [id]: modelError || (probe.error ? t("agentCli.detectionUnavailable") : "") }));
      setChecking(previous => { const next = new Set(previous); next.delete(id); return next; });
    }));
    if (!mounted.current) return;
    try { await refreshInstances({ reportErrors: true }); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    void detect(instancesRef.current);
    // A refreshed model catalog does not need another executable probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return <div className="flex min-w-0 flex-col gap-4 pb-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t("agentCli.title")}</h1>
      <button type="button" className="ui-button" onClick={() => void detect(instancesRef.current)} disabled={checking.size > 0}>
        <RefreshCw size={14} className={cn(checking.size > 0 && "animate-spin")} />{t("agentCli.detectAll")}
      </button>
    </div>
    {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    <div className="flex flex-col gap-2">
      {instances.map(instance => <CliRow key={instance.instanceId} instance={instance} probe={probes[instance.instanceId]} checking={checking.has(instance.instanceId)} error={errors[instance.instanceId]} onDetect={() => void detect([instance])} />)}
    </div>
  </div>;
}
