import type { RoutineManager } from "../automation/routines.ts";
import type { Store } from "../storage/store.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface BotLifecycleRouteDeps {
  store: Pick<Store, "bots">;
  routines(): RoutineManager | null;
  interruptAllDirectThreads(botId: string): Promise<void>;
  cancelDirectTurnDispatch(botId: string, expectedThreadId?: string): unknown;
  revokeInternalCapabilitiesForThread(threadId: string): void;
  deleteBotWithLifecycle(botId: string): Promise<{ status: number; body: unknown }>;
}

export function createBotLifecycleRoutes(deps: BotLifecycleRouteDeps): RouteHandler {
  const {store, interruptAllDirectThreads, cancelDirectTurnDispatch, revokeInternalCapabilitiesForThread, deleteBotWithLifecycle} = deps;
  return async ({ req, res, path, method, json }) => {
    let m: RegExpMatchArray | null = null;
    const routines = deps.routines();
    if (method === "POST" && path === "/api/local-computer/interrupt") {
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      await Promise.allSettled(
        store.bots
          .filter((bot) => bot.computer === "local")
          .map(async (bot) => {
            await interruptAllDirectThreads(bot.id);
            const routineRun = routines!.activeBotRunForBot(bot.id);
            if (routineRun) {
              cancelDirectTurnDispatch(bot.id, routineRun.threadId);
              if (routineRun.threadId) {
                revokeInternalCapabilitiesForThread(routineRun.threadId);
              }
              await routines!.cancelRun(routineRun.id);
            }
          }),
      );
      return json(res, 200, { ok: true });
    }
    m = path.match(/^\/api\/bots\/([\w-]+)$/);
    if (m && method === "DELETE") {
      const result = await deleteBotWithLifecycle(m[1]);
      return json(res, result.status, result.body);
    }
    return PASS;
  };
}
