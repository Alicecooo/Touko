import { updateClaudeCli } from "../platform/claude-update.ts";
import type { ModelSelection } from "../harness/contracts.ts";
import { BUILT_IN_DRIVERS } from "../drivers/builtIn.ts";
import { resetPathCache } from "../platform/env-path.ts";
import type { ProviderRegistry } from "../harness/registry.ts";
import { checkEngine } from "../platform/engine-check.ts";
import { HOSTED_PROVIDER_SETTINGS_ERROR } from "../deployment/hosted-models.ts";
import type { Store } from "../storage/store.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface InstanceRouteDeps {
  store: Pick<Store, "bots" | "tasks">;
  registry: Pick<ProviderRegistry, "get" | "refreshModels" | "installRuntime" | "cliTarget" | "forgetSnapshots">;
  hostedModels: boolean;
  describeInstances(): Promise<unknown>;
  testCliBinary(cli: string, driver: (typeof BUILT_IN_DRIVERS)[number] | undefined): Promise<unknown>;
  cliProbeEnvironment(): NodeJS.ProcessEnv;
  threadBusy(botId: string, threadId: string): boolean;
  botForThread(botId: string, threadId: string): Pick<{ modelSelection: ModelSelection }, "modelSelection"> | null;
}

export function createInstanceRoutes(deps: InstanceRouteDeps): RouteHandler {
  const {
    store, registry, hostedModels, testCliBinary, cliProbeEnvironment, threadBusy, botForThread,
  } = deps;
  const describeInstances = deps.describeInstances;
  // One updater per executable: Claude instances can share an install, and two self-updates would race its files.
  const claudeUpdatesInFlight = new Set<string>();
  return async ({ req, res, path, method, json, readBody }) => {
    if (method === "GET" && path === "/api/instances") {
      // Rescan PATH: Windows never pushes PATH changes into a live process, so a CLI installed since launch stays invisible.
      resetPathCache();
      return json(res, 200, { instances: await describeInstances() });
    }
    const companyMutation = /^\/api\/instances\/(company\.[\w.-]+)(?:\/|$)/.exec(path);
    if (hostedModels && path.startsWith("/api/instances/") && method !== "GET") return json(res, 403, { error: HOSTED_PROVIDER_SETTINGS_ERROR });
    if (companyMutation && method !== "GET") return json(res, 403, { error: "Company accounts are read-only here. Manage this connection in desktop Settings." });

    const instanceAction = /^\/api\/instances\/([\w.-]+)\/(refresh-models|install|check)$/.exec(path);
    if (method === "POST" && instanceAction) {
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      const instanceId = instanceAction[1];
      const action = instanceAction[2];
      try {
        if (action === "check") {
          const instance = registry.get(instanceId);
          if (!instance) return json(res, 404, { error: "unknown instance" });
          res.setHeader("cache-control", "no-store");
          return json(res, 200, await checkEngine(instance));
        }
        if (action === "refresh-models") {
          if (!(await registry.refreshModels(instanceId))) return json(res, 404, { error: "unknown instance" });
          return json(res, 200, { instances: await describeInstances() });
        }
        if (action === "install") {
          if (!(await registry.installRuntime(instanceId))) return json(res, 404, { error: "Installing this engine from Settings is not available on this server. Use the install command on the machine running OpenMausBot." });
          return json(res, 200, { instances: await describeInstances() });
        }
      } catch (error) {
        const requestedStatus = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
        const status = typeof requestedStatus === "number" && [400, 401, 404, 409, 413, 415].includes(requestedStatus) ? requestedStatus : 500;
        return json(res, status, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // POST {cli, driver} → spawn `<cli> --version` with the PATH a turn would use.
    if (method === "POST" && path === "/api/cli-test") {
      // JSON-only: this executes a local binary, so a hostile page must not send it as a simple cross-origin request.
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      const body = await readBody(req);
      const cli = typeof body?.cli === "string" ? body.cli.trim() : "";
      if (!cli || /[\n\r]/.test(cli)) return json(res, 400, { error: "cli must be a non-empty path" });
      const driver = typeof body?.driver === "string" ? BUILT_IN_DRIVERS.find((d) => d.driverKind === body.driver) : undefined;
      // testCliBinary uses a credential-redacted environment, so wrapper arguments cannot read inherited secrets.
      const probe = await testCliBinary(cli, driver);
      return json(res, 200, probe);
    }

    // No command or path comes from the request: the registry supplies this instance's executable. JSON-only.
    const busyProviderSelections = () => store.bots.flatMap((bot) => {
      const busyTasks = store.tasks(bot.id).filter((task) => threadBusy(bot.id, task.threadId));
      const selections = busyTasks.map((task) => botForThread(bot.id, task.threadId)!.modelSelection);
      if (bot.busy && busyTasks.length === 0) selections.push(bot.modelSelection);
      return selections;
    });
    const claudeUpdate = /^\/api\/instances\/([\w.-]+)\/claude-update$/.exec(path);
    if (method === "POST" && claudeUpdate) {
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      await readBody(req);
      const target = registry.cliTarget(claudeUpdate[1]);
      if (!target) return json(res, 404, { error: "no such provider instance" });
      if (target.driverKind !== "claudeAgent") {
        return json(res, 400, { error: "only Claude Code instances can be updated here" });
      }
      if (!target.cli) return json(res, 409, { error: "this Claude instance has no configured executable" });
      if (claudeUpdatesInFlight.has(target.cli)) {
        return json(res, 409, { error: "this Claude installation is already updating" });
      }
      const active = busyProviderSelections().some((selection) => registry.cliTarget(selection.instanceId)?.cli === target.cli);
      if (active) {
        return json(res, 409, { error: "wait for running Claude tasks to finish before updating" });
      }

      claudeUpdatesInFlight.add(target.cli);
      try {
        const result = await updateClaudeCli(target.cli, cliProbeEnvironment());
        resetPathCache();
        return json(res, 200, { ok: true, version: result.version });
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
      } finally {
        claudeUpdatesInFlight.delete(target.cli);
        // Even a failed update may have replaced the executable.
        registry.forgetSnapshots();
      }
    }

    return PASS;
  };
}
