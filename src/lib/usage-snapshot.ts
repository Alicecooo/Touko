// Security: the daily snapshot is counts, booleans and allowlisted words. Names, emails, ids, URLs, labels and
// timestamps from the inputs never reach the event; only lengths, flags and allow() results do.

import { engineReady } from "@/components/EngineLibrary";
import { analyticsEnabled, track } from "@/lib/analytics";
import { allow, APP, CONNECTORS_MODE, DECIDER, EDITION, engineForDriver, LOCAL_VM_MODE, TRIAL_CREDIT, type EventProps, type KeyProvider, type PropValue } from "@/lib/analytics-allowlist";
import { hasActiveConnection, type ConnectorStatus } from "@/lib/connector-status";
import { addedServers } from "@/lib/openai-compat-endpoints";
import type { Routine } from "@/lib/routines";
import type { AppState, Bot, ConfigStatus, Group, InstanceInfo } from "@/state/store";

export const SNAPSHOT_CHECK_MS = 60 * 60 * 1_000;
const SOURCE_TIMEOUT_MS = 60_000;
const DAY_KEY = "omb-analytics-snapshot-day";

export interface UsageInput {
  config: ConfigStatus;
  instances: readonly InstanceInfo[];
  bots: ReadonlyArray<Pick<Bot, "computer" | "cloudBackend" | "hidden">>;
  groups: ReadonlyArray<Pick<Group, "dm">>;
  sections?: readonly string[];
  /** null while the routine list is not loaded. */
  routines: ReadonlyArray<Pick<Routine, "enabled" | "runOn" | "target" | "schedule">> | null;
  /** null while webhooks are not loaded. */
  webhooks: number | null;
  apps: { services: Record<string, ConnectorStatus>; authoritative: boolean } | null;
  sessions: { sessions: ReadonlyArray<{ id?: unknown; email?: unknown }>; current: unknown } | null;
  platform: "desktop" | "browser";
  remoteClient: boolean;
}

const count = (value: unknown): number | undefined => Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
const tally = <T,>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length;

function keyProviders(config: ConfigStatus): KeyProvider[] {
  const ownDecider = config.decider?.configured === true && config.decider.included !== true;
  const configured: Array<[boolean | undefined, KeyProvider]> = [
    [config.anthropic?.configured, "anthropic"],
    [config.openai?.configured, "openai"],
    [config.openrouter?.configured, "openrouter"],
    [config.openaiCompat?.configured, "openai_compat"],
    [config.xai?.configured, "xai"],
    [config.mistral?.configured, "mistral"],
    [config.cerebras?.configured, "cerebras"],
    [config.groq?.configured, "groq"],
    [config.meta?.configured, "meta"],
    [config.composio?.configured && config.composio.mode === "self-hosted", "composio"],
    [config.opencodeGo?.configured, "opencode_go"],
    [ownDecider && config.decider?.provider === "jev", "jev"],
    [ownDecider && config.decider?.provider === "openrouter", "openrouter_decider"],
    [config.imageGen?.openaiConfigured, "openai_image"],
    [config.imageGen?.customKeyConfigured, "custom_image"],
  ];
  return configured.flatMap(([on, provider]) => on === true ? [provider] : []);
}

function routineCounts(routines: UsageInput["routines"]): Record<string, number> {
  if (!routines) return {};
  return {
    routines: routines.length,
    routines_enabled: tally(routines, (routine) => routine.enabled === true),
    routines_cloud: tally(routines, (routine) => routine.runOn === "cloud"),
    routines_room_goal: tally(routines, (routine) => routine.target === "room-goal"),
    routines_once: tally(routines, (routine) => routine.schedule.type === "once"),
    routines_daily: tally(routines, (routine) => routine.schedule.type === "daily"),
    routines_interval: tally(routines, (routine) => routine.schedule.type === "interval"),
    routines_cron: tally(routines, (routine) => routine.schedule.type === "cron"),
  };
}

function appFacts(apps: UsageInput["apps"]): Record<string, PropValue> {
  if (apps?.authoritative !== true) return {};
  const active = Object.entries(apps.services).filter(([, status]) => hasActiveConnection(status));
  return { apps: [...new Set(active.map(([slug]) => allow(slug, APP)))].sort(), apps_connected: active.length };
}

const emailOf = (session: { email?: unknown }) => typeof session.email === "string" && session.email ? session.email.toLowerCase() : null;

function memberFacts(sessions: UsageInput["sessions"]): Record<string, PropValue | undefined> {
  const mine = emailOf(sessions?.sessions.find((session) => session.id === sessions.current) ?? {});
  const others = sessions?.sessions.filter((session) => session.id !== sessions.current);
  return { members: others && new Set(others.map(emailOf).filter((email) => email !== null && email !== mine)).size };
}

