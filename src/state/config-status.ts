// What GET /api/config tells the app about the server and its settings (re-exported by store.tsx).
import type { OnboardingStatus } from "@/lib/onboarding";
import type { ModelSelection } from "./store";

/** GET /api/config — configured flags only; secrets are never echoed. */
export interface ConfigStatus {
  xai?: { configured: boolean };
  mistral?: { configured: boolean };
  cerebras?: { configured: boolean };
  groq?: { configured: boolean };
  meta?: { configured: boolean };
  /** `everyClaudeBot`: the key runs every Claude bot, not only "Claude (API key)". */
  anthropic?: { configured: boolean; everyClaudeBot?: boolean };
  openai?: { configured: boolean };
  openrouter?: { configured: boolean };
  openaiCompat?: { configured: boolean; url?: string };
  /** what this server is entitled to; Settings shows only what works here.
   * `license` reaches admins only, and only while the key is inside its
   * warning window or grace period. */
  edition?: {
    edition: "oss" | "enterprise";
    features: string[];
    license?: { expiresAt: string; expiresInDays: number; graceEndsAt?: string };
  };
  /** a fleet agent exists on this server (Settings → Workspaces) */
  fleet?: { available: boolean };
  budgets?: { monthlyUsd?: number; warnAtPercent?: number };
  billing?: { currency?: string; prices?: Record<string, { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number }> };
  composio: { configured: boolean; mode?: "managed" | "self-hosted" | "unavailable" };
  /** `included`: cloud computers come with Cloud Pro, no key is saved. */
  box: { configured: boolean; included?: boolean };
  /** Per-call ceiling (minutes) for a bot's MCP tools. Absent from servers
   * older than the setting; read it with mcpCallTimeoutMinutes(). */
  mcp?: { callTimeoutMinutes: number };
  threads?: { maxConcurrentPerBot: number; eventLogMaxBytes?: number; eventLogRetentionDays?: number };
  automaticRecovery?: { enabled: boolean; backup?: ModelSelection };
  /** Prompt-cache keep-warm for idle Claude threads. Absent from older servers. */
  cacheKeepWarm?: { enabled: boolean; windowMinutes: number };
  opencodeGo?: { configured: boolean };
  /** who's using the app — collected in onboarding, shown in the sidebar */
  profile?: { name: string; email: string; aboutMe?: string };
  /** UI language override; "" (or absent) follows the system language. */
  language?: string;
  /** Opt-in flags. Absent means off. */
  features?: { skillAuthoring: boolean; showToolCalls?: boolean; sharedComputers?: boolean; claudeUserMcp?: boolean; llmThreadTitles?: boolean; skillsLibrary?: boolean; shareLearnedSkills?: "off" | "ask" | "auto" };
  /** First-run progress: whether the welcome tour was finished and which
   * one-time hints were dismissed. Server-owned so it follows the workspace. */
  onboarding?: OnboardingStatus;

  /** The enrolled organisation's read-only desktop policy; null when this
   * desktop is not enrolled or its Admin sends no policy. */
  managedPolicy?: ManagedPolicySummary | null;
  /** This server is an OMB Cloud home: it offers no "this computer". Absent everywhere else. */
  cloudHome?: boolean;
}

export interface ManagedPolicySummary {
  organizationName: string;
  version: number;
  companyModelsOnly: boolean;
  allowedEngines: "all" | string[];
  mcp: { allowCustom: boolean; allowlist: string[] };
  computers: { thisComputer: boolean; box: boolean };
  remoteAccess: boolean;
}
