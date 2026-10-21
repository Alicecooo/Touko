import { useEffect, useRef, useState } from "react";
import { Check, Server, Laptop, Loader2, Trash2 } from "lucide-react";
import { Card } from "./SettingsPrimitives";
import { t } from "@/lib/i18n";

type SavedWorkspaces = Awaited<ReturnType<NonNullable<NonNullable<Window["ogb"]>["environments"]>["state"]>>;

export function ConnectedWorkspacesSettings() {
  const bridge = window.ogb?.environments;
  // Security: the desktop bridge alone is not enough; never offer access the server refuses.
  
  const [saved, setSaved] = useState<SavedWorkspaces | null>(null);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [envName, setEnvName] = useState("");
  const [envDir, setEnvDir] = useState("");
  const [envForget, setEnvForget] = useState<string | null>(null);
  const [envPurge, setEnvPurge] = useState(false);
  const [envError, setEnvError] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    void bridge?.state().then((state) => { if (generation.current === current) setSaved(state); })
      .catch(() => { if (generation.current === current) setError(t("servers.loadFailed")); });
    return () => { generation.current++; };
  }, [bridge]);
  
  const perform = async (action: () => Promise<unknown>, fail: (message: string) => void = setError) => {
    if (pending.current || !bridge) return;
    pending.current = true; setBusy(true); setError(""); setEnvError("");
    const current = generation.current;
    try {
      // Security: a successful switch unloads this renderer; never ask for its privileged saved list again after the
      // origin changes.
      if (await action() === true) return;
      const state = await bridge.state();
      if (generation.current === current) setSaved(state);
    } catch (nextError) {
      if (generation.current === current) fail(String((nextError as Error)?.message ?? nextError)
        .replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, ""));
    } finally {
      pending.current = false;
      if (generation.current === current) setBusy(false);
    }
  };
  if (!bridge) return <p className="text-[13px] text-ink-secondary">{t("servers.desktopOnly")}</p>;
  const confirmAction = (message: string) => window.ogb?.confirm ? window.ogb.confirm(message) : window.confirm(message);
  
  const locals = saved?.environments.filter(entry => entry.kind === "local") ?? [];
  const forgetEntry = locals.find(entry => entry.id === envForget);
  return <>
    <p className="text-[13px] leading-relaxed text-ink-secondary">{t("servers.description")}</p>
    {saved?.packaged && <Card title={t("servers.localTitle")} subtitle={t("servers.localSubtitle")}>
      {envError && <p role="alert" className="text-[12px] text-danger">{envError}</p>}
      {locals.length > 0 && <ul className="divide-y divide-hairline/40">
        {locals.map((entry) => {
          const active = entry.id === saved.activeId;
          return <li key={entry.id} className="flex items-center gap-3 py-3">
            <Laptop size={18} className="shrink-0 text-ink-secondary" />
            <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-ink">{entry.name}</div>
              <div className="break-all text-[12px] text-ink-secondary">{entry.dataDir}
                {entry.missing && <span className="ml-2 rounded-md bg-inset px-1.5 py-0.5 text-[11px]">{t("servers.missing")}</span>}</div></div>
            {active ? <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-secondary"><Check size={13} />{t("servers.current")}</span> :
              <button type="button" disabled={busy} aria-label={t("servers.switchTo", { name: entry.name })}
                onClick={() => void perform(async () => {
                  if (!await confirmAction(t("servers.confirmSwitch", { name: entry.name }))) return;
                  const result = await bridge.switch(entry.id);
                  if (result && result.ok === false) throw new Error(t("servers.switchFailed"));
                  return true;
                }, setEnvError)}
                className="rounded-md px-2 py-1.5 text-[12px] text-ink hover:bg-control disabled:opacity-50">{t("servers.switch")}</button>}
            {!active && <button type="button" disabled={busy} aria-label={t("servers.forgetNamed", { name: entry.name })} title={t("servers.forgetNamed", { name: entry.name })}
              onClick={() => { setEnvForget(entry.id); setEnvPurge(false); }}
              className="rounded-md p-1.5 text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50"><Trash2 size={14} /></button>}
          </li>;
        })}
      </ul>}
      {forgetEntry && <div className="mt-3 rounded-lg border border-hairline/40 p-3">
        <label className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-secondary">
          <input type="checkbox" checked={envPurge} disabled={busy} className="mt-0.5" onChange={(event) => setEnvPurge(event.target.checked)} />
          {t("servers.alsoDelete", { path: forgetEntry.dataDir ?? "" })}
        </label>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void perform(async () => {
            const result = envPurge ? await bridge.forget(forgetEntry.id, true) : await bridge.forget(forgetEntry.id);
            if (result && result.ok === false) throw new Error(t("servers.forgetFailed"));
            setEnvForget(null);
          }, setEnvError)} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-danger hover:bg-control disabled:opacity-50">{t("servers.forget")}</button>
          <button type="button" onClick={() => setEnvForget(null)} className="rounded-lg px-3 py-1.5 text-[12px] text-ink hover:bg-control">{t("common.cancel")}</button>
        </div>
      </div>}
      <p className="mt-4 text-[13px] font-medium text-ink">{t("servers.newEnvironment")}</p>
      <form className="flex flex-col gap-3 pt-2" onSubmit={(event) => {
        event.preventDefault();
        if (!envName.trim()) return;
        void perform(async () => {
          const created = await bridge.create(envName.trim(), envDir.trim() || undefined);
          if (!created?.ok) throw new Error(t("servers.createFailed"));
          setEnvName(""); setEnvDir("");
        }, setEnvError);
      }}>
        <label className="flex flex-col gap-1.5 text-[12px] text-ink-secondary">{t("servers.name")}<input required value={envName} disabled={busy} maxLength={60} onChange={(event) => setEnvName(event.target.value)} placeholder={t("servers.namePlaceholder")}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink outline-none focus:border-accent/50" />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] text-ink-secondary">{t("servers.dataFolder")}<span className="flex gap-2">
            <input value={envDir} disabled={busy} onChange={(event) => setEnvDir(event.target.value)} placeholder={t("servers.folderPlaceholder")}
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink outline-none focus:border-accent/50" />
            <button type="button" disabled={busy} onClick={() => void perform(async () => {
              const picked = await bridge.pickDir();
              if (picked?.ok && picked.path) setEnvDir(picked.path);
            }, setEnvError)} className="shrink-0 rounded-lg border border-hairline/40 px-3 text-[12px] text-ink hover:bg-control disabled:opacity-50">{t("servers.choose")}</button>
          </span>
        </label>
        <button type="submit" disabled={busy || !envName.trim()} className="flex w-fit items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />}{t("servers.create")}</button>
      </form>
    </Card>}
    <Card title={t("servers.savedTitle")} subtitle={t("servers.savedSubtitle")}>
      {!saved ? <p role="status" className="text-[13px] text-ink-secondary">{error ? t("servers.savedFailed") : t("servers.loading")}</p> :
        <ul className="divide-y divide-hairline/40">
          {[{ id: "local", name: t("serverSwitcher.thisComputer"), origin: "", color: undefined }, ...saved.environments.filter((entry) => entry.kind !== "local")].map((entry) => {
            const active = entry.id === saved.activeId;
            const Icon = entry.id === "local" ? Laptop : Server;
            return <li key={entry.id} className="flex items-center gap-3 py-3">
              {<Icon size={18} className="shrink-0 text-ink-secondary" />}
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-ink">{entry.name}</div>
                <div className="break-all text-[12px] text-ink-secondary">{entry.origin || t("servers.localData")}</div></div>
              {active ? <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-secondary"><Check size={13} />{t("servers.current")}</span> :
                <button type="button" disabled={busy} aria-label={t("servers.switchTo", { name: entry.name })} onClick={() => void perform(async () => { await bridge.switch(entry.id); return true; })}
                  className="rounded-md px-2 py-1.5 text-[12px] text-ink hover:bg-control disabled:opacity-50">{t("servers.switch")}</button>}

              {entry.id !== "local" && <button type="button" disabled={busy} aria-label={t("servers.forgetNamed", { name: entry.name })} title={t("servers.forgetNamed", { name: entry.name })}
                onClick={() => void perform(() => bridge.forget(entry.id))} className="rounded-md p-1.5 text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50"><Trash2 size={14} /></button>}
            </li>;
          })}
        </ul>}
    </Card>

    <Card title={t("servers.connectTitle")} subtitle={t("servers.connectSubtitle")}>
      <form className="flex flex-col gap-3" onSubmit={(event) => {
        event.preventDefault();
        if (address.trim()) void perform(() => bridge.addFromLink(address.trim(), name.trim()));
      }}>
        <label className="flex flex-col gap-1.5 text-[12px] text-ink-secondary">{t("servers.address")}<input required value={address} disabled={busy} onChange={(event) => setAddress(event.target.value)}
            placeholder="https://bots.yourcompany.com" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink outline-none focus:border-accent/50" />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] text-ink-secondary">{t("servers.optionalName")}<input value={name} disabled={busy} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={t("servers.serverPlaceholder")}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink outline-none focus:border-accent/50" />
        </label>
        <p className="text-[12px] leading-relaxed text-ink-secondary">{t("servers.signInHint")}</p>
        
        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
        <button type="submit" disabled={busy || !address.trim()} className="flex w-fit items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />}{t("servers.connect")}</button>
      </form>
    </Card>
  </>;
}
