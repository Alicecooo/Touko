import * as composio from "../integrations/composio.ts";
import { changedInstanceIds, engineLaunches, loadConfig, parseConfigPatch, saveConfig, syncComposioCredentialEnv, type AppConfig } from "../config/config.ts";
import type { InstanceConfigMap, ModelSelection } from "../harness/contracts.ts";
import type { ProviderRegistry } from "../harness/registry.ts";
import { HOSTED_PROVIDER_SETTINGS_ERROR } from "../deployment/hosted-models.ts";
import type { SessionRegistry } from "../auth/sessions.ts";
import { parseSkillMd } from "../skills/skills.ts";
import type { Store } from "../storage/store.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface BusyFlag {
  get(): boolean;
  set(busy: boolean): void;
}

export type ModelSelectionCheck = { ok: true; selection: ModelSelection } | { ok: false; status: number; error: string };

export type ConfigStatus = Record<string, unknown>;

export interface ConfigRouteDeps {
  store: Pick<Store, "bots" | "patchBot">;
  cfg: AppConfig;
  registry: Pick<ProviderRegistry, "get" | "forgetSnapshots">;
  sessions: Pick<SessionRegistry, "revalidateEmailSessions">;

  hostedModels: boolean;

  providerConfigs(): InstanceConfigMap;
  providerConfigBusy: BusyFlag;
  checkedModelSelection(raw: unknown, current?: { selection: ModelSelection; busy: boolean }, requireAvailableModel?: boolean): ModelSelectionCheck;
  policyModelRefusal(instance: { instanceId: string; driverKind: string }): string | undefined;

  configStatus(): ConfigStatus;
  configForAccess(status: ConfigStatus, admin: boolean): unknown;
  revokeEngineCapabilities(engines: ReadonlySet<string>): void;
  reloadProviders(before: Record<string, unknown>): Promise<void>;
  broadcast(payload: Record<string, unknown>): void;
  drainQueuedSends(): void;
}

export function createConfigRoutes(deps: ConfigRouteDeps): RouteHandler {
  const { cfg, registry, sessions, hostedModels, providerConfigs, providerConfigBusy, checkedModelSelection, policyModelRefusal, configStatus, configForAccess, revokeEngineCapabilities, reloadProviders, broadcast, drainQueuedSends } = deps;

  return async ({ req, res, url, path, method, auth, json, readBody }) => {
    // Secrets are never echoed back: booleans only.
    if (method === "GET" && path === "/api/config") {
      return json(res, 200, configForAccess(configStatus(), auth.scopes.includes("admin")));
    }
    if ((method === "PUT" || method === "PATCH") && path === "/api/config") {
      const body = await readBody(req);
      if (hostedModels && Object.hasOwn(body, "instances")) return json(res, 403, { error: HOSTED_PROVIDER_SETTINGS_ERROR });
      const patch = parseConfigPatch(body);

      if (patch.newBotDefaults) {
        if (patch.newBotDefaults.profile.modelSelection) {
          const checked = checkedModelSelection(patch.newBotDefaults.profile.modelSelection);
          if (!checked.ok) return json(res, checked.status, { error: checked.error });
          patch.newBotDefaults.profile.modelSelection = checked.selection;
        }
        for (const skill of patch.newBotDefaults.skills) {
          const parsed = parseSkillMd(skill.text);
          if ("error" in parsed || parsed.name !== skill.name) return json(res, 400, { error: "Skill name does not match its contents" });
        }
      }
      if (hostedModels && patch.defaultModelSelection) {
        const checked = checkedModelSelection(patch.defaultModelSelection);
        if (!checked.ok) return json(res, checked.status, { error: checked.error });
      }
      if (patch.automaticRecovery?.enabled) {
        const checked = checkedModelSelection(patch.automaticRecovery.backup, undefined, true);
        if (!checked.ok) return json(res, checked.status, { error: checked.error });
        const target = registry.get(checked.selection.instanceId)!;
        if (!target.enabled) return json(res, 400, { error: "Enable the backup engine before selecting it for recovery." });
        const refusal = policyModelRefusal(target);
        if (refusal) return json(res, 403, { error: refusal, code: "managed_policy" });
        patch.automaticRecovery.backup = checked.selection;
      }
      if (!Object.keys(patch).length) return json(res, 400, { error: "nothing to save" });
      if (providerConfigBusy.get()) return json(res, 409, { error: "provider settings are already being updated" });
      providerConfigBusy.set(true);
      try {
        const requestedComposioKey = patch.composio?.apiKey;
        if (requestedComposioKey !== undefined) {
          if (requestedComposioKey.trim()) {
            try {
              const prepared = await composio.prepareProjectSession(requestedComposioKey, cfg.composio);
              patch.composio = { ...patch.composio, ...prepared };
            } catch (error) {
              return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
            }
          } else {
            patch.composio = { ...patch.composio, apiKey: "", sessionId: "" };
          }
        }
        const enginesBefore = engineLaunches(providerConfigs());
        const externalSecretStorage = url.searchParams.get("secretStorage") === "external";
        if (externalSecretStorage) {
          // The Composio key is already in OS-encrypted storage; remove any older plaintext copy.
          const persisted = structuredClone(patch);
          if (persisted.composio?.apiKey !== undefined) persisted.composio.apiKey = "";
          saveConfig(persisted);

          syncComposioCredentialEnv(patch);
          Object.assign(cfg, loadConfig());
        } else {
          saveConfig(patch);

          syncComposioCredentialEnv(patch);
          Object.assign(cfg, loadConfig());
        }
        registry.forgetSnapshots();

        if (patch.signIn !== undefined) {
          sessions.revalidateEmailSessions();
        }
        const changedEngines = new Set(changedInstanceIds(enginesBefore, engineLaunches(providerConfigs())));
        // Revoked before any await: a changed engine's old children are invalid at once.
        revokeEngineCapabilities(changedEngines);
        let reloadError: unknown = null;
        if (changedEngines.size > 0) {
          try {
            await reloadProviders(enginesBefore);
          } catch (error) {
            reloadError = error;
          }
        }
        const status = configStatus();
        broadcast({ kind: "config", ...status });
        if (patch.threads !== undefined) drainQueuedSends();
        if (reloadError) throw reloadError;
        return json(res, 200, status);
      } finally {
        providerConfigBusy.set(false);
      }
    }
    return PASS;
  };
}
