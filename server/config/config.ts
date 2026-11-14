// ~/.touko/config.json, with env vars overriding its credentials.
import { readFileSync, mkdirSync, existsSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import { writeFileAtomic } from "../storage/atomic.ts";
import { newBotDefaultsSchema, type NewBotDefaults } from "../bots/new-bot-defaults.ts";
import { replaySettings } from "../agent/replay-settings.ts";
import { EFFORT_LEVELS } from "../../shared/wire.ts";
import { isModelVariant, type InstanceConfigMap, type McpServerSpec, type ModelSelection } from "../harness/contracts.ts";
import { DEFAULT_WINDOW_MINUTES, MAX_WINDOW_MINUTES } from "../agent/cache-keepwarm.ts";
import { PROVIDER_ICON_PRESETS, providerIconError } from "../../shared/provider-icon.ts";
import { helperStoredShape, type HelperConfig } from "../agent/side-jobs.ts";
import { loopGuardConfigSchema, type LoopGuardConfig } from "../host/loop-guard.ts";
import { migrateLegacyFeatureFlags } from "./legacy-feature-flags.ts";
import { isRemoteMcpServer, parseStoredMcpServer } from "../mcp/mcp-registry.ts";
import { parseJson, schemaIssue, type JsonObject, type JsonValue } from "./schema.ts";

const optionalText = z.string().optional();

export const DEFAULT_MCP_CALL_TIMEOUT_MINUTES = 10;
export const MIN_MCP_CALL_TIMEOUT_MINUTES = 1;
export const MAX_MCP_CALL_TIMEOUT_MINUTES = 60;
export const DEFAULT_MAX_CONCURRENT_BOT_THREADS = 3;
export const MAX_CONCURRENT_BOT_THREADS = 10;
/** The floor keeps a log tail large enough for the event inspector's recent-line window. */
export const MIN_THREAD_EVENT_LOG_BYTES = 256 * 1024;
export const MAX_THREAD_EVENT_LOG_BYTES = 4 * 1024 * 1024 * 1024;

const mcpConfigSchema = z.object({
  /** Minutes one bot MCP tool call may run; default 10. */
  callTimeoutMinutes: z
    .number()
    .int()
    .min(MIN_MCP_CALL_TIMEOUT_MINUTES)
    .max(MAX_MCP_CALL_TIMEOUT_MINUTES)
    .optional(),
}).strict();
/** A named browser session; its id names a durable Electron partition. */

// Not strict: a stale client's unknown flag must be dropped, not fail the whole config.
const featureConfigSchema = z.object({
  /** Bots may draft skills for your review. On unless false. */
  skillAuthoring: z.boolean().optional(),
  /** The bot's engine reviews long conversations and updates its learned skills. Off unless true; needs skillAuthoring. */
  skillReview: z.boolean().optional(),
  /** Tool steps in one conversation between automatic reviews. */
  skillReviewSteps: z.number().int().min(3).max(100).optional(),
  /** Show each tool run in the transcript. Off unless explicitly enabled. */
  showToolCalls: z.boolean().optional(),
  /** Run a routine in the conversation it reports to, not a hidden thread. Off unless true. */
  routinesInConversation: z.boolean().optional(),
  /** Built-in browser. On unless false; each bot also has its own switch. */

  /** Computer sharing. Off unless true, set by hand: there is no Settings toggle. */
  sharedComputers: z.boolean().optional(),
  claudeUserMcp: z.boolean().optional(), // Claude bots also load this machine's Claude Code MCP servers. Off unless true: tools cost tokens.
  claudeUserSkills: z.boolean().optional(), // Claude bots also load the skills in ~/.claude/skills, in place. Off unless true.
  /** LLM-generated titles for new threads. Off unless true. */
  llmThreadTitles: z.boolean().optional(),
  /** Recall matching passages from the bot's memory into each turn. On unless false. */
  autoRecall: z.boolean().optional(),
  /** One shared skills store that bots read by assignment. Off unless true. */
  skillsLibrary: z.boolean().optional(),
  shareLearnedSkills: z.enum(["off", "ask", "auto"]).optional(),
  /** A teammate parked on a gate only the person can lift is reported to its Chief of Staff. Off unless true. */
  chiefEscalations: z.boolean().optional(),
  acpPlanLines: z.boolean().optional(), // An ACP agent's plan as activity lines. Off unless true.
}).extend({ agentsToolBridge: z.boolean().optional() }); // the find_tool / use_tool bridge; off unless true
const onboardingConfigSchema = z.object({
  completedAt: z.string().trim().max(40).optional(),
  version: z.number().int().min(0).max(1000).optional(),
  reelSeen: z.boolean().optional(),
  hintsSeen: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  firstTurnAt: z.string().trim().max(40).optional(),
}).strict();
const instanceConfigSchema = z.object({
  driver: z.string().min(1),
  displayName: optionalText,
  accentColor: optionalText,
  icon: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("preset"), preset: z.enum(PROVIDER_ICON_PRESETS) }).strict(),
    z.object({ kind: z.literal("custom"), dataUrl: z.string() }).strict()
      .refine((icon) => providerIconError(icon) === null, { message: "Invalid provider icon" }),
  ]).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
  access: z.enum(["subscription", "custom", "api"]).optional(),
  config: z.json().optional(),
});
const instanceConfigMapSchema = z.record(z.string(), instanceConfigSchema);
const DEFAULT_CLI_INSTANCES: InstanceConfigMap = {
  pi: { driver: "piAgent" },
  omp: { driver: "ompAgent" },
  claude: { driver: "claudeAgent" },
  codex: { driver: "codex" },
  antigravity: { driver: "antigravityAgent" },
  cursor: { driver: "cursorAgent" },
  grok: { driver: "grokAgent" },
};
const LEGACY_MODEL_CONFIG_KEYS = [
  "anthropic", "openai", "openrouter", "openaiCompat", "xai", "mistral", "cerebras", "groq", "meta", "opencodeGo",
] as const;
const defaultModelSelectionSchema = z.object({
  instanceId: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(500),
  effort: z.enum(EFFORT_LEVELS).optional(),
  variant: z.string().refine(isModelVariant, "invalid model variant").optional(),
}).refine((selection) => selection.variant === undefined || selection.effort === undefined,
  "choose either a model variant or an effort level");
