import type { ResolvedSender } from "../../shared/wire.ts";
import type { InstanceConfigMap } from "../harness/contracts.ts";
import type { ProviderRegistry } from "../harness/registry.ts";
import type { hostedModelPolicy } from "../deployment/hosted-models.ts";
import { resolvePeerComms, type ApprovalBus } from "../teams/peer-approval.ts";
import { createQuotaSwitch, type QuotaRequest, type QuotaSwitchDeps } from "../agent/quota-switch.ts";
import type { BotRecord, Message } from "../storage/store.ts";
import type { UsageTrigger } from "../usage/usage-ledger.ts";

export interface QuotaSwitchHostDeps extends Pick<QuotaSwitchDeps, "store" | "coordinator" | "turnStops"> {
  registry: Pick<ProviderRegistry, "instances" | "access">;
  approvalBus: ApprovalBus;
  hostedModels: ReturnType<typeof hostedModelPolicy>;
  providerConfigs(): InstanceConfigMap;
  policyModelRefusal(instance: { instanceId: string; driverKind: string }): string | undefined;
  checkedTaskModelSwitch(
    current: BotRecord, raw: unknown, updateBotDefault: boolean, resetApprovalToAsk: boolean, requireAvailableModel?: boolean,
  ): ReturnType<QuotaSwitchDeps["gate"]>;
  threadBusy(botId: string, threadId: string): boolean;
  directRequestOwners: { get(threadId: string): QuotaRequest | undefined };
  startOrQueueDirectMessage(
    botId: string, threadId: string, text: string, replyTo?: Message, sendId?: string, sender?: ResolvedSender,
    trigger?: UsageTrigger,
  ): Promise<unknown>;
}

export function createQuotaSwitchHost(deps: QuotaSwitchHostDeps) {
  const {
    store, coordinator, registry, turnStops, approvalBus, hostedModels, providerConfigs, policyModelRefusal,
    checkedTaskModelSwitch, threadBusy, directRequestOwners, startOrQueueDirectMessage,
  } = deps;

  const quotaSwitch = createQuotaSwitch({
    store, coordinator, registry, turnStops,
    access: instanceId => providerConfigs()[instanceId]?.access ?? registry.access(instanceId),
    refusal: policyModelRefusal,
    gate: (thread, selection) => checkedTaskModelSwitch(thread, selection, false, false, true),
    reset: (from, to) => hostedModels?.resetTask(from, to),
    busy: threadBusy,
    request: threadId => directRequestOwners.get(threadId),
    resend: (botId, threadId, message, replyTo) => startOrQueueDirectMessage(botId, threadId, message.text ?? "", replyTo, undefined, message.sender),
  });

  /** Settles a card the harness raised itself (a peer approval or a quota-switch offer); undefined for any other card. */
  async function harnessCardOutcome(threadId: string, requestId: string, behavior: "allow" | "deny" | "answer", message: unknown): Promise<string | undefined> {
    if (!store.messagesFor(threadId).some(candidate => candidate.card?.requestId === requestId)) return undefined;
    if (resolvePeerComms(approvalBus, requestId, behavior)) return behavior === "allow" ? "allowed-once" : "rejected";
    return await quotaSwitch.answer(threadId, requestId, behavior, message) ?? undefined;
  }

  return { quotaSwitch, harnessCardOutcome };
}