export function buildUsageSnapshot(input: UsageInput): EventProps {
  const { config, groups, instances } = input;
  const bots = input.bots.filter((bot) => bot.hidden !== true);
  const keys = keyProviders(config);
  const ready = instances.filter(engineReady);
  const place = (computer: Bot["computer"]) => tally(bots, (bot) => bot.computer === computer);
  const props: Record<string, PropValue | undefined> = {
    key_providers: keys,
    key_count: keys.length,
    bots_cloud_vps: tally(bots, (bot) => bot.computer === "cloud" && bot.cloudBackend === "vps"),
    bots: bots.length,
    bots_local_vm: place("vm"),
    bots_this_computer: place("local"),
    bots_browser: place("browser"),
    bots_off: place("off"),
    bots_auto: place(undefined),
    rooms: tally(groups, (group) => group.dm !== true),
    bot_channels: tally(groups, (group) => group.dm === true),
    teams: input.sections?.length ?? 0,
    ...routineCounts(input.routines),
    webhooks: count(input.webhooks),
    engines: [...new Set(ready.map((instance) => engineForDriver(instance.driverKind)))].sort(),
    engine_count: ready.length,
    custom_endpoints: addedServers(instances).length,
    trial_credit: allow(instances.find((instance) => instance.trialCredit !== undefined)?.trialCredit ?? "none", TRIAL_CREDIT),
    ...appFacts(input.apps),
    connectors_mode: allow(config.composio?.mode?.replace("-", "_"), CONNECTORS_MODE),
    local_vm_mode: allow(config.localVm?.mode?.replace("-", "_"), LOCAL_VM_MODE),
    vps_configured: config.vps?.configured === true,
    decider: config.decider?.enabled ? allow(config.decider.provider, DECIDER) : "off",
    decider_included: config.decider?.included === true,
    ...memberFacts(input.sessions),
    edition: allow(config.edition?.edition ?? "oss", EDITION),
    org_managed: Boolean(config.managedPolicy),
    onboarded: Boolean(config.onboarding?.completedAt),
    first_turn: Boolean(config.onboarding?.firstTurnAt),
    platform: input.platform,
    remote_client: input.remoteClient,
  };
  return Object.fromEntries(Object.entries(props).filter((entry): entry is [string, PropValue] => entry[1] !== undefined));
}

export function snapshotReady(
  state: Pick<AppState, "connected" | "hydrated" | "config" | "routinesLoadState" | "instances" | "webhookIngress">,
  loadsWebhooks: boolean,
): boolean {
  return state.connected && state.hydrated === true && state.config !== null && state.routinesLoadState !== "loading"
    && state.instances.length > 0 && (!loadsWebhooks || state.webhookIngress !== null);
}

export interface UsageSources {
  request<T>(path: string): Promise<T>;
  connectedApps(): Promise<{ services: Record<string, ConnectorStatus>; authoritative: boolean }>;

  platform: "desktop" | "browser";
  remoteClient: boolean;
}

export type SnapshotState = Pick<AppState, "config" | "instances" | "bots" | "groups" | "sections" | "routines" | "routinesLoadState" | "webhooks" | "webhookIngress">;

/** Null when the source fails or does not answer in time. */
function settle<T>(work: () => Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SOURCE_TIMEOUT_MS);
    new Promise<T>((run) => run(work())).then(resolve, () => resolve(null)).finally(() => clearTimeout(timer));
  });
}

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

let claimedDay: string | null = null;
let gathering = false;

function claimDay(day: string): boolean {
  if (claimedDay === day) return false;
  try {
    if (localStorage.getItem(DAY_KEY) === day) return false;
  } catch {}
  claimedDay = day;
  try {
    localStorage.setItem(DAY_KEY, day);
  } catch {}
  return true;
}

/** At most one app_snapshot per app origin per UTC day; an opted-out install makes no request at all. */
export async function sendDailySnapshot(state: SnapshotState, sources: UsageSources, now = Date.now()): Promise<boolean> {
  if (!analyticsEnabled() || gathering || !state.config) return false;
  if (!claimDay(utcDay(now))) return false;
  gathering = true;
  try {
    const config = state.config;
    
    const [apps, sessions] = await Promise.all([
      settle(() => sources.connectedApps()),
      settle(() => sources.request<{ sessions?: unknown; current?: unknown }>("/api/auth/sessions")),
    ]);
    track("app_snapshot", buildUsageSnapshot({
      config,
      instances: state.instances,
      bots: state.bots,
      groups: state.groups,
      sections: state.sections,
      routines: state.routinesLoadState === "ready" ? state.routines : null,
      webhooks: state.webhookIngress ? state.webhooks.length : null,
      apps,
      sessions: Array.isArray(sessions?.sessions)
        ? { sessions: sessions.sessions.filter((session) => session !== null && typeof session === "object"), current: sessions.current }
        : null,
      platform: sources.platform,
      remoteClient: sources.remoteClient,
    }));
    return true;
  } finally {
    gathering = false;
  }
}