const automaticRecoverySchema = z.object({
  enabled: z.boolean(),
  backup: defaultModelSelectionSchema.optional(),
}).strict().refine((recovery) => !recovery.enabled || recovery.backup !== undefined,
  { message: "Choose a backup model before enabling automatic recovery", path: ["backup"] });
/** Prompt-cache keep-warm. Off unless enabled; a bot's own `cacheKeepWarm` overrides it. */
const cacheKeepWarmSchema = z.object({
  enabled: z.boolean(),
  windowMinutes: z.number().int().min(15).max(MAX_WINDOW_MINUTES).optional(),
}).strict();
const threadsConfigSchema = z.object({
  maxConcurrentPerBot: z.number().int().min(1).max(MAX_CONCURRENT_BOT_THREADS),
  /** Byte cap for each thread's events/ and native/ log; absent means unbounded. */
  eventLogMaxBytes: z.number().int().min(MIN_THREAD_EVENT_LOG_BYTES).max(MAX_THREAD_EVENT_LOG_BYTES).optional(),
  /** Days a closed or archived thread's event logs survive; absent keeps them forever. */
  eventLogRetentionDays: z.number().int().min(1).max(3650).optional(),
}).strict();
const threadsPatchSchema = threadsConfigSchema.extend({
  maxConcurrentPerBot: threadsConfigSchema.shape.maxConcurrentPerBot.optional(),
  eventLogMaxBytes: threadsConfigSchema.shape.eventLogMaxBytes.nullable(),
  eventLogRetentionDays: threadsConfigSchema.shape.eventLogRetentionDays.nullable(),
});
const appConfigSchema = z.object( {
  /** Set only by the verified domain endpoint, never by a config patch. */
  customDomain: z.string().optional(),
  /** Who may sign in with an emailed code: addresses or `@domain` entries; admins get every scope, members chat only. */
  signIn: z.object({ admins: z.array(z.string().max(320)).max(500).optional(), members: z.array(z.string().max(320)).max(5000).optional() }).optional(),
  defaultModelSelection: defaultModelSelectionSchema.optional(),
  automaticRecovery: automaticRecoverySchema.optional(),
  cacheKeepWarm: cacheKeepWarmSchema.optional(),
  newBotDefaults: newBotDefaultsSchema.optional(),
  /** CLI launch preferences; never enables remote access implicitly. */
  cliStartup: z.object({
    access: z.enum(["local", "tunnel", "tailscale", "public-url"]),
    publicUrl: z.string().url().optional(),
    phone: z.enum(["ios", "android"]).optional(),
  }).optional(),
  /** Workspace monthly spend limit; enforced only with the `budgets` entitlement. */
  budgets: z
    .object({
      monthlyUsd: z.number().min(0).max(1_000_000).optional(),
      warnAtPercent: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
  /** Operator sell prices per million tokens by model id, `driver/model` or `default`; read only with the `billing` entitlement. */
  billing: z
    .object({
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      prices: z
        .record(
          z.string().min(1).max(160),
          z.object({
            inputPerMillion: z.number().min(0).max(1_000_000),
            outputPerMillion: z.number().min(0).max(1_000_000),
            cachedInputPerMillion: z.number().min(0).max(1_000_000).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  /** Composio project key; `userId`/`sessionId` reuse one Composio Session. */
  composio: z.object({ apiKey: optionalText, userId: optionalText, sessionId: optionalText }).optional(),
  /** Non-secret profile details; aboutMe is shared with every bot. */
  profile: z.object({ name: optionalText, email: optionalText, aboutMe: z.string().max(24_000).optional() }).optional(),
  /** UI language override (BCP-47, lowercase); absent follows the system. */
  language: optionalText,
  mcp: mcpConfigSchema.optional(),
  context: z.object({
    compactAt: z.number().positive().max(10_000_000).optional(),
    autoCompact: z.boolean().optional(),
  }).extend(replaySettings).optional(),
  /** Memory upkeep timing, for bots with Memory upkeep switched on. */
  memory: z.object({
    /** Quiet time after a turn before its facts are captured (ms). */
    captureQuietMs: z.number().int().min(1_000).max(24 * 60 * 60_000).optional(),
    /** Local hour (0-23) after which the nightly tidy-up runs. */
    tidyHour: z.number().int().min(0).max(23).optional(),
  }).strict().optional(),
  threads: threadsConfigSchema.optional(),
  /** Minimum days of decision-log month files kept; OMB_DECISION_RETENTION_DAYS wins. */
  decisions: z.object({ retentionDays: z.number().int().min(1).max(3650).optional() }).strict().optional(),
  loopGuard: loopGuardConfigSchema.optional(),
  safetyFloor: z.object({ enabled: z.boolean().optional() }).strict().optional(), // off by default: safetyFloorEnabled in server/agent/safety-floor-gate.ts
  features: featureConfigSchema.optional(),
  onboarding: onboardingConfigSchema.optional(),

  instances: instanceConfigMapSchema.optional(),
  /** Loose on purpose: one bad server entry is skipped later, never fails the whole file. */
  mcpServers: z.record(z.string(), z.unknown()).optional()});
const storedAppConfigSchema = appConfigSchema.extend(helperStoredShape).extend({

});
const appConfigPatchSchema = appConfigSchema.omit({
  instances: true, mcpServers: true, cliStartup: true, customDomain: true,
})
  .extend({ threads: threadsPatchSchema.optional() });
const jsonObjectSchema = z.record(z.string(), z.json());

export interface AppConfig extends HelperConfig {
  customDomain?: string;
  signIn?: { admins?: string[]; members?: string[] };
  /** Preferred selection for newly created bots; existing bots keep theirs. */
  defaultModelSelection?: ModelSelection;
  /** Off by default; one backup attempt only before any work starts. */
  automaticRecovery?: { enabled: boolean; backup?: ModelSelection };
  cacheKeepWarm?: { enabled: boolean; windowMinutes?: number };
  /** UI creation template. Saving it never mutates a bot or grants access. */
  newBotDefaults?: NewBotDefaults;
  cliStartup?: {
    access: "local" | "tunnel" | "tailscale" | "public-url";
    publicUrl?: string;
    phone?: "ios" | "android";
  };
  mcpServers?: Record<string, unknown>;
  language?: string;
  budgets?: { monthlyUsd?: number; warnAtPercent?: number };
  decisions?: { retentionDays?: number };
  loopGuard?: LoopGuardConfig;
  safetyFloor?: { enabled?: boolean };
  billing?: { currency?: string; prices?: Record<string, { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number }> };
  composio?: { apiKey?: string; userId?: string; sessionId?: string };
  /** Boat token (ascii.dev renamed Box to Boat); config key "box", env BOX_TOKEN. */

  profile?: { name?: string; email?: string; aboutMe?: string };
  mcp?: { callTimeoutMinutes?: number };
  threads?: { maxConcurrentPerBot: number; eventLogMaxBytes?: number; eventLogRetentionDays?: number };
  context?: { rebuildBytes?: number; compactAt?: number; autoCompact?: boolean; replayToolHistory?: boolean };
  memory?: { captureQuietMs?: number; tidyHour?: number };
  features?: { skillAuthoring?: boolean; skillReview?: boolean; skillReviewSteps?: number; showToolCalls?: boolean;  sharedComputers?: boolean; claudeUserMcp?: boolean; claudeUserSkills?: boolean; llmThreadTitles?: boolean; autoRecall?: boolean; routinesInConversation?: boolean; skillsLibrary?: boolean; shareLearnedSkills?: "off" | "ask" | "auto"; chiefEscalations?: boolean; acpPlanLines?: boolean; agentsToolBridge?: boolean };
  onboarding?: { completedAt?: string; version?: number; reelSeen?: boolean; hintsSeen?: string[]; firstTurnAt?: string };

  instances?: InstanceConfigMap;
}

export type ConfigPatch = z.output<typeof appConfigPatchSchema>;

/** Electron storage must use this, never the profile id. */

/** A colliding id or partition could attach a bot to another account's retained session. */

/** Electron erases a removed partition only after commit, so a new profile reusing its name would race the wipe. */

export function parseStoredConfig(value: JsonValue): AppConfig {
  const parsed = storedAppConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error(schemaIssue(parsed.error, "Invalid stored configuration"));
  return parsed.data;
}

export function parseConfigPatch(value: JsonValue): ConfigPatch {
  const parsed = appConfigPatchSchema.safeParse(value);
  if (!parsed.success) {
    throw Object.assign(new Error(schemaIssue(parsed.error, "Invalid configuration")), { status: 400 });
  }
  return parsed.data;
}

/** Revalidated because the value is forwarded into a child process environment. */

export function mcpCallTimeoutMinutes(cfg: AppConfig): number {
  return cfg.mcp?.callTimeoutMinutes ?? DEFAULT_MCP_CALL_TIMEOUT_MINUTES;
}

export function cacheKeepWarmSettings(cfg: AppConfig): { enabled: boolean; windowMinutes: number } {
  return { enabled: cfg.cacheKeepWarm?.enabled === true, windowMinutes: cfg.cacheKeepWarm?.windowMinutes ?? DEFAULT_WINDOW_MINUTES };
}

export function maxConcurrentBotThreads(cfg: { threads?: { maxConcurrentPerBot?: number } }): number {
  return cfg.threads?.maxConcurrentPerBot ?? DEFAULT_MAX_CONCURRENT_BOT_THREADS;
}

export function threadEventLogMaxBytes(cfg: AppConfig): number | null {
  const cap = cfg.threads?.eventLogMaxBytes;
  return typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? cap : null;
}

export function threadEventLogRetentionDays(cfg: AppConfig): number | null {
  return cfg.threads?.eventLogRetentionDays ?? null;
}

export function skillAuthoringEnabled(cfg: AppConfig): boolean {
  return cfg.features?.skillAuthoring !== false;
}

export const DEFAULT_SKILL_REVIEW_STEPS = 10;
export const MIN_SKILL_REVIEW_STEPS = 3;
export const MAX_SKILL_REVIEW_STEPS = 100;

export function skillReviewEnabled(cfg: AppConfig): boolean {
  return skillAuthoringEnabled(cfg) && cfg.features?.skillReview === true;
}

export function skillReviewSteps(cfg: AppConfig): number {
  const raw = cfg.features?.skillReviewSteps;
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_SKILL_REVIEW_STEPS;
  return Math.min(MAX_SKILL_REVIEW_STEPS, Math.max(MIN_SKILL_REVIEW_STEPS, value));
}

export function autoRecallEnabled(cfg: AppConfig): boolean {
  return cfg.features?.autoRecall !== false;
}

export const DEFAULT_CAPTURE_QUIET_MS = 2 * 60_000;
export const DEFAULT_TIDY_HOUR = 3;

export function captureQuietMs(cfg: AppConfig): number {
  return cfg.memory?.captureQuietMs ?? DEFAULT_CAPTURE_QUIET_MS;
}

export function tidyHour(cfg: AppConfig): number {
  return cfg.memory?.tidyHour ?? DEFAULT_TIDY_HOUR;
}

export function showToolCallsEnabled(cfg: AppConfig): boolean {
  return cfg.features?.showToolCalls === true;
}

export function routinesInConversationEnabled(cfg: AppConfig): boolean {
  return cfg.features?.routinesInConversation === true;
}

/** Security: off unless true because a read-only folder grant can still be escalated to a shell. */
export function sharedComputersEnabled(cfg: AppConfig): boolean {
  return cfg.features?.sharedComputers === true;
}

export function claudeUserMcpEnabled(cfg: Pick<AppConfig, "features">): boolean {
  return cfg.features?.claudeUserMcp === true;
}

export function llmThreadTitlesEnabled(cfg: AppConfig): boolean {
  return cfg.features?.llmThreadTitles === true;
}

export function engineLaunches(configs: InstanceConfigMap): Record<string, unknown> {
  return Object.fromEntries(Object.entries(configs).map(([id, entry]) => [id, { ...entry }]));
}

export function changedInstanceIds(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((id) => !isDeepStrictEqual(before[id], after[id]));
}

const DEFAULT_DATA_DIR = join(homedir(), ".touko");
export const DATA_DIR = process.env.OMB_DATA_DIR ?? DEFAULT_DATA_DIR;
const LEGACY_DATA_DIRS = [join(homedir(), ".openmausbot"), join(homedir(), ".opengrokbot")];
const isDefaultDataDir = (candidate: string) => {
  const target = resolve(candidate);
  const defaultTarget = resolve(DEFAULT_DATA_DIR);
  return process.platform === "win32" ? target.toLowerCase() === defaultTarget.toLowerCase() : target === defaultTarget;
};
export const EVENTS_DIR = join(DATA_DIR, "events");
export const NATIVE_DIR = join(DATA_DIR, "native");

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) {
    const legacyDirs = isDefaultDataDir(DATA_DIR) ? LEGACY_DATA_DIRS : [];
    for (const legacyDir of legacyDirs) {
      if (!existsSync(legacyDir)) continue;
      try {
        renameSync(legacyDir, DATA_DIR);
        break;
      } catch (error) {
        if (existsSync(DATA_DIR)) break;
        throw new Error(`Could not migrate Touko data from ${JSON.stringify(legacyDir)}.`, { cause: error });
      }
    }
  }
  for (const dir of [DATA_DIR, EVENTS_DIR, NATIVE_DIR]) mkdirSync(dir, { recursive: true });
  migrateLegacyFeatureFlags(DATA_DIR);
}

let lastIgnoredConfigWarning = "";

function stripLegacyProviderConfig(stored: JsonValue): boolean {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  const root = stored as JsonObject;
  let changed = false;
  for (const key of LEGACY_MODEL_CONFIG_KEYS) {
    if (Object.hasOwn(root, key)) {
      delete root[key];
      changed = true;
    }
  }

  if (Object.hasOwn(root, "instances")) {
    delete root.instances;
    changed = true;
  }

  const supportedSelection = (value: JsonValue | undefined): boolean => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const instanceId = (value as JsonObject).instanceId;
    return typeof instanceId === "string" && Object.hasOwn(DEFAULT_CLI_INSTANCES, instanceId);
  };
  if (root.defaultModelSelection !== undefined && !supportedSelection(root.defaultModelSelection)) {
    delete root.defaultModelSelection;
    changed = true;
  }
  const defaults = root.newBotDefaults;
  if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
    const profile = (defaults as JsonObject).profile;
    if (profile && typeof profile === "object" && !Array.isArray(profile)) {
      const selection = (profile as JsonObject).modelSelection;
      if (selection !== undefined && !supportedSelection(selection)) {
        delete (profile as JsonObject).modelSelection;
        changed = true;
      }
    }
  }
  const recovery = root.automaticRecovery;
  if (recovery && typeof recovery === "object" && !Array.isArray(recovery)) {
    const recoveryConfig = recovery as JsonObject;
    if (recoveryConfig.backup !== undefined && !supportedSelection(recoveryConfig.backup)) {
      if (recoveryConfig.enabled === true) root.automaticRecovery = { enabled: false };
      else delete recoveryConfig.backup;
      changed = true;
    }
  }
  return changed;
}

export function loadConfig(): AppConfig {
  let cfg: AppConfig = {};
  try {
    const configPath = join(DATA_DIR, "config.json");
    const stored = parseJson(readFileSync(configPath, "utf8"));
    let migrated = stripLegacyProviderConfig(stored);
    cfg = parseStoredConfig(stored);
    if (stored && typeof stored === "object" && !Array.isArray(stored) && "localVm" in stored) {
      delete stored.localVm;
      migrated = true;
    }
    if (migrated) {
      writeFileAtomic(configPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
    }
    lastIgnoredConfigWarning = "";
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
      // JSON.parse errors can quote the input; a credential must never reach the log.
      const reason = error instanceof SyntaxError ? "invalid JSON"
        : error instanceof Error ? error.message : "unable to read configuration";
      const warning = `config: ignoring ${join(DATA_DIR, "config.json")} and using defaults: ${reason}`;
      if (warning !== lastIgnoredConfigWarning) console.warn(warning);
      lastIgnoredConfigWarning = warning;
    } else {
      lastIgnoredConfigWarning = "";
    }
  }
  // Composio is an app connector, independent of model and agent configuration.
  cfg.composio = { ...cfg.composio };
  if (process.env.COMPOSIO_API_KEY !== undefined) cfg.composio.apiKey = process.env.COMPOSIO_API_KEY;

  const splitEmails = (value: string) => value.split(/[,\s]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (process.env.OMB_SIGNIN_EMAILS !== undefined || process.env.OMB_SIGNIN_MEMBER_EMAILS !== undefined) {
    cfg.signIn = { ...cfg.signIn };
    if (process.env.OMB_SIGNIN_EMAILS !== undefined) cfg.signIn.admins = splitEmails(process.env.OMB_SIGNIN_EMAILS);
    if (process.env.OMB_SIGNIN_MEMBER_EMAILS !== undefined) cfg.signIn.members = splitEmails(process.env.OMB_SIGNIN_MEMBER_EMAILS);
  }
  return cfg;
}

/** Memoizes derive(loadConfig()) until config.json's stat changes; a file saved in the last two seconds is re-read every call, since its mtime may not tick. */
export function cacheUntilConfigChanges<T>(derive: (config: AppConfig) => T): () => T {
  let cached: { stamp: string; value: T } | null = null;
  return () => {
    let stamp: string | null = null;
    try {
      const file = statSync(join(DATA_DIR, "config.json"), { bigint: true });
      if (Date.now() - Number(file.mtimeMs) >= 2_000) stamp = `${file.ino}:${file.size}:${file.mtimeNs}:${file.ctimeNs}`;
    } catch {
    }
    if (stamp !== null && cached?.stamp === stamp) return cached.value;
    const value = derive(loadConfig());
    cached = stamp === null || lastIgnoredConfigWarning !== "" ? null : { stamp, value };
    return value;
  };
}

/** Keeps the live app connector key in sync with its saved config. */
export function syncComposioCredentialEnv(patch: Pick<AppConfig, "composio">): void {
  const value = patch.composio?.apiKey;
  if (value === undefined) return;
  if (value) process.env.COMPOSIO_API_KEY = value;
  else delete process.env.COMPOSIO_API_KEY;
}

/** Workspace credential env names; spawned engine CLIs must never inherit them. */
export const WORKSPACE_CREDENTIAL_ENV = [
  "XAI_API_KEY",
  "MISTRAL_API_KEY",
  "CEREBRAS_API_KEY",
  "OMB_GROQ_API_KEY",
  "OMB_META_API_KEY",
  "OMB_ANTHROPIC_API_KEY",
  "OMB_ANTHROPIC_API_URL",
  "OMB_HOSTED_MODEL_TOKEN",
  "OMB_HOSTED_MODELS",
  "OPENAI_COMPAT_API_KEY",
  "OPENAI_COMPAT_URL",
  "OMB_OPENAI_API_KEY",
  "OMB_OPENROUTER_API_KEY",
  "BOX_TOKEN",
  "OPENCODE_API_KEY",
  // Retired avatar credentials must not reach agent child processes.
  "OMB_OPENAI_IMAGE_KEY",
  "OMB_CUSTOM_IMAGE_KEY",
  "COMPOSIO_API_KEY",
  "OMB_COMPOSIO_BROKER_TOKEN",
  "OMB_CLOUD_BOAT_TOKEN",
  "OMB_CLOUD_AI_TOKEN",
  "OMB_CLOUD_CONNECTED_APPS_GRANT",
  // Not credentials, but they point a shell-capable agent at app-owned state.
  "OMB_BROWSER_CONNECTION", "OMB_USER_DATA", "OMB_BOAT_API",
] as const;

/** Operator secrets only this process reads, plus every `OMB_CLOUD_` var (the underscore leaves out OMB_CLOUDFLARED_PATH). */
export const CONTROL_PLANE_ENV = ["OMB_LICENSE_KEY", "OMB_INSTALLATION_CREDENTIAL"] as const;
export const CONTROL_PLANE_ENV_PREFIX = "OMB_CLOUD_";

/** Names compare case-insensitively because Windows environments do. */
export function stripControlPlaneEnv(env: Record<string, string | undefined>): void {
  for (const key of Object.keys(env)) {
    const name = key.toUpperCase();
    if (name.startsWith(CONTROL_PLANE_ENV_PREFIX) || (CONTROL_PLANE_ENV as readonly string[]).includes(name)) delete env[key];
  }
}

export function stripWorkspaceCredentialEnv(env: Record<string, string | undefined>): void {
  for (const key of WORKSPACE_CREDENTIAL_ENV) delete env[key];
  stripControlPlaneEnv(env);
}

/** Env a provider CLI may read as its billing identity; a foreign key must never move a subscription CLI onto API billing. */
export const PROVIDER_CREDENTIAL_ENV = [
  "CLINE_API_KEY",
  "ANTHROPIC_API_KEY",
  "FACTORY_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "KIMI_API_KEY",
  "MOONSHOT_API_KEY",
  "MINIMAX_API_KEY",
  "OPENAI_API_KEY",
  "OPENCODE_API_KEY",
  "XAI_API_KEY",
  "MISTRAL_API_KEY",
  "CEREBRAS_API_KEY",
  "GROQ_API_KEY",
  "META_API_KEY",
  "CURSOR_API_KEY",
  "CURSOR_AUTH_TOKEN",
] as const;

/** Provider keys OpenCode reads from its environment (with ANTHROPIC_API_KEY set it lists Anthropic's models). */
export const OPENCODE_PROVIDER_ENV = [
  "CLINE_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "KIMI_API_KEY",
  "MOONSHOT_API_KEY",
  "MINIMAX_API_KEY",
  "GROQ_API_KEY",
] as const;

const configSaveListeners = new Set<(before: JsonObject, after: JsonObject) => void>();

/** Called synchronously after each saveConfig with the file before and after; a listener must not throw. */
export function onConfigSaved(listener: (before: JsonObject, after: JsonObject) => void): () => void {
  configSaveListeners.add(listener);
  return () => { configSaveListeners.delete(listener); };
}

/** Secrets are never echoed back; callers report configured-or-not only. */
export function saveConfig(
  patch: Partial<Omit<AppConfig, "threads">> & {
    threads?: z.output<typeof threadsPatchSchema>;
  },
  options: { replaceInstances?: boolean } = {},
): void {
  const p = join(DATA_DIR, "config.json");
  let disk: JsonObject = {};
  try {
    const parsed = jsonObjectSchema.safeParse(parseJson(readFileSync(p, "utf8")));
    if (parsed.success) disk = parsed.data;
  } catch {
  }
  const checkedPatch = appConfigSchema.partial().extend({ threads: threadsPatchSchema.optional() }).parse(patch);
  const before = configSaveListeners.size ? structuredClone(disk) : disk;
  stripLegacyProviderConfig(disk);

  delete disk.localVm;
  delete disk.imageGen;
  for (const key of ["composio", "profile", "mcp", "threads", "context", "memory", "features", "budgets", "billing", "decisions", "loopGuard", "onboarding", "safetyFloor"] as const) {
    const section = checkedPatch[key];
    if (!section) continue;
    const current = jsonObjectSchema.safeParse(disk[key]);
    const merged: JsonObject = current.success ? { ...current.data } : {};
    if (key === "threads" && !current.success) merged.maxConcurrentPerBot = DEFAULT_MAX_CONCURRENT_BOT_THREADS;
    Object.assign(merged, section);
    for (const [sectionKey, sectionValue] of Object.entries(section as Record<string, unknown>)) {
      if (sectionValue === null) delete merged[sectionKey];
    }
    disk[key] = merged;
  }
  delete disk.vps;
  if (checkedPatch.language !== undefined) disk.language = checkedPatch.language;
  if (checkedPatch.customDomain !== undefined) disk.customDomain = checkedPatch.customDomain;
  if (checkedPatch.signIn !== undefined) disk.signIn = checkedPatch.signIn;
  // Replace the section so clearing a backup cannot revive the old selection.
  if (checkedPatch.automaticRecovery !== undefined) disk.automaticRecovery = checkedPatch.automaticRecovery;
  if (checkedPatch.cacheKeepWarm !== undefined) disk.cacheKeepWarm = checkedPatch.cacheKeepWarm;
  if (checkedPatch.defaultModelSelection !== undefined) {
    disk.defaultModelSelection = checkedPatch.defaultModelSelection;
    if (disk.newBotDefaults) {
      const previousDefaults = newBotDefaultsSchema.parse(disk.newBotDefaults);
      disk.newBotDefaults = newBotDefaultsSchema.parse({
        ...previousDefaults,
        profile: { ...previousDefaults.profile, modelSelection: checkedPatch.defaultModelSelection },
      });
    }
  }
  if (checkedPatch.newBotDefaults !== undefined) {
    disk.newBotDefaults = checkedPatch.newBotDefaults;
    if (checkedPatch.newBotDefaults.profile.modelSelection) {
      disk.defaultModelSelection = checkedPatch.newBotDefaults.profile.modelSelection;
    } else {
      delete disk.defaultModelSelection;
    }
  }
  if (checkedPatch.cliStartup !== undefined) disk.cliStartup = checkedPatch.cliStartup;
  if (checkedPatch.mcpServers !== undefined) {
    disk.mcpServers = jsonObjectSchema.parse(checkedPatch.mcpServers);
  }

  if (checkedPatch.instances) {
    const currentInstances = jsonObjectSchema.safeParse(disk.instances);
    const storedInstances: JsonObject = currentInstances.success ? currentInstances.data : {};
    const diskInstances: JsonObject = options.replaceInstances ? {} : storedInstances;
    for (const [instanceId, entry] of Object.entries(checkedPatch.instances)) {
      const current = jsonObjectSchema.safeParse(storedInstances[instanceId]);
      const merged: JsonObject = current.success ? { ...current.data } : {};
      // Shadow entries keep fields only a newer app or driver understands.
      if (options.replaceInstances) {
        for (const key of Object.keys(instanceConfigSchema.shape)) delete merged[key];
      }
      Object.assign(merged, entry);
      diskInstances[instanceId] = merged;
    }
    disk.instances = diskInstances;
  }
  stripLegacyProviderConfig(disk);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileAtomic(p, JSON.stringify(disk, null, 2), { mode: 0o600 });
  for (const listener of configSaveListeners) {
    try {
      listener(before, disk);
    } catch (error) {
      console.warn(`config: a save listener failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Materialize the supported CLI inventory without restoring legacy provider settings. */
export function persistableInstanceConfigs(cfg: AppConfig): InstanceConfigMap {
  return instanceConfigs(cfg);
}

export function instanceConfigs(_cfg: AppConfig): InstanceConfigMap {
  return structuredClone(DEFAULT_CLI_INSTANCES);
}

// config.json: { "mcpServers": { "notes": { "command": "npx", "args": ["-y", "@x/notes-mcp"], "env": { "NOTES_TOKEN": "…" } },
//                                "docs": { "type": "http", "url": "https://…/mcp", "headers": { "Authorization": "Bearer …" } } } }

export type CustomMcpServer = McpServerSpec;

const reportedMcpSkips = new Set<string>();
function skipMcpEntry(name: string, why: string): void {
  const key = `${name}: ${why}`;
  if (reportedMcpSkips.has(key)) return;
  reportedMcpSkips.add(key);
  console.error(`mcpServers.${JSON.stringify(name)} skipped — ${why}`);
}

export function customMcpServers(cfg: AppConfig, only?: string[]): Record<string, CustomMcpServer> {
  const out: Record<string, CustomMcpServer> = {};
  for (const [name, raw] of Object.entries(cfg.mcpServers ?? {})) {
    if (only && !only.includes(name)) continue;
    const parsed = parseStoredMcpServer(name, raw);
    if (!parsed.ok) {
      skipMcpEntry(name, `${parsed.error} Expected { "command": "npx", "args": [...], "env": { ... } } or { "type": "http", "url": "https://…", "headers": { ... } }`);
      continue;
    }
    if (!parsed.server.enabled) continue;
    out[name] = isRemoteMcpServer(parsed.server)
      ? { type: parsed.server.type, url: parsed.server.url, headers: parsed.server.headers }
      : { command: parsed.server.command, args: parsed.server.args, env: parsed.server.env };
  }
  return out;
}
