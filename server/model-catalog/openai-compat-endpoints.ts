import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { InstanceConfig, InstanceConfigMap } from "../harness/contracts.ts";

export const ADDED_ENDPOINT_PREFIX = "openai-compat-";
export const ANTHROPIC_ENDPOINT_PREFIX = "anthropic-compat-";

export const apiEndpointSchema = z.object({
  protocol: z.enum(["openai", "anthropic"]),
  displayName: z.string().trim().min(1).max(80),
  url: z.string().max(512),
  key: z.string().trim().min(1).max(4096),
  models: z.array(z.string().trim().min(1).max(200).regex(/^[^\s\p{Cc}]+$/u)).max(64).optional(),
}).strict();

/** Origin and path only. The driver appends /models and /chat/completions, and fetch refuses URLs with credentials. */
export function endpointBaseUrl(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/** What the instance list shows: never userinfo, query or fragment, even from a hand-edited config.json. */
export function endpointDisplayUrl(config: unknown): string | undefined {
  const raw = (config as { url?: unknown } | undefined)?.url;
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? `${url.origin}${url.pathname}`.replace(/\/+$/, "") : undefined;
  } catch {
    return undefined;
  }
}

export const addEndpointSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  url: z.string().max(512),
  key: z.string().trim().min(1).max(4096),
  models: z.array(z.string().trim().min(1).max(200)).max(64).optional(),
}).strict();

export type AddEndpoint = z.infer<typeof addEndpointSchema>;

export function isAddedEndpoint(instanceId: string, entry: InstanceConfig | undefined): boolean {
  return (entry?.driver === "openai-compat" && instanceId.startsWith(ADDED_ENDPOINT_PREFIX))
    || (entry?.driver === "claudeAgent" && instanceId.startsWith(ANTHROPIC_ENDPOINT_PREFIX));
}

/** One independent connection per endpoint. Claude API endpoints get their own
 * config directory so they never borrow a subscription account's sign-in. */
export function addApiEndpoint(instances: InstanceConfigMap, body: z.infer<typeof apiEndpointSchema>, dataDir: string): { instanceId: string } | { error: string } {
  if (body.protocol === "openai") return addEndpoint(instances, body);
  const url = endpointBaseUrl(body.url);
  if (!url) return { error: "Enter an http or https base URL without a user name, password or query string." };
  if (/^https?:\/\//i.test(body.key)) return { error: "That API key looks like a URL. Paste the secret key itself, not a web address." };
  const instanceId = `${ANTHROPIC_ENDPOINT_PREFIX}${randomUUID()}`;
  const cli = Object.values(instances).find(entry => entry.driver === "claudeAgent")?.config as { cli?: unknown } | undefined;
  const models = [...new Set(body.models ?? [])];
  instances[instanceId] = {
    driver: "claudeAgent", displayName: body.displayName, access: "api",
    config: { requireApiKey: true, configDir: join(dataDir, "providers", instanceId),
      ...(typeof cli?.cli === "string" && cli.cli ? { cli: cli.cli } : {}),
      ...(models.length ? { apiModels: models } : {}) },
    environment: { ANTHROPIC_API_KEY: body.key, ANTHROPIC_BASE_URL: url.replace(/\/v1$/, "") },
  };
  return { instanceId };
}

export function addEndpoint(instances: InstanceConfigMap, body: AddEndpoint): { instanceId: string } | { error: string } {
  const url = endpointBaseUrl(body.url);
  if (!url) return { error: "Enter an http or https base URL without a user name, password or query string." };
  if (/^https?:\/\//i.test(body.key)) return { error: "That API key looks like a URL. Paste the secret key itself, not a web address." };
  const instanceId = `${ADDED_ENDPOINT_PREFIX}${randomUUID()}`;
  const models = [...new Set(body.models ?? [])];
  instances[instanceId] = {
    driver: "openai-compat", displayName: body.displayName, access: "api",
    config: { key: body.key, url, ...(models.length ? { managedModels: models } : {}) },
  };
  return { instanceId };
}

export function withEndpointUrls(described: unknown, configs: InstanceConfigMap): unknown {
  if (!Array.isArray(described)) return described;
  return described.map((instance: { instanceId?: string }) => {
    const entry = instance.instanceId ? configs[instance.instanceId] : undefined;
    if (!entry || !isAddedEndpoint(instance.instanceId!, entry)) return instance;
    const anthropic = entry.driver === "claudeAgent";
    const url = endpointDisplayUrl(anthropic ? { url: entry.environment?.ANTHROPIC_BASE_URL } : entry.config);
    return { ...instance, ...(url ? { url } : {}), apiProtocol: anthropic ? "anthropic" : "openai" };
  });
}
