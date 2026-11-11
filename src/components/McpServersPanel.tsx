import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, FlaskConical, Globe, Loader2, LogIn, LogOut, ServerCog } from "lucide-react";

import { openExternalLink } from "@/lib/app-links";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { updateMcpServers } from "@/lib/mcp-servers";
import { completeMcpSignIn, mcpSignInLink, runMcpSignIn, type McpSignInStatus } from "@/lib/mcp-sign-in";
import { api, useStore } from "@/state/store";

import { Switch } from "./SettingsPrimitives";
import { WhopIcon } from "./WhopIcon";
import type { McpMessage, McpResultBudgetListing } from "./McpResultBudgetField";
import { WHOP_MCP_URL, isWhopServer, whopServerName } from "@/lib/whop-integration";
import { openBotSettings } from "./bot-panel/panel-link";

/** Security: secrets arrive as names only. */
interface StdioMcpListing extends McpResultBudgetListing {
  name: string;
  command: string;
  args: string[];
  envKeys: string[];
  enabled: boolean;
}
interface RemoteMcpListing extends McpResultBudgetListing {
  name: string;
  type: "http" | "sse";
  url: string;
  headerKeys: string[];
  enabled: boolean;
  auth?: "signed-in" | "needs-sign-in";
  oauth?: McpOAuthClientListing;
}
interface McpOAuthClientListing {
  clientId: string;
  scopes: string[];
  clientSecretConfigured: boolean;
  redirectUri: string;
}
export type McpServerListing = (StdioMcpListing | RemoteMcpListing) & { managedBy?: string };

export function isRemoteMcpListing(server: McpServerListing): server is RemoteMcpListing {
  return "url" in server;
}

export interface ProbeResult {
  ok: boolean;
  tools?: Array<{ name: string; description?: string }>;
  total?: number;
  error?: string;
  auth?: "required";
}

