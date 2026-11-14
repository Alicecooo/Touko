import { EXIT } from "./args.ts";
import type { VerbContext, VerbOutcome } from "./context.ts";

type Rec = Record<string, any>;

export async function engineVerb(ctx: VerbContext): Promise<VerbOutcome> {
  const client = await ctx.client();
  const models = await client.tool("list_available_models", {});
  const instances: Rec[] = models.instances ?? [];
  return {
    result: { instances }, exitCode: EXIT.done,
    human: instances.map((instance) => `${instance.instanceId} · ${instance.displayName ?? instance.driverKind} · ${instance.snapshot?.state ?? "unknown"}`),
  };
}