export async function signedInToolsCheck(
  name: string,
  request: (path: string, init?: RequestInit) => Promise<ProbeResult>,
  signal: AbortSignal,
): Promise<ProbeResult> {
  let tested: ProbeResult;
  try {
    tested = await request(`/api/mcp/servers/${name}/test`, { method: "POST", signal });
  } catch (cause) {
    if (signal.aborted) throw cause;
    tested = { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
  if (tested.ok) return tested;
  const reason = (tested.error ?? "").trim();
  return { ...tested, error: t("whop.testFailed", { reason: reason && !/[.!?]$/.test(reason) ? `${reason}.` : reason }) };
}

function probeToolsLabel(tools: ProbeResult["tools"], total?: number): string {
  if (!tools?.length) return t("mcp.probe.noTools");
  const count = Math.max(total ?? 0, tools.length);
  const names = tools.map((tool) => tool.name).join(", ") + (count > tools.length ? ", …" : "");
  return count === 1
    ? t("mcp.probe.toolsOne", { names })
    : t("mcp.probe.toolsMany", { count, names });
}

/** Server definitions come from internal MCP configuration; this view manages connection state only. */
export function McpServersPanel({ embedded = false, whopCard = false, hideWhop = false, refreshKey = 0, onWhopConnection, showContent = true }: {
  embedded?: boolean;
  showContent?: boolean;
  whopCard?: boolean;
  hideWhop?: boolean;
  refreshKey?: number;
  onWhopConnection?: (connected: boolean) => void;
} = {}) {
  const { state: store, dispatch } = useStore();
  const policy = store.config?.managedPolicy;
  const restricted = Boolean(policy && !policy.mcp.allowCustom);
  const [servers, setServers] = useState<McpServerListing[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | McpMessage | null>(null);
  const [notice, setNotice] = useState<(McpMessage & { stateKey?: LocaleKey }) | null>(null);
  const [probe, setProbe] = useState<Record<string, ProbeResult>>({});
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const signInAbort = useRef<AbortController | null>(null);
  const signInComplete = useRef<((result: McpSignInStatus) => void) | null>(null);
  const [signInFlow, setSignInFlow] = useState<McpSignInStatus | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [completingSignIn, setCompletingSignIn] = useState(false);
  const loadGeneration = useRef(0);
  const mounted = useRef(true);
  const whopServer = servers?.find((server) => isRemoteMcpListing(server) && isWhopServer(server));
  const whopConnected = Boolean(whopServer?.enabled && isRemoteMcpListing(whopServer) && whopServer.auth === "signed-in");
  useEffect(() => { if (servers !== null) onWhopConnection?.(whopConnected); }, [servers, whopConnected, onWhopConnection]);

  const load = useCallback(() => {
    const generation = ++loadGeneration.current;
    setBusy("load");
    setError(null);
    return api("/api/mcp/servers")
      .then((result) => {
        if (generation === loadGeneration.current) {
          setServers(result.servers ?? []);
          updateMcpServers(result.servers ?? []);
        }
      })
      .catch((cause) => {
        if (generation === loadGeneration.current) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (generation === loadGeneration.current) setBusy(null);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadGeneration.current += 1; };
  }, [load, refreshKey]);

  const toggle = async (server: McpServerListing) => {
    setBusy(`toggle:${server.name}`);
    loadGeneration.current += 1;
    setError(null);
    try {
      const result = await api(`/api/mcp/servers/${server.name}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      setServers(result.servers ?? []);
      updateMcpServers(result.servers ?? []);
      setNotice({
        key: "mcp.toggled",
        params: { name: server.name },
        stateKey: server.enabled ? "mcp.state.off" : "mcp.state.on",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const test = async (server: McpServerListing) => {
    setBusy(`test:${server.name}`);
    loadGeneration.current += 1;
    setError(null);
    setProbe((current) => {
      const next = { ...current };
      delete next[server.name];
      return next;
    });
    try {
      const result: ProbeResult = await api(`/api/mcp/servers/${server.name}/test`, { method: "POST" });
      setProbe((current) => ({ ...current, [server.name]: result }));
    } catch (cause) {
      setProbe((current) => ({
        ...current,
        [server.name]: { ok: false, error: cause instanceof Error ? cause.message : String(cause) },
      }));
    } finally {
      setBusy(null);
    }
  };

  const signIn = async (server: McpServerListing) => {
    const controller = new AbortController();
    signInAbort.current = controller;
    setSigningIn(server.name);
    setSignInFlow(null);
    setCallbackUrl("");
    setCallbackError(null);
    setError(null);
    setNotice(null);
    setProbe((current) => {
      const next = { ...current };
      delete next[server.name];
      return next;
    });
    try {
      const result = await runMcpSignIn(server.name, { api, open: openExternalLink, signal: controller.signal, onStarted: (status, complete) => {
        setSignInFlow(status);
        signInComplete.current = complete;
      } });
      if (!mounted.current || controller.signal.aborted) return;
      if (result.phase === "succeeded") {
        if (isRemoteMcpListing(server) && isWhopServer(server)) {
          setSignInFlow({ ...result, flowId: null, authorizationUrl: null });
          const tested = await signedInToolsCheck(server.name, api, controller.signal);
          if (controller.signal.aborted || !mounted.current) return;
          setProbe((current) => ({ ...current, [server.name]: tested }));
          if (!tested.ok) return;
          const enabled = await api(`/api/mcp/servers/${server.name}`, { method: "PATCH", body: JSON.stringify({ enabled: true }) });
          if (!mounted.current) return;
          setServers(enabled.servers ?? []);
          updateMcpServers(enabled.servers ?? []);
          setNotice({ key: "whop.connected" });
        } else setNotice({ key: "mcp.auth.done", params: { name: server.name } });
      } else if (result.phase !== "cancelled") {
        setProbe((current) => ({ ...current, [server.name]: { ok: false, error: result.message || t("mcp.auth.failed") } }));
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setProbe((current) => ({ ...current, [server.name]: { ok: false, error: cause instanceof Error ? cause.message : String(cause) } }));
    } finally {
      if (signInAbort.current === controller) {
        signInAbort.current = null;
        signInComplete.current = null;
        setCompletingSignIn(false);
        setSigningIn(null);
        setSignInFlow(null);
        setCallbackUrl("");
        setCallbackError(null);
        if (mounted.current) void load();
      }
    }
  };

  const connectWhop = async () => {
    if (!servers || busy !== null || signingIn !== null) return;
    const existing = servers.find((server) => isRemoteMcpListing(server) && isWhopServer(server));
    if (existing) { await signIn(existing); return; }
    setBusy("whop");
    loadGeneration.current += 1;
    setError(null);
    setNotice(null);
    let added: McpServerListing | undefined;
    try {
      const name = whopServerName(servers);
      const result = await api("/api/mcp/servers", { method: "POST", body: JSON.stringify({ name, type: "http", url: WHOP_MCP_URL, enabled: false }) });
      if (!mounted.current) return;
      setServers(result.servers ?? []);
      updateMcpServers(result.servers ?? []);
      added = result.servers?.find((server: McpServerListing) => server.name === name && isRemoteMcpListing(server) && isWhopServer(server));
      if (!added) throw new Error(t("whop.setupFailed"));
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (mounted.current) setBusy(null); }
    if (added && mounted.current) await signIn(added);
  };

  const completeSignIn = async () => {
    if (!signingIn || !signInFlow?.flowId || completingSignIn) return;
    const controller = signInAbort.current;
    setCompletingSignIn(true);
    setCallbackError(null);
    try {
      const result = await completeMcpSignIn(signingIn, signInFlow.flowId, callbackUrl, api);
      if (signInAbort.current === controller) signInComplete.current?.(result);
    } catch (cause) {
      if (signInAbort.current === controller) setCallbackError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (signInAbort.current === controller) setCompletingSignIn(false);
    }
  };

  const signOut = async (server: McpServerListing) => {
    setBusy(`signout:${server.name}`);
    loadGeneration.current += 1;
    setError(null);
    setNotice(null);
    setProbe((current) => {
      const next = { ...current };
      delete next[server.name];
      return next;
    });
    try {
      if (isRemoteMcpListing(server) && isWhopServer(server)) {
        const paused = await api(`/api/mcp/servers/${server.name}`, { method: "PATCH", body: JSON.stringify({ enabled: false }) });
        setServers(paused.servers ?? []);
        updateMcpServers(paused.servers ?? []);
      }
      const result = await api(`/api/mcp/servers/${server.name}/sign-out`, { method: "POST" });
      setServers(result.servers ?? []);
      updateMcpServers(result.servers ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => () => signInAbort.current?.abort(), []);

  function renderPasteBack(server: McpServerListing) {
    return (
      <>
        <label className="mt-3 block" htmlFor={`mcp-callback-${server.name}`}>{t("mcp.auth.callbackUrl")}</label>
        <input id={`mcp-callback-${server.name}`} type="text" value={callbackUrl} disabled={completingSignIn} onChange={(event) => setCallbackUrl(event.target.value)}
          autoComplete="off" spellCheck={false} placeholder="http://127.0.0.1:…/mcp-oauth/callback?…"
          className="mt-1 w-full rounded-lg border border-hairline bg-inset px-3 py-2 text-ink outline-none focus:border-accent" />
        <button type="button" disabled={!callbackUrl.trim() || completingSignIn} aria-busy={completingSignIn} onClick={() => void completeSignIn()}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 font-medium text-white disabled:opacity-40">
          {completingSignIn && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {t(completingSignIn ? "mcp.auth.completing" : "mcp.auth.complete")}
        </button>
      </>
    );
  }

  function renderSignIn(server: McpServerListing) {
    return signingIn === server.name && (
      <div className="mt-3 space-y-3 rounded-lg bg-raised px-3 py-3 text-[12px] text-ink-secondary">
        <div role="status" className="flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> {t(signInFlow?.phase === "succeeded" ? "whop.loadingTools" : "mcp.auth.waiting")}
        </div>
        {signInFlow?.authorizationUrl && mcpSignInLink(signInFlow.authorizationUrl) && (
          <button type="button" onClick={() => void openExternalLink(signInFlow.authorizationUrl!).catch(() => setCallbackError(t("mcp.auth.openFailed")))} className="text-accent hover:underline">
            {t("mcp.auth.openAgain")}
          </button>
        )}
        {signInFlow?.flowId && (signInFlow.pasteBack
          ? <div>
              <p className="leading-relaxed text-ink">{t("mcp.auth.pasteBackHint")}</p>
              {renderPasteBack(server)}
            </div>
          : <details>
              <summary className="cursor-pointer font-medium text-ink">{t("mcp.auth.otherComputer")}</summary>
              <p className="mt-2 leading-relaxed">{t("mcp.auth.otherComputerHint")}</p>
              {renderPasteBack(server)}
            </details>)}
        {callbackError && <p role="alert" className="text-danger">{callbackError}</p>}
      </div>
    );
  }

  if (whopCard) {
    const result = whopServer && probe[whopServer.name];
    const failed = error || (result && !result.ok ? result.error : null);
    const pending = busy !== null || signingIn !== null;
    return <div data-app-tile="whop" className="flex min-w-0 flex-col rounded-xl px-2 py-2 transition-colors hover:bg-raised/40">
      <div className="flex items-center gap-3">
        <WhopIcon />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold leading-5 text-ink">Whop</span>
            {whopConnected && <Check size={13} strokeWidth={2.5} className="shrink-0 text-success" aria-label={t("apps.connected")} />}
          </div>
          <p className="truncate text-[12.5px] leading-[18px] text-ink-secondary" title={t("whop.description")}>{t("whop.description")}</p>
        </div>
        {signingIn ? <button type="button" onClick={() => signInAbort.current?.abort()} className="inline-flex h-7 shrink-0 items-center rounded-full bg-control/80 px-3 text-[13px] font-medium leading-5 text-ink">{t("mcp.auth.cancel")}</button> :
          <button type="button" aria-label={t(whopConnected ? "whop.disconnect" : "whop.connect")}
            disabled={pending || (servers !== null && !whopConnected && (Boolean(whopServer?.managedBy) || (restricted && !policy?.mcp.allowlist.length)))}
            onClick={() => void (servers === null ? load() : whopConnected && whopServer ? signOut(whopServer) : connectWhop())}
            className="inline-flex h-7 min-w-[64px] shrink-0 items-center justify-center gap-2 rounded-full bg-control/80 px-3 text-[13px] font-medium leading-5 text-ink hover:bg-raised-hover disabled:opacity-40">
            {pending ? <Loader2 size={14} className="animate-spin" /> : servers === null ? t("connectors.action.retry") : t(whopConnected ? "connectors.disconnect" : "connectors.action.connect")}
          </button>}
      </div>
      <div className="ps-[52px]">
      {failed && <p role="alert" className="mt-1.5 text-[12px] text-danger">{typeof failed === "string" ? failed : t(failed.key, failed.params)}</p>}
      {whopServer && renderSignIn(whopServer)}
      <details className="mt-1 text-[12px] text-ink-secondary">
        <summary className="cursor-pointer">{t("whop.access")}</summary>
        <p className="mt-2 leading-relaxed">{t("whop.notice")}</p>
        <p className="mt-2 leading-relaxed">{t("whop.accessHint")}</p>
        <div className="mt-2 flex flex-wrap gap-2">{(store.bots ?? []).filter((bot) => !bot.hidden).map((bot) => <button key={bot.id} type="button" onClick={() => { dispatch({ type: "togglePlugins", open: false }); openBotSettings(dispatch, "access", { botId: bot.id, page: "mcp" }); }} className="rounded-lg bg-control px-2.5 py-1.5 text-ink hover:bg-raised-hover">{t("whop.botSettings", { name: bot.name })}</button>)}</div>
      </details>
      </div>
    </div>;
  }

  const visibleServers = servers?.filter((server) => !hideWhop || !isRemoteMcpListing(server) || !isWhopServer(server));

  return (
    <>
    {showContent && <section
      data-mcp-servers
      aria-labelledby="mcp-servers-title"
      className={embedded ? "mb-5" : "min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-5 sm:px-8"}
    >
      <div className={embedded ? "" : "mx-auto max-w-[840px]"}>
        <h3 id="mcp-servers-title" className="sr-only">{t("mcp.title")}</h3>
        <p className="text-[12.5px] leading-relaxed text-ink-secondary">{t("mcp.internalConfig")}</p>

        {restricted && policy && <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-ink-secondary">{t("policy.mcpRestricted", { organization: policy.organizationName })}</p>}

        {error && <div role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{typeof error === "string" ? error : t(error.key, error.params)}</div>}
        {notice && <div role="status" className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-[12px] text-success">{t(notice.key, {
          ...notice.params,
          ...(notice.stateKey ? { state: t(notice.stateKey) } : {}),
        })}</div>}

        {servers === null ? (
          <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-ink-secondary"><Loader2 size={14} className="animate-spin" /> {t("mcp.loading")}</div>
        ) : visibleServers?.length === 0 ? null : (
          <div className="mt-5 space-y-3">
            {visibleServers?.map((server) => {
              const whop = isRemoteMcpListing(server) && isWhopServer(server);
              const result = probe[server.name];
              const auth = isRemoteMcpListing(server) ? server.auth : undefined;
              const canSignIn = isRemoteMcpListing(server)
                && (auth === "needs-sign-in" || result?.auth === "required" || ((whop || Boolean(server.oauth)) && auth !== "signed-in"));
              return (
                <div key={server.name} data-whop-server={whop ? server.name : undefined} className="rounded-2xl border border-hairline/50 bg-card px-4 py-4 sm:px-5">
                  <div data-mcp-row className="flex flex-wrap items-center gap-3">
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", server.enabled ? "bg-success/10 text-success" : "bg-raised text-ink-secondary")}>
                      {whop ? <WhopIcon /> : isRemoteMcpListing(server) ? <Globe size={19} /> : <ServerCog size={19} />}
                    </div>
                    <div className="min-w-0 flex-[1_1_220px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-[14px] font-medium text-ink">{whop ? "Whop" : server.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px]", server.enabled ? "bg-success/10 text-success" : "bg-raised text-ink-secondary")}>{t(server.enabled ? "mcp.badge.on" : "mcp.badge.off")}</span>
                        {auth && <span className={cn("rounded-full px-2 py-0.5 text-[10.5px]", auth === "signed-in" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{t(auth === "signed-in" ? "mcp.auth.signedIn" : "mcp.auth.needsSignIn")}</span>}
                        {server.managedBy && <span className="rounded-full bg-raised px-2 py-0.5 text-[10.5px] text-ink-secondary">{t("policy.managedBy", { organization: server.managedBy })}</span>}
                      </div>
                      {server.managedBy && <div className="mt-1 text-[11.5px] text-ink-secondary">{t("policy.mcpBlocked", { organization: server.managedBy })}</div>}
                      <div className="mt-1 truncate font-mono text-[11.5px] text-ink-secondary">{isRemoteMcpListing(server) ? server.url : [server.command, ...server.args].join(" ")}</div>
                      {isRemoteMcpListing(server)
                        ? server.headerKeys.length > 0 && <div className="mt-1 truncate text-[11px] text-ink-secondary">{t("mcp.headersSaved", { keys: server.headerKeys.join(", ") })}</div>
                        : server.envKeys.length > 0 && <div className="mt-1 truncate text-[11px] text-ink-secondary">{t("mcp.secretsSaved", { keys: server.envKeys.join(", ") })}</div>}
                      {isRemoteMcpListing(server) && server.oauth && <div className="mt-1 truncate text-[11px] text-ink-secondary">{t(server.oauth.clientSecretConfigured ? "mcp.oauth.savedWithSecret" : "mcp.oauth.saved", { clientId: server.oauth.clientId })}</div>}
                    </div>
                    <div data-mcp-row-actions className="ml-auto flex flex-wrap items-center justify-end gap-1">
                      {signingIn === server.name ? (
                        <button type="button" onClick={() => signInAbort.current?.abort()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink">
                          <Loader2 size={14} className="animate-spin" /> {t("mcp.auth.cancel")}
                        </button>
                      ) : canSignIn ? (
                        <button type="button" disabled={busy !== null || signingIn !== null || Boolean(server.managedBy)} onClick={() => void signIn(server)} className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-2 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40">
                          <LogIn size={14} /> {t(whop ? "whop.connect" : "mcp.auth.signIn")}
                        </button>
                      ) : auth === "signed-in" ? (
                        <button type="button" disabled={busy !== null || signingIn !== null} onClick={() => void signOut(server)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40">
                          {busy === `signout:${server.name}` ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} {t(whop ? "whop.disconnect" : "mcp.auth.signOut")}
                        </button>
                      ) : null}
                      <button type="button" disabled={busy !== null || signingIn !== null} onClick={() => void test(server)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40">
                        {busy === `test:${server.name}` ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} {t("mcp.test")}
                      </button>
                      <span className="ml-1 flex items-center">
                        {busy === `toggle:${server.name}` && <Loader2 size={13} className="mr-1.5 animate-spin text-ink-secondary" />}
                        <Switch
                          checked={server.enabled}
                          disabled={busy !== null || signingIn !== null}
                          onClick={() => void toggle(server)}
                          aria-label={t("mcp.toggleAria", {
                            name: server.name,
                            state: t(server.enabled ? "mcp.state.off" : "mcp.state.on"),
                          })}
                          className="disabled:opacity-40"
                        />
                      </span>
                    </div>
                  </div>
                  {whop && <div className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
                    <p>{t("whop.notice")}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium text-ink">{t("whop.access")}</summary>
                      <p className="mt-2">{t("whop.accessHint")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">{(store.bots ?? []).filter((bot) => !bot.hidden).map((bot) => <button key={bot.id} type="button" onClick={() => { dispatch({ type: "togglePlugins", open: false }); openBotSettings(dispatch, "access", { botId: bot.id, page: "mcp" }); }} className="rounded-lg bg-control px-2.5 py-1.5 text-ink hover:bg-raised-hover">{t("whop.botSettings", { name: bot.name })}</button>)}</div>
                    </details>
                  </div>}
                  {renderSignIn(server)}
                  {result && signingIn !== server.name && (
                    <div role="status" className={cn("mt-3 rounded-lg px-3 py-2 text-[12px]", result.ok ? "bg-success/10 text-success" : result.auth === "required" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger")}>
                      {result.auth === "required" ? t("mcp.auth.required") : result.ok ? (
                        <span className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-px shrink-0" /> {t("mcp.probe.connected")} {probeToolsLabel(result.tools, result.total)}</span>
                      ) : result.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>}
    </>
  );
}
